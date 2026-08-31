"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  analyticsPageFromPath,
  trackProductEvent,
} from "@/lib/product-events";

const SITE_VISIT_SENT_KEY = "doodee.analytics.site_visit_sent.v1";

export function ProductFunnelTracker() {
  const pathname = usePathname() ?? "/";
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const page = analyticsPageFromPath(pathname);
    try {
      if (window.sessionStorage.getItem(SITE_VISIT_SENT_KEY) !== "1") {
        window.sessionStorage.setItem(SITE_VISIT_SENT_KEY, "1");
        void trackProductEvent("site_visit", { page });
      }
    } catch {
      void trackProductEvent("site_visit", { page });
    }
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    void trackProductEvent("page_view", {
      page: analyticsPageFromPath(pathname),
    });
  }, [pathname]);

  return null;
}
