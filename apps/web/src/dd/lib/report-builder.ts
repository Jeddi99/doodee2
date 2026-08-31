/**
 * Phase 139 — clinical-style report builder.
 *
 * Renders a one-image summary of a scan + (optionally) the procedures
 * the user is interested in. Output is a tall PNG (800px wide) the
 * user can save as-is or print → "Save as PDF" from the browser.
 *
 * We avoid pulling in a PDF library (jsPDF, pdf-lib) — zero new
 * dependencies, no bundle bloat, full layout control via canvas APIs.
 *
 * The report is built around a single column of "blocks". Each block
 * draws to a vertical-cursor canvas; we measure intrinsic height as
 * we go so the final image is exactly tall enough.
 */

import type { ScanRecord } from "./scan-history";
import {
  findProcedure,
  findProcedureInfo,
  formatBaht,
  summarizeSelection,
  type ProcedureKey,
} from "./ai-gemini-image";

export interface BuildReportInput {
  record: ScanRecord;
  /** Optional procedures the user is considering — adds a cost / pros-cons section. */
  selectedProcedures?: ProcedureKey[];
  /** "th" | "en" — drives all copy in the report. */
  lang: "th" | "en";
}

const WIDTH = 800;
const MARGIN = 36;
const PALETTE = {
  bg: "#0a0814",
  panel: "#13101f",
  border: "rgba(255,255,255,0.10)",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.65)",
  textSubtle: "rgba(255,255,255,0.45)",
  accent: "#a855f7", // violet
  accentSoft: "rgba(168,85,247,0.18)",
  cyan: "#67e8f9",
  good: "#4ade80",
  warn: "#fbbf24",
  bad: "#f87171",
};

/**
 * Build the report canvas synchronously. Image loading (for the saved
 * scan photo) is async, so this function is async too.
 *
 * Returns a `data:image/png;base64,...` URL ready to drop into
 * `<a download>` or `<img src>`.
 */
