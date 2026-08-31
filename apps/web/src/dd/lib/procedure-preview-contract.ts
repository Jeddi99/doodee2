import type { Landmarks } from "@/types";
import type { Intensity, ProcedureDef, ProcedureKey } from "./ai-procedure-catalog";
import {
  buildProcedureEffectPlan,
  type ProcedureEffectPlan,
} from "./procedure-preview-effects";

export type FaceRegionKey =
  | "lips"
  | "leftEye"
  | "rightEye"
  | "leftIris"
  | "rightIris"
  | "leftUnderEye"
  | "rightUnderEye"
  | "leftUpperEyelid"
  | "rightUpperEyelid"
  | "leftOuterCanthus"
  | "rightOuterCanthus"
  | "leftCrowsFeet"
  | "rightCrowsFeet"
  | "leftNasolabial"
  | "rightNasolabial"
  | "leftBrow"
  | "rightBrow"
  | "nose"
  | "chin"
  | "cheekLeft"
  | "cheekRight"
  | "forehead";

type AnchorKey =
  | "rightEye"
  | "leftEye"
  | "rightBrow"
  | "leftBrow"
  | "noseTip"
  | "mouthCenter"
  | "chin"
  | "rightJaw"
  | "leftJaw"
  // Phase 641 — three more anchors so the Phase 640 landmark
  // re-alignment has a denser stable point set for every procedure
  // (e.g. nose procedures previously fit on 6 points; now 8-9).
  | "rightCheek"
  | "leftCheek"
  | "forehead";

export interface PreviewEditContract {
  version: "preview-lock-v1";
  targetRegions: FaceRegionKey[];
  global: boolean;
  lockedAreas: string[];
  targetGeometry: Array<{
    region: FaceRegionKey;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
    areaPct: number;
  }>;
  // Phase 634 — landmark boxes for identity-critical regions that are
  // NOT being targeted by this procedure. The client-side masked
  // composite (ai-gemini-image.ts) punches these out of the paint mask
  // with a hard edge, so a target region's feathered radius can never
  // bleed AI content into eyes/lips/nose/brows just because it grew
  // large enough to reach them (observed on cheekbone_reduction: a
  // wide, tightly-framed photo pushed the cheek regions' feather ring
  // over both eyes).
  protectedGeometry: Array<{
    region: FaceRegionKey;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
    areaPct: number;
  }>;
  anchors: Record<AnchorKey, { x: number; y: number }>;
  ratios: {
    eyeToNose: number;
    noseToMouth: number;
    faceWidth: number;
    faceHeight: number;
    faceWidthToHeight: number;
  };
  parameters: string[];
  effects?: ProcedureEffectPlan[];
}

const IDX = {
  rightEyeOuter: 33,
  rightEyeInner: 133,
  leftEyeOuter: 263,
  leftEyeInner: 362,
  rightBrow: 105,
  leftBrow: 334,
  noseTip: 1,
  mouthTop: 13,
  mouthBottom: 14,
  chin: 152,
  rightJaw: 172,
  leftJaw: 397,
  rightCheek: 234,
  leftCheek: 454,
  forehead: 10,
} as const;

