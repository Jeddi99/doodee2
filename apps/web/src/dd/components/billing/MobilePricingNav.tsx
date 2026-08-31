"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Crown,
  LockKeyhole,
  MoreHorizontal,
  Palette,
  ScanFace,
  Settings,
  ShieldCheck,
  Ticket,
  type LucideIcon,
} from "lucide-react";

import { MobileQuotaChip } from "@/components/billing/MobileQuotaChip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { activeBillingTier } from "@/lib/subscription-status";
import { useAuthUser } from "@/lib/use-auth-user";
import { useSubscription } from "@/lib/use-subscription";

interface NavItem {
  href: string;
  th: string;
  en: string;
  icon: LucideIcon;
  matchPaths: readonly string[];
}

const ITEMS: readonly NavItem[] = [
  {
    href: "/scan",
    th: "ประเมิน",
    en: "Assess",
    icon: ScanFace,
    matchPaths: ["/scan", "/history"],
  },
  {
    href: "/surgery",
    th: "จำลอง",
    en: "Simulate",
    icon: ShieldCheck,
    matchPaths: ["/surgery"],
  },
  {
    href: "/try-on",
    th: "แต่งหน้า",
    en: "Makeup",
    icon: Palette,
    matchPaths: ["/try-on", "/hair-color", "/eye-color", "/lipstick"],
  },
  {
    href: "/upgrade",
    th: "แพ็กเกจ",
    en: "Plans",
    icon: Crown,
    matchPaths: ["/upgrade", "/pricing"],
  },
] as const;

const MORE_PATHS = ["/methodology", "/settings", "/redeem", "/privacy"] as const;
const PREFETCH_HREFS = [
  ...ITEMS.map((item) => item.href),
  ...MORE_PATHS,
] as const;

function matchesPath(pathname: string, matchPath: string): boolean {
  return pathname === matchPath || pathname.startsWith(`${matchPath}/`);
}

function tap(): void {
  if (typeof navigator === "undefined") return;
  const vibrate = (navigator as Navigator & {
    vibrate?: (pattern: number) => boolean;
  }).vibrate;
  if (typeof vibrate !== "function") return;
  try {
    vibrate.call(navigator, 8);
  } catch {
    // Haptics are optional and may be blocked by the browser.
  }
}

