import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { describeScanError, scanErrorText } from './scanError.js';

/**
 * A raw server code on screen is the same failure as a fabricated number: the screen is not
 * telling the reader what happened. `heavy_queue_busy` reached the capture screens verbatim,
 * under the heading "Upload failed", every time the analysis queue filled up.
 */

test('every code these screens can receive has a sentence in both languages', () => {
  for (const code of ['heavy_queue_busy', 'api_unreachable', 'scan_not_found', 'view_not_captured',
    'no_landmarks', 'stale_consent_version']) {
    for (const isTh of [true, false]) {
      const { text } = describeScanError(code, isTh);
      assert.ok(text.length > 12, `${code} has no sentence in ${isTh ? 'th' : 'en'}`);
      assert.ok(!text.includes(code), `${code} is echoed back as itself in ${isTh ? 'th' : 'en'}`);
      assert.ok(!/_/.test(text), `${code} produced something that still looks like a code`);
    }
  }
});

test('a code this file has not been taught still becomes a sentence, and keeps the raw value', () => {
  for (const isTh of [true, false]) {
    const result = describeScanError('some_code_from_the_future', isTh);
    assert.ok(/[ ]/.test(result.text), 'an unknown code was passed through as a bare token');
    assert.match(result.text, /some_code_from_the_future/, 'the raw value was dropped from the report');
  }
});

test('prose from the server is not wrapped in a code apology', () => {
  const message = 'Consent is required';
  assert.equal(describeScanError(message, false).text, message);
  assert.equal(describeScanError(message, false).code, null);
});

test('a throttled request is answered in the reader’s language, without the seconds', () => {
  const drf = 'Request was throttled. Expected available in 3212 seconds.';
  const th = describeScanError(drf, true);
  assert.equal(th.code, 'throttled');
  assert.ok(!th.text.includes('3212'), 'a countdown in seconds reached the screen');
  assert.ok(!/[A-Za-z]{4}/.test(th.text), 'the Thai reader got the English throttle message');
});

test('nothing produces an empty string, whatever it is handed', () => {
  for (const raw of [null, undefined, '', 0, {}, []]) {
    assert.ok(describeScanError(raw, true).text.length > 0, `${JSON.stringify(raw)} produced no text`);
  }
});

test('scanErrorText prefers the client-set code over the message', () => {
  const error = Object.assign(new Error('Cannot reach the API at http://localhost:8001/api/v1'), {
    code: 'api_unreachable',
  });
  assert.ok(!scanErrorText(error, true).includes('localhost'), 'an API URL reached a user-facing sentence');
});

/**
 * The codes above are not a guess about the server: they are read out of it. If a new one is
 * added to the scan endpoints and not to this module, that is exactly the regression this test
 * is for — a sentence on screen that turns back into snake_case.
 */
test('the codes the scan endpoints raise are the codes this module maps', () => {
  const views = readFileSync(
    fileURLToPath(new URL('../../../../backend/doodee/views.py', import.meta.url)), 'utf8');
  for (const code of ['heavy_queue_busy', 'scan_not_found', 'view_not_captured', 'stale_consent_version']) {
    assert.match(views, new RegExp(`"${code}"`), `${code} is no longer raised by views.py — is this mapping stale?`);
    assert.notEqual(describeScanError(code, true).code, null, `${code} lost its mapping`);
  }
});
