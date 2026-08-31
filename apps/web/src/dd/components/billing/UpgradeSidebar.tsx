"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Award,
  BarChart3,
  BookOpen,
  ClipboardList,
  Clock,
  Crown,
  Droplet,
  Gift,
  LayoutDashboard,
  MessageCircle,
  Moon,
  Palette,
  Pin,
  ScanFace,
  Settings,
  ShieldCheck,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { activeBillingTier, expiredPaidTier } from "@/lib/subscription-status";
import { PLAN_CATALOG } from "@/lib/plans";
import { useSubscription } from "@/lib/use-subscription";
import { useAuthUser } from "@/lib/use-auth-user";
import { useTheme } from "@/lib/use-theme";
import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton";
import { ExpiryPill } from "@/components/billing/ExpiryPill";
import { DoodeeLogo } from "@/components/DoodeeLogo";
import type { SubscriptionTier } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface UpgradeSidebarProps {
  lockToViewport?: boolean;
}

// The rows a signed-in user reaches first. Deliberately not the whole nav:
// prefetching fifteen route chunks on idle costs more than it saves.
const NAV_PREFETCH_HREFS = [
  "/home",
  "/scan",
  "/analysis",
  "/score-card",
  "/doodee-gpt",
  "/history",
  "/settings",
] as const;

const SIDEBAR_PIN_KEY = "doodee.sidebar.pinned.v1";

