import type { RefObject } from "react";
import {
  activeEffectCount,
  applyMakeover,
  type MakeoverLook,
} from "@/lib/makeover";
import type { ScanPhoto } from "@/types";

export function renderTryOnCanvas(
  scan: ScanPhoto,
  look: MakeoverLook,
  hairMask: Uint8Array | null | undefined,
  canvasRef: RefObject<HTMLCanvasElement>
) {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const w = scan.image.naturalWidth || scan.image.width;
  const h = scan.image.naturalHeight || scan.image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx || w === 0 || h === 0) return;
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(scan.image, 0, 0, w, h);
  if (activeEffectCount(look) > 0) {
    applyMakeover(ctx, scan.landmarks, look, { hairMask });
  }
}

export function renderTryOnCompare(
  scan: ScanPhoto,
  sourceRef: RefObject<HTMLCanvasElement>,
  beforeRef: RefObject<HTMLCanvasElement>,
  afterRef: RefObject<HTMLCanvasElement>
) {
  const source = sourceRef.current;
  const before = beforeRef.current;
  const after = afterRef.current;
  if (!source || !before || !after) return;
  drawImageToCanvas(scan.image, before);
  drawCanvasToCanvas(source, after);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas export failed"));
    }, "image/png");
  });
}

function drawImageToCanvas(image: HTMLImageElement, target: HTMLCanvasElement) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const ctx = target.getContext("2d");
  if (!ctx || w === 0 || h === 0) return;
  target.width = w;
  target.height = h;
  ctx.drawImage(image, 0, 0, w, h);
}

function drawCanvasToCanvas(source: HTMLCanvasElement, target: HTMLCanvasElement) {
  const ctx = target.getContext("2d");
  if (!ctx || source.width === 0 || source.height === 0) return;
  target.width = source.width;
  target.height = source.height;
  ctx.drawImage(source, 0, 0, source.width, source.height);
}
