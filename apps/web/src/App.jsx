import React, { lazy, Suspense, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import { authRedirect } from './lib/authRouting';
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

function WorkspaceFallback({ locale }) {
  return <div className="workspace-loading" role="status">{locale === 'th' ? 'กำลังเปิดหน้า…' : 'Opening…'}</div>;
}

const ROUTE_PATHS = { landing: '/', login: '/login', onboarding: '/onboarding', home: '/home', analysis: '/analysis', plan: '/plan', 'doodee-gpt': '/doodee-gpt', 'face-scan': '/scan', simulation: '/simulation', tryon: '/try-on', history: '/history', pricing: '/pricing', settings: '/settings' };

// Every signed-in route lives inside DashboardPage's shell; the path picks the view.
const DASHBOARD_VIEWS = {
  home: 'overview',
  analysis: 'analysis',
  plan: 'plan',
  simulation: 'simulate',
  'doodee-gpt': 'doodeegpt',
  tryon: 'tryon',
  history: 'history',
  pricing: 'pricing',
  settings: 'settings',
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

  const isAuthenticated = Boolean(authState.user && !authState.user.isAnonymous);
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

      {/* Signed-in routes, all inside the ported dashboard shell */}
      {DASHBOARD_VIEWS[currentRoute] && (
        <Suspense fallback={<WorkspaceFallback locale={locale} />}>
          <DashboardPage view={DASHBOARD_VIEWS[currentRoute]} />
        </Suspense>
      )}

    </div>
  );
}
