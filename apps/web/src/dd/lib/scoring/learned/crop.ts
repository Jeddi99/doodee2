import type { Landmarks } from "@/types";
import type { NormalizeMode } from "./manifest";

// SCUT-FBP5500 + most public face-attractiveness checkpoints expect
// ImageNet normalization. Standard values:
const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

/**
 * Default input dimension — used when the manifest doesn't override.
 * Matches the SCUT-FBP5500 / ResNet-50 / EfficientNet-B0 convention.
 */
export const MODEL_INPUT_SIZE = 224;

/**
 * Compute a tight face bounding box from MediaPipe landmarks, then
 * expand outward by `padding` (default 15%) to include hair / jaw —
 * SCUT-FBP5500 was trained on portraits including those regions.
 *
 * Returns image-pixel coords (not normalized). Clamped to image bounds.
 */
export function landmarkBounds(
  landmarks: Landmarks,
  w: number,
  h: number,
  padding: number = 0.15
): { x: number; y: number; w: number; h: number } {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const p of landmarks) {
    const px = p.x * w;
    const py = p.y * h;
    if (px < xMin) xMin = px;
    if (px > xMax) xMax = px;
    if (py < yMin) yMin = py;
    if (py > yMax) yMax = py;
  }
  if (!isFinite(xMin) || !isFinite(yMin)) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  const fw = xMax - xMin;
  const fh = yMax - yMin;
  // Expand the bbox to capture context. Square-ish (square crops train
  // most stably) — pick the larger dimension, then pad symmetrically.
  const side = Math.max(fw, fh) * (1 + padding);
  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;
  let x = cx - side / 2;
  let y = cy - side / 2;
  let s = side;

  // Clamp to image bounds
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + s > w) s = w - x;
  if (y + s > h) s = h - y;

  return { x, y, w: s, h: s };
}

/**
 * Render a face crop onto a `size × size` canvas and return the RGBA
 * pixel array. Caller-supplied canvas keeps allocations off the hot
 * path; caller controls the size to match the model's expected input.
 *
 * @returns Uint8ClampedArray of length size × size × 4 (RGBA), or null
 *          when the crop bounds are empty / image not loaded yet.
 */
export function renderFaceCrop(
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: Landmarks,
  outCanvas: HTMLCanvasElement,
  size: number = MODEL_INPUT_SIZE
): Uint8ClampedArray | null {
  const srcW =
    image instanceof HTMLImageElement
      ? image.naturalWidth || image.width
      : image.width;
  const srcH =
    image instanceof HTMLImageElement
      ? image.naturalHeight || image.height
      : image.height;
  if (srcW === 0 || srcH === 0) return null;

  const bb = landmarkBounds(landmarks, srcW, srcH);
  if (bb.w <= 0 || bb.h <= 0) return null;

  if (outCanvas.width !== size) outCanvas.width = size;
  if (outCanvas.height !== size) outCanvas.height = size;
  const ctx = outCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  // Black background so partial off-canvas crops don't leak undefined
  // pixels. Then draw the crop from the original image scaled to fit.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  try {
    ctx.drawImage(image, bb.x, bb.y, bb.w, bb.h, 0, 0, size, size);
  } catch {
    return null;
  }

  try {
    const imgData = ctx.getImageData(0, 0, size, size);
    return imgData.data;
  } catch {
    return null;
  }
}

/**
 * Convert an RGBA pixel buffer (`size × size × 4` bytes, range 0..255)
 * into a Float32Array shaped `[1, 3, size, size]` with the requested
 * normalization applied. NCHW order is the PyTorch/ONNX standard.
 *
 * Normalize modes:
 *  - **imagenet** — `(p/255 - mean) / std` with ImageNet constants
 *  - **halved**   — `(p/255 - 0.5) / 0.5` → range [-1, 1] (TF-style)
 *  - **none**     — `p/255` → range [0, 1]
 *
 * Layout in returned array (length = 3 × size²):
 *   [R(0,0), R(0,1), ..., G(0,0), ..., B(0,0), ...]
 */
export function pixelsToTensor(
  pixels: Uint8ClampedArray,
  options: { size?: number; normalize?: NormalizeMode } = {}
): Float32Array {
  const size = options.size ?? MODEL_INPUT_SIZE;
  const mode = options.normalize ?? "imagenet";
  const HW = size * size;
  const out = new Float32Array(3 * HW);
  for (let i = 0; i < HW; i += 1) {
    const r = (pixels[i * 4] ?? 0) / 255;
    const g = (pixels[i * 4 + 1] ?? 0) / 255;
    const b = (pixels[i * 4 + 2] ?? 0) / 255;
    if (mode === "imagenet") {
      out[i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
      out[i + HW] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
      out[i + HW * 2] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
    } else if (mode === "halved") {
      out[i] = (r - 0.5) / 0.5;
      out[i + HW] = (g - 0.5) / 0.5;
      out[i + HW * 2] = (b - 0.5) / 0.5;
    } else {
      // mode === "none"
      out[i] = r;
      out[i + HW] = g;
      out[i + HW * 2] = b;
    }
  }
  return out;
}

/**
 * Backward-compat: 224×224 ImageNet-normalized tensor. Used by older
 * tests; new code should call `pixelsToTensor` directly with options.
 */
export function pixelsToImageNetTensor(
  pixels: Uint8ClampedArray,
  size: number = MODEL_INPUT_SIZE
): Float32Array {
  return pixelsToTensor(pixels, { size, normalize: "imagenet" });
}

/**
 * One-shot: crop the face from `image` using `landmarks`, then produce
 * a normalized NCHW tensor. Caller-supplied scratch canvas. Returns
 * null on failure (empty landmarks, zero-sized image).
 */
export function cropToTensor(
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: Landmarks,
  scratchCanvas: HTMLCanvasElement,
  options: { size?: number; normalize?: NormalizeMode } = {}
): Float32Array | null {
  const size = options.size ?? MODEL_INPUT_SIZE;
  const pixels = renderFaceCrop(image, landmarks, scratchCanvas, size);
  if (!pixels) return null;
  return pixelsToTensor(pixels, options);
}
