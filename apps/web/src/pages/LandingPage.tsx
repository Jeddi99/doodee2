import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { Link } from "react-router-dom";
import { siteCopy, type Locale, type Market } from "../localization";
import { useLocale } from "../useLocale";
import Brand from "../Brand";
import {
  ArrowRight,
  Activity,
  BarChart3,
  Banknote,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Cpu,
  Database,
  Eye,
  FileText,
  Footprints,
  GraduationCap,
  Heart,
  Info,
  LockKeyhole,
  Mail,
  Menu,
  MousePointer2,
  MoveHorizontal,
  Scale,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  X,
} from "lucide-react";

const metricDefinitions = [
  {
    id: "midface",
    label: "Midface Ratio",
    detail: "Pupil distance / eye-to-lip height",
    x: 50,
    y: 43,
    scale: 1.62,
    view: "Front view",
    range: [0.75, 1.25],
    target: 1,
  },
  {
    id: "canthal",
    label: "Canthal Tilt",
    detail: "Roll-corrected outer eye angle",
    x: 50,
    y: 32,
    scale: 2.05,
    view: "Eye detail",
    range: [-2, 16],
    target: 7,
  },
  {
    id: "thirds",
    label: "Facial Thirds",
    detail: "Estimated upper / middle / lower",
    x: 50,
    y: 44,
    scale: 1.28,
    view: "Front view",
    range: [20, 46],
    target: 100 / 3,
  },
  {
    id: "fhwr",
    label: "FWHR",
    detail: "Face width / upper-eyelid-to-lip height",
    x: 50,
    y: 41,
    scale: 1.45,
    view: "Front view",
    range: [1.55, 2.25],
    target: 1.9,
  },
  {
    id: "esr",
    label: "Eye Separation Ratio (ESR)",
    detail: "Pupil distance / face width",
    x: 50,
    y: 33,
    scale: 1.85,
    view: "Eye detail",
    range: [36, 56],
    target: 46,
  },
  {
    id: "eyeaspect",
    label: "Eye Aspect Ratio",
    detail: "Eye width / eye aperture",
    x: 50,
    y: 32,
    scale: 2.05,
    view: "Eye detail",
    range: [2, 4],
    target: 3,
  },
  {
    id: "jawface",
    label: "Jaw-to-Face Width Ratio",
    detail: "Jaw width / face width",
    x: 50,
    y: 60,
    scale: 1.42,
    view: "Lower face",
    range: [0.6, 0.96],
    target: 0.78,
  },
  {
    id: "chinphiltrum",
    label: "Chin-to-Philtrum Ratio",
    detail: "Chin height / philtrum length",
    x: 50,
    y: 64,
    scale: 1.9,
    view: "Lower face",
    range: [1, 3],
    target: 2,
  },
  {
    id: "noseface",
    label: "Nose-to-Face Width Ratio",
    detail: "Alar width / face width",
    x: 50,
    y: 47,
    scale: 1.75,
    view: "Front view",
    range: [0.18, 0.34],
    target: 0.25,
  },
  {
    id: "mouthnose",
    label: "Lip / Mouth-to-Nose Ratio",
    detail: "Mouth width / nose width",
    x: 50,
    y: 56,
    scale: 1.9,
    view: "Mouth detail",
    range: [1.1, 1.9],
    target: 1.5,
  },
] as const;

type MetricId = (typeof metricDefinitions)[number]["id"];
type FaceMetric = (typeof metricDefinitions)[number] & {
  value: string;
  score: number;
  match: number;
};

const treatmentGroups = {
  Surgery: [
    { id: "rhinoplasty", label: "Rhinoplasty" },
    { id: "double-eyelid", label: "Double Eyelid" },
    { id: "chin-augmentation", label: "Chin Augmentation" },
    { id: "jaw-reduction", label: "Jaw Reduction" },
    { id: "facial-contouring", label: "Facial Contouring" },
  ],
  "Non-surgical": [
    { id: "masseter-botox", label: "Masseter Botox" },
    { id: "chin-filler", label: "Chin Filler" },
    { id: "lip-filler", label: "Lip Filler" },
    { id: "face-lifting", label: "Face Lifting" },
    { id: "skin-rejuvenation", label: "Skin Rejuvenation" },
  ],
};

type TreatmentGroup = keyof typeof treatmentGroups;
type TreatmentId = (typeof treatmentGroups)[TreatmentGroup][number]["id"];

type WarpMask = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  sx?: number;
  sy?: number;
  dx?: number;
  dy?: number;
  smooth?: boolean;
  light?: number;
  contour?: number;
};

const landmarkPoint = (
  landmarks: NormalizedLandmark[],
  index: number,
  width: number,
  height: number,
) => ({
  x: landmarks[index].x * width,
  y: landmarks[index].y * height,
});

const treatmentIds = Object.values(treatmentGroups)
  .flat()
  .map((treatment) => treatment.id) as TreatmentId[];

const treatmentCrop: Record<
  TreatmentId,
  { size: number; x: number; y: number }
> = {
  rhinoplasty: { size: 285, x: 50, y: 46 },
  "double-eyelid": { size: 240, x: 50, y: 38 },
  "chin-augmentation": { size: 235, x: 50, y: 61 },
  "jaw-reduction": { size: 190, x: 50, y: 55 },
  "facial-contouring": { size: 180, x: 50, y: 53 },
  "masseter-botox": { size: 190, x: 50, y: 55 },
  "chin-filler": { size: 235, x: 50, y: 61 },
  "lip-filler": { size: 275, x: 50, y: 55 },
  "face-lifting": { size: 180, x: 50, y: 53 },
  "skin-rejuvenation": { size: 150, x: 50, y: 46 },
};

function TreatmentAnatomy({ id }: { id: TreatmentId }) {
  const crop = treatmentCrop[id];
  const style = {
    "--anatomy-size": `${crop.size}px`,
    "--anatomy-x": `${crop.x}%`,
    "--anatomy-y": `${crop.y}%`,
  } as React.CSSProperties;
  return (
    <span className="treatment-anatomy" style={style} aria-hidden="true">
      <span className="treatment-anatomy__half treatment-anatomy__half--before">
        <span className="treatment-anatomy__photo treatment-anatomy__photo--before" />
      </span>
      <span className="treatment-anatomy__half treatment-anatomy__half--after">
        <span
          className="treatment-anatomy__photo treatment-anatomy__photo--after"
          style={{
            backgroundImage: `url(/assets/treatments/${id}${treatmentAssetVersion[id] ?? ""}.webp)`,
          }}
        />
      </span>
      <span className="treatment-anatomy__divider" />
    </span>
  );
}

function treatmentMasks(
  id: TreatmentId,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
): WarpMask[] {
  const left = landmarkPoint(landmarks, 234, width, height);
  const right = landmarkPoint(landmarks, 454, width, height);
  const top = landmarkPoint(landmarks, 10, width, height);
  const chin = landmarkPoint(landmarks, 152, width, height);
  const faceWidth = right.x - left.x;
  const faceHeight = chin.y - top.y;
  const p = (index: number) => landmarkPoint(landmarks, index, width, height);
  const pair = (
    a: number,
    b: number,
    rx: number,
    ry: number,
    transform: Partial<WarpMask>,
  ) => [
    {
      cx: p(a).x,
      cy: p(a).y,
      rx: faceWidth * rx,
      ry: faceHeight * ry,
      ...transform,
    },
    {
      cx: p(b).x,
      cy: p(b).y,
      rx: faceWidth * rx,
      ry: faceHeight * ry,
      ...transform,
    },
  ];

  switch (id) {
    case "rhinoplasty": {
      const root = p(168);
      const bridge = p(6);
      const tip = p(1);
      const leftAlar = p(98);
      const rightAlar = p(327);
      const alarWidth = Math.abs(rightAlar.x - leftAlar.x);
      return [
        {
          cx: (root.x + bridge.x) / 2,
          cy: (root.y + bridge.y) / 2,
          rx: faceWidth * 0.052,
          ry: Math.max(faceHeight * 0.07, Math.abs(bridge.y - root.y) * 0.92),
          sx: 0.78,
          light: 5,
        },
        {
          cx: (leftAlar.x + rightAlar.x) / 2,
          cy: (leftAlar.y + rightAlar.y) / 2,
          rx: alarWidth * 0.64,
          ry: faceHeight * 0.048,
          sx: 0.72,
          sy: 0.96,
        },
        {
          cx: tip.x,
          cy: tip.y + faceHeight * 0.006,
          rx: faceWidth * 0.065,
          ry: faceHeight * 0.058,
          sx: 0.78,
          sy: 1.055,
          dy: -faceHeight * 0.009,
          light: 3,
          contour: 2,
        },
      ];
    }
    case "double-eyelid":
      return pair(159, 386, 0.09, 0.032, {
        sy: 0.72,
        dy: -faceHeight * 0.012,
        light: 2,
        contour: 2,
      });
    case "chin-augmentation": {
      const center = p(152);
      return [
        {
          cx: center.x,
          cy: center.y - faceHeight * 0.055,
          rx: faceWidth * 0.14,
          ry: faceHeight * 0.088,
          sx: 1.05,
          sy: 1.12,
          dy: faceHeight * 0.016,
          light: 2,
        },
      ];
    }
    case "jaw-reduction": {
      const leftJaw = p(172);
      const rightJaw = p(397);
      return [
        {
          cx: leftJaw.x,
          cy: leftJaw.y,
          rx: faceWidth * 0.078,
          ry: faceHeight * 0.105,
          sx: 0.78,
          dx: faceWidth * 0.022,
        },
        {
          cx: rightJaw.x,
          cy: rightJaw.y,
          rx: faceWidth * 0.078,
          ry: faceHeight * 0.105,
          sx: 0.78,
          dx: -faceWidth * 0.022,
        },
      ];
    }
    case "facial-contouring": {
      const leftJaw = p(172);
      const rightJaw = p(397);
      return [
        {
          cx: leftJaw.x,
          cy: leftJaw.y,
          rx: faceWidth * 0.072,
          ry: faceHeight * 0.102,
          sx: 0.8,
          sy: 1.04,
          dx: faceWidth * 0.02,
        },
        {
          cx: rightJaw.x,
          cy: rightJaw.y,
          rx: faceWidth * 0.072,
          ry: faceHeight * 0.102,
          sx: 0.8,
          sy: 1.04,
          dx: -faceWidth * 0.02,
        },
        ...pair(123, 352, 0.06, 0.068, { sx: 0.86, dy: -faceHeight * 0.012 }),
      ];
    }
    case "masseter-botox": {
      const leftJaw = p(172);
      const rightJaw = p(397);
      return [
        {
          cx: leftJaw.x,
          cy: leftJaw.y - faceHeight * 0.025,
          rx: faceWidth * 0.082,
          ry: faceHeight * 0.105,
          sx: 0.88,
          dx: faceWidth * 0.012,
        },
        {
          cx: rightJaw.x,
          cy: rightJaw.y - faceHeight * 0.025,
          rx: faceWidth * 0.082,
          ry: faceHeight * 0.105,
          sx: 0.88,
          dx: -faceWidth * 0.012,
        },
      ];
    }
    case "chin-filler": {
      const center = p(152);
      return [
        {
          cx: center.x,
          cy: center.y - faceHeight * 0.05,
          rx: faceWidth * 0.12,
          ry: faceHeight * 0.078,
          sx: 1.045,
          sy: 1.095,
          dy: faceHeight * 0.012,
          light: 2,
        },
      ];
    }
    case "lip-filler": {
      const mouth = p(13);
      return [
        {
          cx: mouth.x,
          cy: mouth.y + faceHeight * 0.018,
          rx: faceWidth * 0.12,
          ry: faceHeight * 0.046,
          sx: 1.045,
          sy: 1.17,
          light: 2,
        },
      ];
    }
    case "face-lifting": {
      const leftCheek = p(123);
      const rightCheek = p(352);
      return [
        {
          cx: leftCheek.x,
          cy: leftCheek.y,
          rx: faceWidth * 0.09,
          ry: faceHeight * 0.115,
          sx: 0.91,
          sy: 0.94,
          dx: faceWidth * 0.01,
          dy: -faceHeight * 0.022,
        },
        {
          cx: rightCheek.x,
          cy: rightCheek.y,
          rx: faceWidth * 0.09,
          ry: faceHeight * 0.115,
          sx: 0.91,
          sy: 0.94,
          dx: -faceWidth * 0.01,
          dy: -faceHeight * 0.022,
        },
      ];
    }
    case "skin-rejuvenation":
      return [
        ...pair(117, 346, 0.085, 0.105, { smooth: true }),
        {
          cx: p(10).x,
          cy: p(10).y + faceHeight * 0.13,
          rx: faceWidth * 0.13,
          ry: faceHeight * 0.062,
          smooth: true,
        },
      ];
  }
  return [];
}

