"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Maximize2, Share2, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { Category } from "@/lib/scoring";
import type { Tier } from "@/lib/scoring/tier";
import { drawDoodeeLogo, loadDoodeeLogoImage } from "@/lib/canvas-logo";

const CARD_W = 1080;
const CARD_H = 1920;
const BRAND = "DOODEE";
const CATEGORY_ORDER: Category[] = [
  "harmony",
  "eye-area",
  "angularity",
  "dimorphism",
  "symmetry",
  "features",
];

interface FaceCardProps {
  image: HTMLImageElement;
  overall: number;
  tier: Tier;
  categories: Partial<Record<Category, number>>;
}

interface CategoryRow {
  key: Category;
  label: string;
  score: number;
}

interface RenderedFaceCard {
  url: string;
  blob: Blob;
}

function score100(score: number): number {
  return Math.max(0, Math.min(100, score * 10));
}

function percentileFor(score: number): number {
  const clamped = Math.max(0, Math.min(10, score));
  return Math.round(10 + (clamped / 10) * 89);
}

function todayLabel(lang: "th" | "en"): string {
  const locale = lang === "th" ? "th-TH" : "en-US";
  return new Date().toLocaleDateString(locale, {
    calendar: "gregory",
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function categoryRows(
  categories: Partial<Record<Category, number>>,
  labels: Record<Category, string>,
): CategoryRow[] {
  return CATEGORY_ORDER.flatMap((key) => {
    const score = categories[key];
    return typeof score === "number" ? [{ key, label: labels[key], score }] : [];
  });
}

function imageSize(img: HTMLImageElement): { width: number; height: number } {
  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
  };
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  destW: number,
  destH: number,
): void {
  const { width: srcW, height: srcH } = imageSize(img);
  const scale = Math.max(destW / srcW, destH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const dx = x + (destW - drawW) / 2;
  const dy = y + (destH - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  destW: number,
  destH: number,
): void {
  const { width: srcW, height: srcH } = imageSize(img);
  const scale = Math.min(destW / srcW, destH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const dx = x + (destW - drawW) / 2;
  const dy = y + (destH - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function fillRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
  stroke?: string,
): void {
  roundedRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawCategoryGrid(ctx: CanvasRenderingContext2D, rows: CategoryRow[]) {
  const x = 94;
  const y = 1608;
  const colW = 424;
  const rowH = 58;
  const gapX = 44;
  const gapY = 13;

  rows.slice(0, 6).forEach((row, index) => {
    const col = index % 2;
    const rowIndex = Math.floor(index / 2);
    const px = x + col * (colW + gapX);
    const py = y + rowIndex * (rowH + gapY);
    const value = score100(row.score);

    fillRound(
      ctx,
      px,
      py,
      colW,
      rowH,
      20,
      "rgba(255,255,255,0.08)",
      "rgba(255,255,255,0.14)",
    );

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.68)";
    ctx.font = "600 18px 'Barlow', 'Sarabun', system-ui, sans-serif";
    ctx.fillText(row.label, px + 20, py + 25);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 26px 'Barlow', 'Sarabun', system-ui, sans-serif";
    ctx.fillText(value.toFixed(0), px + 20, py + 49);

    const barX = px + 104;
    const barY = py + 39;
    const barW = colW - 128;
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    roundedRect(ctx, barX, barY, barW, 10, 999);
    ctx.fill();
    const bar = Math.max(6, Math.min(barW, (barW * value) / 100));
    const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    grad.addColorStop(0, "#b488ff");
    grad.addColorStop(1, "#62e8ff");
    ctx.fillStyle = grad;
    roundedRect(ctx, barX, barY, bar, 10, 999);
    ctx.fill();
  });
}

async function generateFaceCard(
  image: HTMLImageElement,
  overall: number,
  tierLine: string,
  pctLine: string,
  dateLine: string,
  rows: CategoryRow[],
): Promise<Blob | null> {
  const logo = await loadDoodeeLogoImage();
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve(null);
      return;
    }

    ctx.fillStyle = "#050816";
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    drawImageCover(ctx, image, 0, 0, CARD_W, CARD_H);

    const shade = ctx.createLinearGradient(0, 0, 0, CARD_H);
    shade.addColorStop(0, "rgba(5,8,22,0.72)");
    shade.addColorStop(0.36, "rgba(5,8,22,0.48)");
    shade.addColorStop(0.68, "rgba(5,8,22,0.70)");
    shade.addColorStop(1, "rgba(5,8,22,0.98)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    const violet = ctx.createRadialGradient(180, 1400, 40, 180, 1400, 720);
    violet.addColorStop(0, "rgba(168,85,247,0.38)");
    violet.addColorStop(1, "rgba(168,85,247,0)");
    ctx.fillStyle = violet;
    ctx.fillRect(0, 840, CARD_W, CARD_H - 840);

    const cyan = ctx.createRadialGradient(920, 1680, 40, 920, 1680, 650);
    cyan.addColorStop(0, "rgba(6,182,212,0.28)");
    cyan.addColorStop(1, "rgba(6,182,212,0)");
    ctx.fillStyle = cyan;
    ctx.fillRect(0, 1000, CARD_W, CARD_H - 1000);

    const stageX = 64;
    const stageY = 176;
    const stageW = CARD_W - 128;
    const stageH = 1134;
    roundedRect(ctx, stageX, stageY, stageW, stageH, 56);
    ctx.save();
    ctx.clip();
    const stageFill = ctx.createLinearGradient(stageX, stageY, stageX, stageY + stageH);
    stageFill.addColorStop(0, "rgba(255,255,255,0.10)");
    stageFill.addColorStop(1, "rgba(255,255,255,0.03)");
    ctx.fillStyle = stageFill;
    ctx.fillRect(stageX, stageY, stageW, stageH);
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.filter = "blur(26px)";
    drawImageCover(ctx, image, stageX - 42, stageY - 42, stageW + 84, stageH + 84);
    ctx.restore();
    ctx.fillStyle = "rgba(5,8,22,0.38)";
    ctx.fillRect(stageX, stageY, stageW, stageH);
    drawImageContain(ctx, image, stageX + 30, stageY + 34, stageW - 60, stageH - 68);
    const stageShade = ctx.createLinearGradient(stageX, stageY, stageX, stageY + stageH);
    stageShade.addColorStop(0, "rgba(5,8,22,0.28)");
    stageShade.addColorStop(0.52, "rgba(5,8,22,0)");
    stageShade.addColorStop(1, "rgba(5,8,22,0.34)");
    ctx.fillStyle = stageShade;
    ctx.fillRect(stageX, stageY, stageW, stageH);
    ctx.restore();
    roundedRect(ctx, stageX, stageY, stageW, stageH, 56);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();

    drawDoodeeLogo(ctx, logo, {
      x: 70,
      y: 86,
      text: BRAND,
      font: "300 68px 'Instrument Serif', 'Times New Roman', Georgia, serif",
      textColor: "#ffffff",
      markSize: 52,
      gap: 16,
    });

    ctx.fillStyle = "rgba(255,255,255,0.68)";
    ctx.font = "600 24px 'Barlow', 'Sarabun', system-ui, sans-serif";
    ctx.fillText("Facial aesthetics report", 74, 154);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "600 24px 'Barlow', 'Sarabun', system-ui, sans-serif";
    ctx.fillText(dateLine, CARD_W - 70, 114);

    fillRound(
      ctx,
      68,
      1336,
      CARD_W - 136,
      500,
      54,
      "rgba(7,12,27,0.84)",
      "rgba(196,156,255,0.34)",
    );

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.66)";
    ctx.font = "700 25px 'Barlow', 'Sarabun', system-ui, sans-serif";
    ctx.fillText("FACE CARD", CARD_W / 2, 1410);

    const score = score100(overall);
    ctx.fillStyle = "#ffffff";
    ctx.font =
      "300 170px 'Instrument Serif', 'Times New Roman', Georgia, serif";
    ctx.fillText(score.toFixed(1), CARD_W / 2, 1536);

    ctx.fillStyle = "rgba(255,255,255,0.58)";
    ctx.font = "600 28px 'Barlow', 'Sarabun', system-ui, sans-serif";
    ctx.fillText("/100", CARD_W / 2, 1570);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 28px 'Barlow', 'Sarabun', system-ui, sans-serif";
    ctx.fillText(tierLine, CARD_W / 2, 1818);

    ctx.fillStyle = "#8df1ff";
    ctx.font = "700 22px 'Barlow', 'Sarabun', system-ui, sans-serif";
    ctx.fillText(pctLine, CARD_W / 2, 1852);

    drawCategoryGrid(ctx, rows);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.56)";
    ctx.font = "600 24px 'Barlow', 'Sarabun', system-ui, sans-serif";
    ctx.fillText("doodee.app", CARD_W - 70, CARD_H - 50);

    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      resolve(blob);
    }, "image/png");
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function FaceCard({ image, overall, tier, categories }: FaceCardProps) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [rendered, setRendered] = useState<RenderedFaceCard | null>(null);

  useEffect(() => {
    if (!fullscreen) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  const rows = useMemo(
    () => categoryRows(categories, t.category),
    [categories, t.category],
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const rowsSignature = useMemo(
    () => rows.map((row) => `${row.key}:${row.label}:${row.score}`).join("|"),
    [rows],
  );
  const pct = percentileFor(overall);
  const pctLabel =
    lang === "th"
      ? `Top ${(100 - pct).toFixed(0)}% ของประชากร`
      : `Top ${(100 - pct).toFixed(0)}% of population`;
  const tierLine = t.tier[tier];
  const dateLine = todayLabel(lang);

  useEffect(() => {
    let cancelled = false;
    setRendered(null);
    generateFaceCard(image, overall, tierLine, pctLabel, dateLine, rowsRef.current)
      .then(async (blob) => {
        if (!blob || cancelled) return;
        const url = await blobToDataUrl(blob);
        if (!cancelled) setRendered({ url, blob });
      })
      .catch(() => {
        if (!cancelled) setRendered(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dateLine, image, overall, pctLabel, rowsSignature, tierLine]);

  const fileName = `doodee-facecard-${score100(overall).toFixed(1)}.png`;
  const tLabel = (th: string, en: string) => (lang === "th" ? th : en);

  async function ensureBlob(): Promise<Blob | null> {
    return (
      rendered?.blob ??
      (await generateFaceCard(
        image,
        overall,
        tierLine,
        pctLabel,
        dateLine,
        rowsRef.current,
      ))
    );
  }

  // Phase 192af — Download = direct PNG save via anchor. Does NOT route through
  // the share sheet (that confused users who just wanted the file).
  async function handleDownload() {
    if (busy) return;
    setBusy("download");
    try {
      const blob = await ensureBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revoke so Safari can read the URL before it's dropped.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* best-effort save */
    } finally {
      setBusy(null);
    }
  }

  // Phase 192af — Share = native share sheet (iOS "Save to Photos" lives here).
  async function handleShare() {
    if (busy) return;
    setBusy("share");
    try {
      const blob = await ensureBlob();
      if (!blob) return;
      const file = new File([blob], fileName, { type: "image/png" });
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file] });
        } catch (e) {
          // User-cancelled share is fine; swallow.
          if (
            typeof e === "object" &&
            e !== null &&
            (e as { name?: unknown }).name === "AbortError"
          )
            return;
        }
      } else {
        // No share API → fall back to a direct save so the button still works.
        await handleDownload();
      }
    } catch {
      /* best-effort */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => rendered && setFullscreen(true)}
        disabled={!rendered}
        aria-label={tLabel("ดูเต็มจอ", "View fullscreen")}
        className="block w-full disabled:cursor-default"
      >
        <FaceCardPreview url={rendered?.url ?? null} />
      </button>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy !== null || !rendered}
          className="facecard-download-button inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium shadow-[0_16px_34px_-24px_rgba(36,31,26,0.55)] transition disabled:opacity-50"
        >
          {busy === "download" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {tLabel("ดาวน์โหลด PNG", "Download PNG")}
        </button>
        <button
          type="button"
          onClick={handleShare}
          disabled={busy !== null || !rendered}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#241f1a]/15 bg-white/60 px-5 py-2.5 text-sm font-medium text-[#241f1a] backdrop-blur-md transition hover:bg-white/80 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.12]"
        >
          {busy === "share" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          {tLabel("แชร์", "Share")}
        </button>
        <button
          type="button"
          onClick={() => rendered && setFullscreen(true)}
          disabled={!rendered}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#241f1a]/15 bg-white/60 px-5 py-2.5 text-sm font-medium text-[#241f1a] backdrop-blur-md transition hover:bg-white/80 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.12]"
        >
          <Maximize2 className="h-4 w-4" />
          {tLabel("เต็มจอ", "Fullscreen")}
        </button>
      </div>

      <p className="text-center text-[11px] text-[#6f625a] dark:text-white/62">
        {tLabel(
          "1080 x 1920 (9:16) · เปิดเต็มจอเพื่อแคปหน้าจอได้",
          "1080 x 1920 (9:16) · open fullscreen to screenshot",
        )}
      </p>

      {fullscreen && rendered && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/92 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setFullscreen(false)}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setFullscreen(false);
            }}
            aria-label={tLabel("ปิด", "Close")}
            className="absolute right-4 top-[calc(env(safe-area-inset-top)_+_1rem)] z-[101] inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white shadow-[0_18px_50px_-28px_rgba(0,0,0,0.8)] backdrop-blur-md transition hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={rendered.url}
            alt={tLabel("การ์ดผลวิเคราะห์", "Result card")}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82vh] w-auto max-w-full rounded-2xl object-contain shadow-[0_30px_80px_-40px_rgba(0,0,0,0.92)]"
          />
          <p className="mt-4 text-center text-xs text-white/70">
            {tLabel(
              "กดปุ่มแคปหน้าจอของเครื่อง แล้วครอปได้เลย",
              "Use your device screenshot, then crop",
            )}
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setFullscreen(false);
            }}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20"
          >
            <X className="h-4 w-4" />
            {tLabel("ปิดเต็มจอ", "Close fullscreen")}
          </button>
        </div>
      )}
    </div>
  );
}

