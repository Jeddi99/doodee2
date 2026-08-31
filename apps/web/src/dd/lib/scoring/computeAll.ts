import type {
  Landmarks,
  MetricKey,
  MetricOptions,
  MetricResult,
  View,
} from "@/types";
import { METRIC_CALCULATORS } from "@/lib/metrics";
import { SANITY_BOUNDS } from "@/data/sanity-bounds";
import { estimatePose, confidenceBlend, type PoseEstimate } from "./pose";

export type Category =
  | "harmony"
  | "angularity"
  | "dimorphism"
  | "eye-area"
  | "features"
  | "symmetry";

export const CATEGORY_WEIGHTS: Record<Category, number> = {
  // Phase 20c (aged subject + skin folding):
  //
  // Aged subject came back at 6.37 — too high. The signals that catch
  // facial aging are concentrated in **eye-area** (drooping brow,
  // narrow palpebral fissure, hooded upper lid, small eye-to-face).
  // angularity + features stayed high on aged subjects because
  // gonial-angle + lip-fullness + alar-base-width don't sag with age.
  // Bumped eye-area to 0.40; trimmed angularity, dimorphism, features.
  // Also: skin metrics are now folded into overall (12% weight on
  // top of landmark categories) — see `foldSkinIntoOverall`. Skin
  // texture is the real aging marker we can read.
  //
  // Verified against 4 JSON dumps:
  //   - Fat man 5.11 → ~5.09 (steady)
  //   - Mature reference 8.51 → ~8.42 landmark + skin ≈ 8.0-8.2 final
  //   - Chico (model) 6.60 → ~6.43 landmark + good skin → ~6.6 final
  //   - Aged man 6.37 → ~5.92 landmark + worse skin → ~5.6 final
  //
  // Phase 99 calibration (SCUT-FBP5500 n=500, empirical Pearson):
  //   After gonial-angle ideal re-anchored to [142, 152]° (was [128, 138]°
  //   skin-vs-bone offset), angularity flipped from r=-0.32 to r=+0.25.
  //   Final per-category correlations:
  //     dimorphism r=+0.34   harmony r=+0.19
  //     angularity r=+0.25   features r=+0.21
  //     eye-area   r=+0.24   symmetry r=-0.05
  //
  // Phase 104 calibration (SCUT n=2200, AFTER per-metric weighting in
  // each category — see METRIC_WEIGHT above). Category-level correlations
  // jumped significantly when noise metrics got dialed down:
  //     harmony   r=+0.527   (was +0.376 — biggest signal)
  //     dimorphism r=+0.400  (was +0.307)
  //     angularity r=+0.362  (was +0.220)
  //     eye-area  r=+0.331   (was +0.244)
  //     features  r=+0.160   (was +0.166 — features is essentially noise)
  //     symmetry  r=-0.117   (was -0.080 — still 0-weighted)
  //
  // Re-balanced weights ∝ |r|, normalized to sum to 1. Features dropped
  // from 0.20 → 0.09 since it carries no signal. Harmony raised from
  // 0.15 → 0.30 since it's the strongest single signal.
  //
  // Phase 105: features dropped to 0 entirely. After per-metric weighting
  // in Phase 104, features category-r was still only 0.166 — the only
  // front-view metrics in features (alar-base-width, lip-fullness,
  // mouth-aspect-ratio, nasal-bridge-width) all have individual r < 0.10
  // on SCUT. The side-view metrics (lip-e-line, nasal-dorsum-angle,
  // upper/lower-lip-protrusion-side) return null on front-only scans,
  // so features collapses to a 4-metric noise bucket. Redistributed
  // 0.09 weight to harmony + eye-area, both of which have signal.
  //
  // Phase 108: symmetry stayed at 0 — even at 0.03 weight (with
  // nose-symmetry boosted to r=0.20), adding symmetry meant reducing
  // harmony/eye-area (both higher r), net SCUT r dropped ~0.003.
  // Symmetry ideals and per-metric weights still fixed for correctness;
  // the category itself just doesn't earn weight at this scale.
  //
  // Phase 111: gender-agnostic fallback; per-demo overrides in
  // CATEGORY_WEIGHTS_{MALE,FEMALE}_{UNIVERSAL,ASIAN} below.
  harmony: 0.33,
  angularity: 0.20,
  dimorphism: 0.22,
  "eye-area": 0.25,
  features: 0.0,
  symmetry: 0,
};

/**
 * Phase 111 — per-(gender × ethnicity) category weights.
 *
 * SCUT per-demo category correlations:
 *                    M.uni  F.uni  M.asi  F.asi
 *   angularity        0.23   0.24   0.37   0.50
 *   harmony           0.49   0.55   0.53   0.57
 *   eye-area          0.43   0.39   0.40   0.39
 *   dimorphism        0.40   0.53   0.47   0.46
 *   features          0.09   0.10   0.05   0.18
 *   symmetry          0.19   0.09   0.18   0.10
 *
 * Weights ∝ |r|, normalized to sum to 1 across the 4 active categories
 * (features + symmetry kept at 0; their per-metric weights handle the
 * small remaining signal). Female.asian especially needs more angularity
 * weight (r=0.50) — gonial-angle dominates F.asi attractiveness.
 */
