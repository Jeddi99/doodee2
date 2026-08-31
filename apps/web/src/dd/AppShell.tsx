/**
 * Ported from the Next.js app's `src/app/(app)/layout.tsx` — the chrome every
 * signed-in screen rendered inside.
 *
 * Two changes from upstream, both forced by react-router:
 *   - `{children}` becomes `<Outlet />`, since a layout route renders its match
 *     rather than being handed children.
 *   - `next/dynamic` is not used for the two deferred widgets; `React.lazy`
 *     with an explicit `<Suspense>` is the direct equivalent and avoids routing
 *     them through the shim for no gain.
 *
 * The markup is otherwise unchanged, including the Tailwind classes, so it
 * still reads as a diff against upstream.
 */
import { Suspense, lazy } from "react";
import { Outlet } from "react-router-dom";
import Link from "next/link";
import { Home } from "lucide-react";
import { useT } from "@/lib/i18n";
import { AppBackground } from "@/components/AppBackground";
import { LangToggle } from "@/components/LangToggle";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
import { NavProgress } from "@/components/NavProgress";
import { UpgradeSidebar } from "@/components/billing/UpgradeSidebar";
import { MobilePricingNav } from "@/components/billing/MobilePricingNav";
import { AuthGate } from "@/components/AuthGate";
import { QuotaGateProvider } from "@/lib/quota-gate";
import { PaywallDialog } from "@/components/billing/PaywallDialog";
import { ThemeToggle } from "@/components/ThemeToggle";

const OnboardingWizard = lazy(() =>
  import("@/components/onboarding/OnboardingWizard").then((m) => ({
    default: m.OnboardingWizard,
  })),
);
const InstallPrompt = lazy(() =>
  import("@/components/pwa/InstallPrompt").then((m) => ({ default: m.InstallPrompt })),
);

export function AppShell() {
  const { t, lang } = useT();
  return (
    <AuthGate>
      <QuotaGateProvider>
        <div className="relative isolate flex h-[100dvh] w-full max-w-full flex-col overflow-x-clip bg-transparent text-[#f8fafc] antialiased">
          <NavProgress />
          <AppBackground />
          <OfflineBanner />

          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:border focus:border-cyan/30 focus:bg-[#050816]/90 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[#f8fafc] focus:shadow-[0_18px_42px_-30px_rgba(0,0,0,0.72)] focus:outline-none focus:ring-2 focus:ring-cyan/45 focus:ring-offset-2 focus:ring-offset-[#050816]"
          >
            {t.a11y.skipToContent}
          </a>

          <div className="pointer-events-none fixed right-4 top-4 z-30 hidden items-center gap-2 lg:right-6 lg:top-6 lg:flex">
            <div className="pointer-events-auto">
              <LangToggle variant="app" />
            </div>
          </div>

          <div className="relative z-10 flex min-h-0 min-w-0 flex-1">
            <UpgradeSidebar />
            <main
              id="main"
              className="app-glass-page min-w-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain bg-transparent px-3 pb-bottom-nav pt-[calc(env(safe-area-inset-top)_+_0rem)] sm:px-8 sm:pt-12 lg:px-10 lg:pb-14 lg:pt-10"
            >
              <div className="mobile-app-topbar sticky top-[calc(env(safe-area-inset-top)_+_0rem)] z-30 mb-4 flex min-w-0 items-center justify-between gap-3 rounded-3xl border p-1.5 shadow-[0_18px_46px_-34px_rgba(0,0,0,0.72)] backdrop-blur-md lg:hidden">
                <div className="flex min-w-0 items-center gap-2">
                  <ThemeToggle />
                  <Link
                    href="/"
                    aria-label={lang === "th" ? "กลับหน้าแรก" : "Back to homepage"}
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-white/45 bg-white/75 text-[#241f1a] shadow-[0_12px_28px_-22px_rgba(36,31,26,0.48)] transition active:scale-[0.97] dark:border-white/10 dark:bg-white/[0.08] dark:text-[#f8fafc]"
                  >
                    <Home className="h-4 w-4" />
                  </Link>
                </div>
                <div className="shrink-0">
                  <LangToggle variant="app" />
                </div>
              </div>
              <ErrorBoundary>
                <div className="mx-auto w-full min-w-0 max-w-6xl">
                  <Outlet />
                </div>
              </ErrorBoundary>
            </main>
          </div>

          <MobilePricingNav lang={lang} />
          <PaywallDialog />
          {/* These three are deferred and purely additive chrome; a failure to
              load one must not take the page with it, hence a null fallback
              rather than a shared boundary. */}
          <Suspense fallback={null}>
            <InstallPrompt />
          </Suspense>
          <Suspense fallback={null}>
            <OnboardingWizard />
          </Suspense>
        </div>
      </QuotaGateProvider>
    </AuthGate>
  );
}
