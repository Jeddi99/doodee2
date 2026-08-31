"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DoodeeLogo } from "@/components/DoodeeLogo";
import {
  getCurrentUser,
  onAuthChange,
  supabaseConfigured,
} from "@/lib/supabase/auth-client";
import { useT } from "@/lib/i18n";

type State =
  | { kind: "checking" }
  | { kind: "authed" }
  | { kind: "redirecting" };

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { t } = useT();
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;

    function goToLogin(): void {
      setState({ kind: "redirecting" });
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}` as never);
    }

    if (!supabaseConfigured()) {
      goToLogin();
      return;
    }

    let initialCheckDone = false;

    getCurrentUser()
      .then((user) => {
        initialCheckDone = true;
        if (cancelled) return;
        if (user) {
          setState({ kind: "authed" });
        } else {
          goToLogin();
        }
      })
      .catch(() => {
        initialCheckDone = true;
        if (cancelled) return;
        goToLogin();
      });

    const unsub = onAuthChange((user) => {
      // Ignore auth events that fire before the initial session check
      // resolves — a cross-tab SIGNED_OUT during the OAuth callback
      // would otherwise kick a user who just signed in.
      if (!initialCheckDone) return;
      if (cancelled) return;
      if (user) {
        setState({ kind: "authed" });
      } else {
        goToLogin();
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [pathname, router]);

  if (state.kind === "authed") {
    return <>{children}</>;
  }

  const label =
    state.kind === "redirecting" ? t.auth.gateRedirect : t.auth.gateChecking;

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[radial-gradient(circle_at_20%_12%,rgba(168,85,247,0.22),transparent_34%),radial-gradient(circle_at_80%_0%,rgba(6,182,212,0.16),transparent_32%),linear-gradient(180deg,#050816_0%,#070B1A_55%,#0B1020_100%)] px-6 text-[#f8fafc]">
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="w-full max-w-sm rounded-3xl border border-[#f8fafc]/[0.12] bg-[#f8fafc]/[0.06] p-6 shadow-[0_24px_80px_-52px_rgba(0,0,0,0.95)] backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <DoodeeLogo
            className="gap-3"
            markClassName="h-11 w-11 border border-cyan/25 bg-cyan/[0.10] p-1.5 backdrop-blur"
            wordmarkClassName="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan"
          />
          <div className="min-w-0">
            <p className="mt-1 text-sm font-semibold text-[#f8fafc]">{label}</p>
          </div>
        </div>
        <div className="mt-5 space-y-2" aria-hidden>
          <span className="block h-2.5 w-full animate-pulse rounded-full bg-[#f8fafc]/[0.12]" />
          <span className="block h-2.5 w-4/5 animate-pulse rounded-full bg-[#f8fafc]/[0.08]" />
        </div>
      </div>
    </div>
  );
}