export async function buildScanReport(
  input: BuildReportInput
): Promise<string> {
  const { record, selectedProcedures, lang } = input;

  // Two-pass: first measure (draw on an off-screen canvas to get
  // final height), then re-render at the exact size.
  // Simpler approach: draw onto an over-tall canvas, then crop to
  // the actual drawn height.

  const MAX_H = 4000;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = MAX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-2d-unavailable");

  // Background
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, WIDTH, MAX_H);

  let y = MARGIN;

  // ---- Header (brand + date) ----
  y = drawHeader(ctx, y, record, lang);
  y += 16;

  // ---- Hero (photo + score) ----
  y = await drawHero(ctx, y, record, lang);
  y += 20;

  // ---- Categories ----
  if (Object.keys(record.categories).length > 0) {
    y = drawCategories(ctx, y, record, lang);
    y += 16;
  }

  // ---- AI summary (if present) ----
  if (record.aiReasoning) {
    y = drawAiSummary(ctx, y, record, lang);
    y += 16;
  }

  // ---- AI advice ----
  if (record.aiAdvice && record.aiAdvice.length > 0) {
    y = drawAdvice(ctx, y, record, lang);
    y += 16;
  }

  // ---- Procedure picks + cost ----
  if (selectedProcedures && selectedProcedures.length > 0) {
    y = drawProcedurePicks(ctx, y, selectedProcedures, lang);
    y += 16;
  }

  // ---- Disclaimer ----
  y = drawDisclaimer(ctx, y, lang);
  y += MARGIN;

  // Crop to actual drawn height.
  try {
    const drawnH = Math.min(MAX_H, Math.ceil(y));
    return cropToHeight(canvas, drawnH);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

// ============================================================================
// Block drawers — each takes (ctx, currentY) and returns the new Y
// ============================================================================

function drawHeader(
  ctx: CanvasRenderingContext2D,
  y: number,
  record: ScanRecord,
  lang: "th" | "en"
): number {
  // Brand mark
  ctx.fillStyle = PALETTE.accent;
  ctx.font = "italic 300 28px ui-serif, Georgia, 'Times New Roman', serif";
  ctx.textBaseline = "top";
  ctx.fillText("doodee", MARGIN, y);

  // Right-aligned date + tag
  const date = new Date(record.timestamp).toLocaleString(
    lang === "th" ? "th-TH" : "en-US",
    {
      calendar: "gregory",
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
  ctx.font = "500 12px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = PALETTE.textMuted;
  ctx.textAlign = "right";
  ctx.fillText(date, WIDTH - MARGIN, y + 6);
  ctx.textAlign = "left";

  ctx.fillStyle = PALETTE.textSubtle;
  ctx.font = "500 10px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(
    lang === "th" ? "รายงานสรุปการสแกน" : "Scan summary report",
    MARGIN,
    y + 34
  );

  return y + 52;
}

async function drawHero(
  ctx: CanvasRenderingContext2D,
  y: number,
  record: ScanRecord,
  lang: "th" | "en"
): Promise<number> {
  const heroH = 200;
  // Card background
  roundedRect(ctx, MARGIN, y, WIDTH - 2 * MARGIN, heroH, 14);
  ctx.fillStyle = PALETTE.panel;
  ctx.fill();
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Photo (left). Only render if record has it.
  const photoW = 150;
  const photoH = heroH - 24;
  const photoX = MARGIN + 12;
  const photoY = y + 12;
  if (record.photoDataUrl) {
    try {
      const img = await loadImage(record.photoDataUrl);
      const scale = Math.max(photoW / img.naturalWidth, photoH / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const dx = photoX + (photoW - drawW) / 2;
      const dy = photoY + (photoH - drawH) / 2;
      ctx.save();
      clipRoundedRect(ctx, photoX, photoY, photoW, photoH, 10);
      ctx.drawImage(img, dx, dy, drawW, drawH);
      ctx.restore();
    } catch {
      // Skip the photo if it fails to decode.
    }
  } else {
    // Placeholder
    roundedRect(ctx, photoX, photoY, photoW, photoH, 10);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
  }

  // Score block (right of photo)
  const scoreX = photoX + photoW + 24;
  ctx.fillStyle = PALETTE.textSubtle;
  ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(
    (lang === "th" ? "คะแนนรวม" : "Overall score").toUpperCase(),
    scoreX,
    y + 16
  );

  ctx.fillStyle = PALETTE.text;
  ctx.font = "italic 300 72px ui-serif, Georgia, 'Times New Roman', serif";
  ctx.fillText(record.overall.toFixed(1), scoreX, y + 28);

  ctx.fillStyle = PALETTE.accent;
  ctx.font = "500 16px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(tierLabel(record.tier, lang), scoreX, y + 110);

  // Sub-scores (G / S / L)
  let subX = scoreX;
  const subY = y + 140;
  ctx.font = "400 11px ui-sans-serif, system-ui, sans-serif";
  if (record.geometric !== undefined) {
    subX = drawSubScore(ctx, subX, subY, "G", record.geometric.toFixed(1));
  }
  if (record.secondOpinion !== undefined) {
    subX = drawSubScore(ctx, subX, subY, "S", record.secondOpinion.toFixed(1));
  }
  if (record.learned !== undefined) {
    subX = drawSubScore(ctx, subX, subY, "L", record.learned.toFixed(1));
  }

  // Calibration line at the bottom
  ctx.fillStyle = PALETTE.textSubtle;
  ctx.font = "400 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(
    calibrationLabel(record, lang),
    scoreX,
    y + heroH - 28
  );

  return y + heroH;
}

function drawSubScore(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  letter: string,
  value: string
): number {
  const w = 56;
  roundedRect(ctx, x, y, w, 24, 6);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fill();
  ctx.strokeStyle = PALETTE.border;
  ctx.stroke();

  ctx.fillStyle = PALETTE.textSubtle;
  ctx.font = "500 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, x + 8, y + 12);

  ctx.fillStyle = PALETTE.text;
  ctx.font = "500 13px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(value, x + 22, y + 12);

  ctx.textBaseline = "top";
  return x + w + 8;
}

function drawCategories(
  ctx: CanvasRenderingContext2D,
  y0: number,
  record: ScanRecord,
  lang: "th" | "en"
): number {
  let y = y0;
  y = drawSectionTitle(
    ctx,
    y,
    lang === "th" ? "คะแนนแยกหมวด" : "Category scores"
  );
  y += 8;

  const cats = Object.entries(record.categories);
  // Two-column grid
  const col1X = MARGIN;
  const colW = (WIDTH - 2 * MARGIN - 16) / 2;
  const rowH = 38;

  cats.forEach(([key, score], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cellX = col === 0 ? col1X : col1X + colW + 16;
    const cellY = y + row * rowH;

    roundedRect(ctx, cellX, cellY, colW, rowH - 8, 8);
    ctx.fillStyle = PALETTE.panel;
    ctx.fill();
    ctx.strokeStyle = PALETTE.border;
    ctx.stroke();

    ctx.fillStyle = PALETTE.textMuted;
    ctx.font = "400 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(categoryLabel(key, lang), cellX + 12, cellY + (rowH - 8) / 2);

    ctx.fillStyle = PALETTE.text;
    ctx.font = "600 14px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(
      typeof score === "number" ? score.toFixed(1) : "-",
      cellX + colW - 12,
      cellY + (rowH - 8) / 2
    );
    ctx.textAlign = "left";
  });
  ctx.textBaseline = "top";

  const rows = Math.ceil(cats.length / 2);
  return y + rows * rowH;
}

function drawAiSummary(
  ctx: CanvasRenderingContext2D,
  y0: number,
  record: ScanRecord,
  lang: "th" | "en"
): number {
  if (!record.aiReasoning) return y0;
  let y = y0;
  y = drawSectionTitle(
    ctx,
    y,
    lang === "th" ? "บันทึกย่อสำหรับคุณ" : "Personal read"
  );
  y += 8;

  // Wrap reasoning text inside a rounded card.
  const paddingX = 16;
  const paddingY = 14;
  const innerW = WIDTH - 2 * MARGIN - 2 * paddingX;
  ctx.font = "400 13px ui-sans-serif, system-ui, sans-serif";
  const lines = wrapText(ctx, record.aiReasoning, innerW);
  const lineH = 18;
  const cardH = paddingY * 2 + lines.length * lineH;

  roundedRect(ctx, MARGIN, y, WIDTH - 2 * MARGIN, cardH, 12);
  ctx.fillStyle = PALETTE.accentSoft;
  ctx.fill();
  ctx.strokeStyle = "rgba(168,85,247,0.35)";
  ctx.stroke();

  ctx.fillStyle = PALETTE.text;
  ctx.textBaseline = "top";
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i] ?? "", MARGIN + paddingX, y + paddingY + i * lineH);
  }
  return y + cardH;
}

