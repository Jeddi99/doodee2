"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Phase 192q — Auto-cleaning setTimeout scheduler for components that
 * fire timeouts from async event handlers (download success/error,
 * toast auto-dismiss, double-tap confirm flags).
 *
 * The bare `window.setTimeout(() => setState(...), 1500)` pattern in
 * an async handler leaves the timer alive past unmount. If the user
 * unmounts the panel (route change, dialog close) before the timeout
 * fires, the callback runs against an unmounted component → React
 * warns about state updates on unmounted components, and in the worst
 * case the dangling closure prevents the component tree from being
 * garbage-collected.
 *
 * This hook returns a `scheduleTimeout(fn, ms)` function that:
 *   1. Schedules the timeout normally.
 *   2. Tracks the returned id in a ref-held Set.
 *   3. Removes the id from the Set when the timeout fires.
 *   4. Clears every id still in the Set on unmount.
 *
 * Usage:
 *   const schedule = useTrackedTimeout();
 *   ...
 *   schedule(() => setStatus("idle"), 1500);
 */
export function useTrackedTimeout(): (fn: () => void, ms: number) => void {
  const idsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const ids = idsRef.current;
    return () => {
      for (const id of ids) {
        window.clearTimeout(id);
      }
      ids.clear();
    };
  }, []);

  return useCallback((fn: () => void, ms: number): void => {
    const id = window.setTimeout(() => {
      idsRef.current.delete(id);
      fn();
    }, ms);
    idsRef.current.add(id);
  }, []);
}
