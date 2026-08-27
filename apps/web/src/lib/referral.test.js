import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REF_STORAGE_KEY,
  baht,
  describeDiscount,
  isValidReferralCode,
  normalizeReferralCode,
  planPairs,
  referralCodeFromQuery,
  rememberReferralCode,
  shareUrl,
  takeStoredReferralCode,
  yearlySavingPercent,
} from './referral.js';

/** Enough of the Storage interface for these functions, without a browser. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
    data,
  };
}

test('codes normalise the way the server stores them', () => {
  assert.equal(normalizeReferralCode('  ab2c3d4e '), 'AB2C3D4E');
  assert.equal(normalizeReferralCode(null), '');
  assert.equal(normalizeReferralCode(undefined), '');
});

test('the shape check matches the alphabet the server mints from', () => {
  assert.equal(isValidReferralCode('AB2C3D4E'), true);
  assert.equal(isValidReferralCode('ab2c3d4e'), true, 'case is normalised first');
  assert.equal(isValidReferralCode('AB2C3D4'), false, 'too short');
  assert.equal(isValidReferralCode('AB2C3D4EF'), false, 'too long');
  // The five characters the server leaves out because they get misread aloud.
  for (const banned of ['0', 'O', '1', 'I', 'L']) {
    assert.equal(isValidReferralCode(`AB2C3D4${banned}`), false, `${banned} should not be minted`);
  }
});

test('a code is read out of the query string, and rubbish is ignored', () => {
  assert.equal(referralCodeFromQuery('?ref=AB2C3D4E'), 'AB2C3D4E');
  assert.equal(referralCodeFromQuery('?utm=x&ref=ab2c3d4e&y=1'), 'AB2C3D4E');
  assert.equal(referralCodeFromQuery('?ref=nope'), '');
  assert.equal(referralCodeFromQuery(''), '');
  assert.equal(referralCodeFromQuery(undefined), '');
});

test('a code survives the round trip through a sign-in provider', () => {
  // Google sign-in leaves the page and returns on a URL with no ?ref= on it.
  const storage = fakeStorage();
  rememberReferralCode('AB2C3D4E', storage);
  assert.equal(storage.getItem(REF_STORAGE_KEY), 'AB2C3D4E');
  assert.equal(takeStoredReferralCode(storage), 'AB2C3D4E');
});

test('the first inviter to send someone here keeps them', () => {
  const storage = fakeStorage({ [REF_STORAGE_KEY]: 'AB2C3D4E' });
  rememberReferralCode('ZZ9Y8X7W', storage);
  assert.equal(storage.getItem(REF_STORAGE_KEY), 'AB2C3D4E');
});

test('a stored code is cleared on read even when it is unusable', () => {
  // Otherwise a failed claim retries on every page load and burns the rate limit.
  const storage = fakeStorage({ [REF_STORAGE_KEY]: 'garbage' });
  assert.equal(takeStoredReferralCode(storage), '');
  assert.equal(storage.getItem(REF_STORAGE_KEY), null);
});

test('nothing throws without a storage object', () => {
  assert.equal(rememberReferralCode('AB2C3D4E', null), '');
  assert.equal(takeStoredReferralCode(null), '');
});

test('the share link is built from the current origin', () => {
  assert.equal(shareUrl('AB2C3D4E', 'https://doodee.app'), 'https://doodee.app/?ref=AB2C3D4E');
  assert.equal(shareUrl('AB2C3D4E', 'http://localhost:5173/'), 'http://localhost:5173/?ref=AB2C3D4E');
});

test('satang render as baht and drop the decimals when they are zero', () => {
  assert.equal(baht(3000), '฿30');
  assert.equal(baht(49900), '฿499');
  assert.equal(baht(4990), '฿49.90');
  assert.equal(baht(0), '฿0');
  assert.equal(baht(null), '฿0');
});

test('a capped percentage always shows its cap', () => {
  // "ลด 10%" against the ฿4,990 yearly plan promises ฿499 and delivers ฿100.
  const discount = { discount_type: 'percent', discount_value: 10, max_discount_satang: 10000 };
  assert.equal(describeDiscount(discount), 'ลด 10% (ไม่เกิน ฿100)');
  assert.equal(describeDiscount(discount, 'en'), '10% off (up to ฿100)');
});

test('an uncapped percentage says so by saying nothing', () => {
  const discount = { discount_type: 'percent', discount_value: 20, max_discount_satang: 0 };
  assert.equal(describeDiscount(discount), 'ลด 20%');
});

test('a fixed discount reads as money', () => {
  assert.equal(describeDiscount({ discount_type: 'fixed', discount_value: 10000 }), 'ลด ฿100');
});

test('nothing is described when there is no discount', () => {
  assert.equal(describeDiscount(null), '');
});

test('the yearly saving is computed against twelve months, not ten', () => {
  assert.equal(yearlySavingPercent({ price_satang: 49900 }, { price_satang: 499000 }), 17);
  assert.equal(yearlySavingPercent({ price_satang: 79900 }, { price_satang: 799000 }), 17);
});

test('no badge is shown when a saving would be meaningless', () => {
  assert.equal(yearlySavingPercent({ price_satang: 0 }, { price_satang: 0 }), null);
  assert.equal(yearlySavingPercent({ price_satang: 49900 }, null), null);
  assert.equal(
    yearlySavingPercent({ price_satang: 49900 }, { price_satang: 700000 }),
    null,
    'a yearly plan that costs more than twelve months saves nothing',
  );
});

test('monthly plans are paired with their yearly counterpart', () => {
  const plans = [
    { code: 'free', interval: 'month' },
    { code: 'plus', interval: 'month' },
    { code: 'plus_year', interval: 'year' },
    { code: 'pro', interval: 'month' },
    { code: 'pro_year', interval: 'year' },
  ];
  const pairs = planPairs(plans);
  assert.deepEqual(pairs.map((pair) => pair.monthly.code), ['free', 'plus', 'pro']);
  assert.equal(pairs[0].yearly, null, 'the free tier has no yearly row');
  assert.equal(pairs[1].yearly.code, 'plus_year');
  assert.equal(pairs[2].yearly.code, 'pro_year');
});

test('pairing survives an empty or missing price list', () => {
  assert.deepEqual(planPairs([]), []);
  assert.deepEqual(planPairs(undefined), []);
});
