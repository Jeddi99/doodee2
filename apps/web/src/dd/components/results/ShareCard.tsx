"use client";

import { useState } from "react";
import { Share2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { Tier } from "@/lib/scoring/tier";
import { drawDoodeeLogo, loadDoodeeLogoImage } from "@/lib/canvas-logo";

interface ShareCardProps {
  overall: number;
  tier: Tier;
}

const CARD_SIZE = 1080;

function percentile(score: number): number {
  const clamped = Math.max(0, Math.min(10, score));
  return Math.round(10 + (clamped / 10) * 89);
}

async function generateCard(
  overall: number,
  tierLabel: string,
  tierDescription: string,
  pctLabel: string,
  brand: string
): Promise<Blob | null> {
  const logo = await loadDoodeeLogoImage();
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_SIZE;
    canvas.height = CARD_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve(null);
      return;
    }

    const grad = ctx.createLinearGradient(0, 0, 0, CARD_SIZE);
    grad.addColorStop(0, "#f7f3eb");
    grad.addColorStop(0.6, "#f4f1ea");
    grad.addColorStop(1, "#ece6da");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

    const glow = ctx.createRadialGradient(540, 540, 100, 540, 540, 480);
    glow.addColorStop(0, "rgba(63,98,104,0.14)");
    glow.addColorStop(1, "rgba(63,98,104,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

    drawDoodeeLogo(ctx, logo, {
      x: CARD_SIZE / 2,
      y: 170,
      text: brand,
      font: "italic 300 88px 'Instrument Serif', Georgia, serif",
      textColor: "#241f1a",
      markSize: 76,
      gap: 20,
      align: "center",
    });

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#241f1a";
    ctx.font = "italic 300 320px 'Instrument Serif', Georgia, serif";
    ctx.fillText(overall.toFixed(1), CARD_SIZE / 2, 600);

    ctx.fillStyle = "#3f6268";
    ctx.font =
      "500 64px 'Barlow', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(tierLabel, CARD_SIZE / 2, 720);

    ctx.fillStyle = "rgba(36,31,26,0.58)";
    ctx.font =
      "400 30px 'Barlow', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const maxWidth = 820;
    const words = tierDescription.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
      if (lines.length >= 1) break;
    }
    if (line) lines.push(line);
    lines.slice(0, 2).forEach((l, i) => {
      ctx.fillText(l, CARD_SIZE / 2, 790 + i * 42);
    });

    ctx.fillStyle = "rgba(255,255,255,0.88)";
    const pillY = 880;
    const pillW = 360;
    const pillH = 64;
    const pillX = (CARD_SIZE - pillW) / 2;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(pillX, pillY, pillW, pillH, 32);
    } else {
      ctx.rect(pillX, pillY, pillW, pillH);
    }
    ctx.fill();

    ctx.strokeStyle = "rgba(36,31,26,0.12)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#3f6268";
    ctx.font =
      "500 30px 'Barlow', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(pctLabel, CARD_SIZE / 2, pillY + 42);

    ctx.fillStyle = "rgba(36,31,26,0.46)";
    ctx.font =
      "500 30px 'Barlow', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("doodee.app", CARD_SIZE / 2, 1010);

    canvas.toBlob((b) => {
      canvas.width = 0;
      canvas.height = 0;
      resolve(b);
    }, "image/png");
  });
}

export function ShareCard({ overall, tier }: ShareCardProps) {
  const { t } = useT();
  const [busyAction, setBusyAction] = useState<"share" | "download" | null>(null);
  const pct = percentile(overall);
  const pctLabel = t.result.percentile.replace("{pct}", String(pct));

  async function generate(): Promise<File | null> {
    const blob = await generateCard(
      overall,
      t.tier[tier],
      t.tierDescription[tier],
      pctLabel,
      t.brand.name
    );
    if (!blob) return null;
    return new File([blob], "doodee-score.png", { type: "image/png" });
  }

  async function handleShare() {
    if (busyAction) return;
    setBusyAction("share");
    try {
      const file = await generate();
      if (!file) return;
      const shareData: ShareData = {
        title: t.result.shareTitle,
        text: t.result.shareText
          .replace("{score}", overall.toFixed(1))
          .replace("{tier}", t.tier[tier]),
        files: [file],
      };
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare(shareData)
      ) {
        try {
          await navigator.share(shareData);
        } catch {
          return;
        }
      } else {
        triggerDownload(file);
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDownload() {
    if (busyAction) return;
    setBusyAction("download");
    try {
      const file = await generate();
      if (!file) return;
      triggerDownload(file);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="outline"
        onClick={handleShare}
        disabled={busyAction !== null}
        aria-busy={busyAction === "share" ? "true" : undefined}
        className="inline-flex items-center gap-1.5"
      >
        {busyAction === "share" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Share2 className="h-3.5 w-3.5" />
        )}
        {t.result.share}
      </Button>
      <Button
        variant="outline"
        onClick={handleDownload}
        disabled={busyAction !== null}
        aria-busy={busyAction === "download" ? "true" : undefined}
        className="inline-flex items-center gap-1.5"
      >
        {busyAction === "download" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {t.result.download}
      </Button>
    </div>
  );
}

function triggerDownload(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
