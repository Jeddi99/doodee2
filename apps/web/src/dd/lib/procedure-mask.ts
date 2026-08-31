import type { Blendshapes, Landmarks } from "@/types";
import type { ProcedureKey } from "./ai-procedure-catalog";
import { FaceMeshDetector } from "./mediapipe/face-mesh";

export interface ProcedureMaskPayload {
  mime_type: "image/png";
  data: string;
}

export interface ProcedureTargetCropPayload {
  mime_type: "image/jpeg";
  data: string;
}

type MaskArea =
  | "nose"
  | "chin"
  | "underEye"
  | "jaw"
  | "skin"
  | "lips"
  | "eyes"
  | "brow"
  | "hairline"
  | "midface"
  | "nasolabial"
  | "temple"
  | "neck";

type Box = { minX: number; minY: number; maxX: number; maxY: number };

const AREA_INDICES: Record<
  Exclude<MaskArea, "underEye" | "skin" | "midface" | "nasolabial" | "temple" | "neck">,
  readonly number[]
> = {
  nose: [168, 6, 197, 195, 5, 4, 1, 2, 326, 327, 358, 391, 164, 167, 203, 129, 79, 218],
  chin: [18, 200, 199, 175, 152, 377, 396, 287, 273, 335, 406, 313],
  jaw: [234, 132, 172, 136, 150, 149, 176, 148, 152, 377, 400, 365, 397, 361, 454, 356],
  lips: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  eyes: [33, 133, 159, 145, 263, 362, 386, 374, 468, 473],
  brow: [70, 63, 105, 66, 107, 300, 293, 334, 296, 336],
  hairline: [10, 67, 109, 151, 337, 338, 297, 332],
};

const RIGHT_EYE = [33, 133, 159, 145] as const;
const LEFT_EYE = [263, 362, 386, 374] as const;
const FACE_OVAL = [10, 234, 454, 152] as const;

export async function detectPreviewLandmarks(
  image: HTMLImageElement
): Promise<{ landmarks: Landmarks; blendshapes: Blendshapes | null } | null> {
  const detector = await FaceMeshDetector.load();
  return detector.detect(image);
}

export function procedureMaskPayload(
  image: HTMLImageElement,
  landmarks: Landmarks,
  keys: readonly ProcedureKey[]
): ProcedureMaskPayload | null {
  const mask = buildProcedureMaskCanvas(image, landmarks, keys);
  if (!mask) return null;
  try {
    const dataUrl = mask.toDataURL("image/png");
    return { mime_type: "image/png", data: dataUrl.split(",")[1] ?? "" };
  } finally {
    mask.width = 0;
    mask.height = 0;
  }
}

