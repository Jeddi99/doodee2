/**
 * When a failed query is worth asking again, and how long to wait.
 *
 * react-query's defaults are `retry: 3` with no status awareness, which is the wrong shape for
 * this API in both directions. A 429 from the chat quota (`chat_quota_exhausted`) or from a DRF
 * throttle is a *correct answer* — asking three more times cannot change it, it just spends the
 * user's rate budget on being told no. And when the backend is genuinely struggling, four
 * attempts per query across the ~8 components that each ask for `session` and `scans` turns a
 * slow API into an unreachable one. The retry storm is the outage.
 *
 * So: never retry a 4xx, retry a network failure or a 5xx exactly once, and jitter the delay so
 * a thousand tabs recovering from the same blip do not arrive together.
 *
 * Its own module, with no imports, so it can be tested without pulling in Firebase or react-query.
 */

/** Whether asking again could plausibly get a different answer. */
export function isRetriable(error) {
  const status = error?.status;
  // No status means the request never reached the server (DNS, offline, TLS). Worth one retry.
  if (typeof status !== 'number') return true;
  // 4xx is the server telling us something true about this request: bad input, no permission,
  // quota gone, rate limited. Repeating it changes nothing.
  if (status >= 400 && status < 500) return false;
  return status >= 500;
}

/** react-query's `retry`: one extra attempt, and only when it could help. */
export function retry(failureCount, error) {
  return failureCount < 1 && isRetriable(error);
}

/**
 * Exponential backoff with jitter. `rng` is injectable so the spread is testable; production
 * passes nothing and gets Math.random.
 */
export function retryDelay(attempt, rng = Math.random) {
  return Math.min(1000 * 2 ** attempt, 8000) + Math.floor(rng() * 300);
}
