import type { Landmark } from "@/types";
import { faceFrameY } from "@/lib/utils/geometry";

/**
 * Detect when MediaPipe placed a gonion landmark (172/397) on or below
 * the chin level — geometrically impossible for a real face, typically
 * caused by:
 *
 * - High-contrast shirt collar that the lower-face contour follows
 *   onto the chest
 * - Heavy beard / hidden jaw angle
 * - Heavy yaw making the visible jaw angle drop below the chin in the
 *   2D photo plane
 *
 * Returns true if either gonion sits at or beyond the chin's face-frame
 * depth (with a small tolerance). Used by `gonial-angle`,
 * `jaw-symmetry`, and `jaw-width-to-cheek-ratio` to early-return a
 * sentinel out-of-sanity value so the pipeline flags + excludes the
 * metric instead of scoring against a corrupted measurement.
 */
export function gonionLooksBelowChin(
  leftGonion: Landmark,
  rightGonion: Landmark,
  chin: Landmark,
  forehead: Landmark
): boolean {
  const chinDepth = faceFrameY(chin, forehead, chin);
  if (chinDepth <= 0) return true;
  const leftDepth = faceFrameY(leftGonion, forehead, chin);
  const rightDepth = faceFrameY(rightGonion, forehead, chin);
  // A real gonion sits well above the chin in face-frame Y. Tolerance
  // allows for slightly down-tilted poses but rejects clear neck/collar
  // mis-detections.
  const limit = chinDepth * 0.97;
  return leftDepth > limit || rightDepth > limit;
}