export function procedureTargetCropPayload(
  image: HTMLImageElement,
  landmarks: Landmarks,
  keys: readonly ProcedureKey[]
): ProcedureTargetCropPayload | null {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width <= 0 || height <= 0) return null;
  const areas = [...new Set(keys.flatMap(maskAreasForProcedure))];
  const cropBox = unionBoxes(
    areas
      .map((area) => boundsForArea(area, landmarks, width, height))
      .filter((box): box is Box => Boolean(box))
  );
  if (!cropBox) return null;
  const padded = clampBox(expandBox(cropBox, Math.min(width, height) * 0.06), width, height);
  const sourceW = Math.max(1, padded.maxX - padded.minX);
  const sourceH = Math.max(1, padded.maxY - padded.minY);
  const maxSide = 768;
  const scale = Math.min(1, maxSide / Math.max(sourceW, sourceH));
  const targetW = Math.max(1, Math.round(sourceW * scale));
  const targetH = Math.max(1, Math.round(sourceH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    padded.minX,
    padded.minY,
    sourceW,
    sourceH,
    0,
    0,
    targetW,
    targetH
  );
  try {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.93);
    return { mime_type: "image/jpeg", data: dataUrl.split(",")[1] ?? "" };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function compositeProcedurePreviewToMask(
  beforeImage: HTMLImageElement,
  alignedAfterUrl: string,
  keys: readonly ProcedureKey[]
): Promise<string> {
  const detected = await detectPreviewLandmarks(beforeImage);
  if (!detected) throw new Error("procedure-mask-landmarks-missing");
  const mask = buildProcedureMaskCanvas(beforeImage, detected.landmarks, keys);
  if (!mask) throw new Error("procedure-mask-unavailable");
  const after = await loadImage(alignedAfterUrl);
  if (!after) {
    mask.width = 0;
    mask.height = 0;
    throw new Error("procedure-after-image-load-failed");
  }

  const width = beforeImage.naturalWidth || beforeImage.width;
  const height = beforeImage.naturalHeight || beforeImage.height;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const outCtx = out.getContext("2d");
  const afterCanvas = document.createElement("canvas");
  afterCanvas.width = width;
  afterCanvas.height = height;
  const afterCtx = afterCanvas.getContext("2d");
  if (!outCtx || !afterCtx) {
    mask.width = 0;
    mask.height = 0;
    out.width = 0;
    out.height = 0;
    afterCanvas.width = 0;
    afterCanvas.height = 0;
    throw new Error("procedure-composite-canvas-unavailable");
  }

  outCtx.drawImage(beforeImage, 0, 0, width, height);
  afterCtx.drawImage(after, 0, 0, width, height);
  afterCtx.globalCompositeOperation = "destination-in";
  afterCtx.drawImage(mask, 0, 0, width, height);
  outCtx.drawImage(afterCanvas, 0, 0);

  try {
    return out.toDataURL("image/png");
  } finally {
    mask.width = 0;
    mask.height = 0;
    afterCanvas.width = 0;
    afterCanvas.height = 0;
    out.width = 0;
    out.height = 0;
  }
}

function buildProcedureMaskCanvas(
  image: HTMLImageElement,
  landmarks: Landmarks,
  keys: readonly ProcedureKey[]
): HTMLCanvasElement | null {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width <= 0 || height <= 0) return null;
  const areas = [...new Set(keys.flatMap(maskAreasForProcedure))];
  if (areas.length === 0) return null;

  const hard = document.createElement("canvas");
  hard.width = width;
  hard.height = height;
  const ctx = hard.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "white";
  for (const area of areas) drawArea(ctx, area, landmarks, width, height);

  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const maskCtx = mask.getContext("2d");
  if (!maskCtx) return hard;
  maskCtx.filter = `blur(${Math.max(3, Math.round(Math.min(width, height) * 0.008))}px)`;
  maskCtx.drawImage(hard, 0, 0);
  if (areas.includes("nose")) {
    eraseNoseLockedAreas(maskCtx, landmarks, width, height, width * 0.026);
  }
  hard.width = 0;
  hard.height = 0;
  return mask;
}

function drawArea(
  ctx: CanvasRenderingContext2D,
  area: MaskArea,
  landmarks: Landmarks,
  width: number,
  height: number
): void {
  if (area === "skin") {
    drawSkinMask(ctx, landmarks, width, height);
    return;
  }
  if (area === "underEye") {
    drawUnderEye(ctx, landmarks, width, height);
    return;
  }
  if (area === "nose") {
    drawNoseMask(ctx, landmarks, width, height);
    return;
  }
  if (area === "chin") {
    drawChinMask(ctx, landmarks, width, height);
    return;
  }
  if (area === "jaw") {
    drawJawMask(ctx, landmarks, width, height);
    return;
  }
  if (area === "midface") {
    drawMidfaceMask(ctx, landmarks, width, height);
    return;
  }
  if (area === "nasolabial") {
    drawNasolabialMask(ctx, landmarks, width, height);
    return;
  }
  if (area === "temple") {
    drawTempleMask(ctx, landmarks, width, height);
    return;
  }
  if (area === "neck") {
    drawNeckMask(ctx, landmarks, width, height);
    return;
  }
  const box = boxFor(AREA_INDICES[area], landmarks, width, height, padFor(area, width));
  if (box) roundedBox(ctx, box, Math.max(12, width * 0.025));
}

