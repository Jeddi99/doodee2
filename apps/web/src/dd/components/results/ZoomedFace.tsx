"use client";

import { useMemo } from "react";
import Image from "next/image";
import { m } from "framer-motion";
import type { Landmarks } from "@/types";

interface ZoomedFaceProps {
  image: HTMLImageElement;
  landmarks: Landmarks;
  measurementLines: ReadonlyArray<readonly [number, number]>;
  viewportSize?: number;
  paddingRatio?: number;
  strokeColor?: string;
  arc?: {
    vertex: number;
    arm1: number;
    arm2: number;
    label: string;
  };
  /**
   * Phase 158.3 — always-visible value label. Rendered as a corner chip
   * for metrics that don't define an arc (symmetry ratios, etc.), so
   * every metric detail page shows a numeric value on the photo.
   */
  valueLabel?: string;
}

interface NormalizedRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function regionBounds(
  landmarks: Landmarks,
  lines: ReadonlyArray<readonly [number, number]>,
  padding: number
): NormalizedRect {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (const [a, b] of lines) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb) continue;
    found = true;
    minX = Math.min(minX, pa.x, pb.x);
    minY = Math.min(minY, pa.y, pb.y);
    maxX = Math.max(maxX, pa.x, pb.x);
    maxY = Math.max(maxY, pa.y, pb.y);
  }
  if (!found) {
    for (const p of landmarks) {
      if (!p) continue;
      found = true;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!found) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const w = maxX - minX;
  const h = maxY - minY;
  const padX = w * padding + 0.04;
  const padY = h * padding + 0.04;
  return {
    minX: Math.max(0, minX - padX),
    minY: Math.max(0, minY - padY),
    maxX: Math.min(1, maxX + padX),
    maxY: Math.min(1, maxY + padY),
  };
}

interface ArcGeometry {
  path: string;
  labelX: number;
  labelY: number;
}

function computeArc(
  landmarks: Landmarks,
  arc: NonNullable<ZoomedFaceProps["arc"]>,
  imgW: number,
  imgH: number
): ArcGeometry | null {
  const v = landmarks[arc.vertex];
  const a1 = landmarks[arc.arm1];
  const a2 = landmarks[arc.arm2];
  if (!v || !a1 || !a2) return null;

  const vX = v.x * imgW;
  const vY = v.y * imgH;
  const a1X = a1.x * imgW;
  const a1Y = a1.y * imgH;
  const a2X = a2.x * imgW;
  const a2Y = a2.y * imgH;

  const d1X = a1X - vX;
  const d1Y = a1Y - vY;
  const d2X = a2X - vX;
  const d2Y = a2Y - vY;
  const l1 = Math.hypot(d1X, d1Y);
  const l2 = Math.hypot(d2X, d2Y);
  if (l1 === 0 || l2 === 0) return null;

  const u1X = d1X / l1;
  const u1Y = d1Y / l1;
  const u2X = d2X / l2;
  const u2Y = d2Y / l2;

  const r = Math.min(l1, l2) * 0.3;
  const startX = vX + r * u1X;
  const startY = vY + r * u1Y;
  const endX = vX + r * u2X;
  const endY = vY + r * u2Y;

  const cross = u1X * u2Y - u1Y * u2X;
  const sweep = cross > 0 ? 1 : 0;

  const midX = u1X + u2X;
  const midY = u1Y + u2Y;
  const midLen = Math.hypot(midX, midY);
  const labelDist = r * 1.9;
  const labelX = midLen > 0.01 ? vX + (midX / midLen) * labelDist : vX;
  const labelY =
    midLen > 0.01 ? vY + (midY / midLen) * labelDist : vY - labelDist;

  const path = `M ${startX.toFixed(1)} ${startY.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 ${sweep} ${endX.toFixed(1)} ${endY.toFixed(1)}`;

  return { path, labelX, labelY };
}

