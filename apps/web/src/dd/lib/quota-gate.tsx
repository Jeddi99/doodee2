"use client";

// Phase 192u — Global paywall gate. When an AI action is blocked by quota
// exhaustion or premium expiry, any component calls openGate(...) and a
// single app-level dialog pops with a CTA to /upgrade.
// Premium-expired users land here too: the server downgrades them to the
// free tier with 0 quota, so the next consume throws QuotaExhaustedError
// and routes through openGateFromError → openGate just like a fresh free
// user who ran out.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SubscriptionTier } from "@/types";
import { QuotaExhaustedError, FeatureLockedError } from "@/lib/quota";

// Phase 192u — what blocked the action. `kind` selects the dialog headline;
// `tier` is the user's CURRENT tier (free → "subscribe", paid → "renew").
export type GateReason = {
  kind: "scans" | "previews" | "feature";
  tier: SubscriptionTier;
};

interface QuotaGateContextValue {
  reason: GateReason | null;
  openGate: (reason: GateReason) => void;
  closeGate: () => void;
}

const QuotaGateContext = createContext<QuotaGateContextValue | null>(null);

export function QuotaGateProvider({ children }: { children: ReactNode }) {
  const [reason, setReason] = useState<GateReason | null>(null);

  const openGate = useCallback((next: GateReason) => {
    setReason(next);
  }, []);

  const closeGate = useCallback(() => {
    setReason(null);
  }, []);

  // Phase 192g lesson — memoize the context value so the provider sitting
  // near the (app) shell root doesn't re-render every gate consumer on each
  // unrelated parent tick. setReason is stable; openGate/closeGate are
  // useCallback-wrapped, so this only changes when `reason` actually does.
  const value = useMemo<QuotaGateContextValue>(
    () => ({ reason, openGate, closeGate }),
    [reason, openGate, closeGate]
  );

  return (
    <QuotaGateContext.Provider value={value}>
      {children}
    </QuotaGateContext.Provider>
  );
}

export function useQuotaGate(): QuotaGateContextValue {
  const ctx = useContext(QuotaGateContext);
  if (!ctx) {
    throw new Error("useQuotaGate must be used inside <QuotaGateProvider>");
  }
  return ctx;
}

// Phase 192u — Bridge from a thrown error to the gate. Call sites wrap their
// AI action in try/catch and pass the caught error here BEFORE falling back
// to humanizeError. Returns true when the gate handled it (quota/feature),
// false otherwise so the caller can surface its normal error toast.
export function openGateFromError(
  err: unknown,
  openGate: (reason: GateReason) => void
): boolean {
  if (err instanceof QuotaExhaustedError) {
    openGate({ kind: err.kind, tier: err.tier });
    return true;
  }
  if (err instanceof FeatureLockedError) {
    // FeatureLockedError carries currentTier (what the user is on) — use it
    // so the dialog body picks the right "subscribe" vs "renew" copy.
    openGate({ kind: "feature", tier: err.currentTier });
    return true;
  }

  // Phase 192u — server-side 402 surfaces as a generic Error string (client
  // quota guard was removed in 192j/o). Proxies throw e.g.
  // "gemini-recommend-402: {\"error\":\"out_of_quota\",\"kind\":\"scans\",
  // \"code\":\"OUT_OF_SCANS\"...}". Detect the quota markers + route it.
  const msg = (
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : ""
  ).toLowerCase();
  // Require an explicit quota keyword. A bare "402" only counts when paired
  // with one, so a random "402" in a hash/id can't false-trip the paywall.
  const hasQuotaWord =
    msg.includes("out_of_quota") ||
    msg.includes("out of quota") ||
    msg.includes("out_of_scans") ||
    msg.includes("out_of_previews") ||
    msg.includes("quota-exhausted") ||
    msg.includes("quota exhausted");
  const is402 = hasQuotaWord || (msg.includes("402") && msg.includes("quota"));
  if (is402) {
    const kind: "scans" | "previews" =
      msg.includes("out_of_previews") || msg.includes("preview")
        ? "previews"
        : "scans";
    // tier unknown from the string — default "free" (the gate copy branches
    // free vs paid; free is the safe default that says "subscribe"). The
    // dialog still routes to /upgrade either way.
    openGate({ kind, tier: "free" });
    return true;
  }

  return false;
}
