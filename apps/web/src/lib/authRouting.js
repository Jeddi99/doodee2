// `login` is public by definition; `onboarding` stays public so a user who
// signs in can finish answering before their first scan is created.
const PUBLIC_ROUTES = new Set(['landing', 'login', 'onboarding']);

export function authRedirect(authReady, isAuthenticated, currentRoute) {
  if (!authReady) return null;
  if (isAuthenticated && currentRoute === 'landing') return 'home';
  if (!isAuthenticated && !PUBLIC_ROUTES.has(currentRoute)) return 'landing';
  return null;
}