const CATEGORY_WEIGHTS_MALE_UNIVERSAL: Record<Category, number> = {
  harmony: 0.316,
  angularity: 0.150,
  dimorphism: 0.260,
  "eye-area": 0.274,
  features: 0,
  symmetry: 0,
};
const CATEGORY_WEIGHTS_FEMALE_UNIVERSAL: Record<Category, number> = {
  harmony: 0.322,
  angularity: 0.139,
  dimorphism: 0.311,
  "eye-area": 0.228,
  features: 0,
  symmetry: 0,
};
const CATEGORY_WEIGHTS_MALE_ASIAN: Record<Category, number> = {
  harmony: 0.298,
  angularity: 0.210,
  dimorphism: 0.266,
  "eye-area": 0.226,
  features: 0,
  symmetry: 0,
};
const CATEGORY_WEIGHTS_FEMALE_ASIAN: Record<Category, number> = {
  harmony: 0.297,
  angularity: 0.261,
  dimorphism: 0.237,
  "eye-area": 0.204,
  features: 0,
  symmetry: 0,
};

function categoriesForDemo(
  gender: "male" | "female",
  ethnicity: string | undefined
): Record<Category, number> {
  if (ethnicity === "asian") {
    return gender === "male"
      ? CATEGORY_WEIGHTS_MALE_ASIAN
      : CATEGORY_WEIGHTS_FEMALE_ASIAN;
  }
  if (ethnicity === "universal") {
    return gender === "male"
      ? CATEGORY_WEIGHTS_MALE_UNIVERSAL
      : CATEGORY_WEIGHTS_FEMALE_UNIVERSAL;
  }
  return CATEGORY_WEIGHTS;
}

/**
 * Phase 104 — per-metric weights within their category.
 *
 * Each weight = sqrt(max(|empirical_r|, 0.10)) / sum_within_category,
 * where `empirical_r` is the Pearson correlation between the metric's
 * score and SCUT human-rated beauty (n=2200, see `calibration/scores.csv`).
 *
 * Why sqrt: raw |r| weighting let single high-r metrics dominate their
 * category (gonial-angle alone = 57% of angularity). sqrt softens this
 * so other metrics retain meaningful contribution. The 0.10 floor keeps
 * even uncorrelated metrics measurable (not zeroed).
 *
 * Within-category weights sum to 1.0. The category-average computation
 * in `computeAll` does `Σ score_i × weight_i / Σ weight_i` where the
 * sums are over the unflagged metrics ACTUALLY present in the scan, so
 * a missing landmark doesn't punish the rest of the bucket.
 */
/**
 * Phase 109 → 110 — demographic-stratified per-metric weights.
 *
 * Phase 109 introduced gender splits. Phase 110 found even stronger gaps
 * across the **ethnicity** dimension:
 * - `lip-corner-tilt`: M.uni -0.061 vs M.asi +0.477 (range 0.54 — Asian
 *   populations strongly prefer upturned mouth corners; universal doesn't)
 * - `lower-third-ratio`: F.uni +0.493 vs F.asi -0.119 (range 0.61, opposite)
 * - `gonial-angle`: M.uni 0.21 vs F.asi 0.50 (huge variance)
 *
 * Now uses 4 tables: male.universal, female.universal, male.asian, female.asian.
 * `METRIC_WEIGHT_MALE` / `METRIC_WEIGHT_FEMALE` retained as ethnicity-averaged
 * back-compat; `METRIC_WEIGHT` is the 4-way average.
 *
 * Weights use sqrt(max(r, 0.10)) within each category, with negative-r
 * metrics fully excluded (zero weight) per demographic — that's the
 * Phase 107 lesson applied per-slice. So a metric "good for one demo" but
 * "bad for another" only counts where it works.
 */
export const METRIC_WEIGHT_MALE_UNIVERSAL: Record<MetricKey, number> = {
  // angularity
  "canthal-tilt": 0.373,
  "gonial-angle": 0.369,
  "right-canthal-tilt": 0.257,
  "nasolabial-angle": 0,
  "mentolabial-angle": 0,
  "forehead-inclination": 0,
  // harmony
  "facial-thirds": 0.088,
  "lower-third-ratio": 0.078,
  fwhr: 0.075,
  "eye-mouth-distance-ratio": 0.074,
  "nose-mouth-ratio": 0.073,
  "philtrum-chin-ratio": 0.071,
  "inter-pupillary-ratio": 0.068,
  "nose-length-ratio": 0.065,
  "philtrum-length-ratio": 0.064,
  "golden-ratio": 0.062,
  "forehead-height-ratio": 0.061,
  "upper-lower-lip-ratio": 0.058,
  "mouth-chin-distance-ratio": 0.057,
  "eye-spacing-ratio": 0.057,
  "bizygomatic-width-ratio": 0.050,
  "facial-convexity": 0,
  "chin-projection": 0,
  "cupids-bow-height": 0,
  // features
  "alar-base-width": 0.317,
  "nasal-bridge-width": 0.228,
  "mouth-aspect-ratio": 0.228,
  "lip-fullness": 0.228,
  "lip-e-line": 0,
  "nasal-dorsum-angle": 0,
  "upper-lip-protrusion-side": 0,
  "lower-lip-protrusion-side": 0,
  "nose-tip-angle": 0,
  // eye-area
  "interbrow-distance": 0.127,
  "palpebral-fissure-aspect": 0.123,
  "eye-aspect-ratio": 0.122,
  "eyebrow-eye-distance": 0.115,
  "upper-lid-show": 0.115,
  "eye-width-to-face": 0.113,
  "brow-tilt": 0.109,
  "eyebrow-arch-position": 0.099,
  "eye-symmetry": 0,
  "brow-arch-height": 0.077,
  // dimorphism
  "lower-face-height-ratio": 0.152,
  "forehead-width-ratio": 0.150,
  "jaw-width-to-cheek-ratio": 0.134,
  "mouth-width-to-face": 0.132,
  "chin-height-ratio": 0.124,
  "chin-width-ratio": 0.122,
  "mouth-corner-tilt": 0.096,
  "lip-corner-tilt": 0,
  "midface-ratio": 0.091,
  // symmetry
  "nose-symmetry": 0.303,
  "eye-tilt-symmetry": 0.261,
  "mouth-symmetry": 0.218,
  "brow-symmetry": 0.218,
  "eye-vertical-symmetry": 0,
  "jaw-symmetry": 0,
  "mouth-tilt": 0,
  "brow-thickness-symmetry": 0,
};