function drawAdvice(
  ctx: CanvasRenderingContext2D,
  y0: number,
  record: ScanRecord,
  lang: "th" | "en"
): number {
  if (!record.aiAdvice || record.aiAdvice.length === 0) return y0;
  let y = y0;
  y = drawSectionTitle(
    ctx,
    y,
    lang === "th" ? "จุดที่พัฒนาได้" : "Areas to improve"
  );
  y += 8;

  for (const advice of record.aiAdvice) {
    const paddingX = 14;
    const paddingY = 12;
    const innerW = WIDTH - 2 * MARGIN - 2 * paddingX;

    // Pre-measure block height
    ctx.font = "500 13px ui-sans-serif, system-ui, sans-serif";
    const titleH = 18;
    ctx.font = "italic 400 12px ui-sans-serif, system-ui, sans-serif";
    const obsLines = wrapText(ctx, advice.observation, innerW);
    const obsH = obsLines.length * 16;
    ctx.font = "400 12px ui-sans-serif, system-ui, sans-serif";
    const recsLines: string[] = [];
    for (const r of advice.recommendations) {
      const wrapped = wrapText(ctx, "· " + r, innerW - 12);
      recsLines.push(...wrapped);
    }
    const recsH = recsLines.length * 16;
    const blockH = paddingY * 2 + titleH + 6 + obsH + 8 + recsH;

    // Draw block
    roundedRect(ctx, MARGIN, y, WIDTH - 2 * MARGIN, blockH, 10);
    ctx.fillStyle = PALETTE.panel;
    ctx.fill();
    ctx.strokeStyle = PALETTE.border;
    ctx.stroke();

    let cursorY = y + paddingY;
    ctx.fillStyle = PALETTE.text;
    ctx.font = "500 13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(advice.metric, MARGIN + paddingX, cursorY);

    // Difficulty chip on right
    const chipText =
      advice.difficulty === "easy"
        ? lang === "th"
          ? "ง่าย"
          : "Easy"
        : advice.difficulty === "mid"
          ? lang === "th"
            ? "กลาง"
            : "Mid"
          : lang === "th"
            ? "ยาก"
            : "Hard";
    const chipColor =
      advice.difficulty === "easy"
        ? PALETTE.good
        : advice.difficulty === "mid"
          ? PALETTE.cyan
          : PALETTE.warn;
    drawChip(
      ctx,
      WIDTH - MARGIN - paddingX,
      cursorY - 2,
      chipText,
      chipColor,
      "right"
    );
    cursorY += titleH + 6;

    ctx.font = "italic 400 12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = PALETTE.textMuted;
    for (const ln of obsLines) {
      ctx.fillText(ln, MARGIN + paddingX, cursorY);
      cursorY += 16;
    }
    cursorY += 8;

    ctx.font = "400 12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = PALETTE.text;
    for (const ln of recsLines) {
      ctx.fillText(ln, MARGIN + paddingX + 6, cursorY);
      cursorY += 16;
    }

    y += blockH + 10;
  }

  return y;
}

