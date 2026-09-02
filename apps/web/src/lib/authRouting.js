// `login` is public by definition; `onboarding` stays public so a user who
// signs in can finish answering before their first scan is created.
//
// `terms` and `privacy` are public because the login screen tells every visitor that continuing
// means accepting them, and links to both from there. A consent notice that points at a document
// you must first consent in order to read is not notice — so these two must render signed out.
const PUBLIC_ROUTES = new Set(['landing', 'login', 'onboarding', 'terms', 'privacy']);

// Every route the app answers, and the path it answers on. Lives here rather than in App.jsx so
// the table and the rules that gate it are one module, and so a test can read it — see
// `routesWithNoScreen` below.
export const ROUTE_PATHS = {
  landing: '/', login: '/login', onboarding: '/onboarding', terms: '/terms', privacy: '/privacy',
  home: '/home', analysis: '/analysis', plan: '/plan', 'doodee-gpt': '/doodee-gpt',
  'face-scan': '/scan', 'skin-scan': '/skin-scan', simulation: '/simulation', skin: '/skin',
  tryon: '/try-on', history: '/history', pricing: '/pricing', settings: '/settings',
  scorecard: '/score-card', assessment: '/assessment', referral: '/referral', profile: '/profile',
};

// Every signed-in route lives inside DashboardPage's shell; the path picks the view.
export const DASHBOARD_VIEWS = {
  home: 'overview',
  analysis: 'analysis',
  plan: 'plan',
  simulation: 'simulate',
  skin: 'skin',
  'doodee-gpt': 'doodeegpt',
  tryon: 'tryon',
  history: 'history',
  pricing: 'pricing',
  settings: 'settings',
  scorecard: 'scorecard',
  // `/assessment` used to be absent from this table while still being present in ROUTE_PATHS. It
  // matched a route, passed the signed-in check above, and then fell through every render branch
  // in App.jsx to an empty shell. A blank page, not a 404 — nothing logs, nothing throws, and the
  // screen behind it (AssessmentView) had been fully built and wired into DashboardPage all along.
  assessment: 'assessment',
  referral: 'referral',
  profile: 'profile',
};

// The routes App.jsx renders as their own top-level screen instead of a dashboard view. Listed so
// the check below can tell "renders something else" apart from "renders nothing at all".
const STANDALONE_ROUTES = new Set([
  'landing', 'login', 'terms', 'privacy', 'onboarding', 'face-scan', 'skin-scan',
]);

/** Routes that resolve but draw nothing. Always empty; a name here is a dead route.
 *
 * The assessment bug was exactly this and it was invisible: two tables that have to agree sat
 * next to each other with nothing comparing them, so adding a path and forgetting the view cost
 * nothing at build time and produced a blank screen at run time. This is the comparison.
 */
export function routesWithNoScreen() {
  return Object.keys(ROUTE_PATHS).filter(
    (route) => !STANDALONE_ROUTES.has(route) && !DASHBOARD_VIEWS[route],
  );
}

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