export const METRIC_WEIGHT_FEMALE_UNIVERSAL: Record<MetricKey, number> = {
  // angularity
  "canthal-tilt": 0.347,
  "gonial-angle": 0.339,
  "right-canthal-tilt": 0.313,
  "nasolabial-angle": 0,
  "mentolabial-angle": 0,
  "forehead-inclination": 0,
  // harmony
  "lower-third-ratio": 0.095,
  "facial-thirds": 0.089,
  "bizygomatic-width-ratio": 0.082,
  "mouth-chin-distance-ratio": 0.075,
  "nose-mouth-ratio": 0.074,
  fwhr: 0.072,
  "philtrum-chin-ratio": 0.066,
  "inter-pupillary-ratio": 0.063,
  "nose-length-ratio": 0.062,
  "golden-ratio": 0.061,
  "upper-lower-lip-ratio": 0.061,
  "eye-spacing-ratio": 0.058,
  "forehead-height-ratio": 0.053,
  "eye-mouth-distance-ratio": 0.045,
  "philtrum-length-ratio": 0.043,
  "facial-convexity": 0,
  "chin-projection": 0,
  "cupids-bow-height": 0,
  // features
  "nasal-bridge-width": 0,
  "mouth-aspect-ratio": 0,
  "alar-base-width": 1.0,
  "lip-fullness": 0,
  "lip-e-line": 0,
  "nasal-dorsum-angle": 0,
  "upper-lip-protrusion-side": 0,
  "lower-lip-protrusion-side": 0,
  "nose-tip-angle": 0,
  // eye-area
  "palpebral-fissure-aspect": 0.181,
  "interbrow-distance": 0.135,
  "eyebrow-arch-position": 0.132,
  "eye-aspect-ratio": 0.130,
  "brow-tilt": 0.120,
  "eye-width-to-face": 0.114,
  "eye-symmetry": 0,
  "brow-arch-height": 0,
  "eyebrow-eye-distance": 0.093,
  "upper-lid-show": 0.093,
  // dimorphism
  "lower-face-height-ratio": 0.180,
  "forehead-width-ratio": 0.165,
  "chin-height-ratio": 0.157,
  "jaw-width-to-cheek-ratio": 0.147,
  "chin-width-ratio": 0.143,
  "mouth-width-to-face": 0.108,
  "lip-corner-tilt": 0,
  "midface-ratio": 0.100,
  "mouth-corner-tilt": 0,
  // symmetry
  "eye-vertical-symmetry": 0,
  "jaw-symmetry": 0,
  "mouth-tilt": 0.167,
  "brow-thickness-symmetry": 0.167,
  "mouth-symmetry": 0.167,
  "nose-symmetry": 0.167,
  "brow-symmetry": 0.167,
  "eye-tilt-symmetry": 0.167,
};

