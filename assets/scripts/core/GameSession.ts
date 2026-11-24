export type GamePhase = 'ready' | 'running' | 'paused' | 'finished';
export type BossState = 'safe' | 'warning' | 'checking';
export type GameResult = 'punctual' | 'overtime' | 'fired';

export interface GameAdjustment {
  scoreDelta?: number;
  suspicionDelta?: number;
  timeDelta?: number;
  safeWindowSeconds?: number;
}

export interface GameConfig {
  roundSeconds: number;
  targetScore: number;
  baseScorePerSecond: number;
  suspicionWhileSlackingPerSecond: number;
  suspicionWhileWorkingPerSecond: number;
  suspicionWhileCaughtPerSecond: number;
  caughtPenalty: number;
  suspicionLimit: number;
  safeSecondsMin: number;
  safeSecondsMax: number;
  warningSeconds: number;
  checkingSecondsMin: number;
  checkingSecondsMax: number;
  comboStep: number;
  maxMultiplier: number;
}

export interface GameSnapshot {
  phase: GamePhase;
  bossState: BossState;
  result: GameResult | null;
  isSlacking: boolean;
  remainingSeconds: number;
  score: number;
  suspicion: number;
  combo: number;
  multiplier: number;
  caughtCount: number;
  successfulDodges: number;
  bossStateRemainingSeconds: number;
}

export interface GameEvent {
  type:
    | 'round-started'
    | 'boss-warning'
    | 'boss-checking'
    | 'caught'
    | 'dodge-success'
    | 'round-finished';
  snapshot: GameSnapshot;
}

export type GameEventListener = (event: GameEvent) => void;

export const DEFAULT_GAME_CONFIG: Readonly<GameConfig> = Object.freeze({
  roundSeconds: 90,
  targetScore: 600,
  baseScorePerSecond: 10,
  suspicionWhileSlackingPerSecond: 3,
  suspicionWhileWorkingPerSecond: 8,
  suspicionWhileCaughtPerSecond: 35,
  caughtPenalty: 20,
  suspicionLimit: 100,
  safeSecondsMin: 2.5,
  safeSecondsMax: 5,
  warningSeconds: 1.2,
  checkingSecondsMin: 2,
  checkingSecondsMax: 4,
  comboStep: 0.1,
  maxMultiplier: 2,
});

const EPSILON = 0.000_001;

/** Small deterministic RNG so a failed run can be reproduced from its seed. */
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x1_0000_0000;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function validateConfig(config: GameConfig): void {
  const positive: Array<keyof GameConfig> = [
    'roundSeconds',
    'targetScore',
    'baseScorePerSecond',
    'suspicionWhileSlackingPerSecond',
    'suspicionWhileWorkingPerSecond',
    'suspicionWhileCaughtPerSecond',
    'suspicionLimit',
    'safeSecondsMin',
    'safeSecondsMax',
    'warningSeconds',
    'checkingSecondsMin',
    'checkingSecondsMax',
    'maxMultiplier',
  ];

  for (const key of positive) {
    if (!Number.isFinite(config[key]) || config[key] <= 0) {
      throw new Error(`Invalid game config: ${key} must be greater than 0.`);
    }
  }

  if (config.safeSecondsMax < config.safeSecondsMin) {
    throw new Error('Invalid game config: safeSecondsMax must be >= safeSecondsMin.');
  }
  if (config.checkingSecondsMax < config.checkingSecondsMin) {
    throw new Error('Invalid game config: checkingSecondsMax must be >= checkingSecondsMin.');
  }
  if (config.caughtPenalty < 0 || config.comboStep < 0) {
    throw new Error('Invalid game config: penalties and comboStep cannot be negative.');
  }
  if (config.maxMultiplier < 1) {
    throw new Error('Invalid game config: maxMultiplier must be at least 1.');
  }
}

/**
 * Engine-independent rules for one workday. Rendering and platform APIs should
 * consume snapshots/events instead of changing game values directly.
 */
export class GameSession {
  private readonly config: GameConfig;
  private readonly random: SeededRandom;
  private readonly listeners = new Set<GameEventListener>();

  private phase: GamePhase = 'ready';
  private bossState: BossState = 'safe';
  private result: GameResult | null = null;
  private isSlacking = false;
  private remainingSeconds: number;
  private score = 0;
  private suspicion = 0;
  private combo = 0;
  private caughtCount = 0;
  private successfulDodges = 0;
  private bossStateRemainingSeconds: number;
  private caughtDuringCurrentCheck = false;
  private slackedDuringCurrentCycle = false;

  constructor(config: Partial<GameConfig> = {}, seed = Date.now()) {
    this.config = { ...DEFAULT_GAME_CONFIG, ...config };
    validateConfig(this.config);
    this.random = new SeededRandom(seed);
    this.remainingSeconds = this.config.roundSeconds;
    this.bossStateRemainingSeconds = this.randomBetween(
      this.config.safeSecondsMin,
      this.config.safeSecondsMax,
    );
  }

  start(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'running';
    this.emit('round-started');
  }

  pause(): void {
    if (this.phase === 'running') this.phase = 'paused';
  }

  resume(): void {
    if (this.phase === 'paused') this.phase = 'running';
  }

