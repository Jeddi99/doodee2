import assert from 'node:assert/strict';
import test from 'node:test';

import { canSubmitCode, daysRemaining, isVipActive, normalizeCode } from './promoCode.js';

test('codes are normalised the way the server stores them', () => {
  assert.equal(normalizeCode('  doodee-vip  '), 'DOODEE-VIP');
  assert.equal(normalizeCode(''), '');
  assert.equal(normalizeCode(null), '');
  assert.equal(normalizeCode(undefined), '');
});

test('a code too short to exist never reaches the server', () => {
  assert.equal(canSubmitCode('short'), false);
  assert.equal(canSubmitCode('  seven7  '), false);
  assert.equal(canSubmitCode('eightchr'), true);
  assert.equal(canSubmitCode('  doodee-vip '), true);
});

const now = Date.UTC(2026, 7, 9, 12, 0, 0);
const inDays = (days) => new Date(now + days * 86_400_000).toISOString();

test('remaining days round up so the final partial day still counts', () => {
  assert.equal(daysRemaining(inDays(7), now), 7);
  assert.equal(daysRemaining(inDays(6.2), now), 7);
  assert.equal(daysRemaining(inDays(0.1), now), 1);
});

test('an expired or missing entitlement reads as nothing, never a negative count', () => {
  assert.equal(daysRemaining(null, now), null);
  assert.equal(daysRemaining(undefined, now), null);
  assert.equal(daysRemaining(inDays(-1), now), null);
  assert.equal(daysRemaining(new Date(now).toISOString(), now), null);
  assert.equal(daysRemaining('not a date', now), null);
});

test('active status follows the same clock as the countdown', () => {
  assert.equal(isVipActive(inDays(1), now), true);
  assert.equal(isVipActive(inDays(-0.01), now), false);
  assert.equal(isVipActive(null, now), false);
});
