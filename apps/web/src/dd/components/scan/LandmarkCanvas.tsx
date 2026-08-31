"use client";

import { useEffect, useRef } from "react";
import type { Landmarks } from "@/types";

interface LandmarkCanvasProps {
  image: HTMLImageElement;
  landmarks: Landmarks;
  highlightLines?: ReadonlyArray<readonly [number, number]>;
  maxWidth?: number;
}

export function LandmarkCanvas({
  image,
  landmarks,
  highlightLines,
  maxWidth = 560,
}: LandmarkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scale = Math.min(1, maxWidth / image.naturalWidth);
    canvas.width = image.naturalWidth * scale;
    canvas.height = image.naturalHeight * scale;

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Phase 192af — the dense cyan landmark-dot mesh was removed per request
    // (it cluttered the analyzed photo). Optional measurement overlays still
    // draw when a caller explicitly passes `highlightLines`.
    if (highlightLines && highlightLines.length > 0) {
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2;
      ctx.fillStyle = "#06b6d4";
      for (const [a, b] of highlightLines) {
        const pa = landmarks[a];
        const pb = landmarks[b];
        if (!pa || !pb) continue;
        const ax = pa.x * canvas.width;
        const ay = pa.y * canvas.height;
        const bx = pb.x * canvas.width;
        const by = pb.y * canvas.height;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ax, ay, 3, 0, Math.PI * 2);
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [image, landmarks, highlightLines, maxWidth]);

  // Phase 192af — framed photo (clean rounded frame, theme-aware) instead of
  // a bare canvas with a hairline border.
  return (
    <div className="rounded-[1.6rem] border border-black/10 bg-white/60 p-2.5 shadow-[0_26px_64px_-44px_rgba(36,31,26,0.55)] backdrop-blur-md dark:border-white/12 dark:bg-white/[0.04] dark:shadow-[0_26px_64px_-40px_rgba(0,0,0,0.7)]">
      <canvas
        ref={canvasRef}
        className="block h-auto w-full max-w-full rounded-[1.1rem]"
      />
    </div>
  );
}