export const REGION_INDICES: Record<FaceRegionKey, readonly number[]> = {
  // Phase 646 — was [61, 291, 13, 14]: mouth corners + INNER lip edges
  // only. That box's height spans just the mouth opening, missing the
  // outer lip contour (landmarks 0 top / 17 bottom) — so the "lips"
  // protected-region punch-out under-covered the visible lower lip.
  // Chin's own region box (REGION_INDICES.chin below) starts at landmark
  // 18, which sits right at the mentolabial fold immediately below the
  // lip, and its pad/feather expand upward from there — so the chin
  // paint mask reached into the real (under-protected) lip pixels,
  // producing a visible lip-shaped artifact painted near the chin.
  // Reusing the same full 20-point outer-lip contour already used by
  // lip-recolor.ts gives the punch-out the lip's true vertical extent.
  lips: [
    61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17,
    84, 181, 91, 146,
  ],
  leftEye: [263, 362, 386, 374],
  rightEye: [33, 133, 159, 145],
  leftIris: [473, 474, 475, 476, 477],
  rightIris: [468, 469, 470, 471, 472],
  leftUnderEye: [362, 382, 381, 380, 374, 373, 390, 249, 263, 341, 256, 252, 253, 254, 339],
  rightUnderEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 111, 26, 22, 23, 24, 110],
  leftUpperEyelid: [263, 466, 388, 387, 386, 385, 384, 398, 362],
  rightUpperEyelid: [33, 246, 161, 160, 159, 158, 157, 173, 133],
  leftOuterCanthus: [263, 466, 388, 249, 390, 359],
  rightOuterCanthus: [33, 246, 161, 7, 163, 130],
  leftCrowsFeet: [263, 466, 388, 249, 390, 359, 446, 255],
  rightCrowsFeet: [33, 246, 161, 7, 163, 130, 226, 25],
  leftNasolabial: [358, 327, 423, 436, 411, 425, 280, 266, 291, 409, 270],
  rightNasolabial: [129, 98, 203, 216, 187, 205, 50, 36, 61, 185, 40],
  leftBrow: [300, 293, 334, 296, 336],
  rightBrow: [70, 63, 105, 66, 107],
  nose: [168, 6, 197, 195, 5, 4, 1, 2, 98, 129, 164, 167, 327, 358],
  chin: [18, 200, 199, 175, 152, 377, 396, 287, 273, 335, 406, 313],
  cheekLeft: [454, 356, 361, 280, 352],
  cheekRight: [234, 127, 132, 50, 123],
  forehead: [10, 67, 109, 151, 337, 338, 297, 332],
};

export const ALWAYS_PROTECTED_REGIONS: readonly FaceRegionKey[] = [
  "leftEye",
  "rightEye",
  "leftIris",
  "rightIris",
  "leftBrow",
  "rightBrow",
  "nose",
  "lips",
];

const LEFT_EYE_TARGETS_REPLACING_FULL_EYE = new Set<FaceRegionKey>([
  "leftEye",
  "leftUnderEye",
  "leftUpperEyelid",
]);

const RIGHT_EYE_TARGETS_REPLACING_FULL_EYE = new Set<FaceRegionKey>([
  "rightEye",
  "rightUnderEye",
  "rightUpperEyelid",
]);

const LEFT_CENTRAL_EYE_INDICES = [
  362, 386, 385, 384, 374, 380, 381, 382,
] as const;
const RIGHT_CENTRAL_EYE_INDICES = [
  133, 159, 158, 157, 145, 153, 154, 155,
] as const;

export function protectedRegionsForTargets(
  targets: readonly FaceRegionKey[]
): FaceRegionKey[] {
  const targetSet = new Set(targets);
  const replacesLeftEye = targets.some((region) =>
    LEFT_EYE_TARGETS_REPLACING_FULL_EYE.has(region)
  );
  const replacesRightEye = targets.some((region) =>
    RIGHT_EYE_TARGETS_REPLACING_FULL_EYE.has(region)
  );
  const protectedRegions = ALWAYS_PROTECTED_REGIONS.filter((region) => {
    if (targetSet.has(region)) return false;
    if (region === "leftEye" && replacesLeftEye) return false;
    if (region === "rightEye" && replacesRightEye) return false;
    return true;
  });
  if (targetSet.has("leftUnderEye")) protectedRegions.push("leftUpperEyelid");
  if (targetSet.has("rightUnderEye")) protectedRegions.push("rightUpperEyelid");
  if (targetSet.has("leftUpperEyelid")) protectedRegions.push("leftUnderEye");
  if (targetSet.has("rightUpperEyelid")) protectedRegions.push("rightUnderEye");
  if (targetSet.has("leftCrowsFeet")) protectedRegions.push("leftOuterCanthus");
  if (targetSet.has("rightCrowsFeet")) protectedRegions.push("rightOuterCanthus");
  if (
    targetSet.has("cheekLeft") ||
    targetSet.has("cheekRight") ||
    targetSet.has("chin")
  ) {
    if (!targetSet.has("leftNasolabial")) {
      protectedRegions.push("leftNasolabial");
    }
    if (!targetSet.has("rightNasolabial")) {
      protectedRegions.push("rightNasolabial");
    }
  }
  return [...new Set(protectedRegions)].filter((region) => !targetSet.has(region));
}