function renderTreatmentPixels(source: ImageData, masks: WarpMask[]) {
  const { width, height, data } = source;
  const output = new ImageData(new Uint8ClampedArray(data), width, height);
  const sample = (x: number, y: number, channel: number) =>
    data[
      (Math.max(0, Math.min(height - 1, y)) * width +
        Math.max(0, Math.min(width - 1, x))) *
        4 +
        channel
    ];
  const bilinear = (x: number, y: number, channel: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = x - x0;
    const ty = y - y0;
    const top =
      sample(x0, y0, channel) * (1 - tx) + sample(x0 + 1, y0, channel) * tx;
    const bottom =
      sample(x0, y0 + 1, channel) * (1 - tx) +
      sample(x0 + 1, y0 + 1, channel) * tx;
    return top * (1 - ty) + bottom * ty;
  };
  const smoothstep = (edge0: number, edge1: number, value: number) => {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };

  masks.forEach((mask) => {
    const x0 = Math.max(0, Math.floor(mask.cx - mask.rx));
    const x1 = Math.min(width - 1, Math.ceil(mask.cx + mask.rx));
    const y0 = Math.max(0, Math.floor(mask.cy - mask.ry));
    const y1 = Math.min(height - 1, Math.ceil(mask.cy + mask.ry));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const nx = (x - mask.cx) / mask.rx;
        const ny = (y - mask.cy) / mask.ry;
        const distance = Math.sqrt(nx * nx + ny * ny);
        if (distance >= 1) continue;
        const feather = smoothstep(0, 1, (1 - distance) / 0.42);
        const out = (y * width + x) * 4;
        if (mask.smooth) {
          if (feather < 0.58) continue;
          const candidates = [
            [x, y],
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
          ];
          const target = [0, 1, 2].map(
            (channel) =>
              candidates.reduce(
                (sum, point) => sum + sample(point[0], point[1], channel),
                0,
              ) / candidates.length,
          );
          const best = candidates.reduce(
            (current, point) => {
              const score = [0, 1, 2].reduce(
                (sum, channel) =>
                  sum +
                  Math.abs(
                    sample(point[0], point[1], channel) - target[channel],
                  ),
                0,
              );
              return score < current.score ? { point, score } : current;
            },
            { point: candidates[0], score: Number.POSITIVE_INFINITY },
          );
          for (let c = 0; c < 4; c += 1)
            output.data[out + c] = sample(best.point[0], best.point[1], c);
        } else {
          const strength = feather;
          const sx = 1 + ((mask.sx ?? 1) - 1) * strength;
          const sy = 1 + ((mask.sy ?? 1) - 1) * strength;
          const sourceX =
            mask.cx + (x - mask.cx - (mask.dx ?? 0) * strength) / sx;
          const sourceY =
            mask.cy + (y - mask.cy - (mask.dy ?? 0) * strength) / sy;
          for (let c = 0; c < 4; c += 1) {
            const warped = bilinear(sourceX, sourceY, c);
            const lighting = c < 3 ? (mask.light ?? 0) * strength : 0;
            const edgeShade =
              c < 3
                ? (mask.contour ?? 0) *
                  Math.max(0, Math.abs(nx) - 0.3) *
                  strength
                : 0;
            output.data[out + c] = Math.round(
              data[out + c] * (1 - strength) +
                warped * strength +
                lighting -
                edgeShade,
            );
          }
        }
      }
    }
  });
  return output;
}

function treatmentPixelStats(source: ImageData, output: ImageData) {
  const { width, height } = source;
  let changed = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let hash = 2166136261;
  let delta = 0;
  for (let index = 0; index < source.data.length; index += 4) {
    const differs =
      source.data[index] !== output.data[index] ||
      source.data[index + 1] !== output.data[index + 1] ||
      source.data[index + 2] !== output.data[index + 2];
    if (differs) {
      const pixel = index / 4;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      changed += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      delta +=
        Math.abs(source.data[index] - output.data[index]) +
        Math.abs(source.data[index + 1] - output.data[index + 1]) +
        Math.abs(source.data[index + 2] - output.data[index + 2]);
    }
    for (let channel = 0; channel < 3; channel += 1) {
      hash ^= output.data[index + channel];
      hash = Math.imul(hash, 16777619);
    }
  }
  return {
    changedPct: (changed / (width * height)) * 100,
    unchangedPct: 100 - (changed / (width * height)) * 100,
    bounds: changed ? [minX, minY, maxX, maxY] : [],
    changedPixels: changed,
    meanChangedDelta: changed ? delta / (changed * 3) : 0,
    hash: (hash >>> 0).toString(16),
  };
}

async function runTreatmentLoopTest(image: HTMLImageElement, rounds = 99) {
  const surface = document.createElement("canvas");
  surface.width = image.naturalWidth;
  surface.height = image.naturalHeight;
  const context = surface.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(image, 0, 0);
  const source = context.getImageData(0, 0, surface.width, surface.height);
  const landmarks = (await getFaceLandmarker()).detect(image).faceLandmarks[0];
  if (!landmarks) throw new Error("Face landmarks unavailable");
  const results = treatmentIds.map((id) => ({
    id,
    runs: [] as ReturnType<typeof treatmentPixelStats>[],
  }));
  for (let round = 0; round < rounds; round += 1) {
    results.forEach((result) => {
      const output = renderTreatmentPixels(
        source,
        treatmentMasks(result.id, landmarks, surface.width, surface.height),
      );
      result.runs.push(treatmentPixelStats(source, output));
    });
  }
  return results.map((result) => ({
    id: result.id,
    rounds: result.runs.length,
    minIdentity: Math.min(...result.runs.map((run) => run.unchangedPct)),
    minChangedPixels: Math.min(...result.runs.map((run) => run.changedPixels)),
    minMeanDelta: Math.min(...result.runs.map((run) => run.meanChangedDelta)),
    deterministic: new Set(result.runs.map((run) => run.hash)).size === 1,
    stableBounds:
      new Set(result.runs.map((run) => run.bounds.join(","))).size === 1,
  }));
}

declare global {
  interface Window {
    runTreatmentLoopTest?: (rounds?: number) => Promise<unknown>;
  }
}

type FeatherRegion = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  feather?: number;
  opacity?: number;
};

const treatmentFeatherRegions: Record<TreatmentId, FeatherRegion[]> = {
  rhinoplasty: [
    { x: 0.5, y: 0.445, rx: 0.064, ry: 0.105, feather: 0.44 },
    { x: 0.5, y: 0.498, rx: 0.09, ry: 0.06, feather: 0.48 },
  ],
  "double-eyelid": [
    { x: 0.405, y: 0.392, rx: 0.105, ry: 0.048, feather: 0.62 },
    { x: 0.595, y: 0.392, rx: 0.105, ry: 0.048, feather: 0.62 },
  ],
  "chin-augmentation": [
    { x: 0.5, y: 0.632, rx: 0.15, ry: 0.075, feather: 0.45 },
  ],
  "jaw-reduction": [
    { x: 0.34, y: 0.59, rx: 0.13, ry: 0.15, feather: 0.58 },
    { x: 0.66, y: 0.59, rx: 0.13, ry: 0.15, feather: 0.58 },
  ],
  "facial-contouring": [
    { x: 0.35, y: 0.55, rx: 0.09, ry: 0.13, feather: 0.6 },
    { x: 0.65, y: 0.55, rx: 0.09, ry: 0.13, feather: 0.6 },
    { x: 0.5, y: 0.625, rx: 0.135, ry: 0.06, feather: 0.62 },
  ],
  "masseter-botox": [
    { x: 0.35, y: 0.58, rx: 0.075, ry: 0.105, feather: 0.6 },
    { x: 0.65, y: 0.58, rx: 0.075, ry: 0.105, feather: 0.6 },
  ],
  "chin-filler": [{ x: 0.5, y: 0.632, rx: 0.142, ry: 0.064, feather: 0.48 }],
  "lip-filler": [{ x: 0.5, y: 0.548, rx: 0.127, ry: 0.05, feather: 0.45 }],
  "face-lifting": [
    { x: 0.35, y: 0.55, rx: 0.09, ry: 0.135, feather: 0.62 },
    { x: 0.65, y: 0.55, rx: 0.09, ry: 0.135, feather: 0.62 },
  ],
  "skin-rejuvenation": [
    { x: 0.36, y: 0.475, rx: 0.11, ry: 0.12, feather: 0.48, opacity: 0.9 },
    { x: 0.64, y: 0.475, rx: 0.11, ry: 0.12, feather: 0.48, opacity: 0.9 },
    { x: 0.5, y: 0.35, rx: 0.18, ry: 0.095, feather: 0.48, opacity: 0.9 },
    { x: 0.5, y: 0.575, rx: 0.16, ry: 0.08, feather: 0.48, opacity: 0.78 },
  ],
};

const treatmentAssetVersion: Partial<Record<TreatmentId, string>> = {
  rhinoplasty: "-v3",
  "lip-filler": "-v3",
  "chin-filler": "-v3",
  "chin-augmentation": "-v3",
  "jaw-reduction": "-v4",
  "skin-rejuvenation": "-v3",
};