export const METRIC_WEIGHT_MALE_ASIAN: Record<MetricKey, number> = {
  // angularity
  "gonial-angle": 0.407,
  "canthal-tilt": 0.326,
  "right-canthal-tilt": 0.267,
  "nasolabial-angle": 0,
  "mentolabial-angle": 0,
  "forehead-inclination": 0,
  // harmony
  "facial-thirds": 0.101,
  "upper-lower-lip-ratio": 0.098,
  "philtrum-length-ratio": 0.096,
  "eye-spacing-ratio": 0.089,
  "bizygomatic-width-ratio": 0.076,
  "forehead-height-ratio": 0.075,
  "nose-length-ratio": 0.069,
  "inter-pupillary-ratio": 0.067,
  "golden-ratio": 0.067,
  fwhr: 0.060,
  "mouth-chin-distance-ratio": 0.057,
  "philtrum-chin-ratio": 0.048,
  "nose-mouth-ratio": 0.048,
  "eye-mouth-distance-ratio": 0.048,
  "lower-third-ratio": 0,
  "facial-convexity": 0,
  "chin-projection": 0,
  "cupids-bow-height": 0,
  // features
  "mouth-aspect-ratio": 0,
  "nasal-bridge-width": 0.333,
  "alar-base-width": 0.333,
  "lip-fullness": 0.333,
  "lip-e-line": 0,
  "nasal-dorsum-angle": 0,
  "upper-lip-protrusion-side": 0,
  "lower-lip-protrusion-side": 0,
  "nose-tip-angle": 0,
  // eye-area
  "brow-tilt": 0.135,
  "eyebrow-eye-distance": 0.130,
  "upper-lid-show": 0.126,
  "palpebral-fissure-aspect": 0.121,
  "eyebrow-arch-position": 0.103,
  "eye-width-to-face": 0.099,
  "brow-arch-height": 0.099,
  "interbrow-distance": 0.098,
  "eye-aspect-ratio": 0.089,
  "eye-symmetry": 0,
  // dimorphism
  "lip-corner-tilt": 0.176,
  "lower-face-height-ratio": 0.129,
  "jaw-width-to-cheek-ratio": 0.122,
  "mouth-corner-tilt": 0.117,
  "forehead-width-ratio": 0.108,
  "chin-width-ratio": 0.107,
  "chin-height-ratio": 0.080,
  "midface-ratio": 0.080,
  "mouth-width-to-face": 0.080,
  // symmetry
  "nose-symmetry": 0.407,
  "mouth-symmetry": 0.299,
  "mouth-tilt": 0,
  "brow-thickness-symmetry": 0,
  "brow-symmetry": 0.294,
  "eye-vertical-symmetry": 0,
  "jaw-symmetry": 0,
  "eye-tilt-symmetry": 0,
};

export const METRIC_WEIGHT_FEMALE_ASIAN: Record<MetricKey, number> = {
  // angularity
  "gonial-angle": 0.460,
  "canthal-tilt": 0.283,
  "right-canthal-tilt": 0.258,
  "nasolabial-angle": 0,
  "mentolabial-angle": 0,
  "forehead-inclination": 0,
  // harmony
  "facial-thirds": 0.127,
  "philtrum-length-ratio": 0.119,
  "bizygomatic-width-ratio": 0.118,
  "eye-spacing-ratio": 0.109,
  "upper-lower-lip-ratio": 0.097,
  "forehead-height-ratio": 0.087,
  "golden-ratio": 0.076,
  fwhr: 0.075,
  "mouth-chin-distance-ratio": 0.069,
  "lower-third-ratio": 0,
  "eye-mouth-distance-ratio": 0.063,
  "nose-mouth-ratio": 0,
  "philtrum-chin-ratio": 0,
  "inter-pupillary-ratio": 0.061,
  "nose-length-ratio": 0,
  "facial-convexity": 0,
  "chin-projection": 0,
  "cupids-bow-height": 0,
  // features
  "nasal-bridge-width": 0.296,
  "lip-fullness": 0.278,
  "alar-base-width": 0.213,
  "mouth-aspect-ratio": 0.213,
  "lip-e-line": 0,
  "nasal-dorsum-angle": 0,
  "upper-lip-protrusion-side": 0,
  "lower-lip-protrusion-side": 0,
  "nose-tip-angle": 0,
  // eye-area
  "eye-width-to-face": 0.138,
  "eyebrow-arch-position": 0.131,
  "brow-tilt": 0.120,
  "eye-aspect-ratio": 0.115,
  "palpebral-fissure-aspect": 0.108,
  "upper-lid-show": 0.106,
  "eyebrow-eye-distance": 0.104,
  "brow-arch-height": 0.097,
  "eye-symmetry": 0,
  "interbrow-distance": 0.081,
  // dimorphism
  "lip-corner-tilt": 0.181,
  "lower-face-height-ratio": 0.164,
  "jaw-width-to-cheek-ratio": 0.157,
  "chin-width-ratio": 0.141,
  "forehead-width-ratio": 0.138,
  "chin-height-ratio": 0.132,
  "mouth-corner-tilt": 0,
  "mouth-width-to-face": 0.088,
  "midface-ratio": 0,
  // symmetry
  "nose-symmetry": 0.180,
  "brow-symmetry": 0.133,
  "jaw-symmetry": 0.114,
  "eye-vertical-symmetry": 0.114,
  "eye-tilt-symmetry": 0.114,
  "mouth-symmetry": 0.114,
  "brow-thickness-symmetry": 0.114,
  "mouth-tilt": 0.114,
};

