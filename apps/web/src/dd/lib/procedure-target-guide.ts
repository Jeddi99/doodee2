import type { Landmarks } from "@/types";
import type { Intensity, ProcedureKey } from "./ai-procedure-catalog";

export interface ProcedureTargetGuidePayload {
  mime_type: "image/png";
  data: string;
}

type Point = { x: number; y: number };
type Box = { minX: number; minY: number; maxX: number; maxY: number };

const NOSE = [168, 6, 197, 195, 5, 4, 1, 2, 326, 327, 358, 391, 164, 167, 203, 129, 79, 218] as const;
const CHIN = [18, 200, 199, 175, 152, 377, 396, 287, 273, 335, 406, 313] as const;
const JAW = [234, 132, 172, 136, 150, 149, 176, 148, 152, 377, 400, 365, 397, 361, 454, 356] as const;
const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146] as const;
const RIGHT_EYE = [33, 133, 159, 145] as const;
const LEFT_EYE = [263, 362, 386, 374] as const;
const RIGHT_BROW = [70, 63, 105, 66, 107] as const;
const LEFT_BROW = [300, 293, 334, 296, 336] as const;
const HAIRLINE = [10, 67, 109, 151, 337, 338, 297, 332] as const;
const FACE_OVAL = [10, 234, 454, 152] as const;

export function procedureTargetGuidePayload(
  image: HTMLImageElement,
  landmarks: Landmarks,
  keys: readonly ProcedureKey[],
  intensity: Intensity
): ProcedureTargetGuidePayload | null {
  try {
    const guide = buildProcedureTargetGuideCanvas(image, landmarks, keys, intensity);
    if (!guide) return null;
    try {
      const dataUrl = guide.toDataURL("image/png");
      return { mime_type: "image/png", data: dataUrl.split(",")[1] ?? "" };
    } finally {
      guide.width = 0;
      guide.height = 0;
    }
  } catch {
    return null;
  }
}

function buildProcedureTargetGuideCanvas(
  image: HTMLImageElement,
  landmarks: Landmarks,
  keys: readonly ProcedureKey[],
  intensity: Intensity
): HTMLCanvasElement | null {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width <= 0 || height <= 0 || keys.length === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);
  const strength = intensityStrength(intensity);
  const groups = new Set(keys.flatMap(guideGroupsForProcedure));
  for (const group of groups) {
    if (group === "nose") drawNoseGuide(ctx, image, landmarks, width, height, strength);
    else if (group === "chin") drawChinGuide(ctx, image, landmarks, width, height, strength);
    else if (group === "jaw") drawJawGuide(ctx, image, landmarks, width, height, strength);
    else if (group === "underEye") drawUnderEyeGuide(ctx, image, landmarks, width, height, strength);
    else if (group === "eyes") drawEyeGuide(ctx, image, landmarks, width, height, strength);
    else if (group === "brow") drawBrowGuide(ctx, image, landmarks, width, height, strength);
    else if (group === "lips") drawLipGuide(ctx, image, landmarks, width, height, strength);
    else if (group === "skin") drawSkinGuide(ctx, image, landmarks, width, height, strength);
    else drawHairlineGuide(ctx, image, landmarks, width, height, strength);
  }
  return canvas;
}

