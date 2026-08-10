const PUBLIC_ROUTES = new Set(['landing', 'onboarding']);

export function authRedirect(authReady, isAuthenticated, currentRoute) {
  if (!authReady) return null;
  if (isAuthenticated && currentRoute === 'landing') return 'home';
  if (!isAuthenticated && !PUBLIC_ROUTES.has(currentRoute)) return 'landing';
  return null;
}
