/**
 * The reason a request failed, whichever shape the server used to say it.
 *
 * DRF answers a field error with `{field: ["reason"]}` rather than `{detail: …}`, so reading
 * only `detail` turned every validation failure into "Request failed (400)" — which tells the
 * user nothing and hides codes the UI needs to react to, such as which region was rejected.
 *
 * Its own module, with no imports, so it can be tested without pulling in Firebase.
 */
export function errorMessage(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  // An Error thrown by the client (a dead server, say) carries its explanation on `message`.
  // Walking its enumerable properties instead surfaced the bare `code`, so "api_unreachable"
  // reached the screen in place of "Cannot reach the API at …".
  if (payload instanceof Error) return payload.message;
  const first = (value) => (Array.isArray(value) ? first(value[0]) : typeof value === 'string' ? value : '');
  return first(payload.detail) || Object.values(payload).map(first).find(Boolean) || '';
}

/**
 * Anything in a reason that looks like a credential, blanked.
 *
 * The reason is upstream text quoted verbatim, and `chat._gemini_reply` builds its URL with the
 * API key in the query string — so a transport error, unlike an HTTP one, really can carry it.
 * Stripping here rather than at the call site means no caller has to remember.
 */
const SECRETS = [
  [/\b(key|token|secret|password|api[-_]?key)=[^\s&"']+/gi, '$1=…'],
  [/\b(AIza|sk-|gsk_)[A-Za-z0-9_-]{8,}/g, '$1…'],
];

/**
 * What actually went wrong behind a coded failure, when the server said.
 *
 * `errorMessage` reads `detail`, and for an upstream failure that is a code — "chat_upstream_error"
 * — which on screen is indistinguishable from the feature quietly not working. The server already
 * sends the real explanation under `reason`, and `request()` keeps the whole payload on the Error
 * it throws, so the answer was one field away and was being dropped.
 *
 * Empty string when there is nothing to add, so a caller can render it conditionally without
 * checking for null.
 */
export function errorReason(error) {
  const payload = error instanceof Error ? error.payload : error;
  const reason = payload && typeof payload === 'object' ? payload.reason : null;
  if (typeof reason !== 'string' || !reason.trim()) return '';
  return SECRETS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), reason).trim();
}
