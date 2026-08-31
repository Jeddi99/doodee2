import type { MetricKey } from "@/types";

/**
 * Population norms (mean, sigma) per metric. Used to compute Z-score
 * and percentile vs the relevant cohort, separately from the
 * `ideal-ranges.ts` aesthetic targets.
 *
 * Source priority where data exists:
 *  - Farkas LG (anthropometric norms, Caucasian baseline)
 *  - Jayaratne 2013 (Hong Kong Chinese cohort, n=103)
 *  - Hwang 2002 (Korean cohort, n=60)
 *  - Wang 2017 (Caucasian + Korean perception thresholds)
 *  - Kim 2018 (Korean female brow tilt, n=99)
 *
 * Where no published cohort exists, values are anatomical estimates
 * tuned so a typical adult lands near the 50th percentile. These
 * metrics get an `evidence: approximated` tag in metric-evidence.ts.
 *
 * Norms are POPULATION distributions (mean, sigma) — different from
 * the ATTRACTIVENESS ideal range in ideal-ranges.ts. The percentile
 * tells the user where they sit in the population; the score tells
 * them how close they are to the aesthetic ideal.
 */
export interface MetricNorm {
  mean: number;
  sigma: number;
}

const N = (mean: number, sigma: number): MetricNorm => ({ mean, sigma });

export const METRIC_NORMS: Record<MetricKey, MetricNorm> = {
  // Angles (degrees)
  "canthal-tilt": N(4.5, 3.2),
  "right-canthal-tilt": N(4.5, 3.2),
  "brow-tilt": N(6, 4.5),
  "gonial-angle": N(135, 5),
  "nasolabial-angle": N(98, 8),
  "facial-convexity": N(172, 6),
  "mentolabial-angle": N(130, 12),
  "forehead-inclination": N(14, 8),
  "nasal-dorsum-angle": N(33, 8),
  "nose-tip-angle": N(82, 9),
  "mouth-tilt": N(1.5, 1.2),
  "eye-tilt-symmetry": N(1.6, 1.4),

  // Dimensionless ratios
  fwhr: N(1.92, 0.13),
  "golden-ratio": N(1.61, 0.09),
  "facial-thirds": N(0.33, 0.03),
  "eye-spacing-ratio": N(1.0, 0.07),
  "nose-mouth-ratio": N(1.52, 0.1),
  "upper-lower-lip-ratio": N(0.66, 0.08),
  "philtrum-chin-ratio": N(0.5, 0.06),
  "lower-third-ratio": N(0.33, 0.03),
  "inter-pupillary-ratio": N(0.45, 0.025),
  "lip-fullness": N(0.085, 0.015),
  "palpebral-fissure-aspect": N(0.38, 0.05),
  "eyebrow-eye-distance": N(0.057, 0.012),
  "eye-width-to-face": N(0.215, 0.018),
  "jaw-width-to-cheek-ratio": N(0.83, 0.06),
  "midface-ratio": N(1.2, 0.13),
  "chin-height-ratio": N(0.15, 0.022),
  "mouth-width-to-face": N(0.4, 0.03),
  "interbrow-distance": N(0.21, 0.022),
  "eye-mouth-distance-ratio": N(0.34, 0.03),
  "lower-face-height-ratio": N(0.345, 0.025),
  "alar-base-width": N(0.275, 0.035),
  "forehead-width-ratio": N(0.88, 0.04),
  "cupids-bow-height": N(0.018, 0.008),
  "nose-length-ratio": N(0.33, 0.025),
  "mouth-chin-distance-ratio": N(0.135, 0.022),
  "brow-arch-height": N(0.09, 0.04),
  "upper-lid-show": N(0.058, 0.014),
  "philtrum-length-ratio": N(0.075, 0.015),

  // Signed face-fraction offsets
  "mouth-corner-tilt": N(0.005, 0.008),
  "lip-e-line": N(-0.02, 0.018),
  "chin-projection": N(0.005, 0.013),
  "upper-lip-protrusion-side": N(0.005, 0.013),
  "lower-lip-protrusion-side": N(0.008, 0.013),

  // Symmetries — already on a 0-1 closeness scale.
  "eye-symmetry": N(0.97, 0.02),
  "mouth-symmetry": N(0.97, 0.02),
  "nose-symmetry": N(0.97, 0.02),
  "brow-symmetry": N(0.97, 0.02),
  "jaw-symmetry": N(0.97, 0.025),

  // Phase 44 additions — population estimates from cited refs where
  // available, anatomical estimates otherwise.
  "eye-aspect-ratio": N(0.3, 0.05), // Soukupová & Čech 2016 awake-eye distribution
  "mouth-aspect-ratio": N(0.35, 0.08), // approximated
  "bizygomatic-width-ratio": N(1.02, 0.06), // Farkas + Hwang Korean cohort
  "chin-width-ratio": N(0.35, 0.06), // approximated; wider variance
  "nasal-bridge-width": N(0.43, 0.08), // approximated; Korean wider mean
  // Phase 44 second batch
  "brow-thickness-symmetry": N(0.92, 0.05),
  "eye-vertical-symmetry": N(0.025, 0.018),
  "forehead-height-ratio": N(0.33, 0.04),
  "eyebrow-arch-position": N(0.62, 0.08),
  "lip-corner-tilt": N(0.005, 0.012),
};