function protectedGeometryForTargets(
  protectedRegions: readonly FaceRegionKey[],
  targets: readonly FaceRegionKey[],
  landmarks: Landmarks
): PreviewEditContract["protectedGeometry"] {
  const targetSet = new Set(targets);
  return protectedRegions
    .map((region) => {
      const indices = region === "leftEye" && targetSet.has("leftOuterCanthus")
        ? LEFT_CENTRAL_EYE_INDICES
        : region === "rightEye" && targetSet.has("rightOuterCanthus")
          ? RIGHT_CENTRAL_EYE_INDICES
          : REGION_INDICES[region];
      const box = normalizedBox(indices, landmarks);
      if (!box) return null;
      const width = box.maxX - box.minX;
      const height = box.maxY - box.minY;
      return {
        region,
        centerX: round((box.minX + box.maxX) / 2),
        centerY: round((box.minY + box.maxY) / 2),
        width: round(width),
        height: round(height),
        areaPct: round(width * height),
      };
    })
    .filter((item): item is PreviewEditContract["protectedGeometry"][number] =>
      item !== null
    );
}

/**
 * Phase 640 — anchor points derived from a landmark set. Extracted from
 * `buildPreviewEditContract` so the client-side compositor can compute
 * the SAME anchors on the AI-generated image (pts_new) and align them
 * against the contract's anchors from the original photo (pts_old).
 */
export function anchorsFromLandmarks(
  landmarks: Landmarks
): PreviewEditContract["anchors"] {
  return {
    rightEye: mid(landmarks, IDX.rightEyeOuter, IDX.rightEyeInner),
    leftEye: mid(landmarks, IDX.leftEyeOuter, IDX.leftEyeInner),
    rightBrow: point(landmarks, IDX.rightBrow),
    leftBrow: point(landmarks, IDX.leftBrow),
    noseTip: point(landmarks, IDX.noseTip),
    mouthCenter: mid(landmarks, IDX.mouthTop, IDX.mouthBottom),
    chin: point(landmarks, IDX.chin),
    rightJaw: point(landmarks, IDX.rightJaw),
    leftJaw: point(landmarks, IDX.leftJaw),
    rightCheek: point(landmarks, IDX.rightCheek),
    leftCheek: point(landmarks, IDX.leftCheek),
    forehead: point(landmarks, IDX.forehead),
  };
}

export function buildPreviewEditContract(
  procedure: ProcedureDef,
  landmarks: Landmarks,
  intensity: Intensity
): PreviewEditContract {
  const meta = previewRegionsForProcedure(procedure);
  const protectedRegions = protectedRegionsForTargets(meta.regions);
  const anchors = anchorsFromLandmarks(landmarks);
  const eyeMid = avg(anchors.rightEye, anchors.leftEye);
  const mouth = anchors.mouthCenter;
  const nose = anchors.noseTip;
  const faceWidth = dist(anchors.rightCheek, anchors.leftCheek);
  const faceHeight = dist(anchors.forehead, anchors.chin);
  return {
    version: "preview-lock-v1",
    targetRegions: meta.regions,
    global: meta.global,
    lockedAreas: lockedAreasForProcedure(procedure),
    targetGeometry: targetGeometry(meta.regions, landmarks),
    protectedGeometry: protectedGeometryForTargets(
      protectedRegions,
      meta.regions,
      landmarks
    ),
    anchors,
    ratios: {
      eyeToNose: round(dist(eyeMid, nose)),
      noseToMouth: round(dist(nose, mouth)),
      faceWidth: round(faceWidth),
      faceHeight: round(faceHeight),
      faceWidthToHeight: round(faceHeight > 0 ? faceWidth / faceHeight : 0),
    },
    parameters: parametersForProcedure(procedure.key, intensity),
    effects: [buildProcedureEffectPlan(procedure, landmarks, intensity)],
  };
}

