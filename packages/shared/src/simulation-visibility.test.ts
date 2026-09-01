import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { FAINT_PERCENT, describeVisibility } from './simulation-visibility.ts';

const three = (front, left, right) => ({ front, left_profile: left, right_profile: right });

test('a render that fills the frame needs no explanation', () => {
  assert.deepEqual(describeVisibility(three(3.99, 3.05, 3.93), 'front'),
    { level: 'clear', percent: 3.99, elsewhere: null });
});

test('an angle that shows nothing points at the one that does', () => {
  // Tattoo removal on one cheek: the opposite profile is a correct render of no change, and
  // the useful thing to say is which tab to open, not that something went wrong.
  const result = describeVisibility(three(2.6, 0, 0.007), 'left_profile');
  assert.equal(result.level, 'elsewhere');
  assert.equal(result.elsewhere, 'front');
  assert.equal(result.percent, 0);
});

test('it points at the angle that shows the most, not the first one over the line', () => {
  assert.equal(describeVisibility(three(0.9, 0.1, 4.2), 'left_profile').elsewhere, 'right_profile');
});

test('a procedure that is faint everywhere says so instead of sending the user hunting', () => {
  // 4.1, nasolabial filler, at the strongest setting. There is no better angle to offer.
  const result = describeVisibility(three(0.115, 0.091, 0.051), 'front');
  assert.equal(result.level, 'faint');
  assert.equal(result.elsewhere, null);
  assert.equal(result.percent, 0.115);
});

test('an unmeasured render makes no claim, and is not read as zero', () => {
  // Rows saved before this was recorded, and the single-image engine, which does not measure it.
  // Treating a missing number as zero would put "nothing changed" under a perfectly good image.
  for (const empty of [{}, null, undefined, { front: null }, { front: 'lots' }]) {
    assert.equal(describeVisibility(empty, 'front').level, 'unmeasured', JSON.stringify(empty));
  }
  assert.equal(describeVisibility(three(3.99, 3.05, 3.93), 'left_eye').level, 'unmeasured',
    'a view the render does not hold');
});

test('exactly at the threshold counts as visible', () => {
  assert.equal(describeVisibility({ front: FAINT_PERCENT }, 'front').level, 'clear');
  assert.equal(describeVisibility({ front: FAINT_PERCENT - 0.001 }, 'front').level, 'faint');
});

test('the threshold still matches the one the server measures against', () => {
  /**
   * The check that keeps two implementations of one rule from drifting. Nothing builds the JS
   * constant from the Python one — this reads canonical_pipeline.py and compares. When it
   * fails, the fix is to decide which value is right and change both.
   */
  const pipeline = readFileSync(
    fileURLToPath(new URL('../../../backend/doodee/canonical_pipeline.py', import.meta.url)),
    'utf8',
  );
  const match = pipeline.match(/^FAINT_FRACTION = (\.?[0-9.]+)/m);
  assert.ok(match, 'FAINT_FRACTION is gone from canonical_pipeline.py');
  assert.equal(Number(match[1]) * 100, FAINT_PERCENT);
});
