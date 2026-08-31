"use client";

import { useState } from "react";
import { Download, Layers, Sparkles, Check } from "lucide-react";
import type { ScanPhoto } from "@/types";
import type { ScanResult } from "@/lib/scoring";
import { tierFor } from "@/lib/scoring";
import { useT } from "@/lib/i18n";
import { useTrackedTimeout } from "@/lib/use-tracked-timeout";
import { drawDoodeeLogo, loadDoodeeLogoImage } from "@/lib/canvas-logo";

interface AnnotatedFaceDownloadProps {
  scan: ScanPhoto;
  result: ScanResult;
}

const PADDING = 48;
const HEADER_HEIGHT = 110;
const FOOTER_HEIGHT = 60;

export function AnnotatedFaceDownload({
  scan,
  result,
}: AnnotatedFaceDownloadProps) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const scheduleTimeout = useTrackedTimeout();

  async function handleDownload() {
    setBusy(true);
    try {
      const blob = await buildAnnotatedPng(scan, result);
      if (!blob) throw new Error("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `doodee-annotated-${stamp}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDone(true);
      scheduleTimeout(() => setDone(false), 1800);
    } catch {
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={busy}
        className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/30 ${
          done
            ? "border-good/40 bg-good/10 text-good"
            : "border-[#241f1a]/10 bg-white/50 text-[#241f1a] backdrop-blur-md hover:border-[#241f1a]/20 hover:bg-white/70"
        } disabled:opacity-50 disabled:pointer-events-none`}
      >
        {done ? (
          <>
            <Check className="h-3.5 w-3.5" />
            {t.annotated.saved}
          </>
        ) : busy ? (
          <>
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            {t.annotated.rendering}
          </>
        ) : (
          <>
            <Layers className="h-3.5 w-3.5" />
            {t.annotated.download}
            <Download className="h-3.5 w-3.5 text-[#8d8378]" />
          </>
        )}
      </button>
      {t.annotated.subtitle && (
        <p className="max-w-xs text-center text-[10px] leading-relaxed text-[#8d8378]">
          {t.annotated.subtitle}
        </p>
      )}
    </div>
  );
}

async function buildAnnotatedPng(
  scan: ScanPhoto,
  result: ScanResult
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const img = scan.image;
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (srcW === 0 || srcH === 0) return null;

  const outW = srcW + PADDING * 2;
  const outH = srcH + PADDING * 2 + HEADER_HEIGHT + FOOTER_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, 0, outH);
  grad.addColorStop(0, "#fbfaf7");
  grad.addColorStop(0.5, "#f4f1ea");
  grad.addColorStop(1, "#eef8f8");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, outW, outH);

  const logo = await loadDoodeeLogoImage();
  drawDoodeeLogo(ctx, logo, {
    x: PADDING,
    y: 35,
    text: "DOODEE",
    font: "600 18px sans-serif",
    textColor: "#241f1a",
    markSize: 30,
    gap: 10,
  });
  ctx.fillStyle = "rgba(111, 98, 90, 0.95)";
  ctx.font = "12px sans-serif";
  ctx.fillText("Face analysis report · Asian-calibrated", PADDING, 64);

  const overall = result.overall;
  const tier = t_tier(tierFor(overall, result.options.gender));
  ctx.textAlign = "right";
  ctx.fillStyle = "#241f1a";
  ctx.font = "italic 300 72px serif";
  ctx.fillText(overall.toFixed(1), outW - PADDING, 70);
  ctx.fillStyle = "rgba(111, 98, 90, 0.95)";
  ctx.font = "11px sans-serif";
  ctx.fillText(`${tier.toUpperCase()} · / 10`, outW - PADDING, 92);

  const imgX = PADDING;
  const imgY = PADDING + HEADER_HEIGHT;
  ctx.save();
  ctx.shadowColor = "rgba(36, 31, 26, 0.22)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(imgX - 12, imgY - 12, srcW + 24, srcH + 24);
  ctx.restore();
  ctx.drawImage(img, imgX, imgY, srcW, srcH);

  const footerY = imgY + srcH + PADDING + 24;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(36, 31, 26, 0.76)";
  ctx.font = "14px sans-serif";
  ctx.fillText("doodee.app", outW / 2, footerY);
  ctx.fillStyle = "rgba(6, 126, 150, 0.72)";
  ctx.font = "11px sans-serif";
  ctx.fillText("Asian-context face report · local metrics plus optional server AI", outW / 2, footerY + 18);

  return new Promise((resolve) => {
    canvas.toBlob((b) => {
      canvas.width = 0;
      canvas.height = 0;
      resolve(b);
    }, "image/png");
  });
}

function t_tier(tier: string): string {
  return tier;
}
