"use client";

import { useEffect, useRef, useState } from "react";
import type { FocusEvent, FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Gift,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useSubscription } from "@/lib/use-subscription";
import { setSubscriptionCache } from "@/lib/subscription-cache";
import { getAccessToken } from "@/lib/supabase/auth-client";
import type { SubscriptionRow } from "@/lib/supabase/types";

type RedeemError =
  | "COUPON_NOT_FOUND"
  | "COUPON_DISABLED"
  | "COUPON_EXPIRED"
  | "COUPON_DEPLETED"
  | "COUPON_ALREADY_REDEEMED"
  | "COUPON_NO_SUBSCRIPTION"
  | "COUPON_STRIPE_ONLY"
  | "COUPON_BAD_GRANT_TIER"
  | "COUPON_BAD_GRANT_DAYS"
  | "INVALID_CODE_FORMAT"
  | "UNAUTHORIZED"
  | "NETWORK"
  | "UNKNOWN";

interface GrantedEffect {
  kind?: "tier_grant" | "free_credits";
  tier?: "plus" | "pro";
  days?: number;
  scans?: number;
  previews?: number;
  until?: string;
}

interface RedeemSuccess {
  ok: true;
  subscription: SubscriptionRow;
  granted?: GrantedEffect | null;
}

export function RedeemPage() {
  const { t, lang } = useT();
  const { subscription } = useSubscription();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<SubscriptionRow | null>(null);
  const [granted, setGranted] = useState<GrantedEffect | null>(null);
  const [errorCode, setErrorCode] = useState<RedeemError | null>(null);
  const focusScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const r = t.redeem;

  useEffect(() => {
    return () => {
      if (focusScrollTimer.current) clearTimeout(focusScrollTimer.current);
    };
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy) return;

    setSuccess(null);
    setGranted(null);
    setErrorCode(null);

    const trimmed = code
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
      .trim()
      .toUpperCase();

    if (!/^[A-Z0-9_-]{3,64}$/.test(trimmed)) {
      setErrorCode("INVALID_CODE_FORMAT");
      return;
    }

    setBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setErrorCode("UNAUTHORIZED");
        return;
      }

      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: trimmed }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<
        RedeemSuccess & { code?: RedeemError; reason?: string }
      >;

      if (res.ok && body.subscription) {
        setSubscriptionCache(body.subscription);
        setSuccess(body.subscription);
        setGranted(body.granted ?? null);
        setCode("");
        return;
      }

      setErrorCode((body.code as RedeemError | undefined) ?? "UNKNOWN");
    } catch {
      setErrorCode("NETWORK");
    } finally {
      setBusy(false);
    }
  }

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    const el = e.target;
    if (focusScrollTimer.current) clearTimeout(focusScrollTimer.current);
    focusScrollTimer.current = setTimeout(() => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 300);
  }

  const errorMessage = errorCode ? r.errors[errorCode] ?? r.errors.UNKNOWN : null;

  return (
    <div className="mx-auto max-w-xl space-y-8 text-[#241f1a]">
      <header className="space-y-2 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 bg-white/45 shadow-[0_16px_36px_-28px_rgba(36,31,26,0.45)] backdrop-blur">
          <Gift className="h-5 w-5 text-[#236653]" />
        </span>
        <h1 className="font-serif text-3xl font-light italic text-[#241f1a] md:text-4xl">
          {r.title}
        </h1>
        <p className="text-sm leading-relaxed text-[#5f574f]">{r.subtitle}</p>
      </header>

      {subscription && (
        <div className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/45 px-4 py-3 text-xs shadow-[0_18px_44px_-40px_rgba(36,31,26,0.32)] backdrop-blur-md">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#7b7168]">
              {r.currentPlanLabel}
            </p>
            <p className="font-medium uppercase tracking-wider text-[#241f1a]">
              {subscription.tier}
            </p>
          </div>
          {subscription.current_period_end && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#7b7168]">
                {r.expiresLabel}
              </p>
              <p className="tabular-nums text-[#3e3730]">
                {fmtDate(subscription.current_period_end, lang)}
              </p>
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={submit}
        className="space-y-3 rounded-3xl border border-white/60 bg-white/45 p-5 shadow-[0_22px_60px_-52px_rgba(36,31,26,0.45)] backdrop-blur-md"
      >
        <label htmlFor="redeem-code" className="block text-xs text-[#5f574f]">
          {r.inputLabel}
        </label>
        <input
          id="redeem-code"
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setErrorCode(null);
            setSuccess(null);
            setGranted(null);
          }}
          placeholder={r.inputPlaceholder}
          maxLength={64}
          onFocus={handleFocus}
          inputMode="text"
          enterKeyHint="go"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={errorCode != null}
          aria-describedby={errorCode ? "redeem-code-error" : undefined}
          className="w-full rounded-xl border border-white/60 bg-white/55 px-4 py-3 text-center font-mono text-base uppercase tracking-[0.16em] text-[#241f1a] shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] backdrop-blur placeholder:tracking-[0.12em] placeholder:text-[#9b9289] focus:border-[#236653]/60 focus:outline-none focus:ring-2 focus:ring-[#236653]/20 sm:tracking-[0.24em]"
        />
        <button
          type="submit"
          disabled={busy || code.trim().length === 0}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#241f1a] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_-26px_rgba(36,31,26,0.48)] transition hover:bg-[#342d27] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {busy ? r.submitting : r.submit}
        </button>

        {errorMessage && (
          <p
            id="redeem-code-error"
            role="alert"
            className="mt-2 rounded-lg border border-[#d69b8d]/60 bg-white/55 px-3 py-2 text-xs text-[#8a3a2b] backdrop-blur"
          >
            {errorMessage}
          </p>
        )}
      </form>

      {success && (
        <section
          aria-live="polite"
          className="space-y-3 rounded-3xl border border-[#2f7d68]/25 bg-white/45 p-5 shadow-[0_22px_60px_-52px_rgba(36,31,26,0.45)] backdrop-blur-md"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-[#236653]" />
            <p className="font-medium text-[#236653]">{r.successTitle}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#6b625a]">
                {r.newPlanLabel}
              </p>
              <p className="mt-1 inline-flex items-center gap-1 font-medium uppercase tracking-wider text-[#241f1a]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#236653]" />
                {success.tier}
              </p>
            </div>
            {success.current_period_end && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#6b625a]">
                  {r.activeUntilLabel}
                </p>
                <p className="mt-1 tabular-nums text-[#241f1a]">
                  {fmtDate(success.current_period_end, lang)}
                </p>
              </div>
            )}
          </div>

          {granted && granted.kind === "tier_grant" && (
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#2f7d68]/20 bg-white/70 p-3 text-center text-[11px]">
              {typeof granted.days === "number" && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#6b625a]">
                    {r.grantedDuration}
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-[#236653]">
                    {granted.days}
                  </p>
                  <p className="text-[10px] text-[#6b625a]">{r.grantedDays}</p>
                </div>
              )}
              {typeof granted.scans === "number" && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#6b625a]">
                    {r.grantedScans}
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-[#236653]">
                    {granted.scans}
                  </p>
                  <p className="text-[10px] text-[#6b625a]">
                    {r.grantedScansUnit}
                  </p>
                </div>
              )}
              {typeof granted.previews === "number" && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#6b625a]">
                    {r.grantedPreviews}
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-[#236653]">
                    {granted.previews}
                  </p>
                  <p className="text-[10px] text-[#6b625a]">
                    {r.grantedPreviewsUnit}
                  </p>
                </div>
              )}
            </div>
          )}

          {granted && granted.kind === "free_credits" && (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#2f7d68]/20 bg-white/70 p-3 text-center text-[11px]">
              {typeof granted.scans === "number" && granted.scans > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#6b625a]">
                    {r.bonusScans}
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-[#236653]">
                    +{granted.scans}
                  </p>
                </div>
              )}
              {typeof granted.previews === "number" && granted.previews > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#6b625a]">
                    {r.bonusPreviews}
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-[#236653]">
                    +{granted.previews}
                  </p>
                </div>
              )}
            </div>
          )}

          <Link
            href={"/scan" as never}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#236653] hover:underline"
          >
            {r.successCta}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

      <div className="text-center text-[11px] text-[#6b625a]">
        <Link href={"/upgrade" as never} className="hover:text-[#241f1a]">
          {r.noCodeCta}
        </Link>
      </div>
    </div>
  );
}

function fmtDate(iso: string | null, lang: "th" | "en"): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString(lang === "th" ? "th-TH" : "en-US", {
      calendar: "gregory",
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
