import React, { lazy, Suspense, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import HeroSection from './components/HeroSection';
import AboutUsSection from './components/AboutUsSection';
import DataWeUseSection from './components/DataWeUseSection';
import ProcedurePreview from './components/ProcedurePreview';
import SampleReportSection from './components/SampleReportSection';
import DifferenceSection from './components/DifferenceSection';
import CredibilityStrip from './components/CredibilityStrip';
import PricingSection from './components/PricingSection';
import ContactUsSection from './components/ContactUsSection';
import FaqSection from './components/FaqSection';
import FooterSection from './components/FooterSection';

import Sidebar from './components/Sidebar';
import AppHeaderBar from './components/AppHeaderBar';
import OnboardingFlow from './components/OnboardingFlow';
import { authRedirect } from './lib/authRouting';
import { getFirebaseAuth } from './lib/firebase';

const AnalysisDashboard = lazy(() => import('./components/AnalysisDashboard'));
const HomeView = lazy(() => import('./components/HomeView'));
const FacialAnalysisView = lazy(() => import('./components/FacialAnalysisView'));
const SimulationView = lazy(() => import('./components/SimulationView'));
const TryOnView = lazy(() => import('./components/TryOnView'));
const HistoryView = lazy(() => import('./components/HistoryView'));
const PricingView = lazy(() => import('./components/PricingView'));
const SettingsView = lazy(() => import('./components/SettingsView'));

function WorkspaceFallback({ lang }) {
  return <div className="workspace-loading" role="status">{lang === 'th' ? 'กำลังเปิดหน้า…' : 'Opening…'}</div>;
}

const ROUTE_PATHS = { landing: '/', onboarding: '/onboarding', home: '/home', analysis: '/analysis', 'face-scan': '/scan', simulation: '/simulation', tryon: '/try-on', history: '/history', pricing: '/pricing', settings: '/settings' };

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentRoute = Object.entries(ROUTE_PATHS).find(([, path]) => path === location.pathname)?.[0] || 'landing';
  const setCurrentRoute = (route, params = {}) => {
    const query = params.scanId ? `?scan_id=${encodeURIComponent(params.scanId)}` : '';
    navigate(`${ROUTE_PATHS[route] || '/analysis'}${query}`);
  };
  const [lang, setLang] = useState('th'); // 'th' | 'en'
  const [onboardingData, setOnboardingData] = useState(null);
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

  const handleStartScan = () => {
    setCurrentRoute('onboarding');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOnboardingComplete = (answers) => {
    setOnboardingData(answers);
    setCurrentRoute('face-scan');
    window.scrollTo({ top: 0 });
  };

  const isCompactWorkspace = ['tryon', 'simulation'].includes(currentRoute);
  const isTryOnEditor = currentRoute === 'tryon';
  const needsPortraitGate = !isTryOnEditor;

  if (!authState.ready || authRedirect(authState.ready, isAuthenticated, currentRoute)) {
    return <WorkspaceFallback lang={lang} />;
  }

  return (
    <div className={`landing-bg glass-app-bg liquid-glass-app${currentRoute !== 'landing' ? ' is-app-route' : ''}`} style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      
      {/* CASE 1: Main Public Landing Page */}
      {currentRoute === 'landing' && (
        <>
          <Header 
            currentRoute={currentRoute} 
            setCurrentRoute={setCurrentRoute} 
            lang={lang} 
            setLang={setLang}
          />
          <main style={{ minHeight: '100vh', width: '100%', overflowY: 'visible', flex: 1 }}>
            <HeroSection lang={lang} onStartScan={handleStartScan} />
            <AboutUsSection lang={lang} />
            <DataWeUseSection lang={lang} />
            <ProcedurePreview lang={lang} />
            <SampleReportSection lang={lang} onStartScan={handleStartScan} />
            <DifferenceSection lang={lang} />
            <CredibilityStrip lang={lang} />
            <PricingSection lang={lang} onStartScan={handleStartScan} />
            <ContactUsSection lang={lang} />
            <FaqSection lang={lang} />
            <FooterSection lang={lang} onStartScan={handleStartScan} />
          </main>
        </>
      )}

      {currentRoute === 'onboarding' && (
        <OnboardingFlow
          lang={lang}
          authenticated={isAuthenticated}
          onBack={() => setCurrentRoute(isAuthenticated ? 'home' : 'landing')}
          onComplete={handleOnboardingComplete}
        />
      )}

      {currentRoute === 'face-scan' && (
        <Suspense fallback={<WorkspaceFallback lang={lang} />}>
          <FacialAnalysisView
            lang={lang}
            setLang={setLang}
            onboardingData={onboardingData}
            onBack={() => setCurrentRoute('home')}
            onNavigate={setCurrentRoute}
          />
        </Suspense>
      )}

      {/* CASE 2: AI Pre-Consultation Platform Dashboard Shell */}
      {currentRoute !== 'landing' && currentRoute !== 'onboarding' && currentRoute !== 'face-scan' && (
        <div
          className={`app-shell glass-app-shell liquid-glass-shell${isTryOnEditor ? ' is-tryon-editor' : ''}`}
          style={{ display: 'flex', height: '100vh', maxHeight: '100vh', width: '100vw', background: '#f5f5f7', overflow: 'hidden' }}
        >
          
          {/* Floating Language Switcher Pill */}
          <AppHeaderBar lang={lang} setLang={setLang} />

          {needsPortraitGate && (
            <div className="portrait-route-gate" role="status" aria-live="polite">
              <div className="portrait-route-gate-device" aria-hidden="true" />
              <h2>{lang === 'th' ? 'หมุนโทรศัพท์กลับเป็นแนวตั้ง' : 'Rotate your phone to portrait'}</h2>
              <p>{lang === 'th' ? 'ฟังก์ชันนี้ออกแบบให้ใช้งานในแนวตั้ง เพื่อให้เครื่องมืออ่านง่ายและไม่แน่นหน้าจอ' : 'This function is designed for portrait use so its tools stay clear and uncluttered.'}</p>
            </div>
          )}

          {/* Left Floating Sidebar Menu */}
          <Sidebar 
            currentRoute={currentRoute} 
            setCurrentRoute={setCurrentRoute} 
            lang={lang} 
          />

          {/* Right Main Application Workspace Container */}
          <main className="dashboard-main" style={{
            flex: 1,
            marginLeft: isCompactWorkspace ? '78px' : '268px',
            height: '100vh',
            padding: isCompactWorkspace ? '8px 12px 8px 8px' : '14px 24px 14px 16px',
            overflowY: isCompactWorkspace ? 'hidden' : 'auto',
            minWidth: 0,
            boxSizing: 'border-box',
            transition: 'margin-left 220ms ease, padding 220ms ease'
          }}>
            <Suspense fallback={<WorkspaceFallback lang={lang} />}>
              {currentRoute === 'home' && <HomeView lang={lang} onNavigate={setCurrentRoute} />}
              {currentRoute === 'analysis' && <AnalysisDashboard lang={lang} onNavigate={setCurrentRoute} />}
              {currentRoute === 'tryon' && <TryOnView lang={lang} />}
              {currentRoute === 'simulation' && <SimulationView lang={lang} onNavigate={setCurrentRoute} />}
              {currentRoute === 'history' && <HistoryView lang={lang} onNavigate={setCurrentRoute} />}
              {currentRoute === 'pricing' && <PricingView lang={lang} onStartScan={handleStartScan} />}
              {currentRoute === 'settings' && <SettingsView lang={lang} setLang={setLang} setCurrentRoute={setCurrentRoute} />}
            </Suspense>
          </main>
        </div>
      )}
    </div>
  );
}
