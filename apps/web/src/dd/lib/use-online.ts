"use client";

import { useEffect, useState } from "react";

/**
 * Phase 48 — track `navigator.onLine` reactively. Returns true when
 * online, false when offline. Defaults to `true` on the server side
 * to avoid SSR mismatches; the client effect updates on mount.
 *
 * Browser `navigator.onLine` is sometimes optimistic — it tracks
 * radio state, not actual reachability. So this is a hint, not a
 * guarantee. Pair with retry-on-fail logic in the actual fetch
 * paths for full robustness.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return online;
}
