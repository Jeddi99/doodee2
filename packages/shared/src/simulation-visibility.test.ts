import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { FAINT_PERCENT, STRONG_DELTA, describeVisibility } from './simulation-visibility.ts';

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

test('the thresholds still match the ones the server measures against', () => {
  /**
   * The check that keeps two implementations of one rule from drifting. Nothing builds the JS
   * constants from the Python ones — this reads canonical_pipeline.py and compares. When it
   * fails, the fix is to decide which value is right and change both.
   */
  const pipeline = readFileSync(
    fileURLToPath(new URL('../../../backend/doodee/canonical_pipeline.py', import.meta.url)),
    'utf8',
  );
  const fraction = pipeline.match(/^FAINT_FRACTION = (\.?[0-9.]+)/m);
  assert.ok(fraction, 'FAINT_FRACTION is gone from canonical_pipeline.py');
  assert.equal(Number(fraction[1]) * 100, FAINT_PERCENT);

  const strong = pipeline.match(/^STRONG_DELTA = (\d+)/m);
  assert.ok(strong, 'STRONG_DELTA is gone from canonical_pipeline.py');
  assert.equal(Number(strong[1]), STRONG_DELTA);
});

test('a small area changed hard is reported as local, not as nothing', () => {
  /**
   * 10.2, hairline transplant, measured on a real scan: 0.389% of the frame, peak channel delta
   * 137 — more than half the range. Under area alone it was `faint`, and the sentence attached to
   * `faint` says "on your face, this procedure changes very little". A hairline had just been
   * drawn onto the photograph. Mole removal (peak 78) and cosmetic tattooing (64) were told the
   * same thing.
   */
  const hairline = describeVisibility({ front: { percent: 0.389, peak: 137 } }, 'front');
  assert.equal(hairline.level, 'local');
  assert.equal(hairline.percent, 0.389);

  // And the rows that really are faint stay faint: an eyelid crease peaks at 12, a tear trough
  // at 7. Those are the ones a viewer has to be told about, so the threshold must not swallow them.
  for (const [name, peak] of [['double eyelid', 12], ['tear trough', 7], ['lower bleph', 5]]) {
    assert.equal(describeVisibility({ front: { percent: 0.066, peak } }, 'front').level, 'faint', name);
  }
});

test('a wash over the whole face is still clear, and area still wins when it is enough', () => {
  // 2.9, facial peel: 15.3% of the frame at a peak of only 6. Broad and shallow is still visible.
  assert.equal(describeVisibility({ front: { percent: 15.33, peak: 6 } }, 'front').level, 'clear');
});

test('an angle that only clears the peak bar is still worth switching to', () => {
  const result = describeVisibility({
    front: { percent: 0.01, peak: 4 },
    left_profile: { percent: 0.2, peak: 90 },
  }, 'front');
  assert.equal(result.level, 'elsewhere');
  assert.equal(result.elsewhere, 'left_profile');
});

test('a row saved before the peak was recorded is read, not discarded', () => {
  // The stored shape changed from a bare percentage to `{ percent, peak }`. Old rows keep the old
  // shape forever, and reading them as unmeasured would drop the warning from every one of them.
  const old = describeVisibility({ front: 0.115, left_profile: 0.091 }, 'front');
  assert.equal(old.level, 'faint');
  assert.equal(old.percent, 0.115);
  assert.equal(describeVisibility({ front: 3.99 }, 'front').level, 'clear');
});
