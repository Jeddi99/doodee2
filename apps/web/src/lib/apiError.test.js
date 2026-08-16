import assert from 'node:assert/strict';
import test from 'node:test';

import { errorMessage } from './apiError.js';

test('a plain detail string is used as-is', () => {
  assert.equal(errorMessage({ detail: 'preview_in_progress' }), 'preview_in_progress');
});

test('a DRF field error is read instead of falling through to a generic failure', () => {
  // Without this the simulation view cannot tell which region the server rejected.
  assert.equal(errorMessage({ preset_id: ['profile_photos_required:chin'] }), 'profile_photos_required:chin');
  assert.equal(errorMessage({ scan_id: 'Scan not found' }), 'Scan not found');
});

test('detail wins over other fields', () => {
  assert.equal(errorMessage({ preset_id: ['ignored'], detail: 'chosen' }), 'chosen');
});

test('nothing usable reads as empty so the caller can fall back to a status code', () => {
  assert.equal(errorMessage(null), '');
  assert.equal(errorMessage({}), '');
  assert.equal(errorMessage({ count: 3 }), '');
  assert.equal(errorMessage({ nested: [{ deep: 'no' }] }), '');
});

test('an Error thrown by the client reads out its message, not its code', () => {
  const unreachable = new Error('Cannot reach the API at http://localhost:8001/api/v1');
  unreachable.code = 'api_unreachable';
  assert.equal(errorMessage(unreachable), 'Cannot reach the API at http://localhost:8001/api/v1');
  // DRF payloads are still read the same way.
  assert.equal(errorMessage({ detail: 'Consent is required' }), 'Consent is required');
});