  press(): void {
    if (this.phase !== 'running') return;
    this.isSlacking = true;
    if (this.bossState !== 'checking') this.slackedDuringCurrentCycle = true;
  }

  release(): void {
    this.isSlacking = false;
  }

  applyAdjustment(adjustment: GameAdjustment): void {
    if (this.phase !== 'running') return;
    this.score = Math.max(0, this.score + (adjustment.scoreDelta ?? 0));
    this.suspicion = clamp(
      this.suspicion + (adjustment.suspicionDelta ?? 0),
      0,
      this.config.suspicionLimit,
    );
    this.remainingSeconds = Math.max(0, this.remainingSeconds + (adjustment.timeDelta ?? 0));

    if ((adjustment.safeWindowSeconds ?? 0) > 0) {
      this.bossState = 'safe';
      this.caughtDuringCurrentCheck = false;
      this.slackedDuringCurrentCycle = false;
      this.bossStateRemainingSeconds = Math.max(
        this.bossStateRemainingSeconds,
        adjustment.safeWindowSeconds ?? 0,
      );
    }

    if (this.suspicion >= this.config.suspicionLimit - EPSILON) {
      this.finish('fired');
    }
  }

  update(deltaSeconds: number): void {
    if (this.phase !== 'running' || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

    let unprocessed = Math.min(deltaSeconds, this.remainingSeconds);
    while (unprocessed > EPSILON && this.phase === 'running') {
      const step = Math.min(unprocessed, this.bossStateRemainingSeconds, this.remainingSeconds);
      this.applyContinuousRules(step);
      this.remainingSeconds = Math.max(0, this.remainingSeconds - step);
      this.bossStateRemainingSeconds = Math.max(0, this.bossStateRemainingSeconds - step);
      unprocessed -= step;

      if (this.suspicion >= this.config.suspicionLimit - EPSILON) {
        this.suspicion = this.config.suspicionLimit;
        this.finish('fired');
        break;
      }
      if (this.remainingSeconds <= EPSILON) {
        this.remainingSeconds = 0;
        this.finish(this.score >= this.config.targetScore ? 'punctual' : 'overtime');
        break;
      }
      if (this.bossStateRemainingSeconds <= EPSILON) this.advanceBossState();
    }
  }

  subscribe(listener: GameEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): GameSnapshot {
    return {
      phase: this.phase,
      bossState: this.bossState,
      result: this.result,
      isSlacking: this.isSlacking,
      remainingSeconds: this.remainingSeconds,
      score: this.score,
      suspicion: this.suspicion,
      combo: this.combo,
      multiplier: this.multiplier,
      caughtCount: this.caughtCount,
      successfulDodges: this.successfulDodges,
      bossStateRemainingSeconds: this.bossStateRemainingSeconds,
    };
  }

  private get multiplier(): number {
    return Math.min(this.config.maxMultiplier, 1 + this.combo * this.config.comboStep);
  }

  private applyContinuousRules(seconds: number): void {
    if (this.isSlacking) {
      if (this.bossState !== 'checking') {
        this.score += this.config.baseScorePerSecond * this.multiplier * seconds;
        this.suspicion += this.config.suspicionWhileSlackingPerSecond * seconds;
      } else {
        if (!this.caughtDuringCurrentCheck) {
          this.caughtDuringCurrentCheck = true;
          this.caughtCount += 1;
          this.combo = 0;
          this.suspicion += this.config.caughtPenalty;
          this.emit('caught');
        }
        this.suspicion += this.config.suspicionWhileCaughtPerSecond * seconds;
      }
    } else {
      this.suspicion -= this.config.suspicionWhileWorkingPerSecond * seconds;
    }

    this.suspicion = clamp(this.suspicion, 0, this.config.suspicionLimit);
  }

  private advanceBossState(): void {
    if (this.bossState === 'safe') {
      this.bossState = 'warning';
      this.bossStateRemainingSeconds = this.config.warningSeconds;
      this.emit('boss-warning');
      return;
    }

    if (this.bossState === 'warning') {
      this.bossState = 'checking';
      this.caughtDuringCurrentCheck = false;
      this.bossStateRemainingSeconds = this.randomBetween(
        this.config.checkingSecondsMin,
        this.config.checkingSecondsMax,
      );
      this.emit('boss-checking');
      return;
    }

    if (!this.caughtDuringCurrentCheck && this.slackedDuringCurrentCycle) {
      this.combo += 1;
      this.successfulDodges += 1;
      this.emit('dodge-success');
    }
    this.bossState = 'safe';
    this.slackedDuringCurrentCycle = false;
    this.bossStateRemainingSeconds = this.randomBetween(
      this.config.safeSecondsMin,
      this.config.safeSecondsMax,
    );
  }

  private finish(result: GameResult): void {
    this.result = result;
    this.phase = 'finished';
    this.isSlacking = false;
    this.emit('round-finished');
  }

  private randomBetween(min: number, max: number): number {
    return min + (max - min) * this.random.next();
  }

  private emit(type: GameEvent['type']): void {
    const event: GameEvent = { type, snapshot: this.getSnapshot() };
    for (const listener of this.listeners) listener(event);
  }
}