export const METRIC_WEIGHT_MALE: Record<MetricKey, number> = {
  // angularity
  "gonial-angle": 0.247,
  "canthal-tilt": 0.194,
  "right-canthal-tilt": 0.151,
  "nasolabial-angle": 0.136,
  "mentolabial-angle": 0.136,
  "forehead-inclination": 0.136,
  // harmony
  "facial-thirds": 0.088,
  "upper-lower-lip-ratio": 0.082,
  "philtrum-length-ratio": 0.080,
  "eye-spacing-ratio": 0.075,
  "bizygomatic-width-ratio": 0.062,
  "forehead-height-ratio": 0.062,
  "inter-pupillary-ratio": 0.059,
  "mouth-chin-distance-ratio": 0.049,
  fwhr: 0.049,
  "nose-length-ratio": 0.049,
  "golden-ratio": 0.049,
  "philtrum-chin-ratio": 0.044,
  "eye-mouth-distance-ratio": 0.042,
  "nose-mouth-ratio": 0.042,
  "lower-third-ratio": 0.042,
  "facial-convexity": 0.042,
  "chin-projection": 0.042,
  "cupids-bow-height": 0.042,
  // features
  "alar-base-width": 0.111,
  "mouth-aspect-ratio": 0,         // male r=-0.076, exclude
  "nasal-bridge-width": 0.111,
  "lip-fullness": 0.111,
  "lip-e-line": 0.111,
  "nasal-dorsum-angle": 0.111,
  "upper-lip-protrusion-side": 0.111,
  "lower-lip-protrusion-side": 0.111,
  "nose-tip-angle": 0.111,
  // eye-area
  "brow-tilt": 0.126,
  "eyebrow-eye-distance": 0.125,
  "palpebral-fissure-aspect": 0.122,
  "upper-lid-show": 0.121,
  "eye-aspect-ratio": 0.093,
  "eye-width-to-face": 0.090,
  "eye-symmetry": 0,                // male r=-0.128, exclude
  "interbrow-distance": 0.085,
  "eyebrow-arch-position": 0.078,
  "brow-arch-height": 0.075,
  // dimorphism — mouth-corner-tilt KEPT for male (r=+0.188)
  "lip-corner-tilt": 0.156,
  "jaw-width-to-cheek-ratio": 0.130,
  "mouth-corner-tilt": 0.121,
  "lower-face-height-ratio": 0.120,
  "forehead-width-ratio": 0.117,
  "chin-width-ratio": 0.092,
  "chin-height-ratio": 0.088,
  "mouth-width-to-face": 0.088,
  "midface-ratio": 0.088,
  // symmetry — concentrate on nose-symmetry (only positive-r symmetry metric)
  "nose-symmetry": 0.55,
  "brow-symmetry": 0.15,
  "mouth-symmetry": 0.15,
  "eye-tilt-symmetry": 0.15,
  "eye-vertical-symmetry": 0,
  "jaw-symmetry": 0,
  "mouth-tilt": 0,
  "brow-thickness-symmetry": 0,
};

export const METRIC_WEIGHT_FEMALE: Record<MetricKey, number> = {
  // angularity
  "gonial-angle": 0.270,
  "canthal-tilt": 0.178,
  "right-canthal-tilt": 0.161,
  "nasolabial-angle": 0.130,
  "mentolabial-angle": 0.130,
  "forehead-inclination": 0.130,
  // harmony — bizygomatic-width higher for females
  "facial-thirds": 0.091,
  "bizygomatic-width-ratio": 0.084,
  "philtrum-length-ratio": 0.077,
  "eye-spacing-ratio": 0.075,
  "upper-lower-lip-ratio": 0.067,
  "mouth-chin-distance-ratio": 0.055,
  "forehead-height-ratio": 0.054,
  fwhr: 0.054,
  "golden-ratio": 0.052,
  "inter-pupillary-ratio": 0.048,
  "eye-mouth-distance-ratio": 0.043,
  "lower-third-ratio": 0.043,
  "nose-mouth-ratio": 0.043,
  "philtrum-chin-ratio": 0,         // female r=-0.020, exclude
  "nose-length-ratio": 0.043,
  "facial-convexity": 0.043,
  "chin-projection": 0.043,
  "cupids-bow-height": 0.043,
  // features
  "lip-fullness": 0.124,
  "alar-base-width": 0.109,
  "nasal-bridge-width": 0,          // female r=-0.031, exclude
  "mouth-aspect-ratio": 0.109,
  "lip-e-line": 0.109,
  "nasal-dorsum-angle": 0.109,
  "upper-lip-protrusion-side": 0.109,
  "lower-lip-protrusion-side": 0.109,
  "nose-tip-angle": 0.109,
  // eye-area — eye-width-to-face higher for females
  "eye-width-to-face": 0.130,
  "palpebral-fissure-aspect": 0.123,
  "brow-tilt": 0.115,
  "eye-aspect-ratio": 0.112,
  "eyebrow-arch-position": 0.105,
  "eyebrow-eye-distance": 0.093,
  "upper-lid-show": 0.082,
  "eye-symmetry": 0,                // female r=-0.084, exclude
  "interbrow-distance": 0.080,
  "brow-arch-height": 0.080,
  // dimorphism — mouth-corner-tilt EXCLUDED for female (r=-0.169, sign-flipped from male)
  "jaw-width-to-cheek-ratio": 0.133,
  "lower-face-height-ratio": 0.132,
  "lip-corner-tilt": 0.130,
  "forehead-width-ratio": 0.127,
  "chin-height-ratio": 0.122,
  "chin-width-ratio": 0.103,
  "mouth-corner-tilt": 0,
  "mouth-width-to-face": 0.077,
  "midface-ratio": 0,               // female r=-0.002, exclude
  // symmetry
  "nose-symmetry": 0.55,
  "brow-symmetry": 0.15,
  "mouth-symmetry": 0.15,
  "eye-tilt-symmetry": 0.15,
  "eye-vertical-symmetry": 0,
  "jaw-symmetry": 0,
  "mouth-tilt": 0,
  "brow-thickness-symmetry": 0,
};

/**
 * Gender-agnostic fallback (kept for the existing public API).
 * Averaged male + female weights.
 */
