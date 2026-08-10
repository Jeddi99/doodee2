import assert from 'node:assert/strict';
import test from 'node:test';

import { describeSimulationError } from './simulationError.js';

const TH = { chin: 'คาง', jaw: 'กราม', nose: 'จมูก' };
const label = (id) => TH[id] || id;

test('a region-scoped code names the region in the user language', () => {
  const result = describeSimulationError('profile_photos_required:chin', true, label);
  assert.equal(result.code, 'profile_photos_required');
  assert.equal(result.region, 'chin');
  assert.match(result.text, /คาง/);
  assert.doesNotMatch(result.text, /profile_photos_required/, 'the raw code must not reach the screen');
});

test('the region is parsed out so the view can offer to remove exactly that one', () => {
  // The view used to string-match `:region` against every stacked item, which matched too eagerly.
  assert.equal(describeSimulationError('preset_region_mismatch:jaw', false, label).region, 'jaw');
  assert.equal(describeSimulationError('too_many_selections', false, label).region, null);
});

test('a code with no region still reads as a sentence', () => {
  const result = describeSimulationError('too_many_selections', true, label);
  assert.equal(result.code, 'too_many_selections');
  assert.match(result.text, /6 บริเวณ/);
  assert.equal(describeSimulationError('reference_cannot_stack', false, label).text,
    'Compare-to-reference works on one region at a time.');
});

test('malformed-request codes collapse to one plain sentence', () => {
  // Nothing the user picked caused these, so the wording must not imply they chose wrongly.
  for (const code of ['duplicate_region', 'empty_selections', 'invalid_selection', 'conflicting_selection_fields']) {
    assert.match(describeSimulationError(code, true, label).text, /คำขอไม่ถูกต้อง/, code);
  }
});

test('an unmapped code still gives Thai prose, and keeps the raw value for a bug report', () => {
  const result = describeSimulationError('some_new_backend_code', true, label);
  assert.match(result.text, /สร้างภาพจำลองไม่สำเร็จ/);
  assert.match(result.text, /some_new_backend_code/);
  assert.equal(result.code, 'some_new_backend_code');
});

test('an English sentence from the server passes through untouched in English', () => {
  const message = 'Monthly simulation quota reached';
  assert.equal(describeSimulationError(message, false, label).text, message);
  assert.equal(describeSimulationError(message, false, label).code, null, 'prose is not a code');
});

test('nothing to report reads as empty so the caller renders no error block', () => {
  for (const empty of ['', null, undefined, 42]) {
    assert.deepEqual(describeSimulationError(empty, true, label), { code: null, region: null, text: '' });
  }
});
