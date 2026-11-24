import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSession } from '../assets/scripts/core/GameSession.ts';

const deterministicTiming = {
  safeSecondsMin: 2,
  safeSecondsMax: 2,
  warningSeconds: 1,
  checkingSecondsMin: 2,
  checkingSecondsMax: 2,
};

test('starts in a safe, ready state', () => {
  const game = new GameSession(deterministicTiming, 1);
  const state = game.getSnapshot();
  assert.equal(state.phase, 'ready');
  assert.equal(state.bossState, 'safe');
  assert.equal(state.remainingSeconds, 90);
  assert.equal(state.score, 0);
});

test('holding during a safe window earns score and suspicion', () => {
  const game = new GameSession(deterministicTiming, 1);
  game.start();
  game.press();
  game.update(1);
  const state = game.getSnapshot();
  assert.equal(state.score, 10);
  assert.equal(state.suspicion, 3);
});

test('working lowers suspicion but never below zero', () => {
  const game = new GameSession(deterministicTiming, 1);
  game.start();
  game.press();
  game.update(1);
  game.release();
  game.update(0.5);
  assert.equal(game.getSnapshot().suspicion, 0);
});

test('doing nothing never grants a dodge or combo', () => {
  const game = new GameSession(deterministicTiming, 1);
  game.start();
  game.update(2);
  assert.equal(game.getSnapshot().bossState, 'warning');
  game.update(1);
  assert.equal(game.getSnapshot().bossState, 'checking');
  game.update(2);
  const state = game.getSnapshot();
  assert.equal(state.bossState, 'safe');
  assert.equal(state.combo, 0);
  assert.equal(state.successfulDodges, 0);
});

test('slacking then releasing before the check grants one dodge', () => {
  const game = new GameSession(deterministicTiming, 1);
  game.start();
  game.press();
  game.update(1);
  game.release();
  game.update(4);
  const state = game.getSnapshot();
  assert.equal(state.bossState, 'safe');
  assert.equal(state.combo, 1);
  assert.equal(state.successfulDodges, 1);
});

test('being caught applies one flat penalty per check and resets combo', () => {
  const game = new GameSession({ ...deterministicTiming, caughtPenalty: 20 }, 1);
  game.start();
  game.press();
  game.update(1);
  game.release();
  game.update(4); // earned dodge, combo 1, and next safe window begins
  game.update(3); // next check begins
  game.press();
  game.update(0.1);
  const afterCatch = game.getSnapshot();
  assert.equal(afterCatch.caughtCount, 1);
  assert.equal(afterCatch.combo, 0);
  assert.ok(afterCatch.suspicion > 20);
  game.update(0.1);
  assert.equal(game.getSnapshot().caughtCount, 1);
});

test('reaching the suspicion limit ends the round as fired', () => {
  const game = new GameSession(
    {
      ...deterministicTiming,
      suspicionLimit: 25,
      caughtPenalty: 20,
      suspicionWhileCaughtPerSecond: 50,
    },
    1,
  );
  game.start();
  game.update(3);
  game.press();
  game.update(0.1);
  assert.equal(game.getSnapshot().phase, 'finished');
  assert.equal(game.getSnapshot().result, 'fired');
});

test('round ends punctual when target is met', () => {
  const game = new GameSession(
    {
      ...deterministicTiming,
      roundSeconds: 1,
      targetScore: 5,
      suspicionWhileSlackingPerSecond: 1,
    },
    1,
  );
  game.start();
  game.press();
  game.update(1);
  assert.equal(game.getSnapshot().result, 'punctual');
});

test('round ends overtime when target is missed', () => {
  const game = new GameSession(
    { ...deterministicTiming, roundSeconds: 1, targetScore: 999 },
    1,
  );
  game.start();
  game.update(1);
  assert.equal(game.getSnapshot().result, 'overtime');
});

test('a large update crossing multiple states remains deterministic', () => {
  const game = new GameSession(
    { ...deterministicTiming, roundSeconds: 6, targetScore: 999 },
    1,
  );
  game.start();
  game.update(6);
  const state = game.getSnapshot();
  assert.equal(state.phase, 'finished');
  assert.equal(state.successfulDodges, 0);
  assert.equal(state.result, 'overtime');
});

test('pause freezes time and input state', () => {
  const game = new GameSession(deterministicTiming, 1);
  game.start();
  game.press();
  game.pause();
  game.update(10);
  const state = game.getSnapshot();
  assert.equal(state.remainingSeconds, 90);
  assert.equal(state.score, 0);
});

test('work event adjustments are clamped and can extend a safe window', () => {
  const game = new GameSession(deterministicTiming, 1);
  game.start();
  game.applyAdjustment({ scoreDelta: 50, suspicionDelta: -20, timeDelta: 6, safeWindowSeconds: 8 });
  const state = game.getSnapshot();
  assert.equal(state.score, 50);
  assert.equal(state.suspicion, 0);
  assert.equal(state.remainingSeconds, 96);
  assert.equal(state.bossState, 'safe');
  assert.equal(state.bossStateRemainingSeconds, 8);
});
