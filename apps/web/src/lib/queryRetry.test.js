import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRetriable, retry, retryDelay } from './queryRetry.js';

test('a 4xx is never retried — it is already the final answer', () => {
  // The ones this app actually returns and must not be asked again:
  // 429 chat_quota_exhausted / chat_rate_limited, and every DRF throttle.
  for (const status of [400, 401, 403, 404, 409, 429]) {
    assert.equal(isRetriable({ status }), false, `${status} should not be retriable`);
    assert.equal(retry(0, { status }), false, `${status} should not be retried`);
  }
});

test('a 5xx is retried once, not three times', () => {
  for (const status of [500, 502, 503, 504]) {
    assert.equal(isRetriable({ status }), true);
    assert.equal(retry(0, { status }), true, `${status} deserves one retry`);
    assert.equal(retry(1, { status }), false, `${status} must stop after one retry`);
  }
});

test('a request that never reached the server is retried once', () => {
  // api.js throws this shape when fetch itself rejects: a message and a code, no status.
  const offline = Object.assign(new Error('Cannot reach the API'), { code: 'api_unreachable' });
  assert.equal(isRetriable(offline), true);
  assert.equal(retry(0, offline), true);
  assert.equal(retry(1, offline), false);
});

test('a thrown value with no shape at all is still handled', () => {
  for (const junk of [undefined, null, {}, 'boom']) {
    assert.equal(isRetriable(junk), true, 'unknown failures get exactly one retry, not zero');
  }
});

test('retryDelay backs off exponentially and caps at 8s before jitter', () => {
  const noJitter = () => 0;
  assert.equal(retryDelay(0, noJitter), 1000);
  assert.equal(retryDelay(1, noJitter), 2000);
  assert.equal(retryDelay(2, noJitter), 4000);
  assert.equal(retryDelay(3, noJitter), 8000);
  assert.equal(retryDelay(9, noJitter), 8000, 'capped, so a long outage does not push the delay to hours');
});

test('retryDelay adds bounded jitter so tabs do not retry in lockstep', () => {
  assert.equal(retryDelay(0, () => 0.999), 1299);
  const spread = new Set([0, 0.25, 0.5, 0.75].map((r) => retryDelay(0, () => r)));
  assert.equal(spread.size, 4, 'different rng values must produce different delays');
  for (const r of [0, 0.5, 0.999]) {
    const delay = retryDelay(2, () => r);
    assert.ok(delay >= 4000 && delay < 4300, `jitter stays inside one bucket, got ${delay}`);
  }
});