function guideGroupsForProcedure(key: ProcedureKey): string[] {
  switch (key) {
    case "rhinoplasty":
    case "nose_filler":
    case "alar_reduction":
    case "tip_refinement":
    case "nasal_asymmetry_consult":
      return ["nose"];
    case "chin_augmentation":
    case "filler_chin":
    case "chin_dimpling_botox":
    case "genioplasty_consult":
      return ["chin"];
    case "jawline_contour":
    case "jawline_filler":
    case "jaw_reduction":
    case "v_line_surgery":
    case "cheekbone_reduction":
    case "botox_masseter":
    case "buccal_fat":
    case "double_chin_liposuction":
    case "facial_thinning":
    case "body_fat_reduction":
    case "lower_face_laxity_plan":
    case "ultrasound_rf_laxity_consult":
    case "neck_laxity_consult":
    case "thread_lift_consult":
      return ["jaw"];
    case "filler_tear_trough":
    case "under_eye_rejuvenation":
    case "under_eye_fat_repositioning":
    case "eye_bag_removal":
      return ["underEye"];
    case "double_eyelid":
    case "upper_blepharoplasty_consult":
    case "ptosis_correction":
    case "canthoplasty":
      return ["eyes"];
    case "brow_lift":
    case "botox_forehead":
    case "botox_glabellar":
    case "botox_crows_feet":
      return ["brow", "eyes"];
    case "lip_enhancement":
    case "filler_lip":
    case "lip_lift":
    case "lip_asymmetry_consult":
    case "smile_line_dental_consult":
    case "orthodontic_bite_consult":
    case "smile_design_veneers_consult":
    case "gummy_smile_botox":
      return ["lips"];
    case "skin_smoothing":
    case "skin_booster":
    case "rejuran":
    case "juvelook":
    case "pico_laser":
    case "acne_scar_removal":
    case "melasma_pigment_plan":
    case "skin_laxity_tightening":
    case "vascular_redness_derm_consult":
    case "dermatology_referral":
    case "scar_revision_consult":
    case "rf_microneedling_texture_consult":
    case "fractional_laser_resurfacing_consult":
    case "subcision_acne_scar_consult":
      return ["skin"];
    case "hairline_balance_consult":
    case "hairline_restoration_consult":
      return ["hairline"];
    case "temple_filler":
    case "forehead_volume_consult":
      return ["brow", "skin"];
    case "midface_support_filler":
    case "filler_nasolabial":
    case "marionette_line_filler":
    case "facial_fat_grafting":
      return ["skin"];
    default:
      return ["skin"];
  }
}

function drawNoseGuide(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  landmarks: Landmarks,
  width: number,
  height: number,
  strength: number
): void {
  const box = boxFor(NOSE, landmarks, width, height, width * 0.045);
  if (!box) return;
  clipRounded(ctx, box, width * 0.025, () => {
    redrawPatch(ctx, image, box, `contrast(${1.04 + strength * 0.04}) brightness(${1.01 + strength * 0.02})`);
    const top = point(landmarks, 168, width, height);
    const tip = point(landmarks, 1, width, height);
    if (!top || !tip) return;
    strokeLine(ctx, [top, tip], `rgba(255,255,255,${0.13 * strength})`, width * 0.018);
    strokeLine(ctx, [{ x: top.x - width * 0.035, y: top.y + height * 0.035 }, { x: tip.x - width * 0.045, y: tip.y }], `rgba(30,20,16,${0.08 * strength})`, width * 0.012);
    strokeLine(ctx, [{ x: top.x + width * 0.035, y: top.y + height * 0.035 }, { x: tip.x + width * 0.045, y: tip.y }], `rgba(30,20,16,${0.08 * strength})`, width * 0.012);
  });
}

function drawChinGuide(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  landmarks: Landmarks,
  width: number,
  height: number,
  strength: number
): void {
  const box = boxFor(CHIN, landmarks, width, height, width * 0.04);
  if (!box) return;
  clipRounded(ctx, box, width * 0.03, () => {
    const dy = height * 0.006 * strength;
    redrawPatch(ctx, image, box, "contrast(1.05)", 1, 0, dy, 1, 1.035);
    const chin = point(landmarks, 152, width, height);
    const mid = point(landmarks, 200, width, height);
    if (!chin || !mid) return;
    strokeLine(ctx, [mid, chin], `rgba(255,255,255,${0.12 * strength})`, width * 0.018);
  });
}

