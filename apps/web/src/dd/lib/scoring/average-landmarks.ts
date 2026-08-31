import type { Landmark, Landmarks } from "@/types";
import { estimatePose } from "./pose";

/**
 * Phase 636 — per-coordinate (x, y, z) MEDIAN across multiple frames of
 * the same face. All frames must have the same landmark count (478 from
 * MediaPipe Face Mesh).
 *
 * **Why median, not mean:** MediaPipe Face Mesh has ~1-3% landmark
 * jitter even on the same still photo, and an occasional frame can have
 * a landmark drop to a wildly wrong position (motion blur, a blink
 * mid-burst, a hand passing through frame). A single bad frame pulls a
 * mean noticeably; the median ignores it outright as long as it isn't
 * the majority of the burst. Per the founder's capture-standards spec:
 * burst-capture several near-identical frames within ~1-2s, then take
 * the median rather than the mean.
 */
export function medianLandmarks(samples: ReadonlyArray<Landmarks>): Landmarks {
  if (samples.length === 0) {
    throw new Error("medianLandmarks: no samples");
  }
  const first = samples[0]!;
  const n = first.length;
  for (const s of samples) {
    if (s.length !== n) {
      throw new Error(
        `medianLandmarks: frame length mismatch (${s.length} vs ${n})`
      );
    }
  }
  if (samples.length === 1) {
    return first;
  }

  const out: Landmark[] = new Array(n);
  const xs: number[] = new Array(samples.length);
  const ys: number[] = new Array(samples.length);
  const zs: number[] = new Array(samples.length);
  for (let i = 0; i < n; i++) {
    for (let f = 0; f < samples.length; f++) {
      const p = samples[f]![i]!;
      xs[f] = p.x;
      ys[f] = p.y;
      zs[f] = p.z;
    }
    out[i] = { x: median(xs), y: median(ys), z: median(zs) };
  }
  return out;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

// Phase 636 — a frame within a short burst that jumped noticeably off
// the rest of the batch's pose (motion blur, a mid-blink frame the
// detector still returned landmarks for, someone moving mid-capture) is
// exactly the kind of jitter median-ing is meant to filter out at the
// SOURCE, not just average over. 6° is intentionally looser than the
// hard reject-gate thresholds (7°/7°/5° in photo-quality.ts) — this
// only compares frames against each other within one burst, it isn't a
// pass/fail bar for the photo overall.
const POSE_OUTLIER_THRESHOLD_DEG = 6;

/**
 * Drop frames whose yaw/pitch/roll deviates from the burst's own median
 * pose by more than `POSE_OUTLIER_THRESHOLD_DEG`. Never drops everything
 * — if the filter would remove the whole batch (e.g. a genuinely shaky
 * burst with no consistent pose), it returns the original set instead of
 * leaving the caller with nothing to score.
 */
export function rejectPoseOutlierFrames<T extends { landmarks: Landmarks }>(
  frames: ReadonlyArray<T>
): T[] {
  if (frames.length <= 2) return [...frames];

  const poses = frames.map((f) => estimatePose(f.landmarks));
  const medianYaw = median(poses.map((p) => p.yaw));
  const medianPitch = median(poses.map((p) => p.pitch));
  const medianRoll = median(poses.map((p) => p.roll));

  const kept = frames.filter((_, i) => {
    const p = poses[i]!;
    return (
      Math.abs(p.yaw - medianYaw) <= POSE_OUTLIER_THRESHOLD_DEG &&
      Math.abs(p.pitch - medianPitch) <= POSE_OUTLIER_THRESHOLD_DEG &&
      Math.abs(p.roll - medianRoll) <= POSE_OUTLIER_THRESHOLD_DEG
    );
  });

  return kept.length > 0 ? kept : [...frames];
}

/**
 * Pick the frame with the highest pose frontness — used as the "anchor"
 * photo to display when multi-frame aggregation is active. Visual
 * consistency: showing a head-on frame with the aggregated landmarks
 * looks closer to right than showing a yawed frame.
 */
export function pickAnchorFrame<T extends { landmarks: Landmarks }>(
  frames: ReadonlyArray<T>
): T | null {
  if (frames.length === 0) return null;
  let best = frames[0]!;
  let bestFrontness = estimatePose(best.landmarks).frontness;
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i]!;
    const front = estimatePose(f.landmarks).frontness;
    if (front > bestFrontness) {
      best = f;
      bestFrontness = front;
    }
  }
  return best;
}