export function MobilePricingNav({ lang }: { lang: "th" | "en" }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { email, displayName, avatarUrl, loading: authLoading } = useAuthUser();
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const profileName = displayName ?? email ?? (lang === "th" ? "ผู้ใช้ DOODEE" : "DOODEE user");
  const avatarInitial = (profileName.match(/[A-Za-zก-๙]/)?.[0] ?? "D").toUpperCase();
  const tier = activeBillingTier(subscription ?? null);
  const isActive = useCallback(
    (matchPaths: readonly string[]): boolean =>
      matchPaths.some((matchPath) => matchesPath(pathname, matchPath)),
    [pathname]
  );
  const moreActive = isActive(MORE_PATHS);

  useEffect(() => {
    setPendingHref(null);
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefetch = () => {
      for (const href of PREFETCH_HREFS) {
        try {
          router.prefetch(href as Parameters<typeof router.prefetch>[0]);
        } catch {
          // A failed prefetch must never block navigation.
        }
      }
    };
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      const id = idleWindow.requestIdleCallback(prefetch, { timeout: 2000 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(prefetch, 600);
    return () => window.clearTimeout(id);
  }, [router]);

  function handleTap(href: string, active: boolean): void {
    tap();
    setMoreOpen(false);
    startTransition(() => setPendingHref(active ? null : href));
  }

  const nav = (
    <>
      <nav
        data-mobile-bottom-nav=""
        aria-label={lang === "th" ? "เมนูล่าง" : "Bottom navigation"}
        className="fixed inset-x-0 bottom-0 z-40 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none lg:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      >
        <div className="mobile-bottom-nav-shell relative mx-3 mb-2 overflow-hidden rounded-[1.35rem] border">
          <div className="grid grid-cols-5">
            {ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.matchPaths);
              const pending = pendingHref === item.href && !active;
              return (
                <Link
                  key={item.href}
                  href={item.href as never}
                  onClick={() => handleTap(item.href, active)}
                  className="group flex min-h-[56px] min-w-[48px] flex-col items-center justify-center gap-1 px-1 py-2 text-center transition-transform duration-150 active:scale-[0.97]"
                  aria-current={active ? "page" : undefined}
                  aria-busy={pending || undefined}
                  aria-label={lang === "th" ? item.th : item.en}
                >
                  <NavIcon icon={Icon} active={active} pending={pending} />
                  <span className={`mobile-bottom-nav-label max-w-full truncate whitespace-nowrap text-[11px] font-medium leading-none ${active ? "mobile-bottom-nav-label-active" : pending ? "mobile-bottom-nav-label-pending" : "mobile-bottom-nav-label-idle"}`}>
                    {lang === "th" ? item.th : item.en}
                  </span>
                </Link>
              );
            })}

            <button
              type="button"
              onClick={() => {
                tap();
                setMoreOpen(true);
              }}
              className="group flex min-h-[56px] min-w-[48px] flex-col items-center justify-center gap-1 px-1 py-2 text-center transition-transform duration-150 active:scale-[0.97]"
              aria-label={lang === "th" ? "เพิ่มเติม" : "More"}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-current={moreActive ? "page" : undefined}
            >
              <NavIcon icon={MoreHorizontal} active={moreActive || moreOpen} pending={false} />
              <span className={`mobile-bottom-nav-label max-w-full truncate whitespace-nowrap text-[11px] font-medium leading-none ${moreActive || moreOpen ? "mobile-bottom-nav-label-active" : "mobile-bottom-nav-label-idle"}`}>
                {lang === "th" ? "เพิ่มเติม" : "More"}
              </span>
            </button>
          </div>
        </div>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent
          overlayClassName="!bg-[#02040c]/66 backdrop-blur-[2px]"
          className="mobile-nav-more-sheet theme-locked-dark !bottom-0 !left-0 !right-0 !top-auto !max-h-[86dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 gap-0 rounded-b-none rounded-t-2xl border-white/12 bg-[#070b1a] px-4 pb-[calc(max(env(safe-area-inset-bottom),0.75rem)+0.5rem)] pt-5 text-white shadow-[0_-8px_30px_rgba(0,0,0,0.38)]"
        >
          <DialogTitle className="pr-12 text-xl font-semibold">
            {lang === "th" ? "เพิ่มเติม" : "More"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-white/62">
            {lang === "th" ? "บัญชี เครดิต และเมนูรอง" : "Account, credits, and secondary navigation"}
          </DialogDescription>

          <div className="mt-5 border-y border-white/10 py-4">
            <div className="flex items-center gap-3">
              {authLoading ? (
                <span className="h-11 w-11 animate-pulse rounded-full bg-white/10" aria-hidden />
              ) : avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt=""
                  width={44}
                  height={44}
                  unoptimized
                  referrerPolicy="no-referrer"
                  className="h-11 w-11 rounded-full border border-white/12 object-cover"
                />
              ) : (
                <span className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-sm font-bold text-white">
                  {avatarInitial}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{profileName}</p>
                <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.12em] text-white/50">
                  {subscriptionLoading ? "…" : tier}
                </p>
              </div>
              {email ? (
                <MobileQuotaChip />
              ) : (
                <Link
                  href={`/login?next=${encodeURIComponent(pathname)}` as never}
                  className="inline-flex min-h-11 items-center rounded-full border border-white/14 px-4 text-xs font-semibold text-white"
                >
                  {lang === "th" ? "เข้าสู่ระบบ" : "Sign in"}
                </Link>
              )}
            </div>
          </div>

          <div className="mt-2 divide-y divide-white/10">
            <MoreLink href="/methodology" icon={BookOpen} label={lang === "th" ? "วิธีการวัด" : "Methodology"} />
            <MoreLink href="/settings" icon={Settings} label={lang === "th" ? "การตั้งค่า" : "Settings"} />
            <MoreLink href="/redeem" icon={Ticket} label={lang === "th" ? "ใช้โค้ด" : "Redeem code"} />
            <MoreLink href="/privacy" icon={LockKeyhole} label={lang === "th" ? "ความเป็นส่วนตัว" : "Privacy"} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  if (!mounted) return nav;
  return createPortal(nav, document.body);
}

function NavIcon({
  icon: Icon,
  active,
  pending,
}: {
  icon: LucideIcon;
  active: boolean;
  pending: boolean;
}): React.JSX.Element {
  return (
    <span className={`mobile-bottom-nav-icon relative flex h-8 w-8 items-center justify-center rounded-xl border transition ${active ? "mobile-bottom-nav-icon-active" : pending ? "mobile-bottom-nav-icon-pending" : "mobile-bottom-nav-icon-idle"}`}>
      <Icon className={`h-4 w-4 ${active ? "mobile-bottom-nav-svg-active" : pending ? "mobile-bottom-nav-svg-pending" : "mobile-bottom-nav-svg-idle"}`} aria-hidden />
      {(active || pending) && (
        <span aria-hidden className={`mobile-bottom-nav-indicator absolute -bottom-1 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full ${active ? "mobile-bottom-nav-indicator-active" : "mobile-bottom-nav-indicator-pending"}`} />
      )}
    </span>
  );
}

function MoreLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}): React.JSX.Element {
  return (
    <Link
      href={href as never}
      className="flex min-h-14 items-center gap-3 py-2 text-sm font-semibold text-white/82 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/45"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-cyan">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      {label}
    </Link>
  );
}
