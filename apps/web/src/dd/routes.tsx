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
const PricingPage = page(() => import("@/components/pricing/PricingPage"), "PricingPage");
const FaqPage = page(() => import("@/components/marketing/FaqPage"), "FaqPage");
const BlogIndexPage = page(() => import("@/components/marketing/BlogIndexPage"), "BlogIndexPage");
const BlogPostPage = page(() => import("@/components/marketing/BlogPostPage"), "BlogPostPage");
const MethodologyPage = page(() => import("@/components/methodology/MethodologyPage"), "MethodologyPage");
const PrivacyPage = page(() => import("@/components/privacy/PrivacyPage"), "PrivacyPage");
const SharedScanView = page(() => import("@/components/share/SharedScanView"), "SharedScanView");
const ValidationSnapshotView = page(() => import("@/components/proof/ValidationSnapshotView"), "ValidationSnapshotView");
const EditorFaceCardPage = page(() => import("@/components/editor/EditorFaceCardPage"), "EditorFaceCardPage");

// --- Signed-in surface (inside AppShell) -----------------------------------
const ScanCockpitPage = page(() => import("@/components/scan/cockpit/ScanCockpitPage"), "ScanCockpitPage");
const HistoryPage = page(() => import("@/components/history/HistoryPage"), "HistoryPage");
const CompareView = page(() => import("@/components/history/CompareView"), "CompareView");
const SettingsPage = page(() => import("@/components/settings/SettingsPage"), "SettingsPage");
const RedeemPage = page(() => import("@/components/redeem/RedeemPage"), "RedeemPage");
const TryOnPage = page(() => import("@/components/try-on/TryOnPage"), "TryOnPage");
const LipstickPage = page(() => import("@/components/lipstick/LipstickPage"), "LipstickPage");
const HairColorPage = page(() => import("@/components/hair-color/HairColorPage"), "HairColorPage");
const EyeColorPage = page(() => import("@/components/eye-color/EyeColorPage"), "EyeColorPage");
const SurgeryFlow = page(() => import("@/components/surgery/SurgeryFlow"), "SurgeryFlow");
const ValidatePage = page(() => import("@/components/validate/ValidatePage"), "ValidatePage");
const FaceDebugPage = page(() => import("@/components/face-debug/FaceDebugPage"), "FaceDebugPage");

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
        <Route path="pricing" element={<PricingPage />} />
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
          <Route path="scan" element={<ScanCockpitPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="history/compare" element={<CompareView />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="redeem" element={<RedeemPage />} />
          <Route path="try-on" element={<TryOnPage />} />
          <Route path="lipstick" element={<LipstickPage />} />
          <Route path="hair-color" element={<HairColorPage />} />
          <Route path="eye-color" element={<EyeColorPage />} />
          <Route path="surgery" element={<SurgeryFlow />} />
          <Route path="validate" element={<ValidatePage />} />
          <Route path="face-debug" element={<FaceDebugPage />} />
        </Route>

        {/* Anything unrecognised goes to the landing page rather than a blank
            screen — there is no ported 404 page. */}
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </Suspense>
  );
}