export function UpgradeSidebar({
  lockToViewport = false,
}: UpgradeSidebarProps = {}) {
  const { t, lang } = useT();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const {
    subscription,
    loading: subLoading,
    refresh: refreshSubscription,
  } = useSubscription();
  const { email, displayName, avatarUrl, loading: authLoading } = useAuthUser();
  const { theme, toggle: toggleTheme } = useTheme();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const expanded = pinned || hovered || focusWithin;
  // Phase 609 — display the EFFECTIVE tier. A paid row whose
  // current_period_end has passed must render as FREE (same rule the
  // /upgrade page already uses); the raw row tier previously showed
  // "PRO" right next to the "หมดอายุแล้ว" pill.
  const currentTier = activeBillingTier(subscription ?? null);
  const themeActionLabel =
    theme === "dark"
      ? t.upgrade.sidebar.themeLightLabel
      : t.upgrade.sidebar.themeDarkLabel;
  const signedIn = Boolean(email);
  const profileLoading = authLoading || subLoading;
  const quotaUnavailable = !profileLoading && signedIn && !subscription;
  const signedOutQuota = !profileLoading && !signedIn;
  const profileName = signedIn
    ? displayName ?? email ?? t.upgrade.sidebar.guestName
    : t.upgrade.sidebar.signedOutTitle;
  const avatarInitial = (profileName.match(/[A-Za-zก-๙]/)?.[0] ?? "D").toUpperCase();
  // Phase 609 — an expired paid row must not keep advertising the old
  // paid quotas. Until the server heals the row (auto-downgrade on next
  // read), clamp the display to the free plan's allowance.
  const isExpiredPaid = expiredPaidTier(subscription ?? null) !== null;
  const scansLeft = subscription
    ? isExpiredPaid
      ? Math.max(0, PLAN_CATALOG.free.scansQuota - subscription.scans_used)
      : Math.max(
          0,
          subscription.scans_quota +
            (subscription.credit_override_scans ?? 0) -
            subscription.scans_used
        )
    : 0;
  const previewsLeft = subscription
    ? isExpiredPaid
      ? Math.max(0, PLAN_CATALOG.free.previewsQuota - subscription.previews_used)
      : Math.max(
          0,
          subscription.previews_quota +
            (subscription.credit_override_previews ?? 0) -
            subscription.previews_used
        )
    : 0;

  // Upstream this listed only the ported screens. It now also carries this
  // app's own Django-backed ones — chat, the score card, referral, skin and the
  // development plan — which the upstream app has no equivalent for and which
  // are the reason this product exists. Labels for those are inline th/en
  // rather than `t.upgrade.sidebar.*`, because the ported dictionaries have no
  // keys for screens that never existed upstream; they move into the
  // dictionaries as each panel is restyled.
  const th = lang === "th";
  const items: NavItem[] = [
    { href: "/home", label: th ? "ภาพรวม" : "Overview", icon: LayoutDashboard },
    { href: "/scan", label: t.upgrade.sidebar.scan, icon: ScanFace },
    { href: "/analysis", label: th ? "ผลวิเคราะห์" : "Analysis", icon: BarChart3 },
    { href: "/score-card", label: th ? "การ์ดคะแนน" : "Score card", icon: Award },
    { href: "/plan", label: th ? "แผนพัฒนา" : "Plan", icon: ClipboardList },
    { href: "/doodee-gpt", label: th ? "DOODEE Chat" : "DOODEE Chat", icon: MessageCircle },
    { href: "/skin", label: th ? "ผิว" : "Skin", icon: Droplet },
    { href: "/simulation", label: th ? "จำลองรูป" : "Simulate", icon: ShieldCheck },
    { href: "/try-on", label: th ? "แต่งหน้า" : t.upgrade.sidebar.tryOn, icon: Palette },
    { href: "/history", label: th ? "ประวัติ" : "History", icon: Clock },
    { href: "/referral", label: th ? "แนะนำเพื่อน" : "Referral", icon: Gift },
    { href: "/pricing", label: t.upgrade.sidebar.plan, icon: Crown },
    {
      href: "/methodology",
      label: t.upgrade.sidebar.methodology,
      icon: BookOpen,
    },
    { href: "/settings", label: t.upgrade.sidebar.settings, icon: Settings },
  ];

  // Pathname-aware active state — replaces the old hardcoded `active: true`
  // on the plan row so the sidebar reflects whichever page the shell is
  // hosting (the app shell wraps every /(app)/* route).
  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    // `/scan` used to also claim `/history`; history has its own row now.
    if (href === "/scan") {
      return pathname === "/scan" || pathname.startsWith("/scan/");
    }
    // `/upgrade` is a redirect to `/pricing`, so the pricing row owns both.
    if (href === "/pricing") {
      return (
        pathname === "/pricing" ||
        pathname.startsWith("/pricing/") ||
        pathname === "/upgrade" ||
        pathname.startsWith("/upgrade/")
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function handleNavClick(href: string, active: boolean): void {
    setPendingHref(active ? null : href);
  }

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    try {
      setPinned(window.localStorage.getItem(SIDEBAR_PIN_KEY) === "1");
    } catch {
      setPinned(false);
    }
  }, []);

  function togglePinned(): void {
    const next = !pinned;
    setPinned(next);
    try {
      window.localStorage.setItem(SIDEBAR_PIN_KEY, next ? "1" : "0");
    } catch {
      // The sidebar still works when storage is blocked.
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefetch = () => {
      for (const href of NAV_PREFETCH_HREFS) {
        router.prefetch(href as never);
      }
    };
    const ric = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof ric.requestIdleCallback === "function") {
      const id = ric.requestIdleCallback(prefetch, { timeout: 2500 });
      return () => {
        if (typeof ric.cancelIdleCallback === "function") {
          ric.cancelIdleCallback(id);
        }
      };
    }
    const id = window.setTimeout(prefetch, 700);
    return () => window.clearTimeout(id);
  }, [router]);

  // Phase 192v — Short-viewport overflow fix. The rail is a fixed
  // `h-[100dvh]` flex column with a `flex-1` spacer pushing the profile +
  // upgrade CTA + theme toggle to the bottom. On short desktop/tablet-landscape
  // viewports (laptop with toolbars, ~600px tall windows) the 7 nav rows +
  // bottom block exceeded 100dvh and the bottom controls were clipped with no
  // way to reach them. Adding `overflow-y-auto` (with `overscroll-contain` so
  // the page behind doesn't rubber-band) lets the rail scroll internally; the
  // `flex-1` spacer still pins the block to the bottom when there's room.
  const reserveClassName = lockToViewport
    ? "relative hidden h-[100dvh] w-[72px] flex-none lg:block"
    : "relative sticky top-0 hidden h-[100dvh] w-[72px] flex-none lg:block";
  const panelPositionClassName = lockToViewport
    ? "fixed inset-y-0 left-0"
    : "absolute inset-y-0 left-0";

  return (
    <div className={reserveClassName} data-testid="upgrade-sidebar-reserve">
    <aside
      className={`app-glass-page sidebar-glass ${panelPositionClassName} z-30 flex h-[100dvh] flex-col overflow-y-auto overscroll-contain border-r border-white/55 bg-white/50 shadow-[18px_0_60px_-52px_rgba(36,31,26,0.55)] transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none ${
        expanded ? "w-[224px] xl:w-[240px]" : "w-[72px]"
      }`}
      data-testid="upgrade-sidebar"
      data-state={expanded ? "expanded" : "collapsed"}
      data-pinned={pinned ? "true" : "false"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusWithin(false);
        }
      }}
    >
      <div className={`flex min-h-[88px] items-start gap-2 pb-5 pt-6 ${expanded ? "px-5" : "px-4"}`}>
        <Link
          href="/"
          aria-label="DOODEE"
          title={expanded ? undefined : "DOODEE"}
          className={`group flex min-h-11 min-w-0 flex-1 items-center rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/40 ${expanded ? "justify-start" : "justify-center"}`}
        >
          <DoodeeLogo
            className={expanded ? "gap-2.5" : "gap-0"}
            markClassName="h-10 w-10 rounded-xl"
            wordmarkClassName={expanded ? "text-3xl text-[#241f1a]" : "hidden"}
            subtitle={t.upgrade.sidebar.analyzerLabel}
            subtitleClassName={expanded ? "text-[#7a5bd6]" : "hidden"}
          />
        </Link>
        {expanded ? (
          <button
            type="button"
            onClick={togglePinned}
            aria-label={pinned ? t.upgrade.sidebar.unpinSidebar : t.upgrade.sidebar.pinSidebar}
            aria-pressed={pinned}
            title={pinned ? t.upgrade.sidebar.unpinSidebar : t.upgrade.sidebar.pinSidebar}
            className={`grid h-11 w-11 flex-none place-items-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/40 ${
              pinned
                ? "border-[#7a5bd6]/40 bg-[#7a5bd6]/16 text-[#c4b5fd]"
                : "border-white/10 bg-white/[0.06] text-white/62 hover:bg-white/[0.12] hover:text-white"
            }`}
          >
            <Pin className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <nav className="space-y-1 px-3" aria-label={t.a11y.primaryNav}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const pending = pendingHref === item.href && !active;
          // Phase 192s — Cohesive with the mobile bottom-nav language.
          return (
            <Link
              key={item.href}
              href={item.href as never}
              onClick={() => handleNavClick(item.href, active)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              aria-busy={pending || undefined}
              title={expanded ? undefined : item.label}
              className={`sidebar-nav-link group relative flex h-11 items-center overflow-hidden rounded-2xl border px-3 text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/40 ${expanded ? "justify-start gap-3" : "justify-center gap-0"} ${
                active
                  ? "sidebar-nav-active border-[#241f1a] bg-[#241f1a] text-white shadow-[0_14px_34px_-28px_rgba(36,31,26,0.55)]"
                  : pending
                    ? "sidebar-nav-pending border-[#067e96]/35 bg-white/60 text-[#0f5e65] shadow-[0_14px_34px_-30px_rgba(6,126,150,0.28)]"
                  : "sidebar-nav-idle border-transparent text-[#6f625a] hover:border-white/65 hover:bg-white/40 hover:text-[#241f1a] focus-visible:bg-white/50 focus-visible:text-[#241f1a]"
              }`}
            >
              {(active || pending) && (
                <span
                  aria-hidden
                  className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full ${
                    active ? "bg-[#7a5bd6]" : "bg-[#067e96]"
                  }`}
                />
              )}
              <Icon
                className={`h-4 w-4 flex-none transition ${
                  active
                    ? "sidebar-nav-icon-active text-white"
                    : pending
                      ? "sidebar-nav-icon-pending text-[#067e96]"
                      : "sidebar-nav-icon-idle text-[#625a52] group-hover:text-[#241f1a]"
                }`}
              />
              {expanded ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
              {pending && expanded && (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 flex-none rounded-full bg-[#067e96]"
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="space-y-3 px-3 pb-5">
        {expanded ? (
        <>
        <div className="sidebar-profile-card rounded-3xl border border-white/60 bg-white/45 p-3.5 shadow-[0_18px_48px_-40px_rgba(36,31,26,0.48)] backdrop-blur-md">
          {profileLoading ? (
            <SidebarProfileSkeleton />
          ) : signedOutQuota ? (
            <Link
              href={`/login?next=${encodeURIComponent(pathname)}` as never}
              className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-white/60 bg-white/45 p-3 text-[#241f1a] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.38)] backdrop-blur transition hover:bg-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/30"
            >
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#241f1a] text-white shadow-[0_10px_24px_-18px_rgba(36,31,26,0.35)]">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {t.upgrade.sidebar.signedOutTitle}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[#625a52]">
                  {t.upgrade.sidebar.signedOutBody}
                </span>
              </span>
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              {/* Phase 158.37 — real avatar (Google profile picture) +
                colored fallback initial for email-link users. */}
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={profileName}
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 flex-none rounded-full border border-[#241f1a]/10 object-cover shadow-[0_10px_24px_-18px_rgba(36,31,26,0.35)]"
                />
              ) : (
                <div className="sidebar-avatar-fallback flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#241f1a] text-sm font-bold text-white shadow-[0_10px_24px_-18px_rgba(36,31,26,0.35)]">
                  {avatarInitial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-semibold text-[#241f1a]"
                  title={email ?? profileName}
                >
                  {profileName}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex rounded-full border border-white/60 bg-white/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6f625a] shadow-[0_8px_18px_-16px_rgba(36,31,26,0.34)] backdrop-blur">
                    {tierLabel(currentTier, t.upgrade.sidebar)}
                  </span>
                  {/* Phase 182c — show "หมดอายุ X วัน" pill so the user
                      knows exactly when their PLUS/PRO grant or paid
                      period ends. Hidden on FREE (no period to track). */}
                  <ExpiryPill
                    periodEnd={subscription?.current_period_end ?? null}
                    tier={currentTier}
                    labels={t.upgrade.sidebar}
                  />
                </div>
              </div>
            </div>
          )}
          {/* Phase 158.16 — scans = big hero number (most-used credit),
              ภาพจำลอง = small secondary chip. Same row keeps the card
              compact; separator divides the two visually. */}
          {!signedOutQuota && (
          <div className="mt-4 border-t border-[#241f1a]/10 pt-3">
            <div className="flex items-end justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#625a52]">
                {t.upgrade.sidebar.scansRemaining}
              </p>
              {profileLoading ? (
                <Skeleton className="h-8 w-12 rounded" />
              ) : quotaUnavailable ? (
                <p className="font-serif text-3xl font-light italic leading-none text-[#8a7a70]">
                  —
                </p>
              ) : (
                <p className="font-serif text-3xl font-light italic leading-none text-[#241f1a] tabular-nums">
                  {scansLeft}
                </p>
              )}
            </div>
            {/* Phase 181 — previews credit row (was previously hidden;
                the user asked to see both numbers in the sidebar). */}
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#625a52]">
                {t.upgrade.sidebar.previewsRemaining}
              </p>
              {profileLoading ? (
                <Skeleton className="h-4 w-8 rounded" />
              ) : quotaUnavailable ? (
                <p className="font-serif text-lg font-light italic leading-none text-[#8a7a70]">
                  —
                </p>
              ) : (
                <p className="font-serif text-lg font-light italic leading-none text-[#241f1a] tabular-nums">
                  {previewsLeft}
                </p>
              )}
            </div>
            {quotaUnavailable && (
              <button
                type="button"
                onClick={refreshSubscription}
                className="mt-3 flex min-h-11 w-full items-center rounded-2xl border border-[#c78f65]/25 bg-[#fff7ef]/70 px-3 py-2 text-left text-[11px] font-semibold text-[#8a4a1f] backdrop-blur-md transition hover:bg-[#fff1e5]/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c78f65]/30"
              >
                {lang === "th"
                  ? "โควต้ายังไม่โหลด · กดโหลดอีกครั้ง"
                  : "Quota not loaded · retry"}
              </button>
            )}
          </div>
          )}
        </div>

        {currentTier !== "pro" && (
          <Link
            href={"/upgrade" as never}
            className="sidebar-upgrade-card block rounded-3xl border border-white/60 bg-white/45 p-[1px] shadow-[0_18px_42px_-32px_rgba(36,31,26,0.38)] backdrop-blur-md transition hover:border-[#7a5bd6]/20 hover:bg-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/40"
          >
            <div className="relative overflow-hidden rounded-[22px] border border-white/55 bg-white/45 p-4 shadow-[0_12px_30px_-26px_rgba(36,31,26,0.34)] backdrop-blur transition hover:bg-white/65">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#7a5bd6]/30 to-transparent"
              />
              <div className="flex items-center gap-2 text-[#241f1a]">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#7a5bd6]/20 bg-[#f3efff]/70 text-[#5e45b8] backdrop-blur-md">
                  <Crown className="h-4 w-4" />
                </span>
                <p className="text-sm font-semibold">
                  {t.upgrade.sidebar.upgradeProTitle}
                </p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#625a52]">
                {t.upgrade.sidebar.upgradeProBody}
              </p>
            </div>
          </Link>
        )}

        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={themeActionLabel}
            aria-pressed={theme === "light"}
            title={themeActionLabel}
            className="group relative inline-flex min-h-[44px] items-center gap-0.5 rounded-full border border-white/60 bg-white/45 p-1 text-[#6f625a] shadow-[0_12px_30px_-26px_rgba(36,31,26,0.42)] backdrop-blur-md transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/40"
          >
            <span
              className={`flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full transition ${
                theme === "light"
                  ? "sidebar-theme-thumb-active bg-[#241f1a] text-white"
                  : "text-[#625a52]"
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
            </span>
            <span
              className={`flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full transition ${
                theme === "dark"
                  ? "sidebar-theme-thumb-active bg-[#241f1a] text-white"
                  : "text-[#625a52]"
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
            </span>
          </button>
          <p className="text-[10px] font-medium text-[#625a52]">
            {t.upgrade.sidebar.version}
          </p>
        </div>
        </>
        ) : profileLoading ? (
          <div className="grid h-12 place-items-center" aria-label={profileName}>
            <SkeletonCircle size={40} />
          </div>
        ) : signedOutQuota ? (
          <Link
            href={`/login?next=${encodeURIComponent(pathname)}` as never}
            aria-label={t.upgrade.sidebar.signedOutTitle}
            title={t.upgrade.sidebar.signedOutTitle}
            className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/76 transition hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/40"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <Link
            href={"/settings" as never}
            aria-label={profileName}
            title={profileName}
            className="grid h-12 w-12 place-items-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/40"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-full border border-white/12 object-cover"
              />
            ) : (
              <span className="sidebar-avatar-fallback grid h-10 w-10 place-items-center rounded-full text-sm font-bold">
                {avatarInitial}
              </span>
            )}
          </Link>
        )}
      </div>
    </aside>
    </div>
  );
}

function tierLabel(
  tier: SubscriptionTier,
  labels: {
    tierFree: string;
    tierPlus: string;
    tierPro: string;
  }
): string {
  if (tier === "plus") return labels.tierPlus;
  if (tier === "pro") return labels.tierPro;
  return labels.tierFree;
}

/**
 * Phase 169 — Loading skeleton for the sidebar profile row. Matches the
 * eventual layout (avatar circle + 2 lines of text) so the transition is
 * a fade, not a layout jump.
 */
function SidebarProfileSkeleton(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <SkeletonCircle size={40} className="flex-none" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-28 rounded" />
        <Skeleton className="h-3 w-14 rounded-full" />
      </div>
    </div>
  );
}
