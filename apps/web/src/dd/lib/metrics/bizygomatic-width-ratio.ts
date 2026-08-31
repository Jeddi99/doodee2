import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Bizygomatic-to-Bitemporal Width Ratio.
 *
 *   ratio = cheekboneWidth / templeWidth
 *
 * - Ratio ~1.0 = oval face (cheekbones equal to forehead)
 * - Ratio > 1.05 = heart-shaped / diamond (cheekbones wider than forehead)
 * - Ratio < 0.95 = long / oblong (cheekbones narrower)
 *
 * Cheekbone (zygion): landmarks 116 (left) / 345 (right) — sit on the
 * zygomatic arch prominence, the widest lateral point of the cheek.
 *
 * Temple / bitemporal: landmarks 103 (left) / 332 (right) — sit at the
 * temple line, the lateral edge of the forehead.
 *
 * Why this matters: face shape (oval / heart / diamond / oblong) is
 * a strong aesthetic prior independent of any single metric. The
 * existing FWHR and jaw-width-to-cheek metrics capture verticals and
 * jaw vs cheek; this one captures **forehead-vs-cheek**.
 *
 * Sources: Farkas anthropometric norms, ratio range derived from
 * Hwang et al. 2012 Korean cohort + Wang et al. 2019 Chinese cohort.
 */
export function calculateBizygomaticWidthRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const leftCheekbone = lm(landmarks, 116);
  const rightCheekbone = lm(landmarks, 345);
  const leftTemple = lm(landmarks, 103);
  const rightTemple = lm(landmarks, 332);
  const cheek = dist(leftCheekbone, rightCheekbone);
  const temple = dist(leftTemple, rightTemple);
  if (temple === 0) {
    const ideal = getIdealRange("bizygomatic-width-ratio", options);
    return { raw: 0, score: 0, ideal, unit: "x" };
  }
  const raw = cheek / temple;
  const ideal = getIdealRange("bizygomatic-width-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
