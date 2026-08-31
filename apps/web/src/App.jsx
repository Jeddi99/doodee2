import React, { lazy, Suspense, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import { authRedirect } from './lib/authRouting';
import { referralCodeFromQuery, rememberReferralCode } from './lib/referral';
import {
  localDay, readAttribution, rememberAttribution, sendVisit, shouldSendVisit, utmFromQuery,
  visitPayload,
} from './lib/visit';
import { postAttribution } from './lib/api';
import { getFirebaseAuth } from './lib/firebase';
import { useLocale } from './useLocale';

// The landing page carries the MediaPipe demo and the treatment canvas, so it
// is worth its own chunk even though it is the first route most users hit.
const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
// One component serves every signed-in view; the route decides which one shows.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
// Own chunk: it pulls in the MediaPipe worker and the wasm loader.
const ScanPage = lazy(() => import('./pages/ScanPage'));
const SkinScanPage = lazy(() => import('./pages/SkinScanPage'));

function WorkspaceFallback({ locale }) {
  return <div className="workspace-loading" role="status">{locale === 'th' ? 'กำลังเปิดหน้า…' : 'Opening…'}</div>;
}

const ROUTE_PATHS = { landing: '/', login: '/login', onboarding: '/onboarding', home: '/home', analysis: '/analysis', plan: '/plan', 'doodee-gpt': '/doodee-gpt', 'face-scan': '/scan', 'skin-scan': '/skin-scan', simulation: '/simulation', skin: '/skin', tryon: '/try-on', history: '/history', pricing: '/pricing', settings: '/settings', scorecard: '/score-card', referral: '/referral', profile: '/profile' };

// Every signed-in route lives inside DashboardPage's shell; the path picks the view.
const DASHBOARD_VIEWS = {
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
  referral: 'referral',
  profile: 'profile',
};

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentRoute = Object.entries(ROUTE_PATHS).find(([, path]) => path === location.pathname)?.[0] || 'landing';
  const { locale } = useLocale();
  const [authState, setAuthState] = useState({ ready: false, user: null });

  useEffect(() => {
    try {
      return onAuthStateChanged(getFirebaseAuth(), (user) => setAuthState({ ready: true, user }));
    } catch {
      setAuthState({ ready: true, user: null });
      return undefined;
    }
  }, []);

  // A ?ref= code is stashed the moment it is seen, before anything else happens. Google sign-in
  // navigates away and returns on a URL with no query string, so a code read at claim time
  // would already be gone. Stored per tab, and consumed once by the referral panel.
  useEffect(() => {
    const code = referralCodeFromQuery(location.search);
    if (!code) return;
    try {
      rememberReferralCode(code, window.sessionStorage);
    } catch {
      // Private browsing with storage disabled. The user can still type the code by hand.
    }
  }, [location.search]);

  // Where this visit came from, stashed for the same reason and at the same moment as the ?ref=
  // code above: every landing-page CTA is a <Link to="/login"> that replaces the location, so the
  // utm tags are gone one click later. First write wins — first touch is the honest attribution.
  useEffect(() => {
    const utm = utmFromQuery(location.search);
    if (!utm) return;
    try {
      rememberAttribution({ ...utm, landing_path: location.pathname }, window.sessionStorage);
    } catch {
      // Storage disabled. The arrival still gets counted below; only the link to a later signup
      // is lost.
    }
  }, [location.search, location.pathname]);

  // Count the arrival, at most once per browser per day. Deliberately not on mount: the delay and
  // the visibility check are most of the bot defence, since a prerenderer or a link-preview
  // fetcher is usually gone before it fires and a crawler that runs no scripts never gets here.
  //
  // Waiting for visibility rather than testing it once, because a page opened in a background tab
  // is a real person about to read it — cmd-clicking a link is ordinary — and checking only at
  // mount would drop every one of them.
  useEffect(() => {
    let timer;
    // Read now, not when the timer fires: this effect runs before the auth redirect below, so
    // this is still the path the user actually landed on rather than wherever they were sent.
    const landedAt = window.location.pathname;
    const count = () => {
      let stored = null;
      let send = true;
      try {
        stored = readAttribution(window.sessionStorage);
        send = shouldSendVisit(window.localStorage, localDay());
      } catch {
        // Private browsing: count it rather than lose it. The report calls itself an estimate.
      }
      if (send) sendVisit(visitPayload(stored, landedAt, window.innerWidth));
    };
    const arm = () => {
      if (document.visibilityState !== 'visible' || timer) return;
      timer = setTimeout(count, 1500);
    };
    document.addEventListener('visibilitychange', arm);
    arm();
    return () => {
      document.removeEventListener('visibilitychange', arm);
      clearTimeout(timer);
    };
    // Once per page load, not once per navigation: the dedupe is per day, and re-running this on
    // every route change would only ever be wasted work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAuthenticated = Boolean(authState.user && !authState.user.isAnonymous);

  // Attach that source to the account, once it exists. Written once server side, so a repeat is
  // harmless; failure is swallowed for the same reason LoginPage swallows a bad promo code — a
  // report column must never be able to strand a successful sign-in.
  useEffect(() => {
    if (!isAuthenticated) return;
    let stored = null;
    try {
      stored = readAttribution(window.sessionStorage);
    } catch {
      return;
    }
    if (!stored) return;
    postAttribution(stored).catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    const redirect = authRedirect(authState.ready, isAuthenticated, currentRoute);
    if (redirect) navigate(ROUTE_PATHS[redirect], { replace: true });
  }, [authState.ready, currentRoute, isAuthenticated, navigate]);

  if (!authState.ready || authRedirect(authState.ready, isAuthenticated, currentRoute)) {
    return <WorkspaceFallback locale={locale} />;
  }

  return (
    <div className={`doodee-root${currentRoute !== 'landing' ? ' is-app-route' : ''}`}>
      {/* Public routes */}
      {currentRoute === 'landing' && (
        <Suspense fallback={<WorkspaceFallback locale={locale} />}>
          <LandingPage />
        </Suspense>
      )}

      {currentRoute === 'login' && (
        <Suspense fallback={<WorkspaceFallback locale={locale} />}>
          <LoginPage />
        </Suspense>
      )}

      {/* Onboarding and scan carry their own chrome and read locale from useLocale, so unlike
          the dashboard views they take no lang/route props. */}
      {currentRoute === 'onboarding' && (
        <Suspense fallback={<WorkspaceFallback locale={locale} />}>
          <OnboardingPage />
        </Suspense>
      )}

      {currentRoute === 'face-scan' && (
        <Suspense fallback={<WorkspaceFallback locale={locale} />}>
          <ScanPage />
        </Suspense>
      )}

      {currentRoute === 'skin-scan' && (
        <Suspense fallback={<WorkspaceFallback locale={locale} />}>
          <SkinScanPage />
        </Suspense>
      )}

      {/* Signed-in routes, all inside the ported dashboard shell */}
      {DASHBOARD_VIEWS[currentRoute] && (
        <Suspense fallback={<WorkspaceFallback locale={locale} />}>
          <DashboardPage view={DASHBOARD_VIEWS[currentRoute]} />
        </Suspense>
      )}

    </div>
  );
}