function drawJawGuide(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  landmarks: Landmarks,
  width: number,
  height: number,
  strength: number
): void {
  const points = JAW.map((index) => point(landmarks, index, width, height)).filter((p): p is Point => Boolean(p));
  if (points.length < 2) return;
  const box = boxFor(JAW, landmarks, width, height, width * 0.035);
  if (box) {
    clipRounded(ctx, box, width * 0.04, () => {
      redrawPatch(ctx, image, box, `contrast(${1.05 + strength * 0.04})`);
    });
  }
  strokeLine(ctx, points, `rgba(255,255,255,${0.13 * strength})`, width * 0.026);
  strokeLine(ctx, points.map((p) => ({ x: p.x, y: p.y + height * 0.008 })), `rgba(25,16,12,${0.09 * strength})`, width * 0.018);
}

function drawUnderEyeGuide(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  landmarks: Landmarks,
  width: number,
  height: number,
  strength: number
): void {
  for (const indices of [RIGHT_EYE, LEFT_EYE]) {
    const eye = boxFor(indices, landmarks, width, height, width * 0.02);
    if (!eye) continue;
    const eyeH = eye.maxY - eye.minY;
    const box = {
      minX: eye.minX,
      maxX: eye.maxX,
      minY: eye.maxY - eyeH * 0.1,
      maxY: eye.maxY + eyeH * 1.35,
    };
    clipRounded(ctx, box, width * 0.025, () => {
      redrawPatch(ctx, image, box, `brightness(${1.06 + strength * 0.04}) saturate(0.96) contrast(0.96)`);
      fillBox(ctx, box, `rgba(255,235,215,${0.07 * strength})`);
    });
  }
}

function drawEyeGuide(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  landmarks: Landmarks,
  width: number,
  height: number,
  strength: number
): void {
  for (const indices of [RIGHT_EYE, LEFT_EYE]) {
    const box = boxFor(indices, landmarks, width, height, width * 0.035);
    if (!box) continue;
    clipRounded(ctx, box, width * 0.025, () => {
      redrawPatch(ctx, image, box, `brightness(${1.02 + strength * 0.03}) contrast(${1.04 + strength * 0.03})`);
      strokeLine(ctx, [{ x: box.minX + width * 0.01, y: box.minY + (box.maxY - box.minY) * 0.3 }, { x: box.maxX - width * 0.01, y: box.minY + (box.maxY - box.minY) * 0.22 }], `rgba(45,30,24,${0.09 * strength})`, width * 0.008);
    });
  }
}

function drawBrowGuide(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  landmarks: Landmarks,
  width: number,
  height: number,
  strength: number
): void {
  for (const indices of [RIGHT_BROW, LEFT_BROW]) {
    const box = boxFor(indices, landmarks, width, height, width * 0.035);
    if (!box) continue;
    clipRounded(ctx, box, width * 0.02, () => {
      redrawPatch(ctx, image, box, `contrast(${1.04 + strength * 0.03})`);
      strokeLine(ctx, pointsFor(indices, landmarks, width, height), `rgba(35,24,20,${0.1 * strength})`, width * 0.012);
    });
  }
}

function drawLipGuide(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  landmarks: Landmarks,
  width: number,
  height: number,
  strength: number
): void {
  const box = boxFor(LIPS, landmarks, width, height, width * 0.025);
  if (!box) return;
  clipRounded(ctx, box, width * 0.025, () => {
    redrawPatch(ctx, image, box, `saturate(${1.05 + strength * 0.12}) contrast(${1.03 + strength * 0.04})`);
    fillBox(ctx, box, `rgba(170,65,82,${0.045 * strength})`);
  });
}