function drawProcedurePicks(
  ctx: CanvasRenderingContext2D,
  y0: number,
  keys: ProcedureKey[],
  lang: "th" | "en"
): number {
  let y = y0;
  y = drawSectionTitle(
    ctx,
    y,
    lang === "th" ? "หัตถการที่สนใจ" : "Procedures of interest"
  );
  y += 8;

  // Selection summary
  const summary = summarizeSelection(keys);
  if (summary.costMax > 0 || summary.costMin > 0) {
    const paddingX = 14;
    const paddingY = 12;
    const summaryH = 56;
    roundedRect(ctx, MARGIN, y, WIDTH - 2 * MARGIN, summaryH, 10);
    ctx.fillStyle = "rgba(34,211,238,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(34,211,238,0.30)";
    ctx.stroke();

    ctx.fillStyle = PALETTE.textSubtle;
    ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(
      (lang === "th"
        ? `เลือก ${keys.length} รายการ · งบประมาณรวม`
        : `${keys.length} selected · estimated budget`
      ).toUpperCase(),
      MARGIN + paddingX,
      y + paddingY
    );

    ctx.fillStyle = PALETTE.text;
    ctx.font = "600 18px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(
      `${formatBaht(summary.costMin)} – ${formatBaht(summary.costMax)} ${lang === "th" ? "บาท" : "THB"}`,
      MARGIN + paddingX,
      y + paddingY + 18
    );

    y += summaryH + 10;
  }

  // Per-procedure rows
  for (const key of keys) {
    const def = findProcedure(key);
    const info = findProcedureInfo(key);
    if (!def) continue;
    const paddingX = 14;
    const rowH = info ? 78 : 44;

    roundedRect(ctx, MARGIN, y, WIDTH - 2 * MARGIN, rowH, 10);
    ctx.fillStyle = PALETTE.panel;
    ctx.fill();
    ctx.strokeStyle = PALETTE.border;
    ctx.stroke();

    ctx.fillStyle = PALETTE.text;
    ctx.font = "500 13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(
      lang === "th" ? def.label_th : def.label_en,
      MARGIN + paddingX,
      y + 12
    );

    // Kind chip
    const kindChip =
      def.kind === "surgical"
        ? lang === "th"
          ? "ผ่าตัด"
          : "Surgical"
        : def.kind === "injectable"
          ? lang === "th"
            ? "ฉีด"
            : "Injectable"
          : lang === "th"
            ? "ไม่ผ่าตัด"
            : "Non-invasive";
    const kindColor =
      def.kind === "surgical"
        ? PALETTE.warn
        : def.kind === "injectable"
          ? PALETTE.cyan
          : PALETTE.good;
    drawChip(ctx, WIDTH - MARGIN - paddingX, y + 8, kindChip, kindColor, "right");

    if (info) {
      // Three facts: cost, downtime, lasts
      ctx.font = "400 11px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = PALETTE.textSubtle;
      ctx.fillText(
        (lang === "th" ? "ราคาประมาณ" : "Cost").toUpperCase() + ": ",
        MARGIN + paddingX,
        y + 38
      );
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(info.cost_thb, MARGIN + paddingX + 70, y + 38);

      ctx.fillStyle = PALETTE.textSubtle;
      ctx.fillText(
        (lang === "th" ? "พักฟื้น" : "Downtime").toUpperCase() + ": ",
        MARGIN + paddingX,
        y + 56
      );
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(
        lang === "th" ? info.downtime_th : info.downtime_en,
        MARGIN + paddingX + 70,
        y + 56
      );
    }

    y += rowH + 8;
  }

  return y;
}