function FaceCardPreview({ url }: { url: string | null }) {
  return (
    <div
      className="relative mx-auto overflow-hidden rounded-[2rem] border border-white/15 bg-[#050816] shadow-[0_28px_70px_-48px_rgba(5,8,22,0.75)]"
      style={{
        aspectRatio: "9 / 16",
        maxWidth: 360,
      }}
    >
      {url ? (
        <div
          aria-label="FaceCard 9:16 preview"
          role="img"
          className="absolute inset-0 bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${url})` }}
        />
      ) : (
        <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_24%,rgba(6,182,212,0.18),transparent_34%),radial-gradient(circle_at_28%_72%,rgba(168,85,247,0.20),transparent_34%),linear-gradient(180deg,#050816,#070c1b)]">
          <div className="absolute inset-x-6 top-6 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
            <span>DOODEE</span>
            <span>9:16</span>
          </div>
          <div className="absolute inset-x-8 top-[15%] aspect-[3/4] rounded-[1.4rem] border border-cyan/15 bg-white/[0.04] shadow-[0_0_42px_rgba(6,182,212,0.10)_inset]">
            <div className="absolute inset-4 rounded-[1rem] bg-white/[0.05]" />
            <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan/25" />
          </div>
          <div className="absolute inset-x-8 bottom-[13%] rounded-[1.4rem] border border-white/10 bg-[#050816]/72 p-4">
            <div className="mx-auto h-9 w-24 rounded-full bg-white/10" />
            <div className="mt-5 grid gap-2">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet/75 to-cyan/75"
                    style={{ width: `${58 + index * 8}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="absolute inset-0 animate-pulse bg-[linear-gradient(105deg,transparent_0%,rgba(255,255,255,0.10)_48%,transparent_64%)]" />
          <div className="absolute inset-0 grid place-items-center text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
            Rendering
          </div>
        </div>
      )}
    </div>
  );
}
