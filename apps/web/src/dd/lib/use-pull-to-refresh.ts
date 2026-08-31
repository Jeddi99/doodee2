"use client";

/**
 * Phase 166 — Pull-to-refresh primitive.
 *
 * Touch-only (mouse drag is a separate gesture intent). Activates only
 * when the document is already scrolled to the very top, so it doesn't
 * fight with intermediate scroll containers.
 *
 * Returns:
 *   pullPx — current vertical drag distance in pixels (0 when idle).
 *   triggered — true while the refresh callback is in flight.
 *
 * The consumer renders a small indicator that grows with `pullPx` and
 * shows a spinner when `triggered`.
 *
 * Threshold (px to trigger refresh) + damping factor are constants —
 * tuned so the gesture feels like iOS Safari and Twitter's app.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const TRIGGER_PX = 70;
const MAX_PX = 110;
const DAMPING = 0.45;

// Phase 192r — The (app) shell moved the scroll boundary off <body> onto
// the <main id="main"> container (h-[100dvh] flex shell, main is
// overflow-y-auto). PTR's "are we at the top?" gate must read THAT
// element's scrollTop — `window.scrollY` is now permanently 0 inside the
// app shell, which would let PTR fire even when the user is scrolled deep
// into the list. Falls back to document/window scroll for any surface
// that still uses document scroll (e.g. the marketing landing).
function currentScrollTop(): number {
  if (typeof document !== "undefined") {
    const main = document.getElementById("main");
    if (main && main.scrollHeight > main.clientHeight) {
      return main.scrollTop;
    }
  }
  if (typeof window === "undefined") return 0;
  return (
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
}

export interface PullToRefreshState {
  /** Current pull distance in CSS px (0 when idle, capped at MAX_PX). */
  pullPx: number;
  /** True while the user's onRefresh callback is awaiting. */
  refreshing: boolean;
  /** True once the user has crossed the trigger threshold. */
  willTrigger: boolean;
}

export function usePullToRefresh(
  onRefresh: () => void | Promise<void>,
  options?: { enabled?: boolean }
): PullToRefreshState {
  const enabled = options?.enabled ?? true;

  // Phase 192n — CRIT audit finding: listener storm.
  // Previously `pullPx` and `refreshing` were in the touch-listeners
  // effect's dep array. `setPullPx` fires on every touchmove frame, so
  // the effect tore down and re-attached 4 window listeners per frame
  // during the gesture — jankifying the animation and dropping events
  // on mid-range Android.
  // Fix: refs are the source-of-truth for handler logic, state exists
  // only so the parent re-renders the pull indicator. The effect's dep
  // array is now stable (`[enabled, fire]`), so the listeners attach
  // once per gesture session and stay attached.
  const pullPxRef = useRef(0);
  const refreshingRef = useRef(false);
  const [pullPx, setPullPxState] = useState(0);
  const [refreshing, setRefreshingState] = useState(false);
  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  const setPullPx = useCallback((v: number) => {
    pullPxRef.current = v;
    setPullPxState(v);
  }, []);

  const setRefreshing = useCallback((v: boolean) => {
    refreshingRef.current = v;
    setRefreshingState(v);
  }, []);

  // Reset when disabled flips off (e.g. parent unmounts gesture surface).
  useEffect(() => {
    if (!enabled) {
      startYRef.current = null;
      activeRef.current = false;
      setPullPx(0);
    }
  }, [enabled, setPullPx]);

  // Keep `onRefresh` stable inside `fire` so `fire`'s identity doesn't
  // churn if the parent recreates the callback every render.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const fire = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefreshRef.current();
    } finally {
      setRefreshing(false);
      setPullPx(0);
      startYRef.current = null;
      activeRef.current = false;
    }
  }, [setPullPx, setRefreshing]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    function onStart(e: TouchEvent): void {
      if (refreshingRef.current) return;
      // Only kick in when we're scrolled to the top — otherwise the user
      // is mid-scroll and dragging down is just normal scroll. Phase 192r:
      // reads the #main scroll container, not window (see currentScrollTop).
      if (currentScrollTop() > 0) return;
      const touch = e.touches[0];
      if (!touch) return;
      startYRef.current = touch.clientY;
      activeRef.current = true;
    }

    function onMove(e: TouchEvent): void {
      if (!activeRef.current || startYRef.current === null) return;
      const touch = e.touches[0];
      if (!touch) return;
      const delta = touch.clientY - startYRef.current;
      if (delta <= 0) {
        // User is scrolling up — bail out, don't fight native scroll.
        setPullPx(0);
        return;
      }
      const damped = Math.min(MAX_PX, delta * DAMPING);
      setPullPx(damped);
      // Once the user has pulled past a small amount, we own the gesture
      // and need to prevent the page's own bounce/scroll. Without this
      // on iOS the page will rubber-band and our indicator looks janky.
      if (damped > 4 && e.cancelable) {
        e.preventDefault();
      }
    }

    function onEnd(): void {
      if (!activeRef.current) return;
      activeRef.current = false;
      startYRef.current = null;
      // Phase 192n — read CURRENT values from refs, not the stale closure
      // captures from when this listener was attached. Before the fix the
      // effect was re-attaching every frame so the closure WAS current; now
      // the listener is attached once per gesture session and the refs are
      // the only way to see fresh state.
      if (pullPxRef.current >= TRIGGER_PX && !refreshingRef.current) {
        void fire();
      } else {
        setPullPx(0);
      }
    }

    // `passive: false` on touchmove so we can `preventDefault` while the
    // user is dragging the indicator.
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, fire, setPullPx]);

  return {
    pullPx,
    refreshing,
    willTrigger: pullPx >= TRIGGER_PX,
  };
}
