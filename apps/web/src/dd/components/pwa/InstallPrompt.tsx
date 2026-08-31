"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Download, X } from "lucide-react";
import {
  dismissInstall,
  ensureWired,
  promptInstall,
  subscribeInstallable,
} from "@/lib/pwa-install";
import { useT } from "@/lib/i18n";

export function InstallPrompt() {
  const { t } = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    ensureWired();
    return subscribeInstallable(setVisible);
  }, []);

  async function handleInstall() {
    const outcome = await promptInstall();
    if (outcome === "unavailable") {
      setVisible(false);
    }
  }

  function handleDismiss() {
    dismissInstall();
  }

  return (
    <AnimatePresence>
      {visible && (
        <m.div
          initial={{ opacity: 0, y: 20, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.94 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed right-4 z-40 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/55 px-3 py-2.5 shadow-[0_18px_44px_-32px_rgba(36,31,26,0.38)] backdrop-blur-md bottom-[calc(64px+max(env(safe-area-inset-bottom),0.5rem)+0.5rem)] lg:bottom-[max(env(safe-area-inset-bottom),1rem)]"
        >
          <button
            type="button"
            onClick={handleInstall}
            className="inline-flex min-h-[44px] touch-manipulation items-center gap-2 rounded-xl bg-[#241f1a] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#236653]/35"
          >
            <Download className="h-3.5 w-3.5" />
            {t.pwa.install}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={t.pwa.dismiss}
            className="inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-full text-[#6b625a] transition hover:bg-white/55 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#236653]/35"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </m.div>
      )}
    </AnimatePresence>
  );
}