export function mergePreviewEditContracts(
  contracts: readonly PreviewEditContract[]
): PreviewEditContract | null {
  const [first] = contracts;
  if (!first) return null;
  const targetRegions = [
    ...new Set(contracts.flatMap((item) => item.targetRegions)),
  ];
  return {
    ...first,
    targetRegions,
    global: contracts.some((item) => item.global),
    lockedAreas: [...new Set(contracts.flatMap((item) => item.lockedAreas))]
      .filter((area) => !lockedAreaTargetsRegion(area, targetRegions)),
    targetGeometry: mergeTargetGeometry(contracts),
    protectedGeometry: mergeProtectedGeometry(contracts, targetRegions),
    parameters: [...new Set(contracts.flatMap((item) => item.parameters))],
    effects: contracts.flatMap((item) => item.effects ?? []),
  };
}

export function previewEditContractPrompt(contract: PreviewEditContract): string {
  const permitsLocalVolume = contract.effects?.some((effect) =>
    LOCAL_VOLUME_KEYS.has(effect.procedureKey)
  ) ?? false;
  return [
    "LANDMARK LOCK:",
    `- Target regions only: ${contract.global ? "skin/face surface mask only" : contract.targetRegions.join(", ")}.`,
    `- Locked areas: ${contract.lockedAreas.join(", ")}.`,
    `- Target geometry: ${contract.targetGeometry.map(formatTargetGeometry).join("; ")}.`,
    `- Preserve ratios: eye_to_nose=${contract.ratios.eyeToNose}, nose_to_mouth=${contract.ratios.noseToMouth}, face_w=${contract.ratios.faceWidth}, face_h=${contract.ratios.faceHeight}, face_w_h=${contract.ratios.faceWidthToHeight}.`,
    `- Procedure parameters: ${contract.parameters.join("; ")}.`,
    ...(contract.effects?.length
      ? [`- Selected procedures: ${contract.effects.map((item) => `${item.procedureKey}:${item.intensity}`).join(", ")}.`]
      : []),
    permitsLocalVolume
      ? "- Face fullness lock: never make the whole face wider, rounder, heavier, or puffier. Local volume is allowed only inside the selected treatment region."
      : "- Face fullness lock: no wider, rounder, heavier, puffier, or higher body-fat result. Lower-face targets may only stay the same or become slightly leaner.",
    "- Facial hair/shaving lock: preserve clean-shaven, mustache, beard, goatee, soul patch, stubble, and sideburn state exactly from the source; never add, darken, remove, or restyle facial hair.",
    "- If a mask reference is provided, use it only as a technical editable-area selector; never reproduce mask colors, white patches, paint marks, dots, or guide artifacts in the final image.",
  ].join("\n");
}

const LOCAL_VOLUME_KEYS = new Set<ProcedureKey>([
  "nose_filler",
  "filler_tear_trough",
  "filler_chin",
  "midface_support_filler",
  "forehead_volume_consult",
  "temple_filler",
]);

function lockedAreaTargetsRegion(
  area: string,
  targetRegions: readonly FaceRegionKey[]
): boolean {
  const value = area.toLowerCase();
  const targets = new Set(targetRegions);
  const targetsWholeEye = targets.has("leftEye") || targets.has("rightEye");
  const targetsEyelid =
    targets.has("leftUpperEyelid") || targets.has("rightUpperEyelid");
  const targetsCanthus =
    targets.has("leftOuterCanthus") || targets.has("rightOuterCanthus");
  if (/(iris|pupil|gaze)/.test(value) &&
      (targets.has("leftIris") || targets.has("rightIris"))) return true;
  if (/eyelid/.test(value) && (targetsWholeEye || targetsEyelid)) return true;
  if (
    /(^eyes?$|eye shape|canthus)/.test(value.trim()) &&
    (targetsWholeEye || targetsCanthus)
  ) return true;
  if (/brow/.test(value) &&
      (targets.has("leftBrow") || targets.has("rightBrow"))) return true;
  if (/nose/.test(value) && targets.has("nose")) return true;
  if (/(mouth|lip)/.test(value) && targets.has("lips")) return true;
  if (/chin/.test(value) && targets.has("chin")) return true;
  if (/cheek/.test(value) &&
      (targets.has("cheekLeft") || targets.has("cheekRight"))) return true;
  if (/forehead/.test(value) && targets.has("forehead")) return true;
  if (/(jaw|face outline|face structure|lower-face)/.test(value) &&
      (targets.has("chin") || targets.has("cheekLeft") || targets.has("cheekRight"))) return true;
  return false;
}

