import type { Landmarks } from "@/types";
import { landmarkBounds, MODEL_INPUT_SIZE } from "./crop";

// MediaPipe 478 face mesh — outer eye corners are the most-lateral
// landmarks of each eye. Used to compute the in-plane roll angle for
// canonical face alignment before model inference.
const RIGHT_EYE_OUTER = 33;
const LEFT_EYE_OUTER = 263;

/**
 * In-plane roll angle of the face in **radians**, computed from the
 * outer eye corners (33 ↔ 263). Positive = head tilted clockwise from
 * the viewer's perspective (subject's left ear lower).
 *
 * Returns 0 when either landmark is missing — no rotation applied.
 */
export function eyeLineAngle(landmarks: Landmarks): number {
  const r = landmarks[RIGHT_EYE_OUTER];
  const l = landmarks[LEFT_EYE_OUTER];
  if (!r || !l) return 0;
  return Math.atan2(l.y - r.y, l.x - r.x);
}

export interface AlignOptions {
  /** Bbox padding in [0, 1+]. Defaults 0.15 (matches `landmarkBounds`). */
  padding?: number;
  /** Horizontal flip — for test-time augmentation. */
  flip?: boolean;
  /**
   * Rotate-to-canonical so the eye-line is horizontal. Defaults true.
   * Disable for ablation testing.
   */
  align?: boolean;
  /** Output canvas size (square). Default `MODEL_INPUT_SIZE` (224). */
  size?: number;
}

/**
 * Render an aligned (optionally flipped + padded) face crop onto the
 * provided `outCanvas` and return its RGBA pixel data.
 *
 * The transform pipeline (applied to the canvas in reverse order before
 * drawImage):
 *  1. translate(-cx, -cy)       move face center to origin
 *  2. scale(±scale, scale)      uniform fit + optional horizontal flip
 *  3. rotate(-angle)            canonical eye-line
 *  4. translate(W/2, W/2)       face center to output center
 *
 * Why align: most public face-attractiveness checkpoints were trained
 * on aligned datasets (eye line horizontal). Feeding a tilted face
 * loses ~3-5% accuracy. The rotation undoes the natural head roll.
 *
 * Returns null when the image is not yet loaded or the bbox is empty.
 */
export function alignAndCrop(
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: Landmarks,
  outCanvas: HTMLCanvasElement,
  options: AlignOptions = {}
): Uint8ClampedArray | null {
  const {
    padding = 0.15,
    flip = false,
    align = true,
    size = MODEL_INPUT_SIZE,
  } = options;
  const srcW =
    image instanceof HTMLImageElement
      ? image.naturalWidth || image.width
      : image.width;
  const srcH =
    image instanceof HTMLImageElement
      ? image.naturalHeight || image.height
      : image.height;
  if (srcW === 0 || srcH === 0) return null;

  const bb = landmarkBounds(landmarks, srcW, srcH, padding);
  if (bb.w <= 0 || bb.h <= 0) return null;

  const W = size;
  if (outCanvas.width !== W) outCanvas.width = W;
  if (outCanvas.height !== W) outCanvas.height = W;
  const ctx = outCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  // Black background — partial off-canvas rotations leave corners
  // black instead of undefined pixels.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, W);

  const cx = bb.x + bb.w / 2;
  const cy = bb.y + bb.h / 2;
  const angle = align ? eyeLineAngle(landmarks) : 0;
  // Inflate slightly to absorb the bounding rect of the rotated bbox
  // so we don't clip eye corners after rotation.
  const rotInflate = Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)); // ≥ 1, peak ~1.41 at 45°
  const scale = W / (bb.w * rotInflate);

  ctx.translate(W / 2, W / 2);
  ctx.rotate(-angle);
  ctx.scale(flip ? -scale : scale, scale);
  ctx.translate(-cx, -cy);
  try {
    ctx.drawImage(image, 0, 0);
  } catch {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return null;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  try {
    return ctx.getImageData(0, 0, W, W).data;
  } catch {
    return null;
  }
}
