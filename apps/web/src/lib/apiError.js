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
