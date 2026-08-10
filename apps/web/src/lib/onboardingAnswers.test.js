import assert from 'node:assert/strict';
import test from 'node:test';

import { AGE_BANDS, ageBandFor, canContinueFromAge } from './onboardingAnswers.js';

test('a typed age becomes a band, never an exact age', () => {
  assert.equal(ageBandFor('27'), AGE_BANDS.ADULT_COHORT);
  assert.equal(ageBandFor('18'), AGE_BANDS.ADULT_COHORT);
  assert.equal(ageBandFor('35'), AGE_BANDS.ADULT_COHORT);
  assert.equal(ageBandFor('36'), AGE_BANDS.ADULT_OUTSIDE);
  assert.equal(ageBandFor('90'), AGE_BANDS.ADULT_OUTSIDE);
});

test('under eighteen is blocked before any photo is taken', () => {
  assert.equal(ageBandFor('17'), AGE_BANDS.UNDER_18);
  assert.equal(canContinueFromAge('17'), false);
  assert.equal(canContinueFromAge('1'), false);
  assert.equal(canContinueFromAge('18'), true);
});

test('values outside one to one hundred twenty are not an age at all', () => {
  for (const input of ['', ' ', '0', '121', '1000', 'abc', '-5', '2.5']) {
    assert.equal(ageBandFor(input), null, `expected ${JSON.stringify(input)} to be rejected`);
    assert.equal(canContinueFromAge(input), false);
  }
});
