import type { MetricKey } from "@/types";

/**
 * Per-metric evidence classification.
 *
 * `research`  — Both the metric (what it measures) AND the ideal range
 *               come from published cephalometric / anthropometric
 *               literature. Universal numbers are defensible.
 * `approximated` — The metric concept is from real literature, but the
 *               exact ideal-range numbers were tuned by judgement, not
 *               read off a paper. Treat as plausible, not definitive.
 *
 * Asian-calibrated ranges are noted as `approximated` in most cases —
 * the directional bias (e.g. flatter dorsum, narrower palpebral fissure)
 * is well-established, but the exact endpoint values are not from a
 * specific Asian-population study. Improving these is the next data
 * pass; see docs/METRIC_AUDIT.md.
 */
export const METRIC_EVIDENCE: Record<MetricKey, "research" | "approximated"> = {
  "canthal-tilt": "research",
  fwhr: "research",
  "gonial-angle": "research",
  "golden-ratio": "research",
  "facial-thirds": "research",
  "eye-spacing-ratio": "research",
  "nose-mouth-ratio": "research",
  "upper-lower-lip-ratio": "approximated",
  "philtrum-chin-ratio": "research",
  "lower-third-ratio": "research",
  "inter-pupillary-ratio": "research",
  "lip-fullness": "research",
  "nasolabial-angle": "research",
  "facial-convexity": "research",
  "lip-e-line": "research",
  "palpebral-fissure-aspect": "research",
  "eyebrow-eye-distance": "research",
  "brow-tilt": "approximated",
  "eye-width-to-face": "research",
  "eye-symmetry": "research",
  "jaw-width-to-cheek-ratio": "approximated",
  "midface-ratio": "approximated",
  "chin-height-ratio": "approximated",
  "mouth-corner-tilt": "approximated",
  "mouth-width-to-face": "approximated",
  "mouth-symmetry": "research",
  "nose-symmetry": "research",
  "brow-symmetry": "research",
  "jaw-symmetry": "research",
  "mentolabial-angle": "research",
  "forehead-inclination": "approximated",
  "nasal-dorsum-angle": "research",
  "chin-projection": "approximated",
  "upper-lip-protrusion-side": "approximated",
  "right-canthal-tilt": "research",
  "interbrow-distance": "approximated",
  "eye-mouth-distance-ratio": "research",
  "lower-face-height-ratio": "research",
  "lower-lip-protrusion-side": "approximated",
  "alar-base-width": "approximated",
  "nose-tip-angle": "approximated",
  "cupids-bow-height": "approximated",
  "forehead-width-ratio": "research",
  "eye-tilt-symmetry": "research",
  "nose-length-ratio": "research",
  "mouth-chin-distance-ratio": "approximated",
  "brow-arch-height": "approximated",
  "upper-lid-show": "approximated",
  "philtrum-length-ratio": "research",
  "mouth-tilt": "approximated",
  // Phase 44 additions
  "eye-aspect-ratio": "research", // Soukupová & Čech 2016, ICCV Workshop
  "mouth-aspect-ratio": "approximated",
  "bizygomatic-width-ratio": "research", // Farkas anthropometric atlas
  "chin-width-ratio": "approximated",
  "nasal-bridge-width": "approximated",
  // Phase 44 second batch
  "brow-thickness-symmetry": "approximated",
  "eye-vertical-symmetry": "approximated",
  "forehead-height-ratio": "research", // Vitruvian thirds + Farkas
  "eyebrow-arch-position": "research", // Westmore 1974
  "lip-corner-tilt": "approximated",
};
