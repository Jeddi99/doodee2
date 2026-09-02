import assert from 'node:assert/strict';
import test from 'node:test';

import {
  changeCount, emptyRenders, lastRenderForView, noChanges, pendingChanges, renderFor, rowStandings,
  shownRender, stackFingerprint, stackRendered, storeRender,
} from './renderPlan.js';

const item = (id, level = 3, locked = false) => ({ id, level, locked });
const store = (renders, stack, view, result) => storeRender(renders, {
  fingerprint: stackFingerprint(stack), view, stack, result,
});

test('the same procedures at the same levels are the same picture', () => {
  assert.equal(stackFingerprint([item('1.1'), item('4.1')]), stackFingerprint([item('1.1'), item('4.1')]));
  // Locking guards a row from being edited. It does not move a pixel, so it must not cost a render.
  assert.equal(
    stackFingerprint([item('1.1', 3, true)]),
    stackFingerprint([item('1.1', 3, false)]),
    'the lock flag must not change the identity of the image',
  );
  assert.notEqual(stackFingerprint([item('1.1', 3)]), stackFingerprint([item('1.1', 5)]),
    'a different dose is a different picture');
  assert.notEqual(stackFingerprint([item('1.1')]), stackFingerprint([item('1.1'), item('4.1')]));
});

test('a render is handed back only for the exact stack and the exact angle it was made for', () => {
  /**
   * This is the bug that made this file necessary. The map it replaces was keyed by angle alone,
   * so after the front was re-rendered for a new stack, the left profile still held the *previous*
   * stack's image — and the angle tab, finding a picture already there, never asked for a new one.
   * Two tabs, two different selections, no way to tell.
   */
  const first = [item('1.1')];
  const second = [item('1.1'), item('4.1')];
  let renders = emptyRenders();
  renders = store(renders, first, 'front', 'front-of-one');
  renders = store(renders, first, 'left_profile', 'left-of-one');
  renders = store(renders, second, 'front', 'front-of-two');

  assert.equal(renderFor(renders, stackFingerprint(second), 'front').result, 'front-of-two');
  assert.equal(renderFor(renders, stackFingerprint(second), 'left_profile'), null,
    'the two-procedure stack has no left profile, and the one-procedure one must not stand in');
  assert.equal(renderFor(renders, stackFingerprint(first), 'left_profile').result, 'left-of-one',
    'the old stack keeps its own left profile, under its own key');
});

test('the picture of another selection may be shown, but never silently', () => {
  const before = [item('1.1')];
  const after = [item('1.1'), item('4.1')];
  const renders = store(emptyRenders(), before, 'front', 'front-of-one');

  const current = shownRender(renders, stackFingerprint(before), 'front');
  assert.deepEqual([current.entry.result, current.stale], ['front-of-one', false]);

  const stale = shownRender(renders, stackFingerprint(after), 'front');
  assert.equal(stale.entry.result, 'front-of-one', 'the previous image is still worth showing');
  assert.equal(stale.stale, true, 'and the caller is told, so the screen can say so');
});

test('a fallback never crosses angles', () => {
  // Showing the front render under the Left tab is the same class of lie as showing another
  // stack's render: the label on screen would be wrong about what the picture is.
  const renders = store(emptyRenders(), [item('1.1')], 'front', 'front-image');
  const shown = shownRender(renders, stackFingerprint([item('4.1')]), 'left_profile');
  assert.deepEqual([shown.entry, shown.stale], [null, false]);
  assert.equal(lastRenderForView(renders, 'left_profile'), null);
});

test('the most recent render at an angle is the one that stands in for the others', () => {
  let renders = emptyRenders();
  renders = store(renders, [item('1.1')], 'front', 'oldest');
  renders = store(renders, [item('4.1')], 'front', 'newest');
  assert.equal(lastRenderForView(renders, 'front').result, 'newest');
});

test('re-ticking a procedure that was already rendered costs nothing', () => {
  /**
   * The saving this map exists for, and the case the owner measured: add A, add B, remove B, add B
   * again. Under the old flow that was four paid renders for two distinct images. Ticking no longer
   * renders at all, and when the stack lands back on a combination that has been rendered before,
   * the key matches and the image is already here.
   */
  const withB = [item('1.1'), item('4.1')];
  const renders = store(emptyRenders(), withB, 'front', 'A+B');
  const backAgain = [item('1.1'), item('4.1')];
  assert.equal(renderFor(renders, stackFingerprint(backAgain), 'front').result, 'A+B',
    'the same selection must find its own render rather than buying it twice');
});

test('a stack knows whether it has ever been rendered, which is what lets an angle change be automatic', () => {
  const stack = [item('1.1')];
  const renders = store(emptyRenders(), stack, 'front', 'front-image');
  assert.equal(stackRendered(renders, stackFingerprint(stack)), true);
  assert.equal(stackRendered(renders, stackFingerprint([item('4.1')])), false,
    'a stack nobody has pressed Create on must not start renders by having its angle tab clicked');
});

test('what is pending is named, not counted', () => {
  const shownStack = [item('1.1'), item('4.1', 2)];
  const stack = [item('1.1'), item('4.1', 5), item('5.1')];
  const changes = pendingChanges(shownStack, stack);
  assert.deepEqual(changes.added.map((row) => row.id), ['5.1']);
  assert.deepEqual(changes.removed.map((row) => row.id), []);
  assert.deepEqual(changes.relevelled, [{ id: '4.1', from: 2, to: 5 }]);
  assert.equal(changeCount(changes), 2);

  const emptied = pendingChanges(shownStack, []);
  assert.deepEqual(emptied.removed.map((row) => row.id), ['1.1', '4.1']);
  assert.equal(changeCount(noChanges()), 0);
});

test('every chosen row knows whether it is in the picture', () => {
  const entry = { stack: [item('1.1'), item('4.1', 2)] };
  const standings = rowStandings(entry, [item('1.1'), item('4.1', 5), item('5.1')]);
  assert.equal(standings.get('1.1'), 'in');
  // A level moved from 2 to 5 leaves the row chosen and the image out of date. A row marked simply
  // "chosen" would be hiding exactly the change the user just made.
  assert.equal(standings.get('4.1'), 'relevelled');
  assert.equal(standings.get('5.1'), 'added');
});

test('with no picture at all, every chosen row reads as not in one', () => {
  const standings = rowStandings(null, [item('1.1')]);
  assert.equal(standings.get('1.1'), 'added');
});
