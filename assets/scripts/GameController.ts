import { _decorator, Component, Label, Node, ProgressBar, tween, Vec3 } from 'cc';
import {
  GameSession,
  type BossState,
  type GameEvent,
  type GameResult,
  type GameSnapshot,
} from './core/GameSession';

const { ccclass, property } = _decorator;

const BOSS_COPY: Record<BossState, string> = {
  safe: '老板背对着你',
  warning: '老板好像要回头！',
  checking: '老板正在检查',
};

const RESULT_COPY: Record<GameResult, string> = {
  punctual: '准时下班！',
  overtime: '摸鱼指标不足，被迫加班',
  fired: '可疑度爆表，惨遭开除',
};

@ccclass('GameController')
export class GameController extends Component {
  @property(Node)
  public playArea: Node | null = null;

  @property(Node)
  public bossNode: Node | null = null;

  @property(Label)
  public bossStateLabel: Label | null = null;

  @property(Label)
  public timerLabel: Label | null = null;

  @property(Label)
  public scoreLabel: Label | null = null;

  @property(Label)
  public suspicionLabel: Label | null = null;

  @property(Label)
  public comboLabel: Label | null = null;

  @property(Label)
  public actionLabel: Label | null = null;

  @property(ProgressBar)
  public suspicionBar: ProgressBar | null = null;

  @property(Node)
  public resultPanel: Node | null = null;

  @property(Label)
  public resultLabel: Label | null = null;

  private session: GameSession | null = null;
  private unsubscribe: (() => void) | null = null;

  protected onLoad(): void {
    this.bindInput();
    this.startRound();
  }

  protected update(deltaTime: number): void {
    this.session?.update(deltaTime);
    if (this.session) this.render(this.session.getSnapshot());
  }

  protected onDestroy(): void {
    this.unbindInput();
    this.unsubscribe?.();
  }

  public startRound(): void {
    this.unsubscribe?.();
    this.session = new GameSession({}, Date.now());
    this.unsubscribe = this.session.subscribe((event) => this.onGameEvent(event));
    this.resultPanel && (this.resultPanel.active = false);
    this.session.start();
    this.render(this.session.getSnapshot());
  }

  private bindInput(): void {
    if (!this.playArea) return;
    this.playArea.on(Node.EventType.TOUCH_START, this.onPress, this);
    this.playArea.on(Node.EventType.TOUCH_END, this.onRelease, this);
    this.playArea.on(Node.EventType.TOUCH_CANCEL, this.onRelease, this);
  }

  private unbindInput(): void {
    if (!this.playArea) return;
    this.playArea.off(Node.EventType.TOUCH_START, this.onPress, this);
    this.playArea.off(Node.EventType.TOUCH_END, this.onRelease, this);
    this.playArea.off(Node.EventType.TOUCH_CANCEL, this.onRelease, this);
  }

  private readonly onPress = (): void => {
    this.session?.press();
  };

  private readonly onRelease = (): void => {
    this.session?.release();
  };

  private onGameEvent(event: GameEvent): void {
    if (event.type === 'boss-warning' && this.bossNode) {
      tween(this.bossNode)
        .to(0.08, { scale: new Vec3(1.08, 1.08, 1) })
        .to(0.08, { scale: Vec3.ONE })
        .union()
        .repeat(2)
        .start();
    }

    if (event.type === 'round-finished' && event.snapshot.result) {
      if (this.resultPanel) this.resultPanel.active = true;
      if (this.resultLabel) this.resultLabel.string = RESULT_COPY[event.snapshot.result];
    }
  }

  private render(state: GameSnapshot): void {
    if (this.timerLabel) this.timerLabel.string = `${Math.ceil(state.remainingSeconds)} 秒后下班`;
    if (this.scoreLabel) this.scoreLabel.string = `摸鱼值 ${Math.floor(state.score)} / 600`;
    if (this.suspicionLabel) this.suspicionLabel.string = `可疑度 ${Math.ceil(state.suspicion)}%`;
    if (this.comboLabel) this.comboLabel.string = `连击 ${state.combo}  ·  x${state.multiplier.toFixed(1)}`;
    if (this.actionLabel) this.actionLabel.string = state.isSlacking ? '正在摸鱼…松手工作' : '按住屏幕开始摸鱼';
    if (this.bossStateLabel) this.bossStateLabel.string = BOSS_COPY[state.bossState];
    if (this.suspicionBar) this.suspicionBar.progress = state.suspicion / 100;
  }
}