export function ZoomedFace({
  image,
  landmarks,
  measurementLines,
  viewportSize = 320,
  paddingRatio = 0.2,
  strokeColor = "#3f6268",
  arc,
  valueLabel,
}: ZoomedFaceProps) {
  const imgW = image.naturalWidth;
  const imgH = image.naturalHeight;

  const { initial, target } = useMemo(() => {
    const fitScale = Math.min(viewportSize / imgW, viewportSize / imgH);
    const initialState = {
      scale: fitScale,
      x: (viewportSize - imgW * fitScale) / 2,
      y: (viewportSize - imgH * fitScale) / 2,
    };

    const r = regionBounds(landmarks, measurementLines, paddingRatio);
    const rxMin = r.minX * imgW;
    const ryMin = r.minY * imgH;
    const rxMax = r.maxX * imgW;
    const ryMax = r.maxY * imgH;
    const rw = Math.max(1, rxMax - rxMin);
    const rh = Math.max(1, ryMax - ryMin);
    const targetScale = Math.min(viewportSize / rw, viewportSize / rh);
    const cx = (rxMin + rxMax) / 2;
    const cy = (ryMin + ryMax) / 2;
    const targetState = {
      scale: targetScale,
      x: viewportSize / 2 - cx * targetScale,
      y: viewportSize / 2 - cy * targetScale,
    };

    return { initial: initialState, target: targetState };
  }, [landmarks, measurementLines, imgW, imgH, viewportSize, paddingRatio]);

  const arcGeom = arc ? computeArc(landmarks, arc, imgW, imgH) : null;

  // Inverse-scale text so it renders at a fixed viewport size regardless of
  // how aggressively the metric region is zoomed in. Without this the
  // numbers balloon to 100+ px on tight crops.
  const TARGET_TEXT_PX = 18;
  const textFontSize = TARGET_TEXT_PX / target.scale;
  const valueChipFontSize = (TARGET_TEXT_PX - 2) / target.scale;

  // Position the always-visible value chip at the top-right of the
  // measurement region (so it never hides the actual lines/landmarks).
  const valueChip = useMemo(() => {
    if (!valueLabel) return null;
    const r = regionBounds(landmarks, measurementLines, paddingRatio);
    const rxMin = r.minX * imgW;
    const ryMin = r.minY * imgH;
    const rxMax = r.maxX * imgW;
    const inset = 6 / target.scale;
    return {
      x: rxMax - inset,
      y: ryMin + inset + valueChipFontSize,
      padX: 10 / target.scale,
      padY: 6 / target.scale,
      rx: 8 / target.scale,
      // Approximate chip width based on label length so the rounded rect
      // doesn't clip or overflow.
      width: (valueLabel.length * valueChipFontSize * 0.6) + (20 / target.scale),
      height: valueChipFontSize + (12 / target.scale),
      rxMin,
    };
  }, [
    valueLabel,
    landmarks,
    measurementLines,
    imgW,
    imgH,
    paddingRatio,
    target.scale,
    valueChipFontSize,
  ]);

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[#241f1a]/10 bg-white/40 backdrop-blur-md"
      style={{ width: viewportSize, height: viewportSize }}
    >
      <m.div
        initial={{ x: initial.x, y: initial.y, scale: initial.scale }}
        animate={{ x: target.x, y: target.y, scale: target.scale }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: imgW,
          height: imgH,
          transformOrigin: "0 0",
          position: "relative",
        }}
      >
        <Image
          src={image.src}
          width={imgW}
          height={imgH}
          alt=""
          unoptimized
          draggable={false}
          className="block select-none pointer-events-none"
        />
        <svg
          viewBox={`0 0 ${imgW} ${imgH}`}
          width={imgW}
          height={imgH}
          className="absolute inset-0 pointer-events-none"
          style={{
            filter:
              "drop-shadow(0 1px 1px rgba(251,250,247,0.95)) drop-shadow(0 1px 2px rgba(36,31,26,0.28))",
          }}
        >
          {measurementLines.map(([a, b]) => {
            const pa = landmarks[a];
            const pb = landmarks[b];
            if (!pa || !pb) return null;
            return (
              <line
                key={`${a}-${b}`}
                x1={pa.x * imgW}
                y1={pa.y * imgH}
                x2={pb.x * imgW}
                y2={pb.y * imgH}
                stroke={strokeColor}
                strokeWidth={3}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {arcGeom && arc && (
            <g>
              <path
                d={arcGeom.path}
                stroke={strokeColor}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={arcGeom.labelX.toFixed(1)}
                y={arcGeom.labelY.toFixed(1)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#241f1a"
                stroke="rgba(251,250,247,0.96)"
                strokeWidth={2.5 / target.scale}
                paintOrder="stroke"
                style={{
                  fontSize: `${textFontSize.toFixed(2)}px`,
                  fontWeight: 700,
                }}
              >
                {arc.label}
              </text>
            </g>
          )}
          {valueChip && valueLabel && (
            <g>
              <rect
                x={valueChip.x - valueChip.width}
                y={valueChip.y - valueChipFontSize - valueChip.padY}
                width={valueChip.width}
                height={valueChip.height}
                rx={valueChip.rx}
                ry={valueChip.rx}
                fill="rgba(251,250,247,0.92)"
                stroke={strokeColor}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={valueChip.x - valueChip.padX}
                y={valueChip.y - valueChip.padY / 2}
                textAnchor="end"
                dominantBaseline="alphabetic"
                fill="#241f1a"
                style={{
                  fontSize: `${valueChipFontSize.toFixed(2)}px`,
                  fontWeight: 600,
                }}
              >
                {valueLabel}
              </text>
            </g>
          )}
        </svg>
      </m.div>
    </div>
  );
}