function paintFeatherMask(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  regions: FeatherRegion[],
) {
  context.clearRect(0, 0, width, height);
  regions.forEach((region) => {
    const cx = region.x * width;
    const cy = region.y * height;
    const rx = region.rx * width;
    const ry = region.ry * height;
    const featherStart = Math.max(
      0,
      Math.min(0.9, 1 - (region.feather ?? 0.55)),
    );
    const opacity = region.opacity ?? 1;
    context.save();
    context.translate(cx, cy);
    context.scale(rx, ry);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, `rgba(255,255,255,${opacity})`);
    gradient.addColorStop(featherStart, `rgba(255,255,255,${opacity})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, 1, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });
}

function protectUntreatedFeatures(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  treatmentId: TreatmentId,
) {
  const protectedRegions: FeatherRegion[] = [];
  if (treatmentId !== "lip-filler")
    protectedRegions.push({ x: 0.5, y: 0.548, rx: 0.145, ry: 0.058 });
  if (treatmentId === "jaw-reduction")
    protectedRegions.push({ x: 0.5, y: 0.64, rx: 0.125, ry: 0.07 });
  if (treatmentId === "skin-rejuvenation") {
    protectedRegions.push(
      { x: 0.405, y: 0.392, rx: 0.125, ry: 0.062 },
      { x: 0.595, y: 0.392, rx: 0.125, ry: 0.062 },
      { x: 0.5, y: 0.475, rx: 0.095, ry: 0.135 },
    );
  }
  if (!protectedRegions.length) return;
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = "#fff";
  protectedRegions.forEach((region) => {
    context.beginPath();
    context.ellipse(
      region.x * width,
      region.y * height,
      region.rx * width,
      region.ry * height,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  });
  context.restore();
}

function neutralizeColorCast(
  source: ImageData,
  treatment: ImageData,
  regions: FeatherRegion[],
) {
  const { width, height } = source;
  const sums = [0, 0, 0];
  let samples = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const inside = regions.some((region) => {
        const nx = (x / width - region.x) / region.rx;
        const ny = (y / height - region.y) / region.ry;
        return nx * nx + ny * ny < 0.36;
      });
      if (!inside) continue;
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1)
        sums[channel] +=
          treatment.data[index + channel] - source.data[index + channel];
      samples += 1;
    }
  }
  if (!samples) return treatment;
  const offsets = sums.map((sum) => sum / samples);
  const corrected = new ImageData(
    new Uint8ClampedArray(treatment.data),
    width,
    height,
  );
  for (let index = 0; index < corrected.data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1)
      corrected.data[index + channel] = Math.max(
        0,
        Math.min(255, corrected.data[index + channel] - offsets[channel]),
      );
  }
  return corrected;
}

function TreatmentCanvas({ treatmentId }: { treatmentId: TreatmentId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });

    Promise.all([
      loadImage("/assets/treatment-preview-face.webp"),
      loadImage(
        `/assets/treatments/${treatmentId}${treatmentAssetVersion[treatmentId] ?? ""}.webp`,
      ),
    ])
      .then(([sourceImage, treatmentImage]) => {
        if (cancelled) return;
        frame = window.requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const mobile = window.matchMedia("(max-width: 520px)").matches;
        const width = mobile
          ? Math.min(640, sourceImage.naturalWidth)
          : sourceImage.naturalWidth;
        canvas.width = width;
        canvas.height = Math.round(
          sourceImage.naturalHeight * (width / sourceImage.naturalWidth),
        );
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
        const source = context.getImageData(0, 0, canvas.width, canvas.height);

        const overlay = document.createElement("canvas");
        overlay.width = canvas.width;
        overlay.height = canvas.height;
        const overlayContext = overlay.getContext("2d");
        const mask = document.createElement("canvas");
        mask.width = canvas.width;
        mask.height = canvas.height;
        const maskContext = mask.getContext("2d");
        if (!overlayContext || !maskContext) return;

        overlayContext.drawImage(
          treatmentImage,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        const treatmentPixels = overlayContext.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        );
        overlayContext.putImageData(
          neutralizeColorCast(
            source,
            treatmentPixels,
            treatmentFeatherRegions[treatmentId],
          ),
          0,
          0,
        );
        paintFeatherMask(
          maskContext,
          canvas.width,
          canvas.height,
          treatmentFeatherRegions[treatmentId],
        );
        protectUntreatedFeatures(
          maskContext,
          canvas.width,
          canvas.height,
          treatmentId,
        );
        overlayContext.globalCompositeOperation = "destination-in";
        overlayContext.drawImage(mask, 0, 0);
        overlayContext.globalCompositeOperation = "source-over";
        context.drawImage(overlay, 0, 0);

        const output = context.getImageData(0, 0, canvas.width, canvas.height);
        const stats = treatmentPixelStats(source, output);
        canvas.dataset.treatmentReady = "true";
        canvas.dataset.previewMode = "ai-feather-blend";
        canvas.dataset.changedPct = stats.changedPct.toFixed(4);
        canvas.dataset.unchangedPct = stats.unchangedPct.toFixed(4);
        canvas.dataset.changedBounds = stats.bounds.join(",");
        canvas.dataset.changedPixels = String(stats.changedPixels);
        canvas.dataset.meanChangedDelta = stats.meanChangedDelta.toFixed(4);
        canvas.dataset.pixelHash = stats.hash;
        setReady(true);
        });
      })
      .catch(() => {
        const canvas = canvasRef.current;
        if (canvas) canvas.dataset.treatmentReady = "error";
      });
    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [treatmentId]);

  return (
    <canvas
      ref={canvasRef}
      className={ready ? "is-ready" : ""}
      data-treatment-id={treatmentId}
      aria-label={`${treatmentId} identity-preserving preview`}
    />
  );
}

window.runTreatmentLoopTest = (rounds = 99) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.src = "/assets/treatment-preview-face.webp";
    image.onload = () =>
      runTreatmentLoopTest(image, rounds).then(resolve, reject);
    image.onerror = reject;
  });

const proofItems = [
  ["2,000+", "users"],
  ["Treatment", "preview"],
  ["Personalized", "improvement plan"],
  ["Secure", "processing · your data stays private"],
] as const;

const proofItemsTh = [
  ["2,000+ คน", "ผู้ใช้งาน"],
  ["85+ จุด", "วิเคราะห์เชิงลึก"],
  ["ดูภาพจำลอง", "ก่อนตัดสินใจ"],
  ["คำแนะนำเฉพาะบุคคล", "เพื่อการวางแผนที่เหมาะกับคุณ"],
] as const;

const faqs = [
  [
    "Is DOODEE a medical tool?",
    "No. DOODEE provides educational analysis and illustrative previews. It does not diagnose conditions or replace advice from a qualified professional.",
  ],
  [
    "What does the aesthetic preview show?",
    "It helps you explore possible visual directions before a consultation. It is not a prediction or guarantee of a real-world outcome.",
  ],
  [
    "Do I need perfect photos?",
    "No. Guided capture checks lighting, angle and face visibility before the analysis begins.",
  ],
  [
    "How is my privacy protected?",
    "The experience is designed around user control, clear consent and deletion. This prototype demonstrates the intended privacy model.",
  ],
  [
    "Can I share my plan with a professional?",
    "Yes. The complete plan is designed to become a practical brief for a clinic, dermatologist, stylist or other qualified professional.",
  ],
  [
    "Why is the reference population Thai?",
    "Appearance decisions should sit in the user's own context rather than borrow one standard for every market. Comparisons use mean and SD from 240 Thai adults aged 18–35.",
  ],
] as const;

const faqsTh = [
  [
    "DOODEE เป็นเครื่องมือทางการแพทย์หรือไม่?",
    "ไม่ใช่ DOODEE เป็นเครื่องมือช่วยให้คุณทำความเข้าใจข้อมูลเกี่ยวกับใบหน้าและดูภาพจำลองเพื่อประกอบการตัดสินใจ โดยไม่ได้ใช้สำหรับการวินิจฉัยหรือทดแทนคำแนะนำจากแพทย์และผู้เชี่ยวชาญ",
  ],
  [
    "ภาพจำลองบอกผลลัพธ์จริงได้แค่ไหน?",
    "ภาพจำลองใช้เปรียบเทียบทิศทางที่อาจเป็นไปได้ก่อนเข้าปรึกษา ไม่ใช่การทำนายหรือรับประกันผลลัพธ์หลังทำหัตถการ",
  ],
  [
    "ต้องถ่ายภาพแบบสตูดิโอหรือไม่?",
    "ไม่จำเป็น ระบบจะช่วยตรวจแสง มุมกล้อง และตำแหน่งใบหน้า เพื่อให้ภาพพร้อมสำหรับการวิเคราะห์",
  ],
  [
    "ใครเป็นผู้ควบคุมข้อมูลของฉัน?",
    "คุณเป็นผู้ควบคุมข้อมูลและการให้ความยินยอม รวมถึงเลือกจัดการหรือลบข้อมูลของตัวเองได้",
  ],
  [
    "นำผลวิเคราะห์ไปใช้ตอนปรึกษาได้อย่างไร?",
    "รายงาน Complete รวบรวมผลวิเคราะห์ เป้าหมาย และคำถามสำคัญไว้ให้คุณใช้คุยกับคลินิกหรือผู้เชี่ยวชาญได้ตรงประเด็นขึ้น",
  ],
  [
    "ทำไมใช้ค่าอ้างอิงจากคนไทย?",
    "เพราะการตัดสินใจเรื่องรูปลักษณ์ควรสัมพันธ์กับบริบทของผู้ใช้เอง ไม่ใช่ยืมกรอบเดียวมาใช้กับทุกตลาด การเปรียบเทียบใช้ค่าเฉลี่ยและส่วนเบี่ยงเบนจากคนไทย 240 คน อายุ 18–35 ปี",
  ],
] as const;

const metricCopyTh: Record<
  MetricId,
  { label: string; detail: string; view: string }
> = {
  midface: {
    label: "อัตราส่วนช่วงกลางใบหน้า",
    detail: "ระยะรูม่านตาเทียบกับความสูงช่วงตาถึงริมฝีปาก",
    view: "หน้าตรง",
  },
  canthal: {
    label: "องศาหางตา",
    detail: "องศาหางตาหลังปรับแนวใบหน้าให้ตรง",
    view: "บริเวณดวงตา",
  },
  thirds: {
    label: "สัดส่วนใบหน้า 3 ส่วน",
    detail: "ช่วงบน ช่วงกลาง และช่วงล่างของใบหน้า",
    view: "หน้าตรง",
  },
  fhwr: {
    label: "อัตราส่วนกว้างต่อสูงของใบหน้า",
    detail: "ความกว้างใบหน้าเทียบกับช่วงเปลือกตาถึงริมฝีปาก",
    view: "หน้าตรง",
  },
  esr: {
    label: "อัตราส่วนระยะห่างดวงตา",
    detail: "ระยะรูม่านตาเทียบกับความกว้างใบหน้า",
    view: "บริเวณดวงตา",
  },
  eyeaspect: {
    label: "อัตราส่วนรูปทรงดวงตา",
    detail: "ความกว้างดวงตาเทียบกับความสูงของตา",
    view: "บริเวณดวงตา",
  },
  jawface: {
    label: "สัดส่วนกรามต่อใบหน้า",
    detail: "ความกว้างกรามเทียบกับความกว้างใบหน้า",
    view: "ใบหน้าช่วงล่าง",
  },
  chinphiltrum: {
    label: "สัดส่วนคางต่อร่องริมฝีปาก",
    detail: "ความสูงคางเทียบกับความยาวร่องริมฝีปาก",
    view: "ใบหน้าช่วงล่าง",
  },
  noseface: {
    label: "สัดส่วนจมูกต่อใบหน้า",
    detail: "ความกว้างปีกจมูกเทียบกับความกว้างใบหน้า",
    view: "หน้าตรง",
  },
  mouthnose: {
    label: "สัดส่วนความกว้างปากต่อจมูก",
    detail: "ความกว้างปากเทียบกับความกว้างจมูก",
    view: "บริเวณริมฝีปาก",
  },
};

const treatmentCopyTh: Record<TreatmentId, string> = {
  rhinoplasty: "ปรับทรงจมูก",
  "double-eyelid": "ทำตาสองชั้น",
  "chin-augmentation": "เสริมคาง",
  "jaw-reduction": "ลดกราม",
  "facial-contouring": "ปรับรูปหน้า",
  "masseter-botox": "โบท็อกซ์กราม",
  "chin-filler": "ฟิลเลอร์คาง",
  "lip-filler": "ฟิลเลอร์ปาก",
  "face-lifting": "ยกกระชับใบหน้า",
  "skin-rejuvenation": "ฟื้นฟูผิว",
};

const appearanceEvidence = [
  {
    id: "finances",
    label: "Finances",
    stat: "Looks reach your paycheck",
    unit: "5–10% wage penalty linked with below-average looks",
    icon: Banknote,
    hook: "Looks can show up on the payslip.",
    detail:
      "Labor-market research found appearance-linked differences in earnings. A later experiment identified confidence, perceived ability and communication skills as possible channels behind part of the premium.",
    caveat:
      "Association and experimental mechanisms do not mean appearance determines anyone’s income.",
    source: "Beauty and the Labor Market · NBER",
    href: "https://www.nber.org/papers/w4518",
  },
  {
    id: "dating",
    label: "Dating",
    stat: "Attraction starts at first sight",
    unit: "#1 predictor of initial attraction in one speed-dating study",
    icon: Heart,
    hook: "At first sight, appearance carries weight.",
    detail:
      "In a real-life speed-dating study, a partner’s physical attractiveness was the strongest predictor of initial romantic attraction for both men and women.",
    caveat:
      "The study concerns first attraction, not long-term compatibility or relationship quality.",
    source: "What Leads to Romantic Attraction? · Personal Relationships",
    href: "https://pubmed.ncbi.nlm.nih.gov/19558447/",
  },
  {
    id: "social",
    label: "Socializing",
    stat: "People may respond differently",
    unit: "linked with more positive social experiences",
    icon: UsersRound,
    hook: "Appearance can change how interactions feel.",
    detail:
      "Daily-interaction research linked attractiveness with more positive emotional quality in social experiences for both sexes. Effects on the amount of social activity differed by sex.",
    caveat:
      "This does not support the blanket claim that attractive people always have more friends.",
    source: "Physical Attractiveness in Social Interaction II",
    href: "https://www.researchgate.net/publication/232496573_Physical_attractiveness_in_social_interaction_II_Why_does_appearance_affect_social_experience",
  },
  {
    id: "health",
    label: "Health",
    stat: "Looking healthy looks attractive",
    unit: "perceived health shapes how attractive a face appears",
    icon: Activity,
    hook: "We read health from faces.",
    detail:
      "Across Western and Japanese face samples, perceived health explained an important part of why facial symmetry was rated as attractive.",
    caveat:
      "This is perceived health. It does not show that an attractive face causes better physical health.",
    source: "Perceived Health and Facial Attractiveness · Perception",
    href: "https://journals.sagepub.com/doi/pdf/10.1068/p5712?download=true",
  },
  {
    id: "education",
    label: "Education",
    stat: "Judged before you prove yourself",
    unit: "appearance can shape academic expectations",
    icon: GraduationCap,
    hook: "Looks can shape expectations before results do.",
    detail:
      "A review and meta-analysis found that teachers tended to judge more attractive students more positively on intelligence, academic potential, grades and social skills.",
    caveat:
      "These are biased judgments and expectations, not evidence of greater intelligence.",
    source: "Judgments of Physically Attractive Students · RER",
    href: "https://journals.sagepub.com/doi/10.3102/00346543062004413",
  },
  {
    id: "law",
    label: "Law",
    stat: "Justice is not always blind",
    unit: "appearance has been linked with some legal outcomes",
    icon: Scale,
    hook: "Bias can enter places designed to be objective.",
    detail:
      "A US longitudinal study linked higher attractiveness ratings with lower odds of arrest and conviction, but not probation or incarceration; the main pattern was limited to women.",
    caveat:
      "The finding is observational, gender-specific and does not establish that appearance caused the outcomes.",
    source: "Physical Attractiveness and Criminal Justice Processing",
    href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6762156/",
  },
  {
    id: "influence",
    label: "Influence",
    stat: "Your face speaks before you do",
    unit: "appearance can shape how your message lands",
    icon: CircleUserRound,
    hook: "How you look can shape how your message lands.",
    detail:
      "Experiments have linked communicator attractiveness with perceived trust, expertise and liking—signals that can affect credibility and persuasion.",
    caveat:
      "Perceived credibility is not the same as actual competence or truthfulness.",
    source: "Source Credibility and Communicator Attractiveness",
    href: "https://www.sciencedirect.com/science/article/pii/0148296383900309",
  },
  {
    id: "happiness",
    label: "Well-being",
    stat: "How you look can shape how you feel",
    unit: "associated with well-being, but context matters",
    icon: Brain,
    hook: "The link exists, but it is not simple.",
    detail:
      "Longitudinal work reported a positive association with psychological well-being and a negative association with distress and depression, while other research suggests context changes the relationship.",
    caveat:
      "It would be inaccurate to claim that attractive people are simply happier.",
    source: "Beauty in Mind · Social Science & Medicine",
    href: "https://gwern.net/doc/psychiatry/depression/2015-gupta-2.pdf",
  },
] as const;

const appearanceEvidenceTh: Record<
  (typeof appearanceEvidence)[number]["id"],
  {
    label: string;
    stat: string;
    unit: string;
    hook: string;
    detail: string;
    caveat: string;
  }
> = {
  finances: {
    label: "รายได้",
    stat: "รูปลักษณ์อาจส่งผลถึงรายได้",
    unit: "พบความต่างของค่าจ้างราว 5–10% ในบางกลุ่ม",
    hook: "รูปลักษณ์อาจมีความเกี่ยวข้องกับรายได้",
    detail:
      "งานวิจัยด้านตลาดแรงงานพบความสัมพันธ์ระหว่างรูปลักษณ์กับรายได้ โดยมีข้อเสนอว่าความมั่นใจ การรับรู้ถึงความสามารถ และทักษะการสื่อสาร อาจเป็นปัจจัยบางส่วนที่เกี่ยวข้อง",
    caveat:
      "ข้อมูลนี้สะท้อนความสัมพันธ์ในภาพรวม ไม่ได้หมายความว่ารูปลักษณ์จะเป็นตัวกำหนดรายได้ของแต่ละคน",
  },
  dating: {
    label: "การออกเดต",
    stat: "แรงดึงดูดมีผลต่อความประทับใจแรก",
    unit: "รูปลักษณ์เป็นหนึ่งในปัจจัยที่มีผลต่อความสนใจในช่วงแรก",
    hook: "เมื่อแรกพบ รูปลักษณ์มีน้ำหนักมาก",
    detail:
      "งานวิจัยจากสถานการณ์สปีดเดตจริงพบว่า ความดึงดูดทางกายภาพของอีกฝ่ายเป็นตัวทำนายความสนใจเชิงโรแมนติกในช่วงแรกที่เด่นที่สุด ทั้งในผู้ชายและผู้หญิง",
    caveat:
      "ผลนี้พูดถึงความสนใจแรกพบ ไม่ใช่ความเข้ากันได้หรือคุณภาพของความสัมพันธ์ระยะยาว",
  },
  social: {
    label: "การเข้าสังคม",
    stat: "รูปลักษณ์อาจมีผลต่อการเข้าสังคม",
    unit: "ผู้คนอาจมีปฏิสัมพันธ์กับเราแตกต่างกันจากการรับรู้ในช่วงแรก",
    hook: "รูปลักษณ์อาจเปลี่ยนความรู้สึกระหว่างการเข้าสังคม",
    detail:
      "งานวิจัยที่ติดตามปฏิสัมพันธ์ในชีวิตประจำวันพบว่า ความดึงดูดสัมพันธ์กับคุณภาพทางอารมณ์ที่ดีขึ้นระหว่างการเข้าสังคมในทั้งสองเพศ แต่ผลต่อจำนวนครั้งที่เข้าสังคมแตกต่างกันไป",
    caveat: "จึงไม่ควรสรุปเหมารวมว่า คนที่ดูดีกว่าจะมีเพื่อนมากกว่าเสมอ",
  },
  health: {
    label: "สุขภาพ",
    stat: "ใบหน้าที่ดูสุขภาพดีมักดูน่าดึงดูด",
    unit: "การรับรู้ว่าใบหน้าดูสุขภาพดีอาจส่งผลต่อความรู้สึกดึงดูด",
    hook: "คนเราประเมินสุขภาพจากใบหน้าโดยไม่รู้ตัว",
    detail:
      "งานวิจัยทั้งในกลุ่มใบหน้าตะวันตกและญี่ปุ่นพบว่า ภาพของสุขภาพที่คนรับรู้มีส่วนสำคัญต่อการตัดสินความดึงดูด โดยเฉพาะผลที่เชื่อมโยงกับความสมมาตรของใบหน้า",
    caveat:
      "นี่คือสุขภาพที่มองเห็นจากภายนอก ไม่ได้หมายความว่าคนหน้าตาดีจะมีสุขภาพจริงดีกว่า",
  },
  education: {
    label: "การศึกษา",
    stat: "รูปลักษณ์อาจมีผลต่อการรับรู้ด้านการเรียน",
    unit: "ผู้คนอาจเกิดความคาดหวังบางอย่างจากรูปลักษณ์ก่อนเห็นผลงานจริง",
    hook: "หน้าตาอาจสร้างความคาดหวังก่อนผลลัพธ์จริง",
    detail:
      "งานทบทวนและวิเคราะห์งานวิจัยหลายชิ้นพบว่า ครูมีแนวโน้มประเมินนักเรียนที่ถูกมองว่าน่าดึงดูดกว่าในทางบวก ทั้งด้านสติปัญญา ศักยภาพการเรียน คะแนน และทักษะทางสังคม",
    caveat: "นี่คืออคติในการประเมิน ไม่ใช่หลักฐานว่าคนหน้าตาดีฉลาดกว่า",
  },
  law: {
    label: "กระบวนการยุติธรรม",
    stat: "รูปลักษณ์อาจมีผลต่อการตัดสิน",
    unit: "รูปลักษณ์สามารถมีอิทธิพลต่อการรับรู้และการประเมินบุคคลในบางสถานการณ์",
    hook: "อคติอาจเข้าไปอยู่ในพื้นที่ที่ควรเป็นกลาง",
    detail:
      "งานติดตามระยะยาวในสหรัฐฯ พบว่า คะแนนความดึงดูดที่สูงกว่าสัมพันธ์กับโอกาสถูกจับและถูกตัดสินว่ามีความผิดที่ต่ำกว่า แต่ไม่พบผลต่อการคุมประพฤติหรือจำคุก และผลหลักจำกัดอยู่ในผู้หญิง",
    caveat:
      "เป็นผลเชิงสังเกตที่มีข้อจำกัด ไม่ได้พิสูจน์ว่ารูปลักษณ์เป็นสาเหตุโดยตรง",
  },
  influence: {
    label: "อิทธิพลต่อผู้อื่น",
    stat: "ใบหน้าสื่อสารก่อนที่เราจะพูด",
    unit: "รูปลักษณ์อาจมีผลต่อการรับรู้และการตอบสนองของผู้อื่น",
    hook: "รูปลักษณ์อาจเปลี่ยนวิธีที่คนรับสารจากเรา",
    detail:
      "งานทดลองพบความเชื่อมโยงระหว่างความดึงดูดของผู้สื่อสารกับการถูกมองว่าน่าเชื่อถือ มีความเชี่ยวชาญ และน่าชื่นชอบ ซึ่งอาจส่งผลต่อความสามารถในการโน้มน้าว",
    caveat:
      "ความน่าเชื่อถือที่คนรู้สึก ไม่ได้เท่ากับความสามารถหรือความจริงใจที่มีอยู่จริง",
  },
  happiness: {
    label: "สุขภาวะทางใจ",
    stat: "รูปลักษณ์อาจส่งผลต่อความรู้สึกต่อตัวเอง",
    unit: "ความรู้สึกต่อตัวเองอาจสัมพันธ์กับสุขภาวะทางใจ",
    hook: "ความเชื่อมโยงมีอยู่จริง แต่ไม่ได้เรียบง่าย",
    detail:
      "งานติดตามระยะยาวพบความสัมพันธ์เชิงบวกระหว่างความดึงดูดกับสุขภาวะทางใจ และความสัมพันธ์เชิงลบกับความเครียดหรือภาวะซึมเศร้า ขณะที่งานอื่นพบว่าบริบททางสังคมทำให้ผลเปลี่ยนไป",
    caveat: "จึงไม่ควรสรุปตรง ๆ ว่าคนหน้าตาดีจะมีความสุขกว่า",
  },
};

function LogoIntro() {
  return (
    <div className="logo-intro" aria-hidden="true">
      <div className="logo-intro__mark">
        <i className="logo-intro__draw">
          <svg viewBox="0 0 42 50">
            <path d="M7 4v38M7 4h7c12 0 21 9 21 19s-9 19-21 19" />
            <path d="M17 13v33M17 13h4c10 0 18 7 18 16s-8 17-18 17" />
          </svg>
        </i>
        <span>DOODEE</span>
      </div>
    </div>
  );
}

function Button({
  children,
  ghost = false,
  href = "#pricing",
}: {
  children: React.ReactNode;
  ghost?: boolean;
  href?: string;
}) {
  const className = `button ${ghost ? "button--ghost" : ""}`;
  // Only in-app paths go through the router; anchors and mailto: links stay
  // plain <a>, which <Link to> would otherwise mangle into a relative route.
  return href.startsWith("/") ? (
    <Link className={className} to={href}>
      {children}
      <ArrowRight size={16} />
    </Link>
  ) : (
    <a className={className} href={href}>
      {children}
      <ArrowRight size={16} />
    </a>
  );
}

const LANDMARK_WIDTH = 1086;
const LANDMARK_HEIGHT = 1448;
// webp, matching project-qijek: 152 KB against the png's size, same image. The png is gone —
// nothing referenced it any more, and every image on this page is now webp for one reason:
// a full scroll of the landing page used to pull 53 MB, which is ~1,900 visitors per 100 GB
// of hosting bandwidth. At 5.7 MB it is ~17,600.
const SAMPLE_FACE_SRC = "/assets/sample-face-front.webp";
const HAIRLINE_EXTENSION = 0.75;
let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null;

function getFaceLandmarker() {
  faceLandmarkerPromise ??= FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
  ).then((vision) =>
    FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
      },
      numFaces: 1,
      minFaceDetectionConfidence: 0.7,
      minFacePresenceConfidence: 0.7,
      minTrackingConfidence: 0.7,
    }),
  );
  return faceLandmarkerPromise;
}

function calculateFaceMetrics(
  landmarks: NormalizedLandmark[] | null,
): FaceMetric[] {
  if (!landmarks || landmarks.length < 478)
    return metricDefinitions.map((metric) => ({
      ...metric,
      value: "Measuring...",
      score: 50,
      match: 0,
    }));

  const rawPoint = (index: number) => ({
    x: landmarks[index].x * LANDMARK_WIDTH,
    y: landmarks[index].y * LANDMARK_HEIGHT,
  });
  const rightPupil = rawPoint(468);
  const leftPupil = rawPoint(473);
  const eyeMidpoint = {
    x: (rightPupil.x + leftPupil.x) / 2,
    y: (rightPupil.y + leftPupil.y) / 2,
  };
  const roll = Math.atan2(
    leftPupil.y - rightPupil.y,
    leftPupil.x - rightPupil.x,
  );
  const cos = Math.cos(-roll);
  const sin = Math.sin(-roll);
  const rotate = (index: number) => {
    const source = rawPoint(index);
    const x = source.x - eyeMidpoint.x;
    const y = source.y - eyeMidpoint.y;
    return {
      x: x * cos - y * sin + eyeMidpoint.x,
      y: x * sin + y * cos + eyeMidpoint.y,
    };
  };
  const centerX = rotate(1).x;
  const leftSpan = Math.max(1, centerX - rotate(234).x);
  const rightSpan = Math.max(1, rotate(454).x - centerX);
  const averageHalfWidth = (leftSpan + rightSpan) / 2;
  const leftCorrection = Math.min(
    1.18,
    Math.max(0.85, averageHalfWidth / leftSpan),
  );
  const rightCorrection = Math.min(
    1.18,
    Math.max(0.85, averageHalfWidth / rightSpan),
  );
  const point = (index: number) => {
    const aligned = rotate(index);
    const correction = aligned.x < centerX ? leftCorrection : rightCorrection;
    return { x: centerX + (aligned.x - centerX) * correction, y: aligned.y };
  };
  const distance = (from: number, to: number) => {
    const a = point(from),
      b = point(to);
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  const vertical = (from: number, to: number) =>
    Math.abs(point(to).y - point(from).y);
  const mean = (...values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const clamp = (value: number, min = 0, max = 100) =>
    Math.min(max, Math.max(min, value));
  const faceWidth = distance(234, 454);
  const eyeSpacing = distance(468, 473);
  const eyeLineY = mean(point(468).y, point(473).y);
  const upperEyelidY = mean(point(159).y, point(386).y);
  const browY = mean(point(105).y, point(334).y);
  const upperLipY = point(0).y;
  const foreheadLandmarkY = point(10).y;
  const hairlineY = clamp(
    foreheadLandmarkY -
      Math.abs(browY - foreheadLandmarkY) * HAIRLINE_EXTENSION,
    0,
    LANDMARK_HEIGHT,
  );
  const noseBaseY = point(2).y;
  const chinY = point(152).y;
  const upperThird = Math.abs(browY - hairlineY);
  const middleThird = Math.abs(noseBaseY - browY);
  const lowerThird = Math.abs(chinY - noseBaseY);
  const thirdsTotal = upperThird + middleThird + lowerThird;
  const thirds = [upperThird, middleThird, lowerThird].map(
    (value) => (value / thirdsTotal) * 100,
  );
  const canthalAngle = (outer: number, inner: number) => {
    const a = point(outer),
      b = point(inner);
    return (Math.atan2(b.y - a.y, Math.abs(b.x - a.x)) * 180) / Math.PI;
  };
  const midfaceRatio = eyeSpacing / Math.abs(upperLipY - eyeLineY);
  const canthalTilt = mean(canthalAngle(33, 133), canthalAngle(263, 362));
  const fhwr = faceWidth / Math.abs(upperLipY - upperEyelidY);
  const esr = (eyeSpacing / faceWidth) * 100;
  const eyeWidth = mean(distance(33, 133), distance(362, 263));
  const eyeAperture = mean(distance(159, 145), distance(386, 374));
  const eyeAspect = eyeWidth / eyeAperture;
  const jawFace = distance(172, 397) / faceWidth;
  const chinPhiltrum = vertical(17, 152) / vertical(2, 0);
  const noseFace = distance(98, 327) / faceWidth;
  const mouthNose = distance(61, 291) / distance(98, 327);
  const thirdsBalance = clamp(
    100 - thirds.reduce((sum, value) => sum + Math.abs(value - 100 / 3), 0) * 2,
  );

  const measured: Record<
    MetricId,
    { raw: number; value: string; match?: number }
  > = {
    midface: { raw: midfaceRatio, value: midfaceRatio.toFixed(2) },
    canthal: {
      raw: canthalTilt,
      value: `${canthalTilt >= 0 ? "+" : ""}${canthalTilt.toFixed(1)}°`,
    },
    thirds: {
      raw: thirds[1],
      value: thirds.map((value) => `${value.toFixed(0)}%`).join(" · "),
      match: thirdsBalance,
    },
    fhwr: { raw: fhwr, value: fhwr.toFixed(2) },
    esr: { raw: esr, value: `${esr.toFixed(1)}%` },
    eyeaspect: { raw: eyeAspect, value: eyeAspect.toFixed(2) },
    jawface: { raw: jawFace, value: jawFace.toFixed(2) },
    chinphiltrum: { raw: chinPhiltrum, value: chinPhiltrum.toFixed(2) },
    noseface: { raw: noseFace, value: noseFace.toFixed(2) },
    mouthnose: { raw: mouthNose, value: mouthNose.toFixed(2) },
  };

  return metricDefinitions.map((metric) => {
    const result = measured[metric.id];
    const [min, max] = metric.range;
    const score =
      result.raw <= metric.target
        ? clamp(((result.raw - min) / (metric.target - min)) * 50)
        : clamp(
            50 + ((result.raw - metric.target) / (max - metric.target)) * 50,
          );
    const match = result.match ?? clamp(100 - Math.abs(score - 50) * 2);
    return { ...metric, value: result.value, score, match };
  });
}

function FaceGuide({
  metric,
  landmarks,
}: {
  metric: FaceMetric;
  landmarks: NormalizedLandmark[] | null;
}) {
  if (!landmarks) return null;

  const point = (index: number) => ({
    x: landmarks[index].x * LANDMARK_WIDTH,
    y: landmarks[index].y * LANDMARK_HEIGHT,
  });
  const avg = (...indices: number[]) =>
    indices.reduce((sum, index) => sum + point(index).y, 0) / indices.length;
  const line = (from: number, to: number, key: string) => {
    const a = point(from),
      b = point(to);
    return (
      <line
        className="metric-shape"
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        key={key}
      />
    );
  };
  const horizontal = (y: number, inset: number, key: string) => {
    const left = point(234).x,
      right = point(454).x,
      width = right - left;
    return (
      <line
        className="metric-shape"
        x1={left + width * inset}
        y1={y}
        x2={right - width * inset}
        y2={y}
        key={key}
      />
    );
  };
  const polyline = (indices: number[], key: string) => (
    <polyline
      className="metric-shape"
      points={indices
        .map((index) => {
          const p = point(index);
          return `${p.x},${p.y}`;
        })
        .join(" ")}
      key={key}
    />
  );
  const connections = (items: { start: number; end: number }[], key: string) =>
    items.map(({ start, end }, index) => line(start, end, `${key}-${index}`));
  const nodes = (indices: number[]) =>
    indices.map((index) => {
      const p = point(index);
      return (
        <circle
          className="metric-node"
          cx={p.x}
          cy={p.y}
          r="5"
          key={`node-${index}`}
        />
      );
    });
  const eyeY = avg(33, 133, 362, 263);
  const upperEyelidY = avg(159, 386);
  const browY = avg(105, 334);
  const hairlineY = Math.max(
    0,
    point(10).y - Math.abs(browY - point(10).y) * HAIRLINE_EXTENSION,
  );
  const noseY = point(2).y;
  let shapes: React.ReactNode;
  let nodeIndices: number[] = [];

  if (metric.id === "midface") {
    const centerX = point(1).x;
    shapes = (
      <>
        {horizontal(eyeY, 0.08, "eyes")}
        {horizontal(point(0).y, 0.2, "upper-lip")}
        <line
          className="metric-shape"
          x1={centerX}
          y1={eyeY}
          x2={centerX}
          y2={point(0).y}
        />
      </>
    );
    nodeIndices = [468, 473, 0];
  } else if (metric.id === "canthal") {
    shapes = (
      <>
        {line(33, 133, "right-eye")}
        {line(362, 263, "left-eye")}
      </>
    );
    nodeIndices = [33, 133, 362, 263];
  } else if (metric.id === "thirds") {
    shapes = (
      <>
        {horizontal(hairlineY, 0.16, "top")}
        {horizontal(browY, 0.1, "brow")}
        {horizontal(noseY, 0.2, "nose")}
        {horizontal(point(152).y, 0.28, "chin")}
        <circle className="metric-node" cx={point(1).x} cy={hairlineY} r="5" />
      </>
    );
    nodeIndices = [2, 152];
  } else if (metric.id === "fhwr") {
    const centerX = point(1).x;
    shapes = (
      <>
        {line(234, 454, "face-width")}
        <line
          className="metric-shape"
          x1={centerX}
          y1={upperEyelidY}
          x2={centerX}
          y2={point(0).y}
        />
      </>
    );
    nodeIndices = [234, 454, 159, 386, 0];
  } else if (metric.id === "esr") {
    shapes = (
      <>
        {line(468, 473, "pupil-distance")}
        {line(234, 454, "face-width")}
      </>
    );
    nodeIndices = [468, 473, 234, 454];
  } else if (metric.id === "eyeaspect") {
    shapes = (
      <>
        {line(33, 133, "right-width")}
        {line(159, 145, "right-aperture")}
        {line(362, 263, "left-width")}
        {line(386, 374, "left-aperture")}
      </>
    );
    nodeIndices = [33, 133, 159, 145, 362, 263, 386, 374];
  } else if (metric.id === "jawface") {
    shapes = (
      <>
        {polyline(
          [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397],
          "jaw",
        )}
        {line(172, 397, "jaw-width")}
        {line(234, 454, "face-width")}
      </>
    );
    nodeIndices = [172, 397, 234, 454];
  } else if (metric.id === "chinphiltrum") {
    shapes = (
      <>
        {line(2, 0, "philtrum")}
        {line(17, 152, "chin-height")}
      </>
    );
    nodeIndices = [2, 0, 17, 152];
  } else if (metric.id === "noseface") {
    shapes = (
      <>
        {line(98, 327, "nose-width")}
        {line(234, 454, "face-width")}
      </>
    );
    nodeIndices = [98, 327, 234, 454];
  } else {
    shapes = (
      <>
        {connections(FaceLandmarker.FACE_LANDMARKS_LIPS, "lips")}
        {line(61, 291, "mouth-width")}
        {line(98, 327, "nose-width")}
      </>
    );
    nodeIndices = [61, 291, 98, 327];
  }

  return (
    <div
      className={`metric-guide metric-guide--${metric.id}`}
      aria-hidden="true"
    >
      <svg
        className="metric-svg"
        viewBox={`0 0 ${LANDMARK_WIDTH} ${LANDMARK_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
      >
        {shapes}
        {nodes(nodeIndices)}
      </svg>
      <span className="metric-value">{metric.value}</span>
    </div>
  );
}

function ProductPreview({ locale }: { locale: Locale }) {
  const [activeMetricId, setActiveMetricId] = useState<MetricId>("midface");
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [landmarkStatus, setLandmarkStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const imageRef = useRef<HTMLImageElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const faceMetrics = useMemo(
    () => calculateFaceMetrics(landmarks),
    [landmarks],
  );
  const activeMetric =
    faceMetrics.find((metric) => metric.id === activeMetricId) ??
    faceMetrics[0];
  const displayMetric = (metric: FaceMetric) =>
    locale === "th" ? { ...metric, ...metricCopyTh[metric.id] } : metric;

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || !("IntersectionObserver" in window)) {
      setIsNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: "360px 0px", threshold: 0.01 },
    );
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isNearViewport) return;
    let cancelled = false;
    const image = imageRef.current;
    if (!image) return;
    setLandmarks(null);
    setLandmarkStatus("loading");
    const detect = async () => {
      try {
        if (!image.complete)
          await new Promise<void>((resolve) =>
            image.addEventListener("load", () => resolve(), { once: true }),
          );
        const landmarker = await getFaceLandmarker();
        const detected = landmarker.detect(image).faceLandmarks[0] ?? null;
        if (!cancelled) {
          setLandmarks(detected);
          setLandmarkStatus(detected ? "ready" : "error");
        }
      } catch {
        if (!cancelled) setLandmarkStatus("error");
      }
    };
    void detect();
    return () => {
      cancelled = true;
    };
  }, [isNearViewport]);

  return (
    <div
      ref={previewRef}
      className="product-preview product-preview--analysis-only"
    >
      <div className="preview-body">
        <div
          className="portrait-frame portrait-frame--interactive"
          style={
            {
              "--focus-x": `${activeMetric.x}%`,
              "--focus-y": `${activeMetric.y}%`,
              "--focus-scale": activeMetric.scale,
            } as React.CSSProperties
          }
        >
          <img
            key={SAMPLE_FACE_SRC}
            ref={imageRef}
            src={SAMPLE_FACE_SRC}
            alt={
              locale === "th"
                ? `ภาพตัวอย่างสำหรับวัด${displayMetric(activeMetric).label}`
                : `Sample portrait zoomed to show ${activeMetric.label}`
            }
          />
          <FaceGuide metric={activeMetric} landmarks={landmarks} />
          <span className="view-chip">{displayMetric(activeMetric).view}</span>
        </div>
        <div className="analysis-panel metric-panel animate-in">
          <div className="metric-panel-head">
            <div>
              <p className="panel-title">
                {locale === "th" ? "ตัวอย่างผลวิเคราะห์" : "Sample analysis"}
              </p>
              <small>
                {landmarkStatus === "ready"
                  ? locale === "th"
                    ? "ชี้หรือแตะเพื่อดูแต่ละค่า"
                    : "Hover or tap a metric to explore"
                  : landmarkStatus === "loading"
                    ? locale === "th"
                      ? "กำลังตรวจจับจุดสำคัญบนใบหน้า…"
                      : "Mapping facial landmarks…"
                    : locale === "th"
                      ? "ไม่สามารถตรวจจับจุดบนใบหน้าได้"
                      : "Landmark map unavailable"}
              </small>
            </div>
          </div>
          {faceMetrics.map((metric) => (
            <button
              className={`metric-row ${activeMetric.id === metric.id ? "is-active" : ""}`}
              key={metric.id}
              onMouseEnter={() => setActiveMetricId(metric.id)}
              onFocus={() => setActiveMetricId(metric.id)}
              onClick={() => setActiveMetricId(metric.id)}
              aria-pressed={activeMetric.id === metric.id}
            >
              <span className="metric-copy">
                <b>{displayMetric(metric).label}</b>
                <small>{displayMetric(metric).detail}</small>
              </span>
              <span
                className="metric-range"
                role="img"
                aria-label={`${metric.label}: ${Math.round(metric.match)} percent reference alignment`}
                title={`Reference alignment ${Math.round(metric.match)}%`}
              >
                <i style={{ left: `${metric.score}%` }} />
              </span>
              <strong>{metric.value}</strong>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TreatmentPreview({ locale }: { locale: Locale }) {
  const [group, setGroup] = useState<TreatmentGroup>("Surgery");
  const [activeId, setActiveId] = useState(treatmentGroups.Surgery[0].id);
  const [split, setSplit] = useState(50);
  const treatments = treatmentGroups[group];
  const active =
    treatments.find((treatment) => treatment.id === activeId) ?? treatments[0];

  const selectGroup = (nextGroup: TreatmentGroup) => {
    setGroup(nextGroup);
    setActiveId(treatmentGroups[nextGroup][0].id);
  };

  return (
    <section className="treatment-preview section-shell" id="treatment-preview">
      <img
        className="treatment-preview__caustic"
        src="/assets/science/caustic-light-v1.webp"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      />
      <img
        className="static-luxury-art static-luxury-art--membrane"
        src="/assets/science/glass-membrane-v1.webp"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      />
      <div className="treatment-preview__intro">
        <p className="treatment-preview__eyebrow">
          {locale === "th" ? "ตัวอย่างภาพจำลอง" : "Treatment preview"}
        </p>
        <h2>
          {locale === "th" ? (
            <>
              เห็นภาพ ก่อนตัดสินใจ
            </>
          ) : (
            <>
              Preview before
              <br />
              you decide.
            </>
          )}
        </h2>
        <p className="treatment-preview__lede">
          {locale === "th"
            ? "ลองเปรียบเทียบแนวทางที่เป็นไปได้ เพื่อช่วยให้คุณเห็นภาพรวมของแต่ละทางเลือกก่อนเข้าปรึกษาผู้เชี่ยวชาญ"
            : "Explore realistic directions and understand what may suit your face before a consultation."}
        </p>

        <div
          className="treatment-tabs"
          role="tablist"
          aria-label="Treatment category"
        >
          {(Object.keys(treatmentGroups) as TreatmentGroup[]).map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={group === name}
              onClick={() => selectGroup(name)}
            >
              {locale === "th"
                ? name === "Surgery"
                  ? "ผ่าตัด"
                  : "ไม่ผ่าตัด"
                : name}
            </button>
          ))}
        </div>

        <div
          className="treatment-list"
          role="list"
          aria-label={`${group} treatments`}
        >
          {treatments.map((treatment) => {
            const selected = treatment.id === active.id;
            return (
              <button
                key={treatment.id}
                className={selected ? "is-active" : ""}
                onMouseEnter={() => setActiveId(treatment.id)}
                onFocus={() => setActiveId(treatment.id)}
                onClick={() => setActiveId(treatment.id)}
                aria-pressed={selected}
              >
                <span>
                  <TreatmentAnatomy id={treatment.id} />
                  <b>
                    {locale === "th"
                      ? treatmentCopyTh[treatment.id]
                      : treatment.label}
                  </b>
                </span>
                {selected ? (
                  <small>
                    {locale === "th" ? "ภาพที่เลือก" : "Previewing"}
                  </small>
                ) : (
                  <ChevronRight size={18} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="treatment-preview__card">
        <p className="treatment-preview__hint">
          <Info size={17} />{" "}
          {locale === "th"
            ? "เลือกหัตถการเพื่อเปรียบเทียบภาพจำลอง"
            : "Click a treatment or hover to preview"}
        </p>
        <div className="treatment-comparison">
          <img
            className="treatment-comparison__before"
            src="/assets/treatment-preview-face.webp"
            alt="Original treatment preview portrait"
          />
          <div
            className="treatment-comparison__after"
            style={{ clipPath: `inset(0 0 0 ${split}%)` }}
          >
            <TreatmentCanvas treatmentId={active.id} />
          </div>
          <span className="comparison-label comparison-label--before">
            {locale === "th" ? "ภาพปัจจุบัน" : "Before"}
          </span>
          <span className="comparison-label comparison-label--after">
            {locale === "th" ? "ภาพจำลอง" : "Preview"}
          </span>
          <div className="comparison-divider" style={{ left: `${split}%` }}>
            <span>
              <MoveHorizontal size={18} />
            </span>
          </div>
          <input
            type="range"
            min="12"
            max="88"
            value={split}
            onChange={(event) => setSplit(Number(event.target.value))}
            aria-label="Adjust before and preview comparison"
          />
        </div>
        <p className="treatment-preview__caption">
          <strong>
            {locale === "th" ? treatmentCopyTh[active.id] : active.label}
          </strong>{" "}
          ·{" "}
          {locale === "th"
            ? "ภาพจำลองใช้เพื่อประกอบการตัดสินใจเท่านั้น ผลลัพธ์จริงอาจแตกต่างกันในแต่ละบุคคล"
            : "Illustrative simulation only. Results may vary."}
        </p>
      </div>
    </section>
  );
}

function AppearanceEvidence({ locale }: { locale: Locale }) {
  const [activeId, setActiveId] = useState<
    (typeof appearanceEvidence)[number]["id"]
  >(appearanceEvidence[0].id);
  const active =
    appearanceEvidence.find((item) => item.id === activeId) ??
    appearanceEvidence[0];
  const ActiveIcon = active.icon;
  const activeCopy = locale === "th" ? appearanceEvidenceTh[active.id] : active;

  return (
    <section className="appearance-evidence" id="research">
      <img
        className="static-luxury-art static-luxury-art--prisms"
        src="/assets/science/crystal-prisms-v1.webp"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      />
      <div className="section-shell appearance-evidence__intro">
        <h2>
          {locale === "th"
            ? "ทำไมรูปลักษณ์ถึงมีความสำคัญ?"
            : "Why does looking better matter?"}
        </h2>
        <p>
          {locale === "th"
            ? "รูปลักษณ์อาจส่งผลต่อการรับรู้และการตอบสนองของผู้อื่นตั้งแต่แรกพบ จากงานวิจัยพบว่ารูปลักษณ์มีความเกี่ยวข้องกับโอกาสและการตัดสินใจในหลายบริบท อย่างไรก็ตาม รูปลักษณ์ไม่ได้เป็นตัวกำหนดคุณค่าหรืออนาคตของใคร"
            : "Because appearance can influence how people respond before they know anything else. Research finds advantages and biases across several parts of life, but none of them defines human worth or destiny."}
        </p>
      </div>
      <div className="section-shell evidence-explorer">
        <div
          className="evidence-index"
          role="tablist"
          aria-label="Appearance research areas"
        >
          {appearanceEvidence.map((item) => {
            const Icon = item.icon;
            const selected = active.id === item.id;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={selected}
                aria-controls="appearance-study"
                className={selected ? "is-active" : ""}
                onMouseEnter={() => setActiveId(item.id)}
                onFocus={() => setActiveId(item.id)}
                onClick={() => setActiveId(item.id)}
              >
                <span>
                  <i className="evidence-icon">
                    <Icon size={19} />
                  </i>
                  <b>
                    {locale === "th"
                      ? appearanceEvidenceTh[item.id].label
                      : item.label}
                  </b>
                </span>
                <strong>
                  {locale === "th"
                    ? appearanceEvidenceTh[item.id].stat
                    : item.stat}
                </strong>
                <small>
                  {locale === "th"
                    ? appearanceEvidenceTh[item.id].unit
                    : item.unit}
                </small>
              </button>
            );
          })}
        </div>
        <article
          className="evidence-detail"
          id="appearance-study"
          role="tabpanel"
          aria-live="polite"
          key={active.id}
        >
          <div className="evidence-detail__label">
            <i className="evidence-icon evidence-icon--large">
              <ActiveIcon size={20} />
            </i>
            <span>{activeCopy.label}</span>
          </div>
          <h3>{activeCopy.hook}</h3>
          <p>{activeCopy.detail}</p>
          <p className="evidence-detail__caveat">
            <Info size={17} /> {activeCopy.caveat}
          </p>
          <a href={active.href} target="_blank" rel="noreferrer">
            {active.source}
            <ArrowRight size={16} />
          </a>
          <img
            className="evidence-detail__art"
            src="/assets/science/cell-cluster-v1.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
        </article>
      </div>
      <p className="section-shell appearance-evidence__note">
        {locale === "th"
          ? "งานวิจัยเหล่านี้สะท้อนแนวโน้มและการรับรู้ในภาพรวม ไม่ได้ใช้วัดคุณค่าของบุคคลหรือทำนายผลลัพธ์ของแต่ละบุคคล"
          : "These studies describe population-level patterns and perception biases. They do not measure a person’s value or predict an individual outcome."}
      </p>
    </section>
  );
}

function NextSteps({ locale }: { locale: Locale }) {
  const selfSteps =
    locale === "th"
      ? [
          "ทรงผมและการจัดแต่ง",
          "การดูแลผิวในแต่ละวัน",
          "คิ้วและการจัดแต่งใบหน้า",
          "พฤติกรรมในชีวิตประจำวัน",
        ]
      : [
          "Hairstyle & grooming",
          "Skincare priorities",
          "Brow & facial styling",
          "Everyday habits",
        ];
  const professionalSteps =
    locale === "th"
      ? [
          "ทางเลือกแบบไม่ผ่าตัด",
          "ทางเลือกด้านการผ่าตัด",
          "แนวทางที่อาจเหมาะกับเป้าหมายของคุณ",
          "คำถามที่ควรเตรียมไว้ก่อนปรึกษา",
        ]
      : [
          "Non-surgical options",
          "Surgical options",
          "What may suit your goals",
          "Questions to bring to a consultation",
        ];
  const tiltCard = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty("--light-x", `${x * 100}%`);
    card.style.setProperty("--light-y", `${y * 100}%`);
  };
  const resetCard = (event: React.PointerEvent<HTMLElement>) => {
    event.currentTarget.style.removeProperty("--light-x");
    event.currentTarget.style.removeProperty("--light-y");
  };
  return (
    <section className="next-steps section-shell" id="next-steps">
      <img
        className="static-luxury-art static-luxury-art--orbit"
        src="/assets/science/glass-orbit-cluster-v1.webp"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      />
      <div className="next-steps__intro">
        <p>{locale === "th" ? "ลำดับที่เหมาะกับคุณ" : "OUR NEXT STEPS"}</p>
        <h2>
          {locale === "th"
            ? "รู้ว่าควรเริ่มอะไร และอะไรยังไม่จำเป็น"
            : "Know what to do next."}
        </h2>
        <div>
          <p>
            {locale === "th"
              ? "ผลวิเคราะห์และภาพจำลองจะช่วยให้คุณเห็นแนวทางที่เป็นไปได้ ตั้งแต่สิ่งที่เริ่มทำได้ในวันนี้ ไปจนถึงทางเลือกที่ควรปรึกษาผู้เชี่ยวชาญ"
              : "Your analysis and previews come together into a clear next step, whether that means simple changes you can start today or options worth discussing with a professional."}
          </p>
          <span>
            {locale === "th" ? "คำแนะนำแรกของคุณ" : "Recommended for you"}
          </span>
          <strong>
            {locale === "th"
              ? "เริ่มจากสิ่งที่ทำได้ก่อน"
              : "Start simple first."}
          </strong>
          <p>
            {locale === "th"
              ? "หลายจุดสามารถดูแลและพัฒนาได้โดยไม่ต้องทำหัตถการ เริ่มจากสิ่งที่เหมาะกับเป้าหมาย เวลา และความพร้อมของคุณ"
              : "You can improve several areas without a procedure. Focus on the changes with the best balance of impact, effort, and commitment."}
          </p>
        </div>
      </div>
      <div className="next-steps__paths">
        <article onPointerMove={tiltCard} onPointerLeave={resetCard}>
          <div>
            <Footprints size={20} />
            <h3>{locale === "th" ? "เริ่มดูแลด้วยตัวเอง" : "Start on your own"}</h3>
          </div>
          <ul>
            {selfSteps.map((step) => (
              <li key={step}>
                <Check size={15} />
                {step}
              </li>
            ))}
          </ul>
        </article>
        <article onPointerMove={tiltCard} onPointerLeave={resetCard}>
          <div>
            <CircleUserRound size={20} />
            <h3>
              {locale === "th"
                ? "สำรวจทางเลือกกับผู้เชี่ยวชาญ"
                : "Explore with a professional"}
            </h3>
          </div>
          <ul>
            {professionalSteps.map((step) => (
              <li key={step}>
                <ArrowRight size={15} />
                {step}
              </li>
            ))}
          </ul>
        </article>
      </div>
      <div className="next-steps__footer">
        <p>
          <strong>
            {locale === "th"
              ? "ไม่ใช่ทุกการพัฒนาจะต้องพึ่งหัตถการ"
              : "Not every improvement needs a procedure."}
          </strong>{" "}
          {locale === "th"
            ? "DOODEE ช่วยให้คุณเห็นทางเลือกที่เป็นไปได้ เพื่อให้คุณตัดสินใจเลือกสิ่งที่เหมาะกับตัวเองได้อย่างมั่นใจ"
            : "DooDee helps you understand what’s worth changing and what may be better left alone."}
        </p>
        <Button href="#pricing">
          {locale === "th" ? "ดูแนวทางของฉัน" : "View my next steps"}
        </Button>
      </div>
    </section>
  );
}

function ProgressTimeline({ locale }: { locale: Locale }) {
  const steps =
    locale === "th"
      ? [
          {
            icon: Footprints,
            label: "เริ่มพัฒนา",
            time: "วันนี้",
            title: "วางพื้นฐานที่ช่วยให้เห็นการเปลี่ยนแปลง",
            copy: "เริ่มจากทรงผม การดูแลผิว การแต่งหน้า และพฤติกรรมในชีวิตประจำวันที่เหมาะกับคุณ",
            action: "เริ่มจากสิ่งที่ทำได้ง่าย ประเมินผลได้ และปรับเปลี่ยนได้ตามความเหมาะสม",
          },
          {
            icon: BarChart3,
            label: "กลับมาประเมินอีกครั้ง",
            time: "8–12 สัปดาห์",
            title: "เห็นความเปลี่ยนแปลงจากข้อมูลชุดเดิม",
            copy: "อัปโหลดภาพใหม่ในเงื่อนไขใกล้เคียงเดิม แล้วเปรียบเทียบผลเพื่อแยกสิ่งที่สร้างความต่างออกจากสิ่งที่ไม่จำเป็น",
            action: "รักษาสิ่งที่ได้ผล และปรับเฉพาะจุดที่ยังไม่ตอบเป้าหมาย",
          },
          {
            icon: CircleUserRound,
            label: "ทบทวนทางเลือก",
            time: "เมื่อพร้อม",
            title: "เข้าปรึกษาพร้อมเป้าหมายที่ชัดเจน",
            copy: "หากยังต้องการพัฒนาบางจุด คุณจะมีผลวิเคราะห์ ภาพจำลอง และคำถามสำคัญพร้อมสำหรับการคุยกับผู้เชี่ยวชาญ",
            action: "หัตถการคือทางเลือกที่ผ่านการพิจารณา ไม่ใช่จุดเริ่มต้น",
          },
        ]
      : [
          {
            icon: Footprints,
            label: "Start now",
            time: "Today",
            title: "Build the visible foundations.",
            copy: "Begin with hairstyle, skincare, grooming and everyday habits selected for your highest-impact opportunities.",
            action:
              "Your first actions are simple, measurable and low commitment.",
          },
          {
            icon: BarChart3,
            label: "Reassess",
            time: "8–12 weeks",
            title: "See what actually changed.",
            copy: "Upload a consistent new photo, compare measurements and review which changes created a meaningful visible difference.",
            action: "Keep what works. Adjust what does not.",
          },
          {
            icon: CircleUserRound,
            label: "Decide",
            time: "Only if needed",
            title: "Explore options with evidence.",
            copy: "If your goal remains, review suitable non-surgical or surgical options and prepare better questions for a qualified professional.",
            action: "A procedure is an option, never the default.",
          },
        ];
  const [activeStep, setActiveStep] = useState(0);
  const active = steps[activeStep];
  const ActiveIcon = active.icon;
  const tiltStep = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch") return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty("--step-light-x", `${x * 100}%`);
    card.style.setProperty("--step-light-y", `${y * 100}%`);
  };
  const resetStep = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.style.removeProperty("--step-light-x");
    event.currentTarget.style.removeProperty("--step-light-y");
  };
  return (
    <section className="progress-plan section-shell" id="how">
      <img
        className="static-luxury-art static-luxury-art--topography"
        src="/assets/science/topographic-wave-v1.webp"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      />
      <div className="progress-plan__heading">
        <h2>
          {locale === "th"
            ? "เริ่มพัฒนา วัดผล แล้วค่อยตัดสินใจ"
            : "Improve. Reassess. Decide."}
        </h2>
        <p>
          {locale === "th"
            ? "แนวทางของคุณปรับเปลี่ยนได้ตามผลลัพธ์ เริ่มจากสิ่งที่ทำได้ง่าย วัดผล แล้วค่อยตัดสินใจว่าควรไปต่ออย่างไร"
            : "Your plan evolves with you. Start with the lowest-commitment changes, measure the difference, then decide what still matters."}
        </p>
      </div>
      <div className="progress-plan__body">
        <div
          className="progress-plan__rail"
          role="tablist"
          aria-label="Improvement timeline"
        >
          <i
            style={
              { "--progress": `${activeStep * 50}%` } as React.CSSProperties
            }
          />
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <button
                key={step.label}
                role="tab"
                aria-selected={activeStep === index}
                className={activeStep === index ? "is-active" : ""}
                onPointerMove={tiltStep}
                onPointerLeave={resetStep}
                onMouseEnter={() => setActiveStep(index)}
                onFocus={() => setActiveStep(index)}
                onClick={() => setActiveStep(index)}
              >
                <span>
                  <Icon size={19} />
                </span>
                <b>{step.label}</b>
                <small>{step.time}</small>
              </button>
            );
          })}
        </div>
        <article
          className="progress-plan__detail"
          key={active.label}
          role="tabpanel"
        >
          <div>
            <ActiveIcon size={22} />
            <span>{active.time}</span>
          </div>
          <h3>{active.title}</h3>
          <p>{active.copy}</p>
          <strong>
            <Check size={17} />
            {active.action}
          </strong>
        </article>
      </div>
    </section>
  );
}

