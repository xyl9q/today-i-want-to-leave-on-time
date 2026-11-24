import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkEventDeck, type WorkEventDefinition } from '../assets/scripts/core/WorkEvents.ts';

const sampleEvents: ReadonlyArray<WorkEventDefinition> = [
  { id: 'a', title: 'A', copy: 'A', effect: { scoreDelta: 1 }, weight: 1 },
  { id: 'b', title: 'B', copy: 'B', effect: { scoreDelta: 2 }, weight: 1 },
];

test('work event deck respects its initial delay', () => {
  const deck = new WorkEventDeck(1, sampleEvents, 5, 5, 3);
  assert.equal(deck.update(2.9), null);
  assert.notEqual(deck.update(0.1), null);
});

test('work event deck prevents immediate repeats', () => {
  const deck = new WorkEventDeck(1, sampleEvents, 1, 1, 0);
  const first = deck.update(0.1);
  const second = deck.update(1);
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.id, second.id);
});

test('work event deck is deterministic for a seed', () => {
  const first = new WorkEventDeck(42, sampleEvents, 1, 1, 0);
  const second = new WorkEventDeck(42, sampleEvents, 1, 1, 0);
  const firstIds = [first.update(0.1)?.id, first.update(1)?.id, first.update(1)?.id];
  const secondIds = [second.update(0.1)?.id, second.update(1)?.id, second.update(1)?.id];
  assert.deepEqual(firstIds, secondIds);
});
