import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_ITEMS, clearAll, clearUnlocked, count, emptyStack, isLocked, itemFor, remove, select, toRequest, toggleLock, unlock,
} from './simulationStack.js';

const build = (...picks) => picks.reduce((stack, [view, region, presetId]) => select(stack, view, region, presetId), emptyStack());

test('choosing a second shape for a region replaces it instead of stacking two', () => {
  const stack = build(['front', 'jaw', 'jaw-narrow'], ['front', 'jaw', 'jaw-wide']);
  assert.equal(count(stack, 'front'), 1);
  assert.equal(itemFor(stack, 'front', 'jaw').presetId, 'jaw-wide');
});

test('regions accumulate, which is the whole point', () => {
  const stack = build(['front', 'jaw', 'jaw-narrow'], ['front', 'chin', 'chin-long']);
  assert.deepEqual(toRequest(stack, 'front'), [
    { region: 'jaw', preset_id: 'jaw-narrow' },
    { region: 'chin', preset_id: 'chin-long' },
  ]);
});

test('a locked region cannot be changed or removed, and says so by identity', () => {
  // The caller compares by identity to know nothing happened, so it must be the same object:
  // a new-but-equal state would re-render and fire a pointless render request.
  const locked = toggleLock(build(['front', 'jaw', 'jaw-narrow']), 'front', 'jaw');
  assert.equal(isLocked(locked, 'front', 'jaw'), true);
  assert.equal(select(locked, 'front', 'jaw', 'jaw-wide'), locked, 'select must be refused');
  assert.equal(remove(locked, 'front', 'jaw'), locked, 'remove must be refused');
});

test('unlocking gives the region back', () => {
  const stack = toggleLock(build(['front', 'jaw', 'jaw-narrow']), 'front', 'jaw');
  const open = toggleLock(stack, 'front', 'jaw');
  assert.equal(isLocked(open, 'front', 'jaw'), false);
  assert.equal(itemFor(select(open, 'front', 'jaw', 'jaw-wide'), 'front', 'jaw').presetId, 'jaw-wide');
});

test('unlock only touches a region that is actually locked', () => {
  const stack = build(['front', 'jaw', 'jaw-narrow']);
  assert.equal(unlock(stack, 'front', 'jaw'), stack, 'already unlocked, so nothing changes');
  assert.equal(isLocked(unlock(toggleLock(stack, 'front', 'jaw'), 'front', 'jaw'), 'front', 'jaw'), false);
});

test('clearing the unlocked ones keeps what was locked, clearing all does not', () => {
  const stack = toggleLock(build(['front', 'jaw', 'jaw-narrow'], ['front', 'chin', 'chin-long']), 'front', 'jaw');
  assert.deepEqual(clearUnlocked(stack, 'front').front.map((item) => item.region), ['jaw']);
  assert.deepEqual(clearAll(stack), emptyStack(), 'a new scan clears locked items too');
});

test('the side stack is separate from the front one', () => {
  // Front and side are different source photos, so one render cannot hold both.
  const stack = build(['front', 'jaw', 'jaw-narrow'], ['profile', 'chin', 'chin-projection']);
  assert.equal(count(stack, 'front'), 1);
  assert.deepEqual(toRequest(stack, 'profile'), [{ region: 'chin', preset_id: 'chin-projection' }]);
  assert.equal(clearUnlocked(stack, 'front').profile.length, 1, 'clearing one angle leaves the other alone');
});

test('a full stack refuses a new region but still allows swapping the ones it holds', () => {
  const regions = ['eyes', 'nose', 'lips', 'cheeks', 'jaw', 'chin'];
  const full = build(...regions.map((region) => ['front', region, `${region}-a`]));
  assert.equal(count(full, 'front'), MAX_ITEMS);
  assert.equal(select(full, 'front', 'forehead', 'forehead-a'), full, 'a seventh region is refused');
  assert.equal(itemFor(select(full, 'front', 'jaw', 'jaw-b'), 'front', 'jaw').presetId, 'jaw-b');
});

test('re-picking the shape a region already holds changes nothing', () => {
  const stack = build(['front', 'jaw', 'jaw-narrow']);
  assert.equal(select(stack, 'front', 'jaw', 'jaw-narrow'), stack);
});

test('removing or locking a region that is not there changes nothing', () => {
  const stack = build(['front', 'jaw', 'jaw-narrow']);
  assert.equal(remove(stack, 'front', 'chin'), stack);
  assert.equal(toggleLock(stack, 'front', 'chin'), stack);
  assert.equal(clearUnlocked(emptyStack(), 'front').front.length, 0);
});