function drawSkinGuide(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  landmarks: Landmarks,
  width: number,
  height: number,
  strength: number
): void {
  const face = boxFor(FACE_OVAL, landmarks, width, height, width * 0.035);
  if (!face) return;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(
    (face.minX + face.maxX) / 2,
    (face.minY + face.maxY) / 2,
    ((face.maxX - face.minX) / 2) * 0.82,
    ((face.maxY - face.minY) / 2) * 0.88,
    0,
    0,
    Math.PI * 2
  );
  ctx.clip();
  redrawPatch(ctx, image, face, `blur(${Math.max(0.5, width * 0.0015)}px) contrast(${0.98 + strength * 0.01}) brightness(${1.01 + strength * 0.015})`, 0.55);
  ctx.restore();
}

function drawHairlineGuide(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  landmarks: Landmarks,
  width: number,
  height: number,
  strength: number
): void {
  const box = boxFor(HAIRLINE, landmarks, width, height, width * 0.04);
  if (!box) return;
  clipRounded(ctx, box, width * 0.02, () => {
    redrawPatch(ctx, image, box, `contrast(${1.04 + strength * 0.04})`);
    strokeLine(ctx, pointsFor(HAIRLINE, landmarks, width, height), `rgba(30,20,16,${0.1 * strength})`, width * 0.018);
  });
}

function redrawPatch(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  box: Box,
  filter: string,
  alpha = 1,
  dx = 0,
  dy = 0,
  scaleX = 1,
  scaleY = 1
): void {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = filter;
  ctx.drawImage(image, box.minX, box.minY, w, h, box.minX + dx, box.minY + dy, w * scaleX, h * scaleY);
  ctx.restore();
}

function fillBox(ctx: CanvasRenderingContext2D, box: Box, fillStyle: string): void {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = fillStyle;
  ctx.fillRect(box.minX, box.minY, w, h);
}

function clipRounded(
  ctx: CanvasRenderingContext2D,
  box: Box,
  radius: number,
  draw: () => void
): void {
  ctx.save();
  roundedPath(ctx, box, radius);
  ctx.clip();
  draw();
  ctx.restore();
}

function roundedPath(ctx: CanvasRenderingContext2D, box: Box, radius: number): void {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(box.minX + r, box.minY);
  ctx.lineTo(box.maxX - r, box.minY);
  ctx.quadraticCurveTo(box.maxX, box.minY, box.maxX, box.minY + r);
  ctx.lineTo(box.maxX, box.maxY - r);
  ctx.quadraticCurveTo(box.maxX, box.maxY, box.maxX - r, box.maxY);
  ctx.lineTo(box.minX + r, box.maxY);
  ctx.quadraticCurveTo(box.minX, box.maxY, box.minX, box.maxY - r);
  ctx.lineTo(box.minX, box.minY + r);
  ctx.quadraticCurveTo(box.minX, box.minY, box.minX + r, box.minY);
  ctx.closePath();
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  strokeStyle: string,
  lineWidth: number
): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  ctx.restore();
}

function pointsFor(
  indices: readonly number[],
  landmarks: Landmarks,
  width: number,
  height: number
): Point[] {
  return indices
    .map((index) => point(landmarks, index, width, height))
    .filter((p): p is Point => Boolean(p));
}

function boxFor(
  indices: readonly number[],
  landmarks: Landmarks,
  width: number,
  height: number,
  padding: number
): Box | null {
  const points = pointsFor(indices, landmarks, width, height);
  if (points.length < 2) return null;
  return {
    minX: Math.max(0, Math.min(...points.map((p) => p.x)) - padding),
    minY: Math.max(0, Math.min(...points.map((p) => p.y)) - padding),
    maxX: Math.min(width, Math.max(...points.map((p) => p.x)) + padding),
    maxY: Math.min(height, Math.max(...points.map((p) => p.y)) + padding),
  };
}

function point(
  landmarks: Landmarks,
  index: number,
  width: number,
  height: number
): Point | null {
  const item = landmarks[index];
  if (!item) return null;
  return { x: item.x * width, y: item.y * height };
}

function intensityStrength(intensity: Intensity): number {
  if (intensity === "mild") return 0.55;
  if (intensity === "strong") return 1;
  return 0.78;
}
