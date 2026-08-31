/**
 * Whether the light on a face is good enough to measure skin by — checked before the shutter.
 *
 * ## Why this exists
 *
 * `skin_engine.py` refuses a photograph whose two cheeks are more than 1.55 apart in lightness,
 * whose grey-world channel ratios drift past 0.22, or where more than 6% of a patch has hit the
 * end of a channel's range. Those are the right refusals — a within-image comparison cannot undo
 * side lighting, and a channel pinned at 255 has thrown its information away.
 *
 * The problem was when the user found out. Measured on the reference photograph shipped in this
 * repository — a studio shot, and the one the capture screen uses as its own angle guide — the
 * cheeks read L* 80 and L* 51, a ratio of 1.58. Ordinary window light puts a real person over
 * the line. Today they learn that after uploading, waiting for the worker, and opening a screen
 * that shows advisories where numbers should be, with no way back except guessing.
 *
 * So the same three questions get asked of the live preview, and the answer is shown while the
 * user can still move.
 *
 * ## What this is not
 *
 * It is not the gate. The gate is `skin_engine`, in Lab, on the full-resolution photograph that
 * was actually submitted. This runs on a downscaled preview frame in luma, over convex hulls
 * rather than exact masks, on whatever exposure the webcam's auto-exposure landed on. It does
 * not need to agree with Python pixel for pixel — it needs to be right often enough to save a
 * retake, and to never be so wrong that it blocks a photograph the server would have accepted.
 * That last property is why the thresholds here are the Python ones rather than tighter: a
 * client stricter than the server refuses good photographs, which is the failure this module
 * was written to remove, only earlier in the flow.
 *
 * Everything below is arithmetic over numbers someone else sampled. No canvas, no bitmap, no
 * worker — so it runs under `node --test`, the same arrangement `uploadSlot.ts` uses.
 */

/**
 * Thresholds copied from backend/doodee/skin_engine.py.
 *
 * MUST equal `MAX_SHADOW_RATIO`, `MAX_COLOUR_CAST` and `MAX_CLIPPED_FRACTION` there. There is no
 * shared build artifact between the Python and TypeScript halves of this project, so the two
 * copies are kept honest the way the pose sign convention already is: a comment pointing at the
 * other file, and a test that hardcodes the Python values and fails loudly when they drift.
 * `skin_engine.ENGINE_VERSION` is the marker to bump when any of them changes meaning.
 */
export const MAX_SHADOW_RATIO = 1.55;
export const MAX_COLOUR_CAST = 0.22;
export const MAX_CLIPPED_FRACTION = 0.06;

/** Below this a patch is too dark for its ratio against the other cheek to mean anything. */
export const MIN_CHEEK_LUMA = 20;

export type SkinLightingCode = "uneven_lighting" | "colour_cast" | "blown_highlights";

/** What the worker samples off one preview frame, per region, in 0-255 luma and mean channels. */
export type SkinLightingSample = {
  /** Mean luma of the left cheek patch, as it appears to the camera. */
  leftCheek: number;
  /** Mean luma of the right cheek patch. */
  rightCheek: number;
  /** Mean R, G, B over the whole frame — grey-world, matching `_capture_conditions`. */
  meanRgb: readonly [number, number, number];
  /** Share of sampled face pixels with any channel at the end of its range. */
  clippedFraction: number;
};

export type SkinLighting = {
  shadowRatio: number;
  colourCast: number;
  clippedFraction: number;
  /** The single thing to say, or null when nothing is wrong. */
  code: SkinLightingCode | null;
};

/**
 * How far the brighter cheek is above the darker one.
 *
 * The engine compares CIELAB lightness; this compares luma, which is a different curve over the
 * same quantity. For the purpose — is one side of this face in shadow — they move together, and
 * the divergence is smaller than the margin a user has to work with when they turn towards a
 * window. Returns 1 when either patch is too dark to divide by, so a badly underexposed frame is
 * reported as too dark by the existing brightness check rather than as uneven by this one.
 */
export function shadowRatio(leftCheek: number, rightCheek: number): number {
  if (leftCheek < MIN_CHEEK_LUMA || rightCheek < MIN_CHEEK_LUMA) return 1;
  const brighter = Math.max(leftCheek, rightCheek);
  const darker = Math.min(leftCheek, rightCheek);
  return brighter / darker;
}

/**
 * Grey-world cast: how far the most extreme channel sits from the mean of the three.
 *
 * Transcribed from `_capture_conditions`, which reads it off the frame as delivered rather than
 * after white balance — measuring it after correction would report every cast the sclera
 * happened to neutralise as no cast at all.
 */
export function colourCast(meanRgb: readonly [number, number, number]): number {
  const overall = (meanRgb[0] + meanRgb[1] + meanRgb[2]) / 3;
  if (overall <= 0) return 0;
  return Math.max(...meanRgb.map((channel) => Math.abs(channel - overall))) / overall;
}

/**
 * The one thing to tell the user about the light, or null.
 *
 * Ordered by how much it ruins the measurement rather than by how easy it is to fix. Blown
 * highlights come first because a channel at 255 is information that no longer exists — every
 * other problem here still leaves a measurable, if biased, photograph.
 */
export function lightingCode(sample: SkinLightingSample): SkinLightingCode | null {
  if (sample.clippedFraction > MAX_CLIPPED_FRACTION) return "blown_highlights";
  if (shadowRatio(sample.leftCheek, sample.rightCheek) > MAX_SHADOW_RATIO) return "uneven_lighting";
  if (colourCast(sample.meanRgb) > MAX_COLOUR_CAST) return "colour_cast";
  return null;
}

/** Everything at once, for a screen that wants to show the numbers as well as the verdict. */
export function measureLighting(sample: SkinLightingSample): SkinLighting {
  return {
    shadowRatio: shadowRatio(sample.leftCheek, sample.rightCheek),
    colourCast: colourCast(sample.meanRgb),
    clippedFraction: sample.clippedFraction,
    code: lightingCode(sample),
  };
}
