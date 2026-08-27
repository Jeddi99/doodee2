import assert from 'node:assert/strict';
import test from 'node:test';

import {
  benefitsFor,
  daysUntil,
  describeExpiry,
  formatDate,
  isExpiringSoon,
  quotaRows,
} from './profile.js';

const now = Date.UTC(2026, 7, 24, 12, 0, 0);
const inDays = (n) => new Date(now + n * 86_400_000).toISOString();

test('days are counted up, so the last partial day still shows', () => {
  assert.equal(daysUntil(inDays(30), now), 30);
  assert.equal(daysUntil(inDays(0.5), now), 1, 'half a day left is still a day, not zero');
  assert.equal(daysUntil(inDays(-2), now), -2);
});

test('no date is not a broken date', () => {
  assert.equal(daysUntil(null, now), null);
  assert.equal(daysUntil(undefined, now), null);
  assert.equal(daysUntil('not a date', now), null);
});

test('a plan close to its end says so, and an expired one is not called fine', () => {
  assert.equal(isExpiringSoon(inDays(3), 7, now), true);
  assert.equal(isExpiringSoon(inDays(30), 7, now), false);
  assert.equal(isExpiringSoon(inDays(-1), 7, now), true, 'already gone is the most urgent case');
  assert.equal(isExpiringSoon(null, 7, now), false, 'no expiry is not an expiry that is near');
});

test('an account with no subscription reads as having no expiry, not as broken', () => {
  // An admin granting a group writes no Subscription. A blank would look like a failed load.
  assert.equal(describeExpiry(null, 'th', now), 'ไม่มีวันหมดอายุ');
  assert.equal(describeExpiry(null, 'en', now), 'No expiry date');
});

test('the expiry line reads differently at each stage', () => {
  assert.equal(describeExpiry(inDays(30), 'th', now), 'เหลืออีก 30 วัน');
  assert.equal(describeExpiry(inDays(0), 'th', now), 'หมดอายุวันนี้');
  assert.equal(describeExpiry(inDays(-3), 'th', now), 'หมดอายุแล้ว');
  assert.equal(describeExpiry(inDays(30), 'en', now), '30 days left');
});

test('dates format without throwing on anything the server might not send', () => {
  assert.equal(formatDate(null), '');
  assert.equal(formatDate(''), '');
  assert.equal(formatDate('nonsense'), '');
  assert.ok(formatDate(inDays(0), 'en').length > 0);
});

test('nothing to spend produces no benefit cards', () => {
  assert.deepEqual(benefitsFor({ benefits: { credit_satang: 0, discounts: [] } }), []);
  assert.deepEqual(benefitsFor({}), []);
  assert.deepEqual(benefitsFor(undefined), []);
});

test('credit becomes a card that leads to checkout with it applied', () => {
  const [benefit] = benefitsFor({ benefits: { credit_satang: 3000, discounts: [] } });
  assert.equal(benefit.kind, 'credit');
  assert.equal(benefit.amountSatang, 3000);
  assert.equal(benefit.to, '/pricing?credit=1');
});

test('a discount becomes a card carrying its code to checkout', () => {
  const discount = { code: 'FRIEND10', discount_type: 'percent', discount_value: 10, max_discount_satang: 10000 };
  const [benefit] = benefitsFor({ benefits: { credit_satang: 0, discounts: [discount] } });
  assert.equal(benefit.kind, 'discount');
  assert.equal(benefit.to, '/pricing?coupon=FRIEND10');
  assert.equal(benefit.discount.max_discount_satang, 10000, 'the cap travels with it');
});

test('holding both shows both', () => {
  const benefits = benefitsFor({
    benefits: { credit_satang: 3000, discounts: [{ code: 'FRIEND10' }] },
  });
  assert.deepEqual(benefits.map((b) => b.kind), ['credit', 'discount']);
});

test('a code needing escaping does not break the link', () => {
  const [benefit] = benefitsFor({ benefits: { discounts: [{ code: 'A B&C' }] } });
  assert.equal(benefit.to, '/pricing?coupon=A%20B%26C');
});

test('unlimited stays null all the way to the label', () => {
  const rows = quotaRows({ quotas: { preview_remaining: null, chat_remaining: 50, saved_remaining: 20 } });
  const previews = rows.find((r) => r.key === 'preview_remaining');
  assert.equal(previews.unlimited, true);
  assert.equal(previews.remaining, null, 'a sentinel number here is how "unlimited" grows a countdown');
  const chat = rows.find((r) => r.key === 'chat_remaining');
  assert.equal(chat.unlimited, false);
  assert.equal(chat.remaining, 50);
});

test('a missing quotas block does not crash the card', () => {
  const rows = quotaRows({});
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.unlimited === true));
});
