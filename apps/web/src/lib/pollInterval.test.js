import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusPollInterval } from './pollInterval.js';

const query = (status, dataUpdateCount = 0) => ({
  state: { data: status ? { status } : undefined, dataUpdateCount },
});

test('polling stops the moment the job settles, either way', () => {
  assert.equal(statusPollInterval(query('completed', 3)), false);
  assert.equal(statusPollInterval(query('failed', 3)), false);
});

test('an unsettled job keeps polling at the backed-off delay', () => {
  assert.equal(statusPollInterval(query('processing', 0)), 1500);
  assert.equal(statusPollInterval(query('queued', 2)), 2500);
  assert.equal(statusPollInterval(query('processing', 9)), 6000);
});

test('a route that does not show progress does not poll at all', () => {
  // The whole point: reading receipts must not poll a scan the page never displays.
  assert.equal(statusPollInterval(query('processing', 0), false), false);
  assert.equal(statusPollInterval(query('processing', 0), true), 1500);
});

test('a query with no data yet polls rather than stalling', () => {
  assert.equal(statusPollInterval(query(undefined, 0)), 1500);
  assert.equal(statusPollInterval({}), 1500, 'a missing state must not read as settled');
  assert.equal(statusPollInterval(undefined), 1500);
});
