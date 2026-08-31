/**
 * Stands in for `next/navigation` in the ported UI, aliased in `vite.config.js`.
 *
 * Covers exactly the six exports the ported tree imports — `useRouter`,
 * `usePathname`, `useSearchParams`, `useParams`, `redirect`, `notFound`. Adding
 * an export here is cheaper than rewriting call sites, but anything not listed
 * is genuinely absent rather than silently broken: an unshimmed import fails at
 * build time, which is the outcome we want.
 */
import { useMemo } from "react";
import {
  useLocation,
  useNavigate,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom";

export interface AppRouterInstance {
  push(href: string): void;
  replace(href: string): void;
  back(): void;
  forward(): void;
  refresh(): void;
  prefetch(href: string): void;
}

export function useRouter(): AppRouterInstance {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (href: string) => navigate(href),
      replace: (href: string) => navigate(href, { replace: true }),
      back: () => navigate(-1),
      forward: () => navigate(1),
      // Next's `refresh()` re-runs server components and re-renders with fresh
      // server data. There is no server render here, so the honest equivalent
      // of "get the current data again" is a no-op: every screen in this app
      // reads through react-query, which owns its own invalidation. Reloading
      // the document instead would throw away client state the ported flows
      // (scan progress, try-on layers) keep in memory.
      refresh: () => {},
      // Route chunks are already lazy-loaded on demand; there is no prefetch
      // hook to drive, and the six call sites only ever use it as a hint.
      prefetch: () => {},
    }),
    [navigate],
  );
}

export function usePathname(): string {
  return useLocation().pathname;
}

/**
 * Next hands back a read-only `URLSearchParams`; react-router hands back a
 * `[params, setParams]` pair. Callers here only ever read, so the tuple is
 * unwrapped to match the Next shape.
 */
export function useSearchParams(): URLSearchParams {
  const [params] = useRouterSearchParams();
  return params;
}

export function useParams<T = Record<string, string | undefined>>(): T {
  return useRouterParams() as T;
}

/**
 * In Next these throw a control-flow signal the framework catches during a
 * server render. There is no server render and no framework to catch it, so
 * they do the closest client-side thing: `redirect` navigates, `notFound`
 * throws for the nearest error boundary.
 */
export function redirect(href: string): never {
  window.location.assign(href);
  // Unreachable in practice — `assign` tears the document down — but the
  // `never` return is what lets call sites treat this as terminal.
  throw new Error(`redirect(${href})`);
}

export function notFound(): never {
  const error = new Error("NEXT_NOT_FOUND");
  (error as Error & { digest?: string }).digest = "NEXT_NOT_FOUND";
  throw error;
}
