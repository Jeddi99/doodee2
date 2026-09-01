// The guidance loop samples every ~333ms, so a 250ms budget flagged almost every frame as slow.
// MediaPipe with blendshapes and transformation matrices normally lands 200-400ms, and the
// first frames after the landmarker loads are the slowest of all.
const SLOW_INFERENCE_MS = 400;
const WARMUP_FRAMES = 3;
const DISABLE_STREAK = 5;

export function nextSlowInferenceStreak(streak, inferenceMs, frameIndex = WARMUP_FRAMES) {
  if (frameIndex < WARMUP_FRAMES) return 0;
  return inferenceMs > SLOW_INFERENCE_MS ? streak + 1 : 0;
}

export const shouldDisableAutoCapture = (streak) => streak >= DISABLE_STREAK;
