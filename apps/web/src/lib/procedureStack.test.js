import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_INTENSITY_LEVEL, addProcedures, clearUnlockedProcedures, emptyProcedureStack,
  isProcedureLocked, procedureCount, procedureItem, removeProcedure, removeProcedures,
  setProcedureIntensity, toProcedureRequest, toggleProcedure, toggleProcedureLock, unlockProcedure,
} from './procedureStack.js';

const build = (...ids) => ids.reduce((stack, id) => toggleProcedure(stack, id), emptyProcedureStack());

test('two procedures in the same region coexist, which is the whole difference from shapes', () => {
  // 5.1 and 5.2 are both the nose. Under the region-keyed stack the second would have replaced
  // the first; here the user is asking for both and gets both.
  const stack = build('5.1', '5.2');
  assert.equal(procedureCount(stack), 2);
  assert.deepEqual(toProcedureRequest(stack), [
    { procedure_id: '5.1', intensity_level: DEFAULT_INTENSITY_LEVEL },
    { procedure_id: '5.2', intensity_level: DEFAULT_INTENSITY_LEVEL },
  ]);
});

test('choosing a procedure that is already in takes it back out', () => {
  assert.deepEqual(toggleProcedure(build('1.1'), '1.1'), []);
});

test('the intensity level travels with the item', () => {
  const stack = setProcedureIntensity(build('1.1'), '1.1', 5);
  assert.equal(procedureItem(stack, '1.1').level, 5);
  assert.deepEqual(toProcedureRequest(stack), [{ procedure_id: '1.1', intensity_level: 5 }]);
});

test('setting the level it already holds changes nothing, by identity', () => {
  // The caller re-renders and fires a render request on any new state, so an equal-but-new
  // array would cost a round trip for a slider that did not move.
  const stack = build('1.1');
  assert.equal(setProcedureIntensity(stack, '1.1', DEFAULT_INTENSITY_LEVEL), stack);
  assert.equal(setProcedureIntensity(stack, '9.9', 4), stack, 'absent procedures too');
});

test('a locked procedure cannot be removed, re-toggled or re-levelled, and says so by identity', () => {
  const locked = toggleProcedureLock(build('1.1'), '1.1');
  assert.equal(isProcedureLocked(locked, '1.1'), true);
  assert.equal(toggleProcedure(locked, '1.1'), locked, 'toggle must be refused');
  assert.equal(removeProcedure(locked, '1.1'), locked, 'remove must be refused');
  assert.equal(setProcedureIntensity(locked, '1.1', 5), locked, 'intensity must be refused');
});

test('unlocking gives the procedure back', () => {
  const open = toggleProcedureLock(toggleProcedureLock(build('1.1'), '1.1'), '1.1');
  assert.equal(isProcedureLocked(open, '1.1'), false);
  assert.deepEqual(toggleProcedure(open, '1.1'), []);
});

test('unlock only touches one that is actually locked', () => {
  const stack = build('1.1');
  assert.equal(unlockProcedure(stack, '1.1'), stack, 'already unlocked, so nothing changes');
  assert.equal(isProcedureLocked(unlockProcedure(toggleProcedureLock(stack, '1.1'), '1.1'), '1.1'), false);
});

test('clearing keeps what was locked', () => {
  const stack = toggleProcedureLock(build('1.1', '4.1'), '1.1');
  assert.deepEqual(clearUnlockedProcedures(stack).map((item) => item.id), ['1.1']);
});

test('clearing when everything is locked changes nothing, by identity', () => {
  const stack = toggleProcedureLock(build('1.1'), '1.1');
  assert.equal(clearUnlockedProcedures(stack), stack);
});

test('a seventh procedure goes in, and so does a sixteenth', () => {
  // The six-item ceiling this file used to enforce was inherited from a catalogue of six regions
  // that allowed one procedure each, and it was never what the API accepted. Removing it is the
  // point: the largest category alone holds sixteen procedures, and a control offering to select
  // all of them has to be able to.
  const six = build('1.1', '1.2', '1.4', '4.1', '4.2', '4.3');
  const seven = toggleProcedure(six, '5.1');
  assert.equal(procedureCount(seven), 7, 'a seventh must go in');
  assert.notEqual(seven, six, 'and it must be a new array, not a refusal');

  const sixteen = addProcedures(seven, ['5.2', '5.3', '5.4', '6.1', '6.2', '6.3', '7.1', '7.2', '7.3']);
  assert.equal(procedureCount(sixteen), 16);
  assert.equal(toProcedureRequest(sixteen).length, 16, 'and all sixteen are sent');
  // Everything else still behaves at that size.
  assert.equal(procedureCount(toggleProcedure(sixteen, '1.1')), 15, 'removal still works');
  assert.equal(procedureItem(setProcedureIntensity(sixteen, '4.1', 2), '4.1').level, 2);
});

test('selecting a whole category adds what is missing and leaves what is already in alone', () => {
  // The user set 1.1 to level 5 by hand. A bulk add must not quietly reset it to the default —
  // that would be the control undoing a decision the user made deliberately.
  const stack = setProcedureIntensity(build('1.1'), '1.1', 5);
  const filled = addProcedures(stack, ['1.1', '1.2', '1.3']);
  assert.deepEqual(filled.map((item) => item.id), ['1.1', '1.2', '1.3']);
  assert.equal(procedureItem(filled, '1.1').level, 5, 'the level the user chose survives');
  assert.equal(procedureItem(filled, '1.2').level, DEFAULT_INTENSITY_LEVEL);
  assert.equal(addProcedures(filled, ['1.1', '1.2']), filled, 'nothing to add, so nothing changes');
});

test('clearing a category leaves the locked rows standing', () => {
  const stack = toggleProcedureLock(build('1.1', '1.2', '4.1'), '1.1');
  const cleared = removeProcedures(stack, ['1.1', '1.2']);
  assert.deepEqual(cleared.map((item) => item.id), ['1.1', '4.1']);
  assert.equal(removeProcedures(cleared, ['1.1']), cleared, 'a locked-only clear changes nothing');
  assert.equal(removeProcedures(cleared, ['9.9']), cleared, 'and neither does an absent one');
});
