import assert from 'node:assert/strict';
import test from 'node:test';

import { emptyQueue, isBusy, request, settle } from './previewQueue.js';

test('the first selection starts immediately', () => {
  const { state, start } = request(emptyQueue(), 'nose-narrow');
  assert.deepEqual(start, { selection: 'nose-narrow', sequence: 1 });
  assert.equal(isBusy(state), true);
});

test('a selection made while one is running waits instead of overlapping', () => {
  // The server holds a per-user lock during a preview and answers a second one with 409.
  let { state } = request(emptyQueue(), 'nose-narrow');
  const second = request(state, 'nose-wide');
  assert.equal(second.start, null, 'must not fire a second request');
  assert.equal(second.state.pending, 'nose-wide');
});

test('only the newest selection survives a burst of clicks', () => {
  let { state, start } = request(emptyQueue(), 'a');
  for (const selection of ['b', 'c', 'd']) state = request(state, selection).state;
  const done = settle(state, start.sequence);
  assert.equal(done.accept, true, 'the finished request still paints');
  assert.deepEqual(done.start, { selection: 'd', sequence: 2 }, 'the last click wins, the middle ones are dropped');
  assert.equal(done.state.pending, null);
});

test('a late answer for a superseded request never paints', () => {
  let { state, start } = request(emptyQueue(), 'a');
  state = request(state, 'b').state;
  state = settle(state, start.sequence).state;      // 'b' is now in flight
  const stale = settle(state, start.sequence);      // 'a' answers again, out of order
  assert.equal(stale.accept, false);
  assert.equal(stale.start, null);
});

test('an answer arriving after the queue was reset is discarded', () => {
  const { start } = request(emptyQueue(), 'a');
  const afterReset = settle(emptyQueue(), start.sequence);
  assert.equal(afterReset.accept, false);
});

test('the queue goes idle once the last request settles', () => {
  const { state, start } = request(emptyQueue(), 'a');
  const done = settle(state, start.sequence);
  assert.equal(done.start, null);
  assert.equal(isBusy(done.state), false);
  // And it can start again afterwards with a fresh sequence number.
  assert.deepEqual(request(done.state, 'b').start, { selection: 'b', sequence: 2 });
});
