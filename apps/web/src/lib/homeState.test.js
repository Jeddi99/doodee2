import assert from 'node:assert/strict';
import test from 'node:test';

import { homeScanState } from './homeState.js';

test('home selects the next action from the latest scan', () => {
  const future = '2027-01-01T00:00:00Z';
  assert.equal(homeScanState(null, 0), 'empty');
  assert.equal(homeScanState({ status: 'processing', expires_at: future }, 0), 'processing');
  assert.equal(homeScanState({ status: 'completed', expires_at: future }, 0), 'completed');
  assert.equal(homeScanState({ status: 'failed', expires_at: future }, 0), 'failed');
  assert.equal(homeScanState({ status: 'completed', expires_at: '2025-01-01T00:00:00Z' }, Date.parse('2026-01-01')), 'expired');
});
