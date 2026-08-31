export {
  cropToTensor,
  landmarkBounds,
  pixelsToImageNetTensor,
  pixelsToTensor,
  renderFaceCrop,
  MODEL_INPUT_SIZE,
} from "./crop";
export {
  mapDoodeeToScut,
  mapModelOutputToDoodee,
  mapScutToDoodee,
} from "./score";
export {
  aggregateEnsemble,
  isModelAvailable,
  predictAttractiveness,
  resetLearnedCache,
} from "./inference";
export { alignAndCrop, eyeLineAngle } from "./align";
export {
  DEFAULT_MANIFEST,
  loadManifest,
  parseManifest,
  resetManifestCache,
  type ModelManifest,
  type NormalizeMode,
} from "./manifest";

/**
 * Final-overall blending when a learned score is available.
 *
 * Phase 28: when learned score is present, final = geometric × 0.6 +
 * secondOpinion × 0.2 + learned × 0.2. Otherwise (Phase 27 fallback):
 * geometric × 0.7 + secondOpinion × 0.3.
 */
export function blendWithLearned(
  geometric: number,
  secondOpinion: number,
  learned: number
): number {
  // Phase 101: reduced learned weight 0.2 → 0.1. Diagnostic across 8
  // crop strategies on a mature out-of-distribution reference showed the ONNX
  // model trained on SCUT-FBP5500 outputs raw 2.4-2.8 regardless of
  // crop, equivalent to doodee score 3.7-4.6/10. SCUT is heavily skewed
  // Asian + female + young; the model regresses to that distribution's
  // mean for out-of-distribution faces, dragging Western/mature scans.
  // Geometric and second-opinion paths are more interpretable and more
  // robust across demographics; weight shifted to them.
  // TODO Phase 102: retrain on a balanced dataset (SCUT + MEBeauty +
  // FBP-v2 ensemble) to make the L signal genuinely cross-cultural,
  // then restore weight to 0.2.
  return geometric * 0.65 + secondOpinion * 0.25 + learned * 0.1;
}