export const METRIC_WEIGHT: Record<MetricKey, number> = Object.fromEntries(
  (Object.keys(METRIC_WEIGHT_MALE) as MetricKey[]).map((k) => [
    k,
    (METRIC_WEIGHT_MALE[k] + METRIC_WEIGHT_FEMALE[k]) / 2,
  ])
) as Record<MetricKey, number>;

function weightsForGender(
  gender: "male" | "female"
): Record<MetricKey, number> {
  return gender === "male" ? METRIC_WEIGHT_MALE : METRIC_WEIGHT_FEMALE;
}

/**
 * Phase 110 — pick the 4-way weight table by (gender, ethnicity).
 * Falls back to the gender-only table for non-asian/universal ethnicities.
 */
function weightsForDemo(
  gender: "male" | "female",
  ethnicity: string | undefined
): Record<MetricKey, number> {
  if (ethnicity === "asian") {
    return gender === "male" ? METRIC_WEIGHT_MALE_ASIAN : METRIC_WEIGHT_FEMALE_ASIAN;
  }
  if (ethnicity === "universal") {
    return gender === "male"
      ? METRIC_WEIGHT_MALE_UNIVERSAL
      : METRIC_WEIGHT_FEMALE_UNIVERSAL;
  }
  return weightsForGender(gender);
}

export const METRIC_CATEGORY: Record<MetricKey, Category> = {
  "canthal-tilt": "angularity",
  fwhr: "harmony",
  "gonial-angle": "angularity",
  "golden-ratio": "harmony",
  "facial-thirds": "harmony",
  "eye-spacing-ratio": "harmony",
  "nose-mouth-ratio": "harmony",
  "upper-lower-lip-ratio": "harmony",
  "philtrum-chin-ratio": "harmony",
  "lower-third-ratio": "harmony",
  "inter-pupillary-ratio": "harmony",
  "lip-fullness": "features",
  "nasolabial-angle": "angularity",
  "facial-convexity": "harmony",
  "lip-e-line": "features",
  "palpebral-fissure-aspect": "eye-area",
  "eyebrow-eye-distance": "eye-area",
  "brow-tilt": "eye-area",
  "eye-width-to-face": "eye-area",
  "eye-symmetry": "eye-area",
  "jaw-width-to-cheek-ratio": "dimorphism",
  "midface-ratio": "dimorphism",
  "chin-height-ratio": "dimorphism",
  "mouth-corner-tilt": "dimorphism",
  "mouth-width-to-face": "dimorphism",
  "mouth-symmetry": "symmetry",
  "nose-symmetry": "symmetry",
  "brow-symmetry": "symmetry",
  "jaw-symmetry": "symmetry",
  "mentolabial-angle": "angularity",
  "forehead-inclination": "angularity",
  "nasal-dorsum-angle": "features",
  "chin-projection": "harmony",
  "upper-lip-protrusion-side": "features",
  "right-canthal-tilt": "angularity",
  "interbrow-distance": "eye-area",
  "eye-mouth-distance-ratio": "harmony",
  "lower-face-height-ratio": "dimorphism",
  "lower-lip-protrusion-side": "features",
  "alar-base-width": "features",
  "nose-tip-angle": "features",
  "cupids-bow-height": "harmony",
  "forehead-width-ratio": "dimorphism",
  "eye-tilt-symmetry": "symmetry",
  "nose-length-ratio": "harmony",
  "mouth-chin-distance-ratio": "harmony",
  "brow-arch-height": "eye-area",
  "upper-lid-show": "eye-area",
  "philtrum-length-ratio": "harmony",
  "mouth-tilt": "symmetry",
  // Phase 44 additions
  "eye-aspect-ratio": "eye-area",
  "mouth-aspect-ratio": "features",
  "bizygomatic-width-ratio": "harmony",
  "chin-width-ratio": "dimorphism",
  "nasal-bridge-width": "features",
  // Phase 44 second batch
  "brow-thickness-symmetry": "symmetry",
  "eye-vertical-symmetry": "symmetry",
  "forehead-height-ratio": "harmony",
  "eyebrow-arch-position": "eye-area",
  "lip-corner-tilt": "dimorphism",
};