function drawDisclaimer(
  ctx: CanvasRenderingContext2D,
  y0: number,
  lang: "th" | "en"
): number {
  const paddingX = 14;
  const paddingY = 12;
  const innerW = WIDTH - 2 * MARGIN - 2 * paddingX;
  const text =
    lang === "th"
      ? "รายงานนี้สร้างจากการวิเคราะห์ใบหน้าด้วยระบบคอมพิวเตอร์ — เป็นแนวคิดเพื่อช่วยตัดสินใจ ไม่ใช่ภาพคาดการณ์ทางการแพทย์ ปรึกษาแพทย์ผู้เชี่ยวชาญที่ได้รับการรับรองก่อนตัดสินใจทำหัตถการใดๆ"
      : "This report comes from an in-browser facial analysis — it's a conceptual visual to help you think through options, not a medical prediction. Always consult a board-certified specialist before any actual procedure.";
  ctx.font = "400 11px ui-sans-serif, system-ui, sans-serif";
  const lines = wrapText(ctx, text, innerW);
  const lineH = 16;
  const cardH = paddingY * 2 + lines.length * lineH;

  roundedRect(ctx, MARGIN, y0, WIDTH - 2 * MARGIN, cardH, 10);
  ctx.fillStyle = "rgba(251,191,36,0.06)";
  ctx.fill();
  ctx.strokeStyle = "rgba(251,191,36,0.30)";
  ctx.stroke();

  ctx.fillStyle = "rgba(251,191,36,0.90)";
  ctx.textBaseline = "top";
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i] ?? "", MARGIN + paddingX, y0 + paddingY + i * lineH);
  }
  return y0 + cardH;
}

// ============================================================================
// Helpers
// ============================================================================

function drawSectionTitle(
  ctx: CanvasRenderingContext2D,
  y: number,
  text: string
): number {
  ctx.fillStyle = PALETTE.textSubtle;
  ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(text.toUpperCase(), MARGIN, y);
  return y + 14;
}

function drawChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
  align: "left" | "right"
): void {
  ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  const padX = 8;
  const padY = 4;
  const tw = ctx.measureText(text).width;
  const w = tw + padX * 2;
  const h = 18;
  const drawX = align === "right" ? x - w : x;
  roundedRect(ctx, drawX, y, w, h, 9);
  ctx.fillStyle = color + "20"; // 20 hex = ~12.5% alpha
  // Browsers don't all support "#RRGGBBAA" reliably; fall back via globalAlpha.
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.15;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.fillText(text, drawX + padX, y + h / 2);
  ctx.textBaseline = "top";
  void padY;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clipRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  roundedRect(ctx, x, y, w, h, r);
  ctx.clip();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  // Split on spaces and on Thai zero-width breaks. Thai text doesn't
  // separate words with spaces, so we fall back to character-by-character
  // wrapping when the source contains Thai but no spaces in a long span.
  const out: string[] = [];
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    const tokens = tokenize(para);
    let line = "";
    for (const tok of tokens) {
      const candidate = line ? line + tok : tok;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        if (line) out.push(line);
        // Token alone might exceed width — break it character by character.
        if (ctx.measureText(tok).width > maxWidth) {
          let buf = "";
          for (const ch of tok) {
            const next = buf + ch;
            if (ctx.measureText(next).width > maxWidth) {
              if (buf) out.push(buf);
              buf = ch;
            } else {
              buf = next;
            }
          }
          line = buf;
        } else {
          line = tok;
        }
      }
    }
    if (line) out.push(line);
    if (paragraphs.length > 1) out.push("");
  }
  return out;
}

function tokenize(s: string): string[] {
  // Split on spaces but keep them as part of the following token so
  // we preserve word boundaries during reflow.
  const out: string[] = [];
  const re = /(\S+\s*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push(m[0]);
  }
  return out.length > 0 ? out : [s];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image-load-failed"));
    img.src = src;
  });
}

function cropToHeight(src: HTMLCanvasElement, h: number): string {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return src.toDataURL("image/png");
  ctx.drawImage(src, 0, 0, src.width, h, 0, 0, src.width, h);
  try {
    return out.toDataURL("image/png");
  } finally {
    out.width = 0;
    out.height = 0;
  }
}

function tierLabel(tier: ScanRecord["tier"], lang: "th" | "en"): string {
  const labels: Record<ScanRecord["tier"], { th: string; en: string }> = {
    ltn: { th: "ระดับต่ำมาก", en: "Well below average" },
    mtn: { th: "ระดับต่ำกว่าค่ามาตรฐาน", en: "Below average" },
    htn: { th: "ระดับมาตรฐาน", en: "Average" },
    chadlite: { th: "ระดับเหนือมาตรฐาน", en: "Above average" },
    chad: { th: "ระดับสูง (top 10-15%)", en: "Top tier" },
    gigachad: { th: "ระดับสูงมาก", en: "Exceptional" },
    stacylite: { th: "ระดับเหนือมาตรฐาน", en: "Above average" },
    stacy: { th: "ระดับสูง (top 10-15%)", en: "Top tier" },
    goddess: { th: "ระดับสูงมาก", en: "Exceptional" },
  };
  return labels[tier]?.[lang] ?? tier;
}

function categoryLabel(key: string, lang: "th" | "en"): string {
  const m: Record<string, { th: string; en: string }> = {
    harmony: { th: "ความกลมกลืน", en: "Harmony" },
    angularity: { th: "ความคม", en: "Angularity" },
    dimorphism: { th: "ความเป็นเพศ", en: "Dimorphism" },
    "eye-area": { th: "ดวงตา", en: "Eye area" },
    features: { th: "องค์ประกอบ", en: "Features" },
    symmetry: { th: "ความสมมาตร", en: "Symmetry" },
    skin: { th: "ผิว", en: "Skin" },
  };
  return m[key]?.[lang] ?? key;
}

function calibrationLabel(
  record: ScanRecord,
  lang: "th" | "en"
): string {
  const g =
    record.options.gender === "male"
      ? lang === "th"
        ? "ชาย"
        : "Male"
      : lang === "th"
        ? "หญิง"
        : "Female";
  const e =
    record.options.ethnicity === "asian"
      ? lang === "th"
        ? "เอเชีย"
        : "Asian"
      : lang === "th"
        ? "สากล"
        : "Universal";
  const v = record.views.side
    ? lang === "th"
      ? "หน้าตรง + ข้าง"
      : "Front + Side"
    : lang === "th"
      ? "หน้าตรง"
      : "Front only";
  return `${g} · ${e} · ${v}`;
}

// Re-export the input type for callers that want a thin wrapper.
export type { ScanRecord };
