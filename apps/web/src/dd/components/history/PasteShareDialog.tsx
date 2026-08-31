"use client";

import { useEffect, useState } from "react";
import { Link2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  decodeShareUrl,
  encodeShare,
  sharedToRecord,
  type SharedScan,
} from "@/lib/share-link";
import type { ScanRecord } from "@/lib/scan-history";
import type { Tier } from "@/lib/scoring/tier";
import { useT } from "@/lib/i18n";

interface PasteShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Fires when the user pastes a valid scan URL + clicks Compare.
   * Phase 179 — `payload` is the canonical encoded form of the shared
   * scan; the caller uses it to build the `?b=share&payload=…` URL of
   * the new `/history/compare` page so the comparison stays
   * bookmarkable + shareable rather than living inside a modal.
   */
  onScan: (record: ScanRecord, payload: string) => void;
}

/**
 * Phase 38 — paste a `/share?d=...` URL (or just the encoded blob) to
 * compare your scan with someone else's. Lives separate from
 * `CompareDialog` because it has its own input + validation surface.
 */
export function PasteShareDialog({
  open,
  onOpenChange,
  onScan,
}: PasteShareDialogProps) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [err, setErr] = useState(false);

  function handleFocus(e: React.FocusEvent<HTMLTextAreaElement>) {
    // Phase 192r — iOS keyboard covers centered-dialog inputs; defer
    // scrollIntoView past the keyboard slide-up animation (~300ms).
    const el = e.target;
    setTimeout(() => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 300);
  }

  useEffect(() => {
    if (!open) {
      setText("");
      setErr(false);
    }
  }, [open]);

  function handleCompare() {
    const shared: SharedScan | null = decodeShareUrl(text);
    if (!shared) {
      setErr(true);
      return;
    }
    const projected = sharedToRecord(shared);
    // Phase 179 — Re-encode so the receiver always works against the
    // canonical short form (URL stays under the typical ~2k char cap
    // even with the full base64 payload).
    const payload = encodeShare(shared);
    onScan(
      {
        ...projected,
        tier: projected.tier as Tier,
      },
      payload
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-md gap-0 overflow-hidden !border-white/60 !bg-white/60 p-0 text-[#241f1a] !shadow-[0_24px_80px_-48px_rgba(36,31,26,0.55)] backdrop-blur-md sm:w-[calc(100%-1.5rem)]">
        <div className="border-b border-white/50 bg-white/40 px-5 pb-3 pt-5 pr-12 backdrop-blur">
          <DialogTitle className="text-2xl text-[#241f1a]">{t.paste.title}</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-[#625a52]">
            {t.paste.subtitle}
          </DialogDescription>
        </div>

        <div className="min-w-0 px-5 py-5 space-y-3">
          <label className="block">
            <span className="sr-only">{t.paste.urlLabel}</span>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (err) setErr(false);
              }}
              placeholder={t.paste.placeholder}
              rows={3}
              autoFocus
              onFocus={handleFocus}
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full resize-none rounded-xl border border-white/60 bg-white/50 px-3 py-2 text-sm text-[#241f1a] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur placeholder:text-[#8f8379] transition focus:border-[#7a5bd6]/45 focus:outline-none focus:ring-2 focus:ring-[#7a5bd6]/20"
            />
          </label>
          {err && (
            <p className="text-xs text-warn flex items-center gap-1.5">
              <X className="h-3 w-3" />
              {t.paste.invalid}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap justify-end gap-3 border-t border-white/50 bg-white/26 px-5 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-white/60 bg-white/45 px-4 py-2.5 text-sm font-medium text-[#625a52] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.3)] backdrop-blur transition hover:bg-white/65 hover:text-[#241f1a]"
          >
            {t.paste.cancel}
          </button>
          <button
            type="button"
            onClick={handleCompare}
            disabled={text.trim().length === 0}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#241f1a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#342d27] disabled:pointer-events-none disabled:opacity-40"
          >
            <Link2 className="h-3.5 w-3.5" />
            {t.paste.compare}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
