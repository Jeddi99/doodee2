"use client";

import { AppBackground } from "@/components/AppBackground";
import { UpgradeSidebar } from "@/components/billing/UpgradeSidebar";
import { MobilePricingNav } from "@/components/billing/MobilePricingNav";
import { MethodologyPage } from "@/components/methodology/MethodologyPage";
import { useT } from "@/lib/i18n";

export function MethodologyShell(): React.JSX.Element {
  const { lang } = useT();

  return (
    <main className="methodology-shell relative isolate flex min-h-[100dvh] w-full max-w-full overflow-x-clip bg-transparent text-[#f8fafc] antialiased">
      <AppBackground />
      <UpgradeSidebar />
      <div className="relative z-10 min-w-0 flex-1 overflow-x-clip px-4 pb-bottom-nav pt-[calc(env(safe-area-inset-top)_+_1rem)] sm:px-8 sm:pt-12 lg:px-10 lg:pb-14 lg:pt-10">
        <MethodologyPage />
      </div>
      <MobilePricingNav lang={lang} />
    </main>
  );
}
