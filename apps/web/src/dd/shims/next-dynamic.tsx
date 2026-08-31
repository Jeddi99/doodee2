/**
 * Stands in for `next/dynamic` in the ported UI, aliased in `vite.config.js`.
 *
 * `dynamic(loader, { ssr: false, loading })` becomes `React.lazy` wrapped in a
 * `<Suspense>` carrying the same fallback. The `ssr: false` option — the reason
 * five of the call sites exist at all, since they pull in MediaPipe or canvas
 * code that cannot run on a server — is simply true here: nothing server-renders.
 */
import { Suspense, lazy, createElement } from "react";
import type { ComponentType, ReactNode } from "react";

type Loader<P> = () => Promise<{ default: ComponentType<P> } | ComponentType<P>>;

interface DynamicOptions {
  ssr?: boolean;
  loading?: (props: { error?: Error | null; isLoading?: boolean }) => ReactNode;
}

export default function dynamic<P extends object>(
  loader: Loader<P>,
  options: DynamicOptions = {},
): ComponentType<P> {
  const Lazy = lazy(async () => {
    const mod = await loader();
    // Next accepts both a module with a default export and a bare component
    // (`dynamic(() => import("./x").then(m => m.Named))`); `lazy` only accepts
    // the former, so a bare component is re-wrapped.
    return "default" in mod ? (mod as { default: ComponentType<P> }) : { default: mod };
  });

  const fallback = options.loading ? options.loading({ isLoading: true }) : null;

  return function DynamicComponent(props: P) {
    return createElement(Suspense, { fallback }, createElement(Lazy, props));
  };
}
