"use client";

import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { buildScanReport } from "@/lib/report-builder";
import type { ScanRecord } from "@/lib/scan-history";
import type { ProcedureKey } from "@/lib/ai-gemini-image";
import { useT } from "@/lib/i18n";
import { useTrackedTimeout } from "@/lib/use-tracked-timeout";

interface ReportDownloadButtonProps {
  record: ScanRecord;
  selectedProcedures?: ProcedureKey[];
  variant?: "primary" | "ghost";
  size?: "default" | "sm";
  className?: string;
}

export function ReportDownloadButton({
  record,
  selectedProcedures,
  variant = "ghost",
  size = "sm",
  className,
}: ReportDownloadButtonProps) {
  const { lang } = useT();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const scheduleTimeout = useTrackedTimeout();

  async function handleDownload() {
    if (busy) return;
    setBusy(true);
    setStatus("idle");
    try {
      const url = await buildScanReport({
        record,
        ...(selectedProcedures && selectedProcedures.length > 0
          ? { selectedProcedures }
          : {}),
        lang,
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `doodee-report-${formatStamp(record.timestamp)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus("ok");
    } catch {
      setStatus("err");
    } finally {
      setBusy(false);
      scheduleTimeout(() => setStatus("idle"), 1800);
    }
  }

  const sizeClasses =
    size === "default"
      ? "min-h-[44px] px-5 py-2.5 text-sm font-semibold rounded-xl"
      : "min-h-[44px] px-3.5 py-2 text-xs rounded-lg";

  const baseClass =
    variant === "primary"
      ? `inline-flex items-center gap-1.5 bg-[#241f1a] font-medium text-white shadow-[0_16px_34px_-24px_rgba(36,31,26,0.55)] transition hover:bg-[#342d27] disabled:opacity-50 disabled:shadow-none ${sizeClasses}`
      : `inline-flex items-center gap-1.5 border border-[#241f1a]/10 bg-white/50 text-[#241f1a] shadow-[0_10px_26px_-24px_rgba(36,31,26,0.28)] backdrop-blur-md transition hover:border-[#241f1a]/20 hover:bg-white/70 disabled:opacity-50 ${sizeClasses}`;

  const label = busy
    ? lang === "th"
      ? "กำลังสร้างรายงาน…"
      : "Building report…"
    : status === "ok"
      ? lang === "th"
        ? "บันทึกแล้ว ✓"
        : "Saved ✓"
      : status === "err"
        ? lang === "th"
          ? "ดาวน์โหลดไม่สำเร็จ"
          : "Download failed"
        : lang === "th"
          ? "ดาวน์โหลดรายงาน (PNG)"
          : "Download report (PNG)";

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={busy}
      aria-busy={busy ? "true" : undefined}
      className={[baseClass, className].filter(Boolean).join(" ")}
      title={
        lang === "th"
          ? "ดาวน์โหลดรายงานเป็นรูป — เปิดในเบราว์เซอร์แล้ว Print → Save as PDF ได้"
          : "Download report image — open in browser then Print → Save as PDF if needed"
      }
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : status === "idle" ? (
        <FileText className="h-3.5 w-3.5" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
  );
}

function formatStamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}
