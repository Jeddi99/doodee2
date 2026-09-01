import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_INTENSITY_LEVEL, MAX_PROCEDURES, clearUnlockedProcedures, emptyProcedureStack,
  isProcedureLocked, procedureCount, procedureItem, removeProcedure, setProcedureIntensity,
  toProcedureRequest, toggleProcedure, toggleProcedureLock, unlockProcedure,
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

test('a full stack refuses a seventh but still lets the six be changed', () => {
  // Six is what the backend accepts; a seventh would be refused there with `too_many_selections`
  // after the user had already been shown it going in.
  const ids = ['1.1', '1.2', '1.4', '4.1', '4.2', '4.3'];
  const full = build(...ids);
  assert.equal(procedureCount(full), MAX_PROCEDURES);
  assert.equal(toggleProcedure(full, '5.1'), full, 'a seventh is refused');
  assert.equal(procedureCount(toggleProcedure(full, '1.1')), MAX_PROCEDURES - 1, 'removal still works');
  assert.equal(procedureItem(setProcedureIntensity(full, '4.1', 2), '4.1').level, 2);
});