function ClinicBridge({ locale }: { locale: Locale }) {
  return (
    <section className="clinic-bridge clinic-bridge--pilot" id="clinics">
      <img
        className="static-luxury-art static-luxury-art--microfluidic"
        src="/assets/science/microfluidic-ribbon-v1.webp"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      />
      <div className="section-shell">
        <div className="clinic-bridge__intro">
          <div>
            <span className="clinic-brand">
              {locale === "th"
                ? "DOODEE สำหรับคลินิก"
                : "DOODEE Clinic Pilot Program"}
            </span>
            <h2>
              {locale === "th" ? (
                <>
                  ให้คนไข้เห็นภาพ
                  <br />
                  ก่อนเริ่มตัดสินใจ
                </>
              ) : (
                <>
                  Bring clarity into
                  <br />
                  every consultation.
                </>
              )}
            </h2>
          </div>
          <div>
            <p>
              {locale === "th"
                ? "สร้างโมเดลใบหน้า 3D และเปิดภาพจำลองระหว่างการปรึกษา ด้วย iPhone หรือ iPad ที่คลินิกมีอยู่แล้ว"
                : "A new 3D consultation workflow built around the devices clinics already use."}
            </p>
            <div className="clinic-pilot-actions">
              <Button href="#clinic-pilot">
                {locale === "th" ? "ขอเดโมสำหรับคลินิก" : "Join the pilot"}
              </Button>
              <a href="#clinic-pilot">
                {locale === "th" ? "ดูขั้นตอนการทำงาน" : "Request a demo"}{" "}
                <ArrowRight size={16} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConsultationBridge({ locale }: { locale: Locale }) {
  return (
    <section
      className="consultation-bridge section-shell"
      aria-labelledby="consultation-bridge-title"
    >
      <div className="consultation-bridge__line" aria-hidden="true">
        <span />
        <i />
        <span />
      </div>
      <div className="consultation-bridge__glass">
        <span>
          {locale === "th"
            ? "พร้อมก่อนเข้าปรึกษา"
            : "From your plan to the consultation"}
        </span>
        <h2 id="consultation-bridge-title">
          {locale === "th"
            ? "เมื่อพร้อมไปต่อ ให้ใช้แนวทางของคุณเป็นตัวช่วยในการตัดสินใจ"
            : "When you're ready to go further, bring your plan with you."}
        </h2>
        <p>
          {locale === "th"
            ? "นำผลวิเคราะห์ เป้าหมาย และภาพจำลองไปใช้เป็นจุดเริ่มต้นของการปรึกษา เพื่อคุยเรื่องความเหมาะสม ข้อจำกัด และผลลัพธ์ที่คาดหวังได้ตรงประเด็นขึ้น"
            : "Your analysis, goals and previews can become a clearer starting point for a professional consultation."}
        </p>
        <a href="#clinics">
          {locale === "th"
            ? "ดูประสบการณ์สำหรับคลินิก"
            : "See the clinic workflow"}{" "}
          <ArrowRight size={17} />
        </a>
      </div>
    </section>
  );
}

function ClinicBusinessFlow({ locale }: { locale: Locale }) {
  const values =
    locale === "th"
      ? [
          [
              "อธิบายได้เห็นภาพชัดเจน",
            "เปรียบเทียบทิศทางบนใบหน้าคนไข้ แทนการอธิบายด้วยคำพูดเพียงอย่างเดียว",
            "/assets/clinic-benefits/clearer-explanations.webp",
          ],
          [
              "เตรียมตัวก่อนปรึกษาได้ดีขึ้น",
            "รวบรวมสิ่งที่กังวล ผลลัพธ์ที่ต้องการ และลำดับความสำคัญไว้ก่อนเริ่มปรึกษา",
            "/assets/clinic-benefits/prepared-patient.webp",
          ],
          [
              "การปรึกษามีประสิทธิภาพมากขึ้น",
              "ช่วยให้พูดคุยเรื่องความเหมาะสม ข้อจำกัด และทางเลือกในขั้นต่อไปได้ตรงประเด็นมากขึ้น",
            "/assets/clinic-benefits/focused-consultation.webp",
          ],
          [
            "ประสบการณ์ที่สะท้อนมาตรฐานคลินิก",
            "ทำให้การปรึกษาดูทันสมัย เข้าใจง่าย และจดจำได้ตั้งแต่ครั้งแรก",
            "/assets/clinic-benefits/premium-clinic.webp",
          ],
        ]
      : [
          [
            "Clearer explanations",
            "Show treatment directions visually instead of relying on words alone.",
            "/assets/clinic-benefits/clearer-explanations.webp",
          ],
          [
            "Better-prepared patients",
            "Align goals and priorities before the consultation becomes complex.",
            "/assets/clinic-benefits/prepared-patient.webp",
          ],
          [
            "More focused consultations",
            "Spend more time discussing fit, limitations and next steps.",
            "/assets/clinic-benefits/focused-consultation.webp",
          ],
          [
            "A premium clinic image",
            "Deliver a modern experience patients can understand and remember.",
            "/assets/clinic-benefits/premium-clinic.webp",
          ],
        ];
  return (
    <div className="clinic-business">
      <section id="clinic-value" className="clinic-benefits section-shell">
        <div className="clinic-business__heading">
          <span>
            {locale === "th" ? "ผลลัพธ์สำหรับคลินิก" : "Clinic value"}
          </span>
          <h2>
            {locale === "th"
              ? "การปรึกษาที่คนไข้เข้าใจ และแพทย์ต่อยอดได้ทันที"
              : "Turn every consultation into a premium experience."}
          </h2>
          <p>
            {locale === "th"
              ? "ช่วยให้คุณเข้าใจ เปรียบเทียบ และพูดคุยเรื่องความงามได้ง่ายขึ้น"
              : "Make complex aesthetic decisions easier to explain, compare and discuss."}
          </p>
        </div>
        <div className="clinic-benefit-grid">
          {values.map(([title, copy, image], index) => (
            <article key={title}>
              <div className="clinic-benefit-image">
                <img src={image} alt="" loading="lazy" />
                <span>{index + 1}</span>
              </div>
              <div className="clinic-benefit-copy">
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="clinic-hardware section-shell">
        <div className="clinic-hardware__visual">
          <img
            src="/assets/clinic-no-hardware.webp"
            alt="An iPhone capturing a face beside an iPad showing a consultation-ready facial model"
            loading="lazy"
          />
        </div>
        <div className="clinic-hardware__copy">
          <span>
            {locale === "th" ? "ใช้อุปกรณ์เดิมของคลินิก" : "No new hardware"}
          </span>
          <h2>
            {locale === "th"
              ? "เพิ่มประสบการณ์ 3D โดยไม่เพิ่มเครื่องสแกน"
              : "Start with the devices you already have."}
          </h2>
          <p>
            {locale === "th"
              ? "ถ่ายใบหน้าด้วย iPhone หรือ iPad จากนั้นเปิดโมเดลและภาพจำลองบนอุปกรณ์ที่ทีมใช้อยู่แล้ว"
              : "Capture on iPhone or iPad, prepare the case, then open the consultation view on any clinic device."}
          </p>
          <ul>
            <li>
              <Check />
              {locale === "th"
                ? "ไม่ต้องลงทุนกับเครื่องสแกนเฉพาะทาง"
                : "No dedicated scanner required"}
            </li>
            <li>
              <Check />
              {locale === "th"
                ? "เชื่อมเข้ากับขั้นตอนรับคนไข้เดิม"
                : "Fits your existing patient flow"}
            </li>
            <li>
              <Check />
              {locale === "th"
                ? "ตั้งค่าทิศทางการปรึกษาให้เข้ากับคลินิก"
                : "Use presets prepared for your clinic"}
            </li>
          </ul>
        </div>
      </section>

      <section className="clinic-demo-cta section-shell" id="clinic-pilot">
        <div>
          <span>{locale === "th" ? "เดโมสำหรับคลินิก" : "Pilot access"}</span>
          <h2>
            {locale === "th"
              ? "ดูว่า DOODEE เข้ากับการปรึกษาของคลินิกคุณอย่างไร"
              : "Shape the next generation of aesthetic consultation."}
          </h2>
          <p>
            {locale === "th"
              ? "เราจะสาธิตตั้งแต่การถ่ายใบหน้า การสร้างโมเดล 3D ไปจนถึงการเปรียบเทียบทิศทางระหว่างปรึกษา"
              : "Join a focused group of clinics testing a simpler 3D workflow with their existing devices."}
          </p>
        </div>
        <div>
          <Button href="#clinic-pilot">
            {locale === "th" ? "ขอเดโมสำหรับคลินิก" : "Join the pilot"}
          </Button>
          <a href="#clinics">
            {locale === "th" ? "ดูประสบการณ์ 3D" : "Request a demo"}{" "}
            <ArrowRight size={16} />
          </a>
        </div>
      </section>
    </div>
  );
}

/* Sections below carry over content doodee's landing had and qijek did not.
 * They reuse qijek's own section-shell / section-heading / trust-columns
 * markup so styles.css already covers them — no new CSS, no new palette. */

function AboutSection({ locale }: { locale: Locale }) {
  const copy = siteCopy[locale].about;
  return (
    <section className="trust section-shell" id="about">
      <div className="section-heading section-heading--center">
        <span className="section-eyebrow">
          <Sparkles size={14} /> {copy.label}
        </span>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
      <div className="trust-columns">
        {[Target, ShieldCheck, Heart].map((Icon, index) => (
          <article key={copy.values[index][0]}>
            <span>
              <Icon />
            </span>
            <h3>{copy.values[index][0]}</h3>
            <p>{copy.values[index][1]}</p>
          </article>
        ))}
      </div>
      <div className="about-banner">
        <div>
          <span className="section-eyebrow">{copy.bannerLabel}</span>
          <h3>{copy.bannerTitle}</h3>
          <p>{copy.bannerBody}</p>
        </div>
      </div>
    </section>
  );
}

function DataWeUse({ locale }: { locale: Locale }) {
  const copy = siteCopy[locale].data;
  return (
    <section className="trust section-shell" id="data">
      <div className="section-heading section-heading--center">
        <span className="section-eyebrow">
          <Database size={14} /> {copy.label}
        </span>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
      <div className="trust-columns">
        {[Eye, Cpu, Database, LockKeyhole].map((Icon, index) => (
          <article key={copy.items[index][0]}>
            <span>
              <Icon />
            </span>
            <h3>{copy.items[index][0]}</h3>
            <p>{copy.items[index][1]}</p>
          </article>
        ))}
      </div>
      <div className="data-guarantee">
        <h3>
          <ShieldCheck size={18} /> {copy.guaranteeTitle}
        </h3>
        <ul>
          {copy.guarantees.map((line) => (
            <li key={line}>
              <Check size={16} />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ContactSection({ locale }: { locale: Locale }) {
  const copy = siteCopy[locale].contact;
  const channels = [
    [copy.lineLabel, "@doodee.ai", "https://line.me/R/ti/p/@doodee.ai"],
    [copy.emailLabel, "hello@doodee.app", "mailto:hello@doodee.app"],
    [copy.partnerLabel, "hello@doodee.app", "mailto:hello@doodee.app"],
  ] as const;
  return (
    <section className="contact section-shell" id="contact">
      <div className="section-heading section-heading--center">
        <span className="section-eyebrow">
          <Mail size={14} /> {copy.label}
        </span>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
      <div className="contact-grid">
        <article>
          <h3>{copy.channelsTitle}</h3>
          <ul className="contact-channels">
            {channels.map(([label, value, href]) => (
              <li key={value}>
                <span>{label}</span>
                <a href={href}>{value}</a>
              </li>
            ))}
          </ul>
        </article>
        <article>
          <h3>{copy.hoursTitle}</h3>
          <p>{copy.hours}</p>
          <Button href="mailto:hello@doodee.app">{copy.write}</Button>
        </article>
      </div>
    </section>
  );
}

function LandingPage() {
  const [showIntro, setShowIntro] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [headerCompact, setHeaderCompact] = useState(false);
  const { locale, chooseLocale, copy } = useLocale();
  const [market, setMarket] = useState<Market>(() =>
    document.cookie.includes("doodee_market=TH") ? "TH" : "GLOBAL",
  );
  const [marketReady, setMarketReady] = useState(false);
  const cursorAuraRef = useRef<HTMLSpanElement>(null);
  const cursorFrameRef = useRef(0);
  const year = useMemo(() => new Date().getFullYear(), []);
  const paidPrice = market === "TH" ? "฿299" : "$19.99";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/geo", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((geo: { market?: Market }) => {
        if (cancelled) return;
        const nextMarket = geo.market === "TH" ? "TH" : "GLOBAL";
        setMarket(nextMarket);
        // Match the attributes api/geo.js sets server-side; dropping Secure
        // here would downgrade the cookie the serverless function just wrote.
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `doodee_market=${nextMarket}; Path=/; Max-Age=2592000; SameSite=Lax${secure}`;
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setMarketReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timeout = window.setTimeout(
      () => setShowIntro(false),
      reducedMotion ? 80 : 1750,
    );
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (showIntro || !window.location.hash) return;
    window.requestAnimationFrame(() =>
      document.querySelector(window.location.hash)?.scrollIntoView(),
    );
  }, [showIntro]);

  const tiltTrustCard = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty("--trust-light-x", `${x * 100}%`);
    card.style.setProperty("--trust-light-y", `${y * 100}%`);
  };

  const resetTrustCard = (event: React.PointerEvent<HTMLElement>) => {
    event.currentTarget.style.removeProperty("--trust-light-x");
    event.currentTarget.style.removeProperty("--trust-light-y");
  };

  const tiltPriceCard = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty("--price-x", `${x * 100}%`);
    card.style.setProperty("--price-y", `${y * 100}%`);
  };

  const resetPriceCard = (event: React.PointerEvent<HTMLElement>) => {
    event.currentTarget.style.removeProperty("--price-x");
    event.currentTarget.style.removeProperty("--price-y");
  };

  const movePointerLight = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--mouse-x",
      `${event.clientX - rect.left}px`,
    );
    event.currentTarget.style.setProperty(
      "--mouse-y",
      `${event.clientY - rect.top}px`,
    );
    event.currentTarget.style.setProperty("--mouse-active", "1");
  };

  const resetPointerLight = (event: React.PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--mouse-active", "0");
  };

  const moveCursorAura = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch" || cursorFrameRef.current) return;
    const x = event.clientX;
    const y = event.clientY;
    cursorFrameRef.current = window.requestAnimationFrame(() => {
      cursorFrameRef.current = 0;
      if (cursorAuraRef.current)
        cursorAuraRef.current.style.transform = `translate3d(${x}px,${y}px,0)`;
    });
  };

  useEffect(() => {
    let frame = 0;
    let compact = window.scrollY > 80;
    const updateHeader = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const next = window.scrollY > 80;
        if (next !== compact) {
          compact = next;
          setHeaderCompact(next);
        }
      });
    };
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateHeader);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const selectors = [
      ".appearance-evidence__intro > *",
      ".evidence-index button",
      ".analysis-transition > *",
      ".analysis-showcase .product-preview",
      ".treatment-preview__intro > *",
      ".treatment-preview__card",
      ".next-steps__intro > *",
      ".next-steps__paths article",
      ".next-steps__footer > *",
      ".progress-plan__heading > *",
      ".progress-plan__body",
      ".section-heading > *",
      ".engine-steps article",
      ".engine-demo > *",
      ".spectrum-track article",
      ".trust-columns article",
      ".consultation-bridge__line",
      ".consultation-bridge__glass > *",
      ".clinic-bridge__intro > *",
      ".clinic-business__heading > *",
      ".clinic-benefit-grid article",
      ".clinic-hardware__visual",
      ".clinic-hardware__copy > *",
      ".clinic-demo-cta > *",
      ".price-plans article",
      ".faq-item",
      ".audience-cta article",
      ".footer-grid > *",
    ];
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(selectors.join(",")),
    );
    elements.forEach((element, index) => {
      element.classList.add("scroll-reveal");
      element.style.setProperty("--reveal-order", String(index % 4));
    });
    document.documentElement.classList.add("motion-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.revealed = "true";
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -7% 0px" },
    );
    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("motion-ready");
    };
  }, []);

  return (
    <main id="top" onPointerMove={moveCursorAura}>
      <span ref={cursorAuraRef} className="cursor-aura" aria-hidden="true" />
      {showIntro && <LogoIntro />}
      <div
        className="hero-stage mouse-light-surface"
        onPointerMove={movePointerLight}
        onPointerLeave={resetPointerLight}
      >
        <header
          className={
            headerCompact ? "site-header site-header--compact" : "site-header"
          }
        >
          <Brand href="#top" />
          <nav
            id="main-navigation"
            className={menuOpen ? "nav nav--open" : "nav"}
            aria-label="Main navigation"
          >
            {copy.nav.map((label, index) => (
              <a
                key={label}
                href={
                  ["#product", "#research", "#safety", "#clinics", "#pricing"][
                    index
                  ]
                }
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </a>
            ))}
            <div className="mobile-nav-actions">
              <Button href="/login">{copy.start}</Button>
            </div>
          </nav>
          <div className="locale-switch header-locale" aria-label="Language">
            <button
              className={locale === "th" ? "is-active" : ""}
              onClick={() => chooseLocale("th")}
              aria-pressed={locale === "th"}
            >
              TH
            </button>
            <span>/</span>
            <button
              className={locale === "en" ? "is-active" : ""}
              onClick={() => chooseLocale("en")}
              aria-pressed={locale === "en"}
            >
              EN
            </button>
          </div>
          <div className="header-actions">
            <div className="locale-switch" aria-label="Language">
              <button
                className={locale === "th" ? "is-active" : ""}
                onClick={() => chooseLocale("th")}
                aria-pressed={locale === "th"}
              >
                TH
              </button>
              <span>/</span>
              <button
                className={locale === "en" ? "is-active" : ""}
                onClick={() => chooseLocale("en")}
                aria-pressed={locale === "en"}
              >
                EN
              </button>
            </div>
            <Button href="/login">{copy.start}</Button>
          </div>
          <button
            className="menu-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            aria-controls="main-navigation"
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </header>

        <img
          className="landing-science-art landing-science-art--dna"
          src="/assets/science/dna-glass-v1.webp"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          decoding="async"
        />
        <img
          className="static-luxury-art static-luxury-art--ring"
          src="/assets/science/optical-ring-v1.webp"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          decoding="async"
        />

        <section className="hero section-shell">
          <div className="hero-copy">
            <div className="hero-message">
              <h1 aria-label={copy.hero}>
                {copy.hero.split(" ").map((word, index) => (
                  <Fragment key={word}>
                    <span
                      className="hero-word"
                      aria-hidden="true"
                      style={{ animationDelay: `${80 + index * 55}ms` }}
                    >
                      {word}
                    </span>{" "}
                  </Fragment>
                ))}
              </h1>
              <div className="accent-line" />
              <p>{copy.heroBody}</p>
              <div className="hero-actions">
                <Button href="/login">{copy.start}</Button>
                <Button ghost href="#product">
                  {copy.sample}
                </Button>
              </div>
            </div>
            <div className="hero-trust-zone">
              <div className="hero-assurances" aria-label="Product assurances">
                <span>
                  <ShieldCheck size={15} /> {copy.assurances[0]}
                </span>
                <span>
                  <ScanFace size={15} /> {copy.assurances[1]}
                </span>
                <span>
                  <LockKeyhole size={15} /> {copy.assurances[2]}
                </span>
              </div>
              <div className="trust-strip" aria-label="Product proof">
                <div className="trust-track">
                  {Array.from({ length: 6 }, () =>
                    locale === "th" ? proofItemsTh : proofItems,
                  ).flat().map(([title, detail], index) => (
                    <div
                      aria-hidden={index >= proofItems.length || undefined}
                      key={`${title}-${index}`}
                    >
                      <strong>{title}</strong>
                      <span>{detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <AboutSection locale={locale} />

      <AppearanceEvidence locale={locale} />

      <section className="analysis-showcase section-shell" id="product">
        <img
          className="static-luxury-art static-luxury-art--molecule"
          src="/assets/science/molecular-lattice-v1.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        />
        <div className="analysis-transition">
          <h2>{copy.analysisTitle}</h2>
          <p>{copy.analysisBody}</p>
          <span>
            <MousePointer2 size={15} /> {copy.interactive}
          </span>
        </div>
        <ProductPreview locale={locale} />
      </section>

      <div className="science-ribbon-divider" aria-hidden="true">
        <img
          src="/assets/science/chrome-ribbon-v1.webp"
          alt=""
          loading="lazy"
          decoding="async"
        />
      </div>

      <TreatmentPreview locale={locale} />

      <NextSteps locale={locale} />

      <ProgressTimeline locale={locale} />

      <section className="trust" id="safety">
        <div className="section-shell">
          <img
            className="landing-science-art landing-science-art--collagen"
            src="/assets/science/collagen-ribbon-v1.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
          <img
            className="static-luxury-art static-luxury-art--pearls"
            src="/assets/science/micro-pearls-v1.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
          <div className="section-heading section-heading--center">
            <h2>{copy.safetyTitle}</h2>
          </div>
          <div className="trust-columns">
            {[LockKeyhole, BarChart3, Eye, FileText].map((Icon, index) => (
              <article
                key={copy.safety[index][0]}
                onPointerMove={tiltTrustCard}
                onPointerLeave={resetTrustCard}
              >
                <span>
                  <Icon />
                </span>
                <h3>{copy.safety[index][0]}</h3>
                <p>{copy.safety[index][1]}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <DataWeUse locale={locale} />

      <section className="pricing section-shell" id="pricing">
        <img
          className="static-luxury-art static-luxury-art--arcs"
          src="/assets/science/calibration-arcs-v1.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        />
        <div className="section-heading">
          <h2>
            {copy.pricingTitle.split("\n").map((line, index) => (
              <Fragment key={line}>
                {line}
                {index === 0 && <br />}
              </Fragment>
            ))}
          </h2>
          <p>{copy.pricingBody}</p>
        </div>
        <div className="price-plans">
          <article
            onPointerMove={tiltPriceCard}
            onPointerLeave={resetPriceCard}
          >
            <div className="price-copy">
              <h3>{copy.freeTitle}</h3>
              <strong>{market === "TH" ? "฿0" : "$0"}</strong>
              <p>{copy.freeBody}</p>
            </div>
            <ul>
              {copy.freeFeatures.map((feature) => (
                <li key={feature}>
                  <Check />
                  {feature}
                </li>
              ))}
            </ul>
            <Button ghost href="/login">{copy.startFree}</Button>
          </article>
          <article
            className="plan-featured"
            onPointerMove={tiltPriceCard}
            onPointerLeave={resetPriceCard}
          >
            <span className="price-badge">{copy.membership}</span>
            <div className="price-copy">
              <h3>{copy.completeTitle}</h3>
              <strong className={marketReady ? "" : "price-loading"}>
                {paidPrice}
                <small>{locale === "th" ? "/เดือน" : "/month"}</small>
              </strong>
              <p>{copy.completeBody}</p>
            </div>
            <ul>
              {copy.completeFeatures.map((feature) => (
                <li key={feature}>
                  <Check />
                  {feature}
                </li>
              ))}
            </ul>
            <Button href="/login">{copy.startMonthly}</Button>
          </article>
        </div>
      </section>

      <ConsultationBridge locale={locale} />
      <ClinicBridge locale={locale} />
      <ClinicBusinessFlow locale={locale} />

      <ContactSection locale={locale} />

      <section className="faq section-shell">
        <img
          className="static-luxury-art static-luxury-art--specimen"
          src="/assets/science/crystal-specimen-v1.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        />
        <div className="section-heading">
          <h2>
            {locale === "th" ? "คำถามที่พบบ่อย" : "Frequently asked questions"}
          </h2>
        </div>
        <div className="faq-list">
          {(locale === "th" ? faqsTh : faqs).map(
            ([question, answer], index) => (
              <article
                className={openFaq === index ? "faq-item is-open" : "faq-item"}
                key={question}
                onMouseEnter={() => setOpenFaq(index)}
                onFocus={() => setOpenFaq(index)}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  aria-expanded={openFaq === index}
                >
                  <span>{question}</span>
                  <ChevronDown />
                </button>
                <div>
                  <p>{answer}</p>
                </div>
              </article>
            ),
          )}
        </div>
      </section>

      <section
        className="audience-cta section-shell mouse-light-surface"
        aria-label="Get started"
        onPointerMove={movePointerLight}
        onPointerLeave={resetPointerLight}
      >
        <article>
          <span>{copy.forYou}</span>
          <h2>{copy.userCtaTitle}</h2>
          <p>{copy.userCtaBody}</p>
          <Button href="/login">{copy.start}</Button>
        </article>
        <article>
          <span>{copy.forClinics}</span>
          <h2>{copy.clinicCtaTitle}</h2>
          <p>{copy.clinicCtaBody}</p>
          <Button href="#clinic-pilot">{copy.joinPilot}</Button>
        </article>
      </section>

      <footer>
        <div className="section-shell footer-grid">
          <Brand />
          <nav>
            {copy.nav.map((label, index) => (
              <a
                key={label}
                href={
                  ["#product", "#research", "#safety", "#clinics", "#pricing"][
                    index
                  ]
                }
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="locale-switch locale-switch--footer">
            <button
              className={locale === "th" ? "is-active" : ""}
              onClick={() => chooseLocale("th")}
            >
              TH
            </button>
            <span>/</span>
            <button
              className={locale === "en" ? "is-active" : ""}
              onClick={() => chooseLocale("en")}
            >
              EN
            </button>
          </div>
          {/* The two legal documents, reusing the labels the login screen already
              shows in both locales. A footer is where a visitor looks for these,
              and until now the only link to either was a dead `#terms` anchor. */}
          <nav className="footer-legal">
            <Link to="/terms">{copy.login.terms}</Link>
            <Link to="/privacy">{copy.login.privacy}</Link>
          </nav>
          <p>
            © {year} DOODEE. {copy.footer}
          </p>
        </div>
      </footer>
    </main>
  );
}

export default LandingPage;
