import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canWithdraw,
  checkNumber,
  isCancellable,
  isOpen,
  maskAccount,
  normalizeNumber,
  shortfall,
} from './payout.js';

test('the formatting people type into an account field is not part of the account', () => {
  assert.equal(normalizeNumber('123-4-56789-0'), '1234567890');
  assert.equal(normalizeNumber(' 081 234 5678 '), '0812345678');
  assert.equal(normalizeNumber(null), '');
  assert.equal(normalizeNumber(undefined), '');
});

test('a PromptPay id is a mobile number or a national id', () => {
  assert.equal(checkNumber('promptpay', '0812345678'), '');
  assert.equal(checkNumber('promptpay', '1234567890123'), '');
  assert.equal(checkNumber('promptpay', '08-1234-5678'), '', 'formatting is stripped first');
  assert.equal(checkNumber('promptpay', '12345'), 'invalid_promptpay_id');
  assert.equal(checkNumber('promptpay', '12345678901'), 'invalid_promptpay_id');
});

test('a bank account is ten to fifteen digits, matching the server', () => {
  assert.equal(checkNumber('bank', '1234567890'), '');
  assert.equal(checkNumber('bank', '123456789012345'), '');
  assert.equal(checkNumber('bank', '123456789'), 'invalid_account_number');
  assert.equal(checkNumber('bank', '1234567890123456'), 'invalid_account_number');
});

test('an empty field says it is empty rather than that it is invalid', () => {
  assert.equal(checkNumber('bank', ''), 'number_required');
  assert.equal(checkNumber('promptpay', '   '), 'number_required');
});

test('a masked account shows four digits and nothing else', () => {
  assert.equal(maskAccount('0812345678'), '••••5678');
  assert.equal(maskAccount('123-4-56789-0'), '••••7890');
  assert.equal(maskAccount(''), '');
});

const ready = { enabled: true, hasAccount: true, hasOpenRequest: false, balance: 50000, minimum: 30000 };

test('a ready account can withdraw', () => {
  assert.equal(canWithdraw(ready), '');
});

test('every refusal names itself so the button can explain', () => {
  assert.equal(canWithdraw({ ...ready, enabled: false }), 'withdrawal_disabled');
  assert.equal(canWithdraw({ ...ready, hasOpenRequest: true }), 'withdrawal_already_pending');
  assert.equal(canWithdraw({ ...ready, hasAccount: false }), 'no_payout_account');
  assert.equal(canWithdraw({ ...ready, balance: 0 }), 'no_balance');
  assert.equal(canWithdraw({ ...ready, balance: 10000 }), 'below_minimum');
});

test('the most fixable problem is the one reported', () => {
  // Somebody with neither an account nor enough credit should be told to add an account, not
  // sent away to earn more.
  assert.equal(canWithdraw({ ...ready, hasAccount: false, balance: 100 }), 'no_payout_account');
  // And a request already in flight outranks everything, because nothing else is actionable.
  assert.equal(
    canWithdraw({ ...ready, hasOpenRequest: true, hasAccount: false }),
    'withdrawal_already_pending',
  );
});

test('the shortfall says how much further to go, and stops at zero', () => {
  assert.equal(shortfall(10000, 30000), 20000);
  assert.equal(shortfall(30000, 30000), 0);
  assert.equal(shortfall(50000, 30000), 0);
  assert.equal(shortfall(null, 30000), 30000);
});

test('only an untouched request can be taken back', () => {
  assert.equal(isCancellable({ status: 'pending' }), true);
  assert.equal(isCancellable({ status: 'approved' }), false, 'an operator is already on it');
  assert.equal(isCancellable({ status: 'paid' }), false);
  assert.equal(isCancellable(undefined), false);
});

test('open means the money has neither been sent nor returned', () => {
  assert.equal(isOpen({ status: 'pending' }), true);
  assert.equal(isOpen({ status: 'approved' }), true);
  for (const status of ['paid', 'rejected', 'cancelled']) {
    assert.equal(isOpen({ status }), false, `${status} is settled`);
  }
});