export const METRIC_VIEW: Record<MetricKey, View> = {
  "canthal-tilt": "front",
  fwhr: "front",
  "gonial-angle": "front",
  "golden-ratio": "front",
  "facial-thirds": "front",
  "eye-spacing-ratio": "front",
  "nose-mouth-ratio": "front",
  "upper-lower-lip-ratio": "front",
  "philtrum-chin-ratio": "front",
  "lower-third-ratio": "front",
  "inter-pupillary-ratio": "front",
  "lip-fullness": "front",
  "nasolabial-angle": "side",
  "facial-convexity": "side",
  "lip-e-line": "side",
  "palpebral-fissure-aspect": "front",
  "eyebrow-eye-distance": "front",
  "brow-tilt": "front",
  "eye-width-to-face": "front",
  "eye-symmetry": "front",
  "jaw-width-to-cheek-ratio": "front",
  "midface-ratio": "front",
  "chin-height-ratio": "front",
  "mouth-corner-tilt": "front",
  "mouth-width-to-face": "front",
  "mouth-symmetry": "front",
  "nose-symmetry": "front",
  "brow-symmetry": "front",
  "jaw-symmetry": "front",
  "mentolabial-angle": "side",
  "forehead-inclination": "side",
  "nasal-dorsum-angle": "side",
  "chin-projection": "side",
  "upper-lip-protrusion-side": "side",
  "right-canthal-tilt": "front",
  "interbrow-distance": "front",
  "eye-mouth-distance-ratio": "front",
  "lower-face-height-ratio": "front",
  "lower-lip-protrusion-side": "side",
  "alar-base-width": "front",
  "nose-tip-angle": "front",
  "cupids-bow-height": "front",
  "forehead-width-ratio": "front",
  "eye-tilt-symmetry": "front",
  "nose-length-ratio": "front",
  "mouth-chin-distance-ratio": "front",
  "brow-arch-height": "front",
  "upper-lid-show": "front",
  "philtrum-length-ratio": "front",
  "mouth-tilt": "front",
  // Phase 44 additions — all front-view
  "eye-aspect-ratio": "front",
  "mouth-aspect-ratio": "front",
  "bizygomatic-width-ratio": "front",
  "chin-width-ratio": "front",
  "nasal-bridge-width": "front",
  // Phase 44 second batch
  "brow-thickness-symmetry": "front",
  "eye-vertical-symmetry": "front",
  "forehead-height-ratio": "front",
  "eyebrow-arch-position": "front",
  "lip-corner-tilt": "front",
};

export interface ScanInput {
  front: Landmarks;
  side?: Landmarks;
}

export interface SkinResult {
  uniformity: number;
  clarity: number;
  glow: number;
  meanRgb: [number, number, number];
  textureSigma: number;
  luminance: number;
  toneVariance: number;
}

export interface ScanResult {
  metrics: Partial<Record<MetricKey, MetricResult>>;
  categories: Partial<Record<Category, number>>;
  overall: number;
  options: MetricOptions;
  views: { front: true; side: boolean };
  /** Head-pose estimate from the front-view landmarks. */
  pose: PoseEstimate;
  /** Average per-metric confidence used in aggregation. */
  confidence: number;
  /** Optional skin analysis — present only when the scan flow ran
   * `analyzeSkin` on the front image before computeAll. */
  skin?: SkinResult;
  /**
   * The pre-blend "geometric" overall (weighted-mean of category averages
   * + skin fold). Stored separately from `overall` so the UI can show
   * the breakdown ("G: 7.8 · S: 8.1"). Phase 27.
   */
  geometric?: number;
  /**
   * The second-opinion score (statistical ensemble of the same metric
   * scores — see `src/lib/scoring/second-opinion.ts`). Phase 27. Blended
   * into `overall` at `SECOND_OPINION_WEIGHT`.
   */
  secondOpinion?: number;
  /**
   * Learned attractiveness score from the ONNX model in
   * `/public/models/attractiveness.onnx` (Phase 28 / ADR-011). Async +
   * optional. When present, the final overall uses
   * `blendWithLearned(geometric, secondOpinion, learned)` instead of
   * the Phase 27 two-way blend.
   */
  learned?: number;
  /** Raw provider score before deterministic DOODEE calibration. */
  aiRawScore?: number;
  /** Final-score discount from broad/full lower-face softness signals. */
  fullnessPenalty?: number;
  /**
   * Calibrated AI-led display score. When present, this overrides
   * `overall`; raw provider output is kept in `aiRawScore`.
   */
  aiScore?: number;
  /** Short AI reasoning shown in the UI. */
  aiReasoning?: string;
  /** Self-reported AI confidence in its judgement, 0-1. */
  aiConfidence?: number;
  /** Where the final `overall` came from: "ai" | "geometric". */
  aiSource?: "ai" | "geometric";
  /** AI's perceived demographics — for transparency. */
  aiPerceived?: {
    expression: string;
    photoQuality: "good" | "ok" | "poor";
  };
  /**
   * Phase 122 — personalized advice per weak metric. Gemini reads the
   * photo + the user's 5 lowest MediaPipe metrics and writes specific,
   * actionable recommendations referencing the actual measurements.
   * The geometric breakdown stays authoritative; AI just interprets.
   */
  aiAdvice?: Array<{
    metric: string;
    observation: string;
    recommendations: string[];
    difficulty: "easy" | "mid" | "hard";
  }>;
  /**
   * Phase 126 — AI-projected score after completing each roadmap phase.
   * All values absolute 0-10 (not deltas). Drives a progression bar in
   * `RoadmapCard` showing the user the realistic upside of doing the work.
   */
  aiPotential?: {
    ifEasy: number;
    ifMid: number;
    ifHard: number;
    note?: string;
  };
}

/**
 * Metrics that are robust to head-pose changes (symmetry-style metrics
 * already project across the face frame). Everything else takes the
 * full pose hit on confidence.
 */
const POSE_INSENSITIVE: ReadonlySet<MetricKey> = new Set<MetricKey>([
  "eye-symmetry",
  "mouth-symmetry",
  "nose-symmetry",
  "brow-symmetry",
  "jaw-symmetry",
  "eye-tilt-symmetry",
  "mouth-tilt",
]);

const METRIC_KEYS = Object.keys(METRIC_CALCULATORS) as MetricKey[];

