import type { ScanResult, SkinResult } from "./computeAll";
import {
  blendOverall,
  secondOpinionScore,
  SECOND_OPINION_WEIGHT,
} from "./second-opinion";
import { blendWithLearned } from "./learned";
import { applyFacialFullnessPenalty } from "./facial-fullness";
import {
  qualityConfidenceFactor,
  type PhotoQualityReport,
} from "./photo-quality";

/**
 * Weight of skin metrics in the final overall score. The landmark-based
 * categories already weight to 1.0; skin folds on top by scaling the
 * landmark overall by (1 - SKIN_WEIGHT) and adding skinAvg × SKIN_WEIGHT.
 *
 * Rationale: skin texture / uniformity / clarity is the strongest
 * aging signal MediaPipe geometry CANNOT capture. Folding it in pushes
 * aged subjects' overall down without dragging young/clear-skinned
 * subjects (whose skin scores high, neutral effect).
 */
export const SKIN_WEIGHT = 0.12;

export function skinAverage(skin: SkinResult): number {
  return (skin.uniformity + skin.clarity + skin.glow) / 3;
}

/**
 * Take a scan result and fold the skin sub-scores into the overall,
 * then apply the second-opinion blend (Phase 27 / ADR-010).
 *
 * Pipeline (in order):
 *   geometric_post_skin = landmark_overall × 0.88 + skinAvg × 0.12
 *   secondOpinion       = ensemble(median, worstK, skinHeavy, confDisc)
 *   final               = geometric_post_skin × (1 - SECOND_OPINION_WEIGHT)
 *                         + secondOpinion × SECOND_OPINION_WEIGHT
 *
 * Phase 192v (comment-only): SECOND_OPINION_WEIGHT is currently 0.10, so
 * final = geometric_post_skin × 0.90 + secondOpinion × 0.10. (Was 0.7/0.3.)
 *
 * `scan.geometric` records the pre-blend value for UI transparency.
 * `scan.secondOpinion` records the second-opinion value.
 *
 * Idempotent in the sense that calling twice with the same skin produces
 * the same final — the geometric portion is recomputed from `scan.overall`
 * each time. Callers should call this once, right after `analyzeSkin`.
 */
export function foldSkinIntoOverall(
  scan: ScanResult,
  skin: SkinResult
): ScanResult {
  const skinAvg = skinAverage(skin);
  const geometric = scan.overall * (1 - SKIN_WEIGHT) + skinAvg * SKIN_WEIGHT;
  // Attach skin BEFORE computing second-opinion so the skin-heavy
  // aggregator sees it.
  const withSkin: ScanResult = { ...scan, overall: geometric, skin };
  const secondOpinion = secondOpinionScore(withSkin, skin);
  // No-op blend when second-opinion has no signal (no valid metrics).
  // Otherwise a degenerate scan with overall>0 but zero metrics would
  // have its overall pulled to 70% of geometric, which isn't meaningful.
  const finalOverall =
    secondOpinion > 0
      ? blendOverall(geometric, secondOpinion, SECOND_OPINION_WEIGHT)
      : geometric;
  return applyFacialFullnessPenalty({
    ...withSkin,
    overall: finalOverall,
    geometric,
    secondOpinion,
  });
}

/**
 * Apply only the second-opinion blend to a scan without skin (caller
 * has no skin analysis yet). Useful when the scan flow gives up on
 * skin analysis after a failure but we still want the gestalt blend.
 */
export function foldSecondOpinion(scan: ScanResult): ScanResult {
  const geometric = scan.overall;
  const secondOpinion = secondOpinionScore(scan, undefined);
  const finalOverall =
    secondOpinion > 0
      ? blendOverall(geometric, secondOpinion, SECOND_OPINION_WEIGHT)
      : geometric;
  return applyFacialFullnessPenalty({
    ...scan,
    overall: finalOverall,
    geometric,
    secondOpinion,
  });
}

/**
 * Apply a photo-quality penalty to scan confidence (Phase 33 / ADR-012).
 *
 * Multiplies `scan.confidence` by the quality factor (`[0.2, 1.0]`).
 * Doesn't touch metric scores — quality is an UNCERTAINTY signal, not
 * a SCORE signal. A blurry photo's number isn't wrong, it's unreliable;
 * the existing `<LowConfidenceBanner>` already fires below 0.65 to tell
 * the user "we're less sure" — quality issues now propagate there
 * automatically.
 *
 * Idempotent — returns the input scan unchanged when the report has no
 * issues (factor = 1.0).
 */
export function foldQualityIntoConfidence(
  scan: ScanResult,
  report: PhotoQualityReport
): ScanResult {
  const factor = qualityConfidenceFactor(report);
  if (factor >= 0.999) return scan;
  return { ...scan, confidence: scan.confidence * factor };
}

/**
 * Re-blend a scan with the learned ONNX score (Phase 28 / ADR-011).
 *
 * Requires that `scan.geometric` and `scan.secondOpinion` are already
 * populated (i.e., the sync `foldSkinIntoOverall` / `foldSecondOpinion`
 * has run). Pure function — no side effects.
 *
 *   final = geometric × 0.6 + secondOpinion × 0.2 + learned × 0.2
 *
 * If `learned` is invalid (NaN, null, ≤0), returns the input scan
 * unchanged.
 *
 * Phase 114 — when `scan.aiSource === "ai"` the overall has already
 * been set by Gemini-led reconciliation; the SCUT-biased learned blend
 * MUST NOT override it. We still attach the learned value for display
 * in the BlendChip, but `overall` stays at the AI verdict.
 */
export function applyLearnedBlend(
  scan: ScanResult,
  learned: number | null
): ScanResult {
  if (
    learned === null ||
    !Number.isFinite(learned) ||
    learned <= 0 ||
    scan.geometric === undefined ||
    scan.secondOpinion === undefined
  ) {
    return scan;
  }
  // Phase 114 — preserve AI verdict; don't overwrite with learned blend.
  if (scan.aiSource === "ai") {
    return { ...scan, learned };
  }
  const overall = blendWithLearned(
    scan.geometric,
    scan.secondOpinion,
    learned
  );
  return applyFacialFullnessPenalty({ ...scan, overall, learned });
}
