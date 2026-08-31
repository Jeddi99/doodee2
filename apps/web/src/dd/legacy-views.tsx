/**
 * Adapters that let the app's own Django-backed screens render inside the
 * ported shell.
 *
 * These screens are NOT part of the port — they are this app's product surface
 * (DOODEE Chat, the members-only score card, referral + withdrawal, skin
 * scan/trend, the development plan) and the reason `doodee web` exists. The
 * upstream Next.js app has no equivalent for any of them, so adopting its UI
 * wholesale would have deleted them. Instead they move into its shell and get
 * restyled panel by panel.
 *
 * They are imported from `src/pages/**` rather than copied into `src/dd`,
 * because `src/dd` is a near-verbatim mirror of upstream that should stay
 * re-syncable with a plain copy. Anything in here is ours.
 *
 * Most panels are prop-less default exports that already read Django through
 * tanstack-query, so they need no adapter at all and are imported directly by
 * `routes.tsx`. Only the four below take props that used to come from
 * `DashboardPage`'s internal state, and this file supplies those from the
 * router instead.
 */
import { useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Analysis, Overview, VIEW_ROUTES, type AppView } from "../pages/DashboardPage";
import SimulationView from "../components/SimulationView";
import TryOnView from "../components/TryOnView";
import { useLocale } from "../useLocale";
import { toAppPath } from "./shims/base-path";

/**
 * `DashboardPage` switched views by setting local state; here each view has its
 * own URL, so the same callback becomes a navigation. `VIEW_ROUTES` is the
 * mapping DashboardPage already exported, and `toAppPath` puts it under the
 * prefix the ported UI is mounted at.
 */
function useOpenView(): (view: AppView) => void {
  const navigate = useNavigate();
  return useCallback(
    (view: AppView) => navigate(toAppPath(VIEW_ROUTES[view])),
    [navigate],
  );
}

/**
 * `onUnlock` opened a paywall dialog owned by DashboardPage. The ported shell
 * has its own (`billing/PaywallDialog`), but it is driven by the ported quota
 * client, which is not wired to Django yet — showing it would put invented
 * allowance numbers in front of the user. Sending them to the real pricing
 * screen is the honest equivalent until that mapping lands.
 */
function useUnlock(): () => void {
  const navigate = useNavigate();
  return useCallback(() => navigate(toAppPath(VIEW_ROUTES.pricing)), [navigate]);
}

export function OverviewRoute() {
  return <Overview openView={useOpenView()} onUnlock={useUnlock()} />;
}

export function AnalysisRoute() {
  return <Analysis openView={useOpenView()} onUnlock={useUnlock()} />;
}

export function SimulationRoute() {
  const { locale } = useLocale();
  const navigate = useNavigate();
  return (
    <SimulationView
      lang={locale}
      // DashboardPage passed a bare route name; keep that contract and resolve
      // it here so SimulationView needs no change.
      onNavigate={(route: string) => navigate(toAppPath(`/${route}`))}
    />
  );
}

export function TryOnRoute() {
  const { locale } = useLocale();
  return <TryOnView lang={locale} />;
}

/**
 * Layout route wrapping every local screen in `.dd-legacy`.
 *
 * Two things need that hook. The panels' stylesheet reads its colours through
 * `--app-*` variables that only exist on `.doodee-app`, which is not an ancestor
 * inside the ported shell; and they lean on browser default typography that the
 * scoped Tailwind Preflight removes. Both are re-established for this subtree in
 * `theme.css`.
 *
 * A class rather than a blanket rule on `.dd-ui`, because undoing Preflight for
 * the whole shell would change the ported screens too — any heading there
 * without an explicit size class would silently pick up the browser default.
 */
export function LegacyScope() {
  return (
    <div className="dd-legacy">
      <Outlet />
    </div>
  );
}