function boundsForArea(
  area: MaskArea,
  landmarks: Landmarks,
  width: number,
  height: number
): Box | null {
  if (area === "skin") return boxFor(FACE_OVAL, landmarks, width, height, width * 0.04);
  if (area === "underEye") {
    return unionBoxes(
      [RIGHT_EYE, LEFT_EYE]
        .map((indices) => boxFor(indices, landmarks, width, height, width * 0.04))
        .filter((box): box is Box => Boolean(box))
    );
  }
  if (area === "jaw") return boxFor(AREA_INDICES.jaw, landmarks, width, height, width * 0.06);
  if (area === "midface") return boxFor([234, 454, 50, 280], landmarks, width, height, width * 0.06);
  if (area === "nasolabial") return boxFor([129, 61, 358, 291], landmarks, width, height, width * 0.05);
  if (area === "temple") return boxFor([10, 67, 109, 297, 332, 234, 454], landmarks, width, height, width * 0.05);
  if (area === "neck") return boxFor([132, 152, 361, 234, 454], landmarks, width, height, width * 0.06);
  return boxFor(AREA_INDICES[area], landmarks, width, height, padFor(area, width));
}

function drawJawMask(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  width: number,
  height: number
): void {
  const points = AREA_INDICES.jaw
    .map((index) => landmarks[index])
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ x: p.x * width, y: p.y * height }));
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = "white";
  ctx.fillStyle = "white";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(16, width * 0.055);
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  const chin = boxFor([148, 152, 377, 175, 199, 200], landmarks, width, height, width * 0.025);
  if (chin) roundedBox(ctx, chin, Math.max(10, width * 0.02));
  ctx.restore();
}

function drawChinMask(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  width: number,
  height: number
): void {
  const face = boxFor(FACE_OVAL, landmarks, width, height, 0);
  const lips = boxFor(AREA_INDICES.lips, landmarks, width, height, 0);
  const chin = landmarks[152];
  const nose = landmarks[1] ?? landmarks[4];
  const mouthTop = landmarks[13];
  const mouthBottom = landmarks[14];
  const rightJaw = landmarks[132] ?? landmarks[234];
  const leftJaw = landmarks[361] ?? landmarks[454];
  if (!face || !chin || !rightJaw || !leftJaw) return;

  const mouthCenterX =
    mouthTop && mouthBottom ? ((mouthTop.x + mouthBottom.x) / 2) * width : chin.x * width;
  const centerX = ((nose?.x ?? chin.x) * width + mouthCenterX + chin.x * width) / 3;
  const jawWidth = Math.abs(leftJaw.x - rightJaw.x) * width;
  const faceHeight = face.maxY - face.minY;
  const lipW = lips ? lips.maxX - lips.minX : 0;
  const lipH = lips ? lips.maxY - lips.minY : 0;
  // Phase 611 — enlarged capture area. The previous tight box put the
  // composite seam right on the chin's shading gradient, so even a good
  // generated variant showed a visible tone step at the boundary. A wider
  // and deeper box (plus the stronger feather in buildProcedureMaskCanvas)
  // moves the seam onto flatter cheek/neck skin where blending is easy.
  // The lip cutout below still protects the mouth.
  const topFromLip = lips ? lips.maxY + lipH * 0.05 : chin.y * height - faceHeight * 0.18;
  const top = Math.max(topFromLip, chin.y * height - faceHeight * 0.18);
  const bottom = Math.min(height, chin.y * height + faceHeight * 0.1);
  const halfWidth = Math.max(jawWidth * 0.36, lipW * 1.05, width * 0.075);
  roundedBox(
    ctx,
    {
      minX: Math.max(0, centerX - halfWidth),
      maxX: Math.min(width, centerX + halfWidth),
      minY: Math.max(0, top),
      maxY: Math.min(height, bottom),
    },
    Math.max(18, width * 0.045)
  );

  if (!lips) return;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  roundedBox(
    ctx,
    {
      minX: Math.max(0, lips.minX - Math.max(width * 0.02, lipW * 0.2)),
      maxX: Math.min(width, lips.maxX + Math.max(width * 0.02, lipW * 0.2)),
      minY: Math.max(0, lips.minY - Math.max(height * 0.01, lipH * 0.3)),
      maxY: Math.min(height, lips.maxY + Math.max(height * 0.008, lipH * 0.18)),
    },
    Math.max(10, width * 0.022)
  );
  ctx.restore();
}

