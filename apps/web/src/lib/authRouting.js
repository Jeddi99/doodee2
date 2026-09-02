// `login` is public by definition; `onboarding` stays public so a user who
// signs in can finish answering before their first scan is created.
//
// `terms` and `privacy` are public because the login screen tells every visitor that continuing
// means accepting them, and links to both from there. A consent notice that points at a document
// you must first consent in order to read is not notice — so these two must render signed out.
const PUBLIC_ROUTES = new Set(['landing', 'login', 'onboarding', 'terms', 'privacy']);

// `hasScan` is a tri-state on purpose: true, false, or null while the scan list has not
// answered yet. It has to be, because the dashboard sends a signed-in user with no scan back
// to the landing page — so if this function guessed `false` as "not yet known" it would bounce
// them to home, the dashboard would bounce them back, and the two rules would trade the user
// between them forever. Unknown means stay put.
export function authRedirect(authReady, isAuthenticated, currentRoute, hasScan = null) {
  if (!authReady) return null;
  if (isAuthenticated && currentRoute === 'landing') return hasScan === true ? 'home' : null;
  if (!isAuthenticated && !PUBLIC_ROUTES.has(currentRoute)) return 'landing';
  return null;
}
