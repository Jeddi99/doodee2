"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

function closestAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest("a");
}

export function NavProgress() {
  const pathname = usePathname();
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const lastPath = useRef(pathname);
  const tickRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);

  const start = useCallback(() => {
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }

    setVisible(true);
    setProgress(10);

    let next = 10;
    tickRef.current = window.setInterval(() => {
      next += (88 - next) * 0.08;
      setProgress(next);
      if (next > 87.5 && tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }, 80);
  }, []);

  const finish = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }

    setProgress(100);
    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
    }
    finishTimerRef.current = window.setTimeout(() => {
      finishTimerRef.current = null;
      setVisible(false);
      setProgress(0);
    }, 180);
  }, []);

  useEffect(() => {
    const isCoarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    if (isCoarse) return;

    const seen = new Set<string>();
    function onPointerEnter(event: PointerEvent) {
      const target = closestAnchor(event.target);
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || !href.startsWith("/") || seen.has(href)) return;
      seen.add(href);
      try {
        router.prefetch(href as Parameters<typeof router.prefetch>[0]);
      } catch {}
    }

    document.addEventListener("pointerenter", onPointerEnter, true);
    return () => document.removeEventListener("pointerenter", onPointerEnter, true);
  }, [router]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }

      const target = closestAnchor(event.target);
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      if (target.target && target.target !== "_self") return;
      const hrefPath = href.split("#")[0]?.split("?")[0] ?? href;
      if (href === pathname || hrefPath === pathname) return;
      start();
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname, start]);

  useEffect(() => {
    if (pathname !== lastPath.current) {
      lastPath.current = pathname;
      finish();
    }
  }, [finish, pathname]);

  useEffect(() => {
    return () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
      if (finishTimerRef.current !== null) {
        window.clearTimeout(finishTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] bg-[#241f1a]/5"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 180ms ease-out",
      }}
    >
      <div
        className="h-full origin-left bg-[#067e96] shadow-[0_0_10px_rgba(6,126,150,0.24)]"
        style={{
          transform: `scaleX(${progress / 100})`,
          transition: "transform 90ms ease-out",
        }}
      />
    </div>
  );
}