function drawNoseMask(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  width: number,
  height: number
): void {
  const bridge = [168, 6, 197, 195, 5, 4, 1]
    .map((index) => landmarks[index])
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ x: p.x * width, y: p.y * height }));
  if (bridge.length >= 2) {
    ctx.save();
    ctx.strokeStyle = "white";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(14, width * 0.032);
    ctx.beginPath();
    bridge.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  const lower = boxFor(
    [1, 2, 4, 5, 98, 129, 164, 167, 327, 358],
    landmarks,
    width,
    height,
    width * 0.018
  );
  if (lower) roundedBox(ctx, lower, Math.max(10, width * 0.02));

  eraseNoseLockedAreas(ctx, landmarks, width, height, width * 0.022);
}

function eraseNoseLockedAreas(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  width: number,
  height: number,
  pad: number
): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (const indices of [RIGHT_EYE, LEFT_EYE]) {
    const eye = boxFor(indices, landmarks, width, height, pad);
    if (eye) roundedBox(ctx, eye, Math.max(8, width * 0.018));
  }
  const brow = boxFor(AREA_INDICES.brow, landmarks, width, height, pad * 0.82);
  if (brow) roundedBox(ctx, brow, Math.max(8, width * 0.018));
  const lips = boxFor(AREA_INDICES.lips, landmarks, width, height, pad * 0.62);
  if (lips) roundedBox(ctx, lips, Math.max(8, width * 0.018));
  ctx.restore();
}

function drawUnderEye(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  width: number,
  height: number
): void {
  for (const indices of [RIGHT_EYE, LEFT_EYE]) {
    const eye = boxFor(indices, landmarks, width, height, 0);
    if (!eye) continue;
    const eyeW = eye.maxX - eye.minX;
    const eyeH = eye.maxY - eye.minY;
    const padX = Math.max(width * 0.012, eyeW * 0.18);
    const top = eye.maxY + Math.max(height * 0.004, eyeH * 0.08);
    const bottom = eye.maxY + Math.max(height * 0.018, eyeH * 0.95);
    roundedBox(
      ctx,
      {
        minX: Math.max(0, eye.minX - padX),
        maxX: Math.min(width, eye.maxX + padX),
        minY: Math.max(0, top),
        maxY: Math.min(height, bottom),
      },
      Math.max(10, width * 0.02)
    );
  }

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (const indices of [RIGHT_EYE, LEFT_EYE]) {
    const eye = boxFor(indices, landmarks, width, height, Math.max(width * 0.01, height * 0.004));
    if (eye) roundedBox(ctx, eye, Math.max(8, width * 0.018));
  }
  ctx.restore();
}

function drawMidfaceMask(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  width: number,
  height: number
): void {
  const face = boxFor(FACE_OVAL, landmarks, width, height, 0);
  const right = landmarks[234];
  const left = landmarks[454];
  if (!face || !right || !left) return;
  const faceW = face.maxX - face.minX;
  const faceH = face.maxY - face.minY;
  const boxW = faceW * 0.28;
  const boxH = faceH * 0.18;
  for (const cheek of [right, left]) {
    const cx = cheek.x * width;
    const cy = cheek.y * height - boxH * 0.18;
    roundedBox(
      ctx,
      {
        minX: Math.max(0, cx - boxW * 0.5),
        maxX: Math.min(width, cx + boxW * 0.5),
        minY: Math.max(0, cy - boxH * 0.5),
        maxY: Math.min(height, cy + boxH * 0.5),
      },
      Math.max(12, width * 0.025)
    );
  }
}