export function computeAll(
  input: ScanInput,
  options: MetricOptions
): ScanResult {
  const pose = estimatePose(input.front);
  const metrics: Partial<Record<MetricKey, MetricResult>> = {};
  let confidenceTotal = 0;
  let confidenceCount = 0;

  for (const key of METRIC_KEYS) {
    const view = METRIC_VIEW[key];
    const landmarks = view === "front" ? input.front : input.side;
    if (!landmarks) continue;
    // Phase 192v — per-metric isolation. `lm()` throws on a missing
    // landmark index; without this, one bad metric kills the whole loop
    // and loses all 60 metrics. Flag the offending metric and continue.
    let result: MetricResult;
    try {
      result = METRIC_CALCULATORS[key](landmarks, options);
    } catch {
      metrics[key] = {
        raw: NaN,
        score: 0,
        ideal: [0, 0],
        unit: "",
        flagged: true,
        confidence: 0,
      };
      continue;
    }
    const bounds = SANITY_BOUNDS[key];
    if (!bounds) {
      metrics[key] = {
        raw: NaN,
        score: 0,
        ideal: [0, 0],
        unit: "",
        flagged: true,
        confidence: 0,
      };
      continue;
    }
    const [smin, smax] = bounds;
    // NaN/Infinity guard: a metric calculator with a degenerate landmark
    // (zero-norm, missing point) can leak NaN as `raw`. `NaN < smin` and
    // `NaN > smax` are both false, so the sanity check silently passes
    // it through, then confidenceBlend × NaN poisons the weighted-mean
    // category aggregator → scan.overall = NaN. Flag non-finite raw values
    // the same way as out-of-bounds.
    const flagged =
      !Number.isFinite(result.raw) ||
      !Number.isFinite(result.score) ||
      result.raw < smin ||
      result.raw > smax;

    // Confidence: 1.0 baseline, reduced by pose for pose-sensitive metrics.
    // Symmetry-style metrics already project on face frame → less hit.
    //
    // Phase 102: halved pose-sensitive sensitivity 1.0 → 0.5. The old
    // value pulled a raw-10 metric on a mid-pose (frontness 0.66) photo
    // all the way down to 8.5 via confidenceBlend(10, 0.66) → 8.47. That
    // capped genuinely good scans (frontness 0.66) at ~7.3
    // overall when his real score is ~8.0. SCUT n=2200 calibration r
    // moves 0.43 → 0.40 (within noise; SCUT photos are mostly frontal
    // and the change barely touches them). Pose-insensitive set
    // untouched at 0.3 — those are already mostly projected on face frame.
    const poseSensitivity = POSE_INSENSITIVE.has(key) ? 0.3 : 0.5;
    const poseConfidence =
      1 - poseSensitivity * (1 - pose.frontness);
    const confidence = flagged ? 0 : Math.max(0.1, poseConfidence);

    const blendedScore = flagged
      ? 0
      : confidenceBlend(result.score, confidence);

    metrics[key] = flagged
      ? { ...result, score: 0, flagged: true, confidence: 0 }
      : { ...result, score: blendedScore, confidence };

    if (!flagged) {
      confidenceTotal += confidence;
      confidenceCount += 1;
    }
  }

  // Phase 104+109: weighted category aggregation. Each metric contributes
  // to its category by `score × METRIC_WEIGHT[metric]`, summing then
  // dividing by Σ weights of unflagged metrics ACTUALLY present. That
  // last detail matters: when a landmark is missing or a metric is
  // flagged, its weight comes out of the denominator too, so the
  // remaining metrics' contribution is rescaled to fill in.
  //
  // Phase 109+110: weight table is selected by (gender, ethnicity) —
  // many metrics correlate oppositely across demographics (e.g.,
  // lip-corner-tilt: M.uni -0.06 vs M.asi +0.48). The per-demo table
  // zeros out negatively-correlating metrics for that demographic only.
  const weightTable = weightsForDemo(options.gender, options.ethnicity);
  // Phase 111: CATEGORY weights also per-demo. F.asi needs angularity at
  // 0.26 (r=0.50), F.uni only 0.14 (r=0.24).
  const categoryWeights = categoriesForDemo(options.gender, options.ethnicity);
  const bucketContrib = new Map<Category, { num: number; den: number }>();
  for (const key of METRIC_KEYS) {
    const r = metrics[key];
    if (!r || r.flagged) continue;
    const cat = METRIC_CATEGORY[key];
    const w = weightTable[key];
    const slot = bucketContrib.get(cat) ?? { num: 0, den: 0 };
    slot.num += r.score * w;
    slot.den += w;
    bucketContrib.set(cat, slot);
  }

  const categories: Partial<Record<Category, number>> = {};
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [cat, { num, den }] of bucketContrib) {
    const avg = den > 0 ? num / den : 0;
    categories[cat] = avg;
    const weight = categoryWeights[cat];
    if (weight > 0) {
      weightedSum += avg * weight;
      totalWeight += weight;
    }
  }

  const overall = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const confidence = confidenceCount > 0 ? confidenceTotal / confidenceCount : 0;
  return {
    metrics,
    categories,
    overall,
    options,
    views: { front: true, side: input.side !== undefined },
    pose,
    confidence,
  };
}