export function isPreviewEditContract(value: unknown): value is PreviewEditContract {
  if (!isRecord(value)) return false;
  if (value.version !== "preview-lock-v1") return false;
  if (!Array.isArray(value.targetRegions) || !Array.isArray(value.lockedAreas)) return false;
  if (!Array.isArray(value.targetGeometry)) return false;
  if (!Array.isArray(value.protectedGeometry)) return false;
  if (!isRecord(value.anchors) || !isRecord(value.ratios)) return false;
  if (!Array.isArray(value.parameters)) return false;
  if (value.effects !== undefined && !Array.isArray(value.effects)) return false;
  return (
    value.targetRegions.every((item) => typeof item === "string") &&
    value.lockedAreas.every((item) => typeof item === "string") &&
    value.targetGeometry.every(isTargetGeometryItem) &&
    value.protectedGeometry.every(isTargetGeometryItem) &&
    value.parameters.every((item) => typeof item === "string") &&
    (value.effects === undefined || value.effects.every(isProcedureEffectPlan)) &&
    typeof value.global === "boolean"
  );
}

function isProcedureEffectPlan(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    typeof value.procedureKey !== "string" ||
    typeof value.intensity !== "string" ||
    typeof value.engine !== "string" ||
    !Array.isArray(value.geometry) ||
    !Array.isArray(value.appearance)
  ) {
    return false;
  }
  return (
    value.geometry.every((item) =>
      hasNumericFields(item, ["x", "y", "dx", "dy", "radiusX", "radiusY"])
    ) &&
    value.appearance.every((item) =>
      isRecord(item) &&
      typeof item.kind === "string" &&
      hasNumericFields(item, [
        "centerX",
        "centerY",
        "radiusX",
        "radiusY",
        "rotation",
        "strength",
      ])
    )
  );
}

function hasNumericFields(value: unknown, fields: readonly string[]): boolean {
  return isRecord(value) && fields.every((field) => typeof value[field] === "number");
}

function isTargetGeometryItem(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.region === "string" &&
    typeof value.centerX === "number" &&
    typeof value.centerY === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    typeof value.areaPct === "number"
  );
}

function targetGeometry(
  regions: readonly FaceRegionKey[],
  landmarks: Landmarks
): PreviewEditContract["targetGeometry"] {
  return regions.flatMap((region) => {
    if (region === "leftNasolabial" || region === "rightNasolabial") {
      return nasolabialBandGeometry(region, landmarks);
    }
    const box = normalizedBox(REGION_INDICES[region], landmarks);
    if (!box) return [];
    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;
    return [{
      region,
      centerX: round((box.minX + box.maxX) / 2),
      centerY: round((box.minY + box.maxY) / 2),
      width: round(width),
      height: round(height),
      areaPct: round(width * height),
    }];
  });
}

function nasolabialBandGeometry(
  region: "leftNasolabial" | "rightNasolabial",
  landmarks: Landmarks
): PreviewEditContract["targetGeometry"] {
  const [startIndex, endIndex] = region === "leftNasolabial"
    ? [358, 291]
    : [129, 61];
  const start = point(landmarks, startIndex);
  const end = point(landmarks, endIndex);
  const measuredFaceWidth = dist(point(landmarks, 234), point(landmarks, 454));
  const measuredFaceHeight = dist(point(landmarks, 10), point(landmarks, 152));
  const faceWidth = measuredFaceWidth > 0.01 ? measuredFaceWidth : 0.36;
  const faceHeight = measuredFaceHeight > 0.01 ? measuredFaceHeight : 0.45;
  const width = round(faceWidth * 0.045);
  const height = round(faceHeight * 0.045);
  return [0.2, 0.4, 0.6, 0.8].map((progress) => ({
    region,
    centerX: round(start.x + (end.x - start.x) * progress),
    centerY: round(start.y + (end.y - start.y) * progress),
    width,
    height,
    areaPct: roundFine(width * height),
  }));
}