function drawNasolabialMask(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  width: number,
  height: number
): void {
  const pairs = [
    [129, 61],
    [358, 291],
  ] as const;
  ctx.save();
  ctx.strokeStyle = "white";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(12, width * 0.03);
  for (const [from, to] of pairs) {
    const a = landmarks[from];
    const b = landmarks[to];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTempleMask(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  width: number,
  height: number
): void {
  const face = boxFor(FACE_OVAL, landmarks, width, height, 0);
  if (!face) return;
  const faceW = face.maxX - face.minX;
  const faceH = face.maxY - face.minY;
  const boxW = faceW * 0.2;
  const boxH = faceH * 0.18;
  for (const x of [face.minX + faceW * 0.16, face.maxX - faceW * 0.16]) {
    roundedBox(
      ctx,
      {
        minX: Math.max(0, x - boxW * 0.5),
        maxX: Math.min(width, x + boxW * 0.5),
        minY: Math.max(0, face.minY + faceH * 0.13),
        maxY: Math.min(height, face.minY + faceH * 0.13 + boxH),
      },
      Math.max(12, width * 0.025)
    );
  }
}

function drawNeckMask(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  width: number,
  height: number
): void {
  const chin = landmarks[152];
  const right = landmarks[132] ?? landmarks[234];
  const left = landmarks[361] ?? landmarks[454];
  if (!chin || !right || !left) return;
  const jawW = Math.abs(left.x - right.x) * width;
  const cx = chin.x * width;
  const top = chin.y * height - height * 0.012;
  roundedBox(
    ctx,
    {
      minX: Math.max(0, cx - jawW * 0.38),
      maxX: Math.min(width, cx + jawW * 0.38),
      minY: Math.max(0, top),
      maxY: Math.min(height, top + height * 0.14),
    },
    Math.max(14, width * 0.035)
  );
}

function drawSkinMask(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  width: number,
  height: number
): void {
  const face = boxFor(FACE_OVAL, landmarks, width, height, width * 0.05);
  if (!face) return;
  ctx.beginPath();
  ctx.ellipse(
    (face.minX + face.maxX) / 2,
    (face.minY + face.maxY) / 2,
    ((face.maxX - face.minX) / 2) * 0.84,
    ((face.maxY - face.minY) / 2) * 0.9,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (const area of ["eyes", "lips", "brow", "hairline"] as const) {
    const box = boxFor(AREA_INDICES[area], landmarks, width, height, padFor(area, width));
    if (box) roundedBox(ctx, box, Math.max(10, width * 0.02));
  }
  drawFacialHairProtection(ctx, landmarks, width, height);
  ctx.restore();
}

function drawFacialHairProtection(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  width: number,
  height: number
): void {
  const lips = boxFor(AREA_INDICES.lips, landmarks, width, height, padFor("lips", width));
  const chin = boxFor([18, 200, 199, 175, 152, 148, 377], landmarks, width, height, width * 0.01);
  if (!lips) return;
  const lipW = lips.maxX - lips.minX;
  const lipH = lips.maxY - lips.minY;
  roundedBox(
    ctx,
    {
      minX: Math.max(0, lips.minX - lipW * 0.18),
      maxX: Math.min(width, lips.maxX + lipW * 0.18),
      minY: Math.max(0, lips.minY - lipH * 1.25),
      maxY: Math.min(height, lips.minY + lipH * 0.15),
    },
    Math.max(8, width * 0.018)
  );
  if (!chin) return;
  roundedBox(
    ctx,
    {
      minX: Math.max(0, lips.minX + lipW * 0.12),
      maxX: Math.min(width, lips.maxX - lipW * 0.12),
      minY: Math.max(0, lips.maxY - lipH * 0.12),
      maxY: Math.min(height, Math.min(chin.maxY, lips.maxY + lipH * 1.45)),
    },
    Math.max(8, width * 0.018)
  );
}

function maskAreasForProcedure(key: ProcedureKey): MaskArea[] {
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
    case "under_eye_rejuvenation":
    case "filler_tear_trough":
    case "under_eye_fat_repositioning":
    case "eye_bag_removal":
      return ["underEye"];
    case "jawline_contour":
    case "jawline_filler":
    case "jaw_reduction":
    case "v_line_surgery":
    case "cheekbone_reduction":
    case "botox_masseter":
    case "buccal_fat":
      return ["jaw"];
    case "double_chin_liposuction":
    case "body_fat_reduction":
      return ["jaw", "neck"];
    case "facial_thinning":
    case "lower_face_laxity_plan":
    case "ultrasound_rf_laxity_consult":
    case "thread_lift_consult":
      return ["jaw"];
    case "neck_laxity_consult":
      return ["neck"];
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
    case "lip_enhancement":
    case "filler_lip":
    case "lip_lift":
    case "lip_asymmetry_consult":
    case "smile_line_dental_consult":
    case "orthodontic_bite_consult":
    case "smile_design_veneers_consult":
    case "gummy_smile_botox":
      return ["lips"];
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
    case "hairline_balance_consult":
    case "hairline_restoration_consult":
      return ["hairline"];
    case "temple_filler":
    case "forehead_volume_consult":
      return ["temple"];
    case "midface_support_filler":
      return ["midface"];
    case "filler_nasolabial":
    case "marionette_line_filler":
      return ["nasolabial", "lips"];
    case "facial_fat_grafting":
      return ["midface"];
    default:
      return ["skin"];
  }
}

function unionBoxes(boxes: readonly Box[]): Box | null {
  const [first] = boxes;
  if (!first) return null;
  return boxes.slice(1).reduce<Box>(
    (acc, box) => ({
      minX: Math.min(acc.minX, box.minX),
      minY: Math.min(acc.minY, box.minY),
      maxX: Math.max(acc.maxX, box.maxX),
      maxY: Math.max(acc.maxY, box.maxY),
    }),
    { ...first }
  );
}

function expandBox(box: Box, pad: number): Box {
  return {
    minX: box.minX - pad,
    minY: box.minY - pad,
    maxX: box.maxX + pad,
    maxY: box.maxY + pad,
  };
}

function clampBox(box: Box, width: number, height: number): Box {
  return {
    minX: Math.max(0, Math.min(width, box.minX)),
    minY: Math.max(0, Math.min(height, box.minY)),
    maxX: Math.max(0, Math.min(width, box.maxX)),
    maxY: Math.max(0, Math.min(height, box.maxY)),
  };
}

function boxFor(
  indices: readonly number[],
  landmarks: Landmarks,
  width: number,
  height: number,
  padding: number
): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const index of indices) {
    const p = landmarks[index];
    if (!p) continue;
    const x = p.x * width;
    const y = p.y * height;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    count += 1;
  }
  if (count < 2) return null;
  return {
    minX: Math.max(0, minX - padding),
    minY: Math.max(0, minY - padding),
    maxX: Math.min(width, maxX + padding),
    maxY: Math.min(height, maxY + padding),
  };
}

function roundedBox(ctx: CanvasRenderingContext2D, box: Box, radius: number): void {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  if (w <= 0 || h <= 0) return;
  ctx.beginPath();
  ctx.roundRect(box.minX, box.minY, w, h, Math.min(radius, w / 2, h / 2));
  ctx.fill();
}

function padFor(area: MaskArea, width: number): number {
  if (area === "nose") return width * 0.035;
  if (area === "chin") return width * 0.04;
  if (area === "jaw") return width * 0.035;
  if (area === "lips") return width * 0.025;
  return width * 0.03;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
