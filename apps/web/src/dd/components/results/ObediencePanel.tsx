"use client";

import { AlertTriangle, Eye, EyeOff, ShieldCheck } from "lucide-react";
import type { ObedienceReport } from "@/lib/obedience-check";

export function ObediencePanel({
  report,
  showDiff,
  onToggleDiff,
  lang,
}: {
  report: ObedienceReport | null;
  showDiff: boolean;
  onToggleDiff: () => void;
  lang: "th" | "en";
}) {
  if (!report) return null;

  const showWarning = !report.global && report.severity !== "none";

  const driftLabels = report.drift
    .slice(0, 3)
    .map((d) => (lang === "th" ? d.label.th : d.label.en))
    .join(", ");

  const isMajor = report.severity === "major";

  return (
    <div className="space-y-2">
      {showWarning && (
        <div
          className={`rounded-xl border p-3 flex items-start gap-2.5 ${
            isMajor
              ? "border-warn/40 bg-warn/[0.08]"
              : "border-cyan/30 bg-cyan/[0.05]"
          }`}
        >
          <AlertTriangle
            className={`h-3.5 w-3.5 mt-0.5 flex-none ${
              isMajor ? "text-warn/90" : "text-cyan/90"
            }`}
          />
          <p
            className={`text-[11px] leading-relaxed ${
              isMajor ? "text-warn/95" : "text-cyan/95"
            }`}
          >
            {isMajor
              ? lang === "th"
                ? `ภาพอ้างอิงอาจเปลี่ยน ${driftLabels} เพิ่มเติมนอกเหนือจากที่เลือก — ลองเตรียมภาพอีกครั้งหรือเปิด "ดูจุดที่เปลี่ยน"`
                : `The reference may have changed ${driftLabels} outside the targeted area. Prepare it again or inspect with "Show what changed".`
              : lang === "th"
                ? `ภาพอ้างอิงอาจเปลี่ยน ${driftLabels} เล็กน้อย — เปิดดูจุดที่เปลี่ยนเพื่อตรวจสอบ`
                : `The reference may have lightly changed ${driftLabels}. Toggle "Show what changed" to inspect.`}
          </p>
        </div>
      )}
      {!showWarning && !report.global && (
        <div className="rounded-xl border border-good/25 bg-good/[0.04] p-3 flex items-start gap-2.5">
          <ShieldCheck className="h-3.5 w-3.5 text-good/90 mt-0.5 flex-none" />
          <p className="text-[11px] text-good/90 leading-relaxed">
            {lang === "th"
              ? "ภาพอ้างอิงเปลี่ยนเฉพาะบริเวณที่เลือก — ไม่พบการแก้ส่วนอื่นของใบหน้า"
              : "Reference changes stayed within the targeted region. No unrelated edits detected."}
          </p>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleDiff}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#241f1a]/10 bg-white/50 px-4 py-2 text-[11px] font-medium text-[#241f1a] backdrop-blur-md transition hover:border-[#241f1a]/20 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35"
        >
          {showDiff ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          {showDiff
            ? lang === "th"
              ? "ซ่อนจุดที่เปลี่ยน"
              : "Hide diff"
            : lang === "th"
              ? "ดูจุดที่เปลี่ยน"
              : "Show what changed"}
        </button>
        {showDiff && (
          <p className="text-[10px] italic text-[#8d8378]">
            {lang === "th"
              ? "พื้นที่แดง/ส้ม = พิกเซลที่ภาพอ้างอิงเปลี่ยน"
              : "Red/orange = pixels changed in the reference"}
          </p>
        )}
      </div>
    </div>
  );
}