function mergeTargetGeometry(
  contracts: readonly PreviewEditContract[]
): PreviewEditContract["targetGeometry"] {
  const byRegion = new Map<FaceRegionKey, PreviewEditContract["targetGeometry"]>();
  for (const contract of contracts) {
    const regions = new Set(contract.targetGeometry.map((item) => item.region));
    for (const region of regions) {
      byRegion.set(
        region,
        contract.targetGeometry.filter((item) => item.region === region)
      );
    }
  }
  return [...byRegion.values()].flat();
}

function mergeProtectedGeometry(
  contracts: readonly PreviewEditContract[],
  mergedTargetRegions: readonly FaceRegionKey[]
): PreviewEditContract["protectedGeometry"] {
  const byRegion = new Map<FaceRegionKey, PreviewEditContract["protectedGeometry"][number]>();
  for (const contract of contracts) {
    for (const item of contract.protectedGeometry) {
      byRegion.set(item.region, item);
    }
  }
  // A region protected by one procedure but targeted by another in the
  // same combo must not stay protected — the combo IS editing it.
  for (const region of mergedTargetRegions) {
    byRegion.delete(region);
  }
  return [...byRegion.values()];
}

function formatTargetGeometry(
  item: PreviewEditContract["targetGeometry"][number]
): string {
  return `${item.region}(cx=${item.centerX}, cy=${item.centerY}, w=${item.width}, h=${item.height}, area=${item.areaPct})`;
}

function normalizedBox(
  indices: readonly number[],
  landmarks: Landmarks
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const points = indices
    .map((index) => landmarks[index])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (points.length === 0) return null;
  return points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxX: Math.max(acc.maxX, point.x),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: 1, minY: 1, maxX: 0, maxY: 0 }
  );
}

function lockedAreasForProcedure(procedure: ProcedureDef): string[] {
  if (
    isUnderEyeProcedureKey(procedure.key) ||
    procedure.key === "botox_crows_feet"
  ) {
    return [
      "eye shape",
      "eyelids",
      "iris size",
      "pupils",
      "gaze direction",
      "brows",
      "nose",
      "mouth",
      "jaw",
      "chin",
      "cheek volume",
      "facial hair/shaving state",
    ];
  }
  switch (procedure.category) {
    case "nose":
      return ["eyes", "brows", "mouth", "chin", "jawline", "face outline", "facial hair/shaving state"];
    case "jaw":
      if (procedure.key === "chin_augmentation" || procedure.key === "filler_chin" || procedure.key === "genioplasty_consult") {
        return ["eyes", "brows", "nose", "mouth", "skin texture", "facial hair/shaving state"];
      }
      return ["eyes", "brows", "nose", "mouth", "skin tone", "chin unless selected", "facial hair/shaving state"];
    case "eyes":
      return [
        "iris size",
        "pupils",
        "gaze direction",
        "nose",
        "mouth",
        "jaw",
        "chin",
        "cheek volume",
        "facial hair/shaving state",
      ];
    case "skin":
      return ["face structure", "eyes", "nose", "mouth", "jaw", "chin", "hair", "facial hair/shaving state"];
    case "lips":
      return ["eyes", "brows", "nose", "chin", "jaw", "skin tone", "facial hair/shaving state"];
    default:
      return ["identity", "face outline", "skin tone", "lighting", "background", "facial hair/shaving state"];
  }
}

