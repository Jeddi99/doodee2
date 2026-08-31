"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  ClipboardList,
  CreditCard,
  Loader2,
  LogOut,
  Menu,
  QrCode,
  Receipt,
  Sparkles,
  Tag,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { AdminUnauthorizedError, adminFetch } from "@/lib/admin-client";
import { signOut } from "@/lib/supabase/auth-client";
import { useT } from "@/lib/i18n";
import type { Translations } from "@/locales/types";

interface NavItem {
  href: string;
  label: string;
  mobileLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
}

function buildNav(t: Translations): NavItem[] {
  return [
    {
      href: "/admin",
      label: t.adminNav.dashboard,
      mobileLabel: "ภาพรวม",
      icon: BarChart3,
    },
    {
      href: "/admin/users",
      label: t.adminNav.users,
      mobileLabel: "ผู้ใช้",
      icon: Users,
    },
    {
      href: "/admin/proof",
      label: "หลักฐาน ณ เวลานั้น",
      mobileLabel: "หลักฐาน",
      icon: QrCode,
    },
    { href: "/admin/subscriptions", label: t.adminNav.subscriptions, icon: Sparkles },
    { href: "/admin/payments", label: t.adminNav.payments, icon: CreditCard },
    { href: "/admin/usage", label: t.adminNav.usage, icon: Receipt },
    { href: "/admin/coupons", label: t.adminNav.coupons, icon: Tag },
    { href: "/admin/health", label: t.adminNav.health, icon: Activity },
    { href: "/admin/audit", label: t.adminNav.audit, icon: ClipboardList },
  ];
}

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { t } = useT();
  const nav = useMemo(() => buildNav(t), [t]);
  const [signingOut, setSigningOut] = useState(false);
  const [authState, setAuthState] = useState<
    | { kind: "loading" }
    | { kind: "ok" }
    | { kind: "redirecting" }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    adminFetch<{ ok?: boolean }>("/api/admin/stats")
      .then(() => {
        if (!cancelled) setAuthState({ kind: "ok" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof AdminUnauthorizedError) {
          setAuthState({ kind: "redirecting" });
          router.replace(
            err.reason === "not-signed-in" ? ("/login?next=%2Fadmin" as never) : ("/" as never)
          );
          return;
        }
        setAuthState({
          kind: "error",
          message: err instanceof Error ? err.message : "unknown",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleSignOut(): void {
    if (signingOut) return;
    setSigningOut(true);
    signOut()
      .then(() => {
        window.location.href = "/login";
      })
      .catch(() => setSigningOut(false));
  }

  return (
    <div className="admin-glass-page min-h-[100dvh] bg-[#050816] text-[#f8fafc]">
      <div className="mx-auto flex max-w-[1500px] gap-7 px-3 py-3 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <DesktopSidebar
          pathname={pathname}
          nav={nav}
          signingOut={signingOut}
          onSignOut={handleSignOut}
        />
        <main className="min-w-0 flex-1 space-y-5 pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:pb-0">
          {(authState.kind === "loading" || authState.kind === "redirecting") && (
            <LoadingPanel label={t.adminGate.checking} />
          )}
          {authState.kind === "error" && (
            <ErrorPanel message={authState.message} title={t.adminGate.loadFailed} />
          )}
          {authState.kind === "ok" && children}
        </main>
      </div>
      {authState.kind === "ok" && (
        <MobileNav
          pathname={pathname}
          nav={nav}
          signingOut={signingOut}
          onSignOut={handleSignOut}
        />
      )}
    </div>
  );
}

function DesktopSidebar({
  pathname,
  nav,
  signingOut,
  onSignOut,
}: {
  pathname: string;
  nav: NavItem[];
  signingOut: boolean;
  onSignOut: () => void;
}) {
  return (
    <aside className="sticky top-8 hidden w-64 flex-none self-start lg:block">
      <div className="rounded-3xl border border-white/[0.08] bg-[#0b1020] p-3 shadow-[0_18px_48px_-32px_rgba(6,182,212,0.3)]">
        <div className="px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan">
            DOODEE ADMIN
          </p>
          <p className="mt-1 text-lg font-semibold text-white">ศูนย์จัดการ</p>
        </div>
        <nav className="mt-2 space-y-1" aria-label="เมนูแอดมิน">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href as never}
                className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 ${
                  active
                    ? "border-cyan/35 bg-cyan/10 text-white"
                    : "border-transparent text-white/62 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-cyan" : "text-white/45"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-xl border-t border-white/[0.08] px-3 pt-3 text-sm font-medium text-white/55 transition hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60"
        >
          {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          ออกจากระบบ
        </button>
      </div>
    </aside>
  );
}

function MobileNav({
  pathname,
  nav,
  signingOut,
  onSignOut,
}: {
  pathname: string;
  nav: NavItem[];
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = nav.slice(0, 3);
  const more = nav.slice(3);

  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <>
      <DialogPrimitive.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/55 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-50 rounded-3xl border border-white/[0.1] bg-[#0b1020] p-3 shadow-[0_24px_72px_rgba(0,0,0,0.55)] focus:outline-none lg:hidden">
            <div className="mb-2 flex items-center justify-between pl-2">
              <DialogPrimitive.Title className="text-sm font-semibold text-white">
                เมนูเพิ่มเติม
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                เมนูจัดการส่วนอื่นของระบบ
              </DialogPrimitive.Description>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label="ปิดเมนู"
                  className="grid h-11 w-11 place-items-center rounded-xl text-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
                >
                  <X className="h-5 w-5" />
                </button>
              </DialogPrimitive.Close>
            </div>
            <nav className="grid grid-cols-2 gap-2" aria-label="เมนูเพิ่มเติม">
              {more.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href as never}
                    className={`flex min-h-12 items-center gap-2.5 rounded-xl border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
                      active
                        ? "border-cyan/35 bg-cyan/10 text-white"
                        : "border-white/[0.08] bg-white/[0.03] text-white/72"
                    }`}
                  >
                    <Icon className="h-4 w-4 text-cyan" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] text-sm font-medium text-white/65 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
            >
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              ออกจากระบบ
            </button>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <nav
        className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-50 grid grid-cols-4 rounded-2xl border border-white/[0.1] bg-[#070b1a]/95 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.55)] lg:hidden"
        aria-label="เมนูหลักแอดมิน"
      >
        {primary.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href as never}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
                active ? "bg-cyan/10 text-white" : "text-white/52"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-cyan" : "text-white/48"}`} />
              {item.mobileLabel ?? item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
            moreOpen ? "bg-cyan/10 text-white" : "text-white/52"
          }`}
        >
          <Menu className={`h-5 w-5 ${moreOpen ? "text-cyan" : "text-white/48"}`} />
          เพิ่มเติม
        </button>
      </nav>
    </>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-3xl border border-white/[0.08] bg-[#0b1020] text-white/62">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-cyan" />
        {label}
      </div>
    </div>
  );
}

function ErrorPanel({ message, title }: { message: string; title: string }) {
  return (
    <div className="space-y-2 rounded-3xl border border-warn/30 bg-warn/10 p-6">
      <p className="font-medium text-white">{title}</p>
      <p className="text-sm text-white/62">{message}</p>
    </div>
  );
}
