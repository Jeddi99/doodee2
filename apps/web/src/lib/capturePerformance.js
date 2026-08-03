export function nextSlowInferenceStreak(streak, inferenceMs) {
  return inferenceMs > 250 ? streak + 1 : 0;
}

export const shouldDisableAutoCapture = (streak) => streak >= 3;
