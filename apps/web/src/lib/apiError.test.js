import assert from 'node:assert/strict';
import test from 'node:test';

import { errorMessage, errorReason } from './apiError.js';

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

test('the upstream reason is read out of the payload the thrown Error carries', () => {
  // The case this exists for: a chat turn refused by the provider. Without it the screen shows
  // "chat_upstream_error" and a user cannot tell a misconfigured key from a broken feature.
  const error = new Error('chat_upstream_error');
  error.payload = { detail: 'chat_upstream_error', reason: 'http_400: API key not valid.' };
  assert.equal(errorMessage(error), 'chat_upstream_error');
  assert.equal(errorReason(error), 'http_400: API key not valid.');
});

test('a failure with no reason adds nothing rather than the word undefined', () => {
  const error = new Error('chat_upstream_error');
  error.payload = { detail: 'chat_upstream_error' };
  assert.equal(errorReason(error), '');
  assert.equal(errorReason(null), '');
  assert.equal(errorReason({ reason: '   ' }), '');
});

test('a credential inside a reason never reaches the screen', () => {
  // `_gemini_reply` puts the API key in the query string, so a transport-level failure — unlike
  // an HTTP one, which quotes only the response body — can quote the URL back with the key in it.
  assert.equal(
    errorReason({ reason: 'unreachable: <urlopen error> https://x/v1beta/models/m:g?key=AIzaSyABCDEFGH12345' }),
    'unreachable: <urlopen error> https://x/v1beta/models/m:g?key=…',
  );
  assert.equal(errorReason({ reason: 'http_401: bad token gsk_ABCDEFGH12345678' }), 'http_401: bad token gsk_…');
});
