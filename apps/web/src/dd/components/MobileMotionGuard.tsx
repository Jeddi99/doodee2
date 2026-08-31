"use client";
import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";
import { useEffect, useState } from "react";

function useIsMobile(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setM(mq.matches);
    const h = (e: MediaQueryListEvent) => setM(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return m;
}

// Phase 192p — Mobile gets reducedMotion=always to skip all framer tweens.
// User-reported severe mobile lag; framer's transform/opacity tweens on
// dozens of cards/dialogs each pull layout work onto main thread.
export function MobileMotionGuard({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={isMobile ? "always" : "user"}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
