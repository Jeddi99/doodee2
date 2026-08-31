import type { MetricKey } from "@/types";

/**
 * Per-metric plausible-human bounds — values outside these ranges are
 * almost certainly landmark detection errors (wrong landmark, occluded
 * face, non-face image) rather than real anatomical outliers.
 *
 * The pipeline (`computeAll`) checks `raw` against these bounds and,
 * when violated, sets `score: 0` and `flagged: true` on the result and
 * excludes the metric from category / overall aggregation.
 *
 * Bounds are intentionally **wider** than the ideal ranges in
 * `ideal-ranges.ts` — a person at the statistical extreme of normal
 * human variation is NOT flagged. Only physically impossible values are.
 *
 * Sources: anthropometric extremes (Farkas norms ±3σ), cephalometric
 * surgical guidelines, and the +/- envelope around published mean
 * values in the existing citations.
 */
export const SANITY_BOUNDS: Record<MetricKey, [number, number]> = {
  // Angles (degrees)
  "canthal-tilt": [-25, 35],
  "right-canthal-tilt": [-25, 35],
  "brow-tilt": [-30, 40],
  "gonial-angle": [80, 160],
  "nasolabial-angle": [50, 160],
  "facial-convexity": [120, 200],
  "mentolabial-angle": [60, 180],
  "forehead-inclination": [-5, 60],
  "nasal-dorsum-angle": [0, 90],

  // Dimensionless ratios
  fwhr: [0.8, 3.5],
  "golden-ratio": [0.8, 2.5],
  // Phase 18c: tightened low bound. Values < 0.22 = upper-third
  // less than 22% of face = almost certainly MediaPipe foreheadApex(10)
  // detected at the hairline (with hair covering the trichion).
  //
  // Phase 102: relaxed back to 0.18. Empirical test on SCUT n=2200
  // showed facial-thirds is the *top* correlator (r=0.445) but the
  // tight 0.22 bound excludes ~25% of records (hair-covered foreheads
  // are common). Widening to 0.18 keeps the noisy-but-informative reads
  // in, lifting overall r from 0.393 → 0.402 AND adding +0.45 to Brad
  // Pitt's harmony category (his foreheadApex is on hairline at 0.201).
  "facial-thirds": [0.18, 0.55],
  "eye-spacing-ratio": [0.3, 2.0],
  "nose-mouth-ratio": [0.5, 3.0],
  "upper-lower-lip-ratio": [0.1, 1.5],
  "philtrum-chin-ratio": [0.1, 1.5],
  "lower-third-ratio": [0.1, 0.6],
  "inter-pupillary-ratio": [0.2, 0.7],
  "lip-fullness": [0.005, 0.15],
  // Phase 18c: tightened low end. Aspect < 0.18 = eyes almost closed,
  // almost always a MediaPipe lid landmark misdetection rather than a
  // real anatomical signal.
  "palpebral-fissure-aspect": [0.18, 0.6],
  "eyebrow-eye-distance": [0.005, 0.18],
  "eye-width-to-face": [0.05, 0.4],
  "jaw-width-to-cheek-ratio": [0.4, 1.2],
  "midface-ratio": [0.4, 2.5],
  "chin-height-ratio": [0.02, 0.35],
  "mouth-width-to-face": [0.15, 0.65],
  "interbrow-distance": [0.05, 0.45],
  "eye-mouth-distance-ratio": [0.1, 0.55],
  "lower-face-height-ratio": [0.15, 0.5],
  "alar-base-width": [0.1, 0.5],

  // Signed face-fraction offsets
  "mouth-corner-tilt": [-0.05, 0.05],
  "lip-e-line": [-0.12, 0.12],
  "chin-projection": [-0.12, 0.12],
  "upper-lip-protrusion-side": [-0.12, 0.12],
  "lower-lip-protrusion-side": [-0.12, 0.12],

  // Symmetries (already bounded by formula to [0, 1])
  "eye-symmetry": [0, 1],
  "mouth-symmetry": [0, 1],
  "nose-symmetry": [0, 1],
  "brow-symmetry": [0, 1],
  "jaw-symmetry": [0, 1],

  // New (Phase 16) metrics
  // Phase 102 reverted: widening 140→170 admitted pitched-reference 146.9°
  // back into the features bucket, but the ideal range [72, 88] is
  // population-mean from frontal anatomical photos. A 146.9° reading is
  // a 2D-projection artifact under slight pitch — keep flagged so the
  // metric is excluded entirely, not scored against a mismatched ideal.
  "nose-tip-angle": [40, 140],
  "cupids-bow-height": [-0.01, 0.08],
  "forehead-width-ratio": [0.5, 1.3],
  "eye-tilt-symmetry": [0, 30],
  "nose-length-ratio": [0.15, 0.55],
  "mouth-chin-distance-ratio": [0.03, 0.3],
  "brow-arch-height": [0, 0.35],
  "upper-lid-show": [0.005, 0.15],
  "philtrum-length-ratio": [0.015, 0.18],
  "mouth-tilt": [0, 30],
  // Phase 44 additions — wide-but-plausible bounds
  "eye-aspect-ratio": [0.02, 0.6], // < 0.02 = degenerate; > 0.6 = lid landmarks misdetected
  "mouth-aspect-ratio": [0.02, 0.95], // open mouth / surprised; > 0.95 implausible
  "bizygomatic-width-ratio": [0.4, 1.9], // very long face → very wide diamond
  "chin-width-ratio": [0.08, 0.7], // very narrow tip → unusually wide chin
  "nasal-bridge-width": [0.15, 0.95], // narrow bridge → very flat nose
  // Phase 44 second batch
  "brow-thickness-symmetry": [0, 1],
  "eye-vertical-symmetry": [0, 0.5],
  "forehead-height-ratio": [0.1, 0.6],
  "eyebrow-arch-position": [0, 1],
  "lip-corner-tilt": [-0.15, 0.15],
};