function parametersForProcedure(key: ProcedureKey, intensity: Intensity): string[] {
  const mildOrMedium = intensity === "mild" ? "mild" : "medium";
  switch (key) {
    case "rhinoplasty":
    case "nose_filler":
      return [
        `bridge_height=${mildOrMedium}`,
        `tip_refinement=${mildOrMedium}`,
        "alar_width=unchanged",
        "nose_length=unchanged",
        "style=natural",
      ];
    case "tip_refinement":
      return ["bridge_height=unchanged", `tip_refinement=${mildOrMedium}`, "alar_width=unchanged", "nose_length=unchanged", "style=natural"];
    case "alar_reduction":
      return ["bridge_height=unchanged", "tip_refinement=mild", `alar_width=${intensity === "mild" ? "-5%" : "-10%"}`, "nose_length=unchanged", "style=natural"];
    case "chin_augmentation":
    case "genioplasty_consult":
      return ["view=frontal_direction_only", `lower_third_definition=${mildOrMedium}`, "chin_length=slightly_longer", "chin_width=slightly_tapered", "jaw_transition=smooth", "style=natural_only"];
    case "filler_chin":
      return ["view=frontal_direction_only", `chin_definition=${mildOrMedium}`, "chin_length=slightly_longer", "chin_width=slightly_tapered", "jaw_transition=smooth", "style=natural_only"];
    case "under_eye_rejuvenation":
    case "filler_tear_trough":
    case "under_eye_fat_repositioning":
    case "eye_bag_removal":
      return [
        "dark_circle_reduce=30-50%",
        "texture=smoother_but_realistic",
        "skin_tone=unchanged",
        "cheek_volume=unchanged",
        "eye_shape=unchanged",
        "eyelids=unchanged",
        "gaze=unchanged",
      ];
    case "double_eyelid":
      return [
        `upper_lid_crease=${mildOrMedium}`,
        "eye_aperture=unchanged",
        "canthi=unchanged",
        "gaze=unchanged",
        "brows=unchanged",
      ];
    case "canthoplasty":
      return [
        `outer_canthus_extension=${intensity === "mild" ? "1-2%" : "2-4%"}`,
        "direction=mild_upward",
        "inner_canthus=unchanged",
        "eyelids=unchanged",
        "gaze=unchanged",
      ];
    case "botox_crows_feet":
      return [
        "lateral_eye_lines=reduce_only",
        "eye_shape=unchanged",
        "brows=unchanged",
        "pores=preserve",
      ];
    case "jaw_reduction":
    case "v_line_surgery":
      return [
        `lower_jaw_width=${intensity === "mild" ? "-2%" : "-4%"}`,
        "cheekbone_width=unchanged",
        "chin_center=unchanged",
        "upper_face=unchanged",
      ];
    case "cheekbone_reduction":
      return [
        `zygoma_width=${intensity === "mild" ? "-2%" : "-4%"}`,
        "jaw_width=unchanged",
        "midface_height=unchanged",
      ];
    case "buccal_fat":
      return [
        `mid_cheek_fullness=${intensity === "mild" ? "mild_reduction" : "moderate_reduction"}`,
        "cheekbone_width=unchanged",
        "jaw_width=unchanged",
        "avoid_hollowing=true",
      ];
    case "thread_lift_consult":
      return [
        `lower_cheek_lift=${mildOrMedium}`,
        "direction=upward",
        "cheek_volume=unchanged",
        "jaw_width=unchanged",
      ];
    case "filler_nasolabial":
      return [
        "nasolabial_shadow=reduce_30-50%",
        "nose=unchanged",
        "lips=unchanged",
        "expression=unchanged",
      ];
    case "midface_support_filler":
      return [
        `upper_midface_support=${mildOrMedium}`,
        "direction=slightly_upward",
        "lower_cheek=unchanged",
        "jaw=unchanged",
      ];
    case "forehead_volume_consult":
      return [
        `central_forehead_volume=${mildOrMedium}`,
        "brows=unchanged",
        "hairline=unchanged",
        "temples=unchanged",
      ];
    case "temple_filler":
      return [
        `temple_volume=${mildOrMedium}`,
        "forehead=unchanged",
        "cheekbones=unchanged",
        "hairline=unchanged",
      ];
    case "botox_forehead":
      return [
        "horizontal_lines=reduce_only",
        "brow_position=unchanged",
        "pores=preserve",
        "whole_face_smoothing=off",
      ];
    case "skin_smoothing":
    case "skin_booster":
    case "rejuran":
    case "juvelook":
    case "pico_laser":
    case "acne_scar_removal":
      return ["texture=smoother_but_realistic", "acne_marks=reduce_not_erase_all", "skin_tone=unchanged", "pores=mild_reduction"];
    case "jawline_contour":
    case "jawline_filler":
    case "botox_masseter":
    case "facial_thinning":
      return [`face_width=${intensity === "mild" ? "-3% max" : "-5% max"}`, "jaw_angle=softer", "masseter_area=mild_reduction", "chin=unchanged_unless_selected"];
    default:
      return ["strength=mild_to_natural", "global_beauty=off", "unselected_anatomy=unchanged"];
  }
}

