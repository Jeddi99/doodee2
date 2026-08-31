/**
 * The ported UI's route table — the react-router equivalent of the Next.js
 * app's `src/app/` directory.
 *
 * Each entry corresponds to a `page.tsx` upstream. Those pages were thin: an
 * exported `metadata` object (dropped — there is no server render to emit head
 * tags from) wrapping a single component. What survives is the component and
 * the path it lived at.
 *
 * Route groups map onto layouts: everything under `(app)/` upstream rendered
 * inside `(app)/layout.tsx`, which is ported as `AppShell` and applied here via
 * a layout route. `admin/` had its own layout and gets the same treatment.
 *
 * Every page is lazily imported. Upstream got per-route code splitting from the
 * framework; without it the landing page would pull MediaPipe, onnxruntime and
 * the whole try-on canvas into the first chunk.
 */
import { Suspense, lazy } from "react";
import type { ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";

/**
 * Upstream pages default-exported; ported components are named exports. This
 * adapts a named export into the `{ default }` shape `lazy` requires, so the
 * route table can name the component directly.
 */
function page<T extends Record<string, unknown>>(
  loader: () => Promise<T>,
  name: keyof T,
): ComponentType {
  return lazy(async () => ({ default: (await loader())[name] as ComponentType }));
}

// --- Public surface (no auth, no app shell) --------------------------------
const LandingHero = page(() => import("@/components/marketing/LandingHero"), "LandingHero");
const WelcomeLogin = page(() => import("@/components/marketing/WelcomeLogin"), "WelcomeLogin");
const FaqPage = page(() => import("@/components/marketing/FaqPage"), "FaqPage");
const BlogIndexPage = page(() => import("@/components/marketing/BlogIndexPage"), "BlogIndexPage");
const BlogPostPage = page(() => import("@/components/marketing/BlogPostPage"), "BlogPostPage");
const MethodologyPage = page(() => import("@/components/methodology/MethodologyPage"), "MethodologyPage");
const PrivacyPage = page(() => import("@/components/privacy/PrivacyPage"), "PrivacyPage");
const SharedScanView = page(() => import("@/components/share/SharedScanView"), "SharedScanView");
const ValidationSnapshotView = page(() => import("@/components/proof/ValidationSnapshotView"), "ValidationSnapshotView");
const EditorFaceCardPage = page(() => import("@/components/editor/EditorFaceCardPage"), "EditorFaceCardPage");

// --- Signed-in surface: ported screens with no local equivalent -------------
const RedeemPage = page(() => import("@/components/redeem/RedeemPage"), "RedeemPage");
const LipstickPage = page(() => import("@/components/lipstick/LipstickPage"), "LipstickPage");
const HairColorPage = page(() => import("@/components/hair-color/HairColorPage"), "HairColorPage");
const EyeColorPage = page(() => import("@/components/eye-color/EyeColorPage"), "EyeColorPage");
const ValidatePage = page(() => import("@/components/validate/ValidatePage"), "ValidatePage");
const FaceDebugPage = page(() => import("@/components/face-debug/FaceDebugPage"), "FaceDebugPage");
const CompareView = page(() => import("@/components/history/CompareView"), "CompareView");

// --- Signed-in surface: this app's own Django-backed screens ----------------
//
// Where both apps have a screen, the local one wins and the ported one becomes
// its design reference rather than its replacement. The local screens read the
// Django API; the ported equivalents talk to the upstream app's own /api/*
// routes and Stripe, which do not exist here. `scan` is the clearest case:
// uploadScan() -> Django is what produces the score card, history, chat context
// and development plan, none of which the ported browser-only ScanFlow feeds.
//
// Still-ported, still-reachable counterparts for reference while restyling:
//   scan       @/components/scan/cockpit/ScanCockpitPage
//   history    @/components/history/HistoryPage
//   settings   @/components/settings/SettingsPage
//   pricing    @/components/pricing/PricingPage
//   try-on     @/components/try-on/TryOnPage
//   surgery    @/components/surgery/SurgeryFlow
const local = (loader: () => Promise<{ default: ComponentType }>) => lazy(loader);

const ScanPage = local(() => import("../pages/ScanPage"));
const SkinScanPage = local(() => import("../pages/SkinScanPage"));
const ChatPanel = local(() => import("../pages/views/ChatPanel"));
const ScoreCardPanel = local(() => import("../pages/views/ScoreCardPanel"));
const ReferralPanel = local(() => import("../pages/views/ReferralPanel"));
const ProfilePanel = local(() => import("../pages/views/ProfilePanel"));
const SkinPanel = local(() => import("../pages/views/SkinPanel"));
const DevelopmentPlanPanel = local(() => import("../pages/views/DevelopmentPlanPanel"));
const HistoryPanel = local(() => import("../pages/views/HistoryPanel"));
const SettingsPanel = local(() => import("../pages/views/SettingsPanel"));
const PricingPanel = local(() => import("../pages/views/PricingPanel"));

// Views that took props from DashboardPage's internal state; see ./legacy-views.
const OverviewRoute = local(() => import("./legacy-views").then((m) => ({ default: m.OverviewRoute })));
const AnalysisRoute = local(() => import("./legacy-views").then((m) => ({ default: m.AnalysisRoute })));
const SimulationRoute = local(() => import("./legacy-views").then((m) => ({ default: m.SimulationRoute })));
const TryOnRoute = local(() => import("./legacy-views").then((m) => ({ default: m.TryOnRoute })));
const LegacyScope = local(() => import("./legacy-views").then((m) => ({ default: m.LegacyScope })));

/** Matches the transparent placeholder the upstream pages used as a Suspense
 *  fallback, so a route swap does not flash the page background. */
function RouteFallback() {
  return <div className="min-h-[100dvh] bg-transparent" aria-hidden />;
}

export function DoodeeRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route index element={<LandingHero />} />
        <Route path="login" element={<WelcomeLogin />} />
        <Route path="faq" element={<FaqPage />} />
        <Route path="methodology" element={<MethodologyPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="blog" element={<BlogIndexPage />} />
        <Route path="blog/:slug" element={<BlogPostPage />} />
        <Route path="share" element={<SharedScanView />} />
        <Route path="proof/:token" element={<ValidationSnapshotView />} />
        <Route path="editor-card" element={<EditorFaceCardPage />} />

        {/* Upstream `/pricing` and `/upgrade` were separate routes that
            rendered the same page; the redirect is kept so shared links work. */}
        <Route path="upgrade" element={<Navigate to="../pricing" replace />} />

        <Route element={<AppShell />}>
          {/* This app's own screens, on the Django API. Wrapped in a layout
              route that re-establishes what their stylesheet needs; see
              LegacyScope. */}
          <Route element={<LegacyScope />}>
            <Route path="home" element={<OverviewRoute />} />
            <Route path="analysis" element={<AnalysisRoute />} />
            <Route path="plan" element={<DevelopmentPlanPanel />} />
            <Route path="doodee-gpt" element={<ChatPanel />} />
            <Route path="score-card" element={<ScoreCardPanel />} />
            <Route path="referral" element={<ReferralPanel />} />
            <Route path="profile" element={<ProfilePanel />} />
            <Route path="skin" element={<SkinPanel />} />
            <Route path="skin-scan" element={<SkinScanPage />} />
            <Route path="scan" element={<ScanPage />} />
            <Route path="history" element={<HistoryPanel />} />
            <Route path="settings" element={<SettingsPanel />} />
            <Route path="pricing" element={<PricingPanel />} />
            <Route path="simulation" element={<SimulationRoute />} />
            <Route path="try-on" element={<TryOnRoute />} />
          </Route>

          {/* Ported screens with no local equivalent. */}
          <Route path="redeem" element={<RedeemPage />} />
          <Route path="lipstick" element={<LipstickPage />} />
          <Route path="hair-color" element={<HairColorPage />} />
          <Route path="eye-color" element={<EyeColorPage />} />
          <Route path="validate" element={<ValidatePage />} />
          <Route path="face-debug" element={<FaceDebugPage />} />
          <Route path="history/compare" element={<CompareView />} />
        </Route>

        {/* Anything unrecognised goes to the landing page rather than a blank
            screen — there is no ported 404 page. */}
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </Suspense>
  );
}