export function previewRegionsForProcedure(
  procedure: ProcedureDef
): { regions: FaceRegionKey[]; global: boolean } {
  switch (procedure.key) {
    case "body_fat_reduction":
      return { regions: [], global: true };
    case "chin_augmentation":
    case "filler_chin":
    case "genioplasty_consult":
    case "chin_dimpling_botox":
      return { regions: ["chin"], global: false };
    case "jawline_contour":
    case "jawline_filler":
    case "jaw_reduction":
    case "v_line_surgery":
    case "double_chin_liposuction":
    case "facial_thinning":
    case "lower_face_laxity_plan":
    case "ultrasound_rf_laxity_consult":
      return { regions: ["chin", "cheekLeft", "cheekRight"], global: false };
    case "cheekbone_reduction":
    case "botox_masseter":
    case "buccal_fat":
      return { regions: ["cheekLeft", "cheekRight"], global: false };
    case "thread_lift_consult":
      return { regions: ["chin", "cheekLeft", "cheekRight"], global: false };
    case "rhinoplasty":
    case "nose_filler":
    case "alar_reduction":
    case "tip_refinement":
    case "nasal_asymmetry_consult":
      return { regions: ["nose"], global: false };
    case "filler_tear_trough":
    case "under_eye_rejuvenation":
    case "under_eye_fat_repositioning":
    case "eye_bag_removal":
      return { regions: ["leftUnderEye", "rightUnderEye"], global: false };
    case "double_eyelid":
    case "upper_blepharoplasty_consult":
    case "ptosis_correction":
      return { regions: ["leftUpperEyelid", "rightUpperEyelid"], global: false };
    case "canthoplasty":
      return { regions: ["leftOuterCanthus", "rightOuterCanthus"], global: false };
    case "brow_lift":
    case "botox_glabellar":
      return { regions: ["forehead", "leftBrow", "rightBrow"], global: false };
    case "botox_forehead":
      return { regions: ["forehead"], global: false };
    case "botox_crows_feet":
      return { regions: ["leftCrowsFeet", "rightCrowsFeet"], global: false };
    case "lip_enhancement":
    case "filler_lip":
    case "lip_lift":
    case "lip_asymmetry_consult":
    case "smile_line_dental_consult":
    case "orthodontic_bite_consult":
    case "smile_design_veneers_consult":
    case "gummy_smile_botox":
      return { regions: ["lips"], global: false };
    case "temple_filler":
      return { regions: ["forehead", "cheekLeft", "cheekRight"], global: false };
    case "forehead_volume_consult":
      return { regions: ["forehead"], global: false };
    case "midface_support_filler":
      return { regions: ["cheekLeft", "cheekRight"], global: false };
    case "filler_nasolabial":
      return { regions: ["leftNasolabial", "rightNasolabial"], global: false };
    case "marionette_line_filler":
    case "facial_fat_grafting":
      return { regions: ["cheekLeft", "cheekRight", "lips"], global: false };
    case "hairline_balance_consult":
    case "hairline_restoration_consult":
      return { regions: ["forehead"], global: false };
    default:
      return procedure.category === "skin"
        ? { regions: [], global: true }
        : { regions: [], global: false };
  }
}

function isUnderEyeProcedureKey(key: ProcedureKey): boolean {
  return (
    key === "under_eye_rejuvenation" ||
    key === "filler_tear_trough" ||
    key === "under_eye_fat_repositioning" ||
    key === "eye_bag_removal"
  );
}

function point(landmarks: Landmarks, index: number): { x: number; y: number } {
  const p = landmarks[index];
  return { x: round(p?.x ?? 0), y: round(p?.y ?? 0) };
}

function mid(landmarks: Landmarks, a: number, b: number): { x: number; y: number } {
  return avg(point(landmarks, a), point(landmarks, b));
}

function avg(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: round((a.x + b.x) / 2), y: round((a.y + b.y) / 2) };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundFine(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
