import type { Landmark, Landmarks } from "@/types";

export function lm(landmarks: Landmarks, index: number): Landmark {
  const p = landmarks[index];
  if (!p) {
    throw new Error(`MediaPipe landmark ${index} missing`);
  }
  return p;
}

export function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function pairSymmetry(
  left: Landmark,
  right: Landmark,
  midX: number,
  scale: number
): number {
  if (scale <= 0) return 0;
  const mirroredLx = 2 * midX - left.x;
  const dx = mirroredLx - right.x;
  const dy = left.y - right.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return Math.max(0, 1 - distance / scale);
}

/**
 * Symmetry between a left/right landmark pair, measured by mirroring
 * `left` across the face-vertical axis (faceTop → faceBottom) rather
 * than across a vertical image-x line. Roll-invariant: a 20°-tilted
 * head no longer fakes asymmetry the way the image-x version does.
 *
 * Yaw (head turned left/right) is NOT fully corrected — that would
 * require MediaPipe's z-coordinates and a 3D mirror across the face's
 * symmetry plane. For most upright-facing selfies, roll dominates.
 */
export function pairSymmetryAcrossLine(
  left: Landmark,
  right: Landmark,
  lineStart: Landmark,
  lineEnd: Landmark,
  scale: number
): number {
  if (scale <= 0) return 0;
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  const t =
    ((left.x - lineStart.x) * dx + (left.y - lineStart.y) * dy) / len2;
  const footX = lineStart.x + t * dx;
  const footY = lineStart.y + t * dy;
  const mirroredX = 2 * footX - left.x;
  const mirroredY = 2 * footY - left.y;
  const ddx = mirroredX - right.x;
  const ddy = mirroredY - right.y;
  const distance = Math.sqrt(ddx * ddx + ddy * ddy);
  return Math.max(0, 1 - distance / scale);
}

/**
 * Signed tilt angle of an axis relative to a reference axis, sign chosen so
 * positive means the axis deviates toward the up-reference landmark.
 *
 * Used to make tilt metrics (canthal-tilt, brow-tilt, etc.) invariant to
 * head roll: pass the inter-inner-canthal line as `refStart`/`refEnd` and
 * the forehead as `upRef`, and the result is the clinical tilt regardless
 * of how the head is rolled in the photo.
 */
export function signedTiltAngle(
  axisVertex: Landmark,
  axisOther: Landmark,
  refStart: Landmark,
  refEnd: Landmark,
  upRef: Landmark
): number {
  const refX = refEnd.x - refStart.x;
  const refY = refEnd.y - refStart.y;
  const refLen = Math.sqrt(refX * refX + refY * refY);
  if (refLen === 0) return 0;
  const ux = refX / refLen;
  const uy = refY / refLen;

  const perp1X = uy;
  const perp1Y = -ux;
  const perp2X = -uy;
  const perp2Y = ux;

  const midX = (refStart.x + refEnd.x) / 2;
  const midY = (refStart.y + refEnd.y) / 2;
  const upX = upRef.x - midX;
  const upY = upRef.y - midY;

  const dot1 = perp1X * upX + perp1Y * upY;
  const dot2 = perp2X * upX + perp2Y * upY;
  const perpX = dot1 > dot2 ? perp1X : perp2X;
  const perpY = dot1 > dot2 ? perp1Y : perp2Y;

  const axisX = axisOther.x - axisVertex.x;
  const axisY = axisOther.y - axisVertex.y;
  const along = axisX * ux + axisY * uy;
  const across = axisX * perpX + axisY * perpY;

  return (Math.atan2(across, Math.abs(along)) * 180) / Math.PI;
}

export function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

/**
 * Project a point's offset (from faceTop) onto the face-vertical axis
 * (faceTop → faceBottom). Returns a signed scalar — distance along
 * the face's own "down" direction.
 *
 * Use to replace `Math.abs(a.y - b.y)` patterns when measuring face-
 * frame vertical spans. `faceFrameY(b, …) - faceFrameY(a, …)` is the
 * true face-vertical distance between two points, independent of how
 * the head is rolled in the photo.
 *
 * `Math.abs(a.y - b.y)` projects onto image-y, so head roll in the
 * photo gets baked into the measurement (a 20° roll understates the
 * true face-vertical span by ~6%).
 */
export function faceFrameY(
  point: Landmark,
  faceTop: Landmark,
  faceBottom: Landmark
): number {
  const fx = faceBottom.x - faceTop.x;
  const fy = faceBottom.y - faceTop.y;
  const len = Math.sqrt(fx * fx + fy * fy);
  if (len === 0) return 0;
  return ((point.x - faceTop.x) * fx + (point.y - faceTop.y) * fy) / len;
}

/**
 * Unsigned angle between a segment (start → end) and the face-vertical axis
 * (faceTop → faceBottom). Returns degrees in [0, 180].
 *
 * Use for metrics that measure a feature's inclination from vertical in the
 * face's own frame, independent of how the head is rolled in the photo.
 */
export function angleFromFaceAxis(
  segmentStart: Landmark,
  segmentEnd: Landmark,
  faceTop: Landmark,
  faceBottom: Landmark
): number {
  const fx = faceBottom.x - faceTop.x;
  const fy = faceBottom.y - faceTop.y;
  const sx = segmentEnd.x - segmentStart.x;
  const sy = segmentEnd.y - segmentStart.y;
  const flen = Math.sqrt(fx * fx + fy * fy);
  const slen = Math.sqrt(sx * sx + sy * sy);
  if (flen === 0 || slen === 0) return 0;
  const cos = (fx * sx + fy * sy) / (flen * slen);
  const clamped = Math.max(-1, Math.min(1, cos));
  return (Math.acos(clamped) * 180) / Math.PI;
}

/**
 * Project a point's offset (from a reference) onto the face's own coordinate
 * frame. Returns `forward` (perpendicular to face-vertical, in the direction
 * of `forwardRef`) and `down` (along face-vertical). Both head-roll-
 * invariant within the limits of the chosen face axis.
 */
export function faceFrameCoords(
  point: Landmark,
  reference: Landmark,
  faceTop: Landmark,
  faceBottom: Landmark,
  forwardRef: Landmark
): { forward: number; down: number } {
  const fx = faceBottom.x - faceTop.x;
  const fy = faceBottom.y - faceTop.y;
  const flen = Math.sqrt(fx * fx + fy * fy);
  if (flen === 0) return { forward: 0, down: 0 };
  const downX = fx / flen;
  const downY = fy / flen;

  const midX = (faceTop.x + faceBottom.x) / 2;
  const midY = (faceTop.y + faceBottom.y) / 2;
  const fwdDx = forwardRef.x - midX;
  const fwdDy = forwardRef.y - midY;

  const perp1X = -downY;
  const perp1Y = downX;
  const perp2X = downY;
  const perp2Y = -downX;
  const useFirst = perp1X * fwdDx + perp1Y * fwdDy > 0;
  const forwardX = useFirst ? perp1X : perp2X;
  const forwardY = useFirst ? perp1Y : perp2Y;

  const ox = point.x - reference.x;
  const oy = point.y - reference.y;

  return {
    forward: ox * forwardX + oy * forwardY,
    down: ox * downX + oy * downY,
  };
}

export function angleDeg(p1: Landmark, vertex: Landmark, p2: Landmark): number {
  const v1x = p1.x - vertex.x;
  const v1y = p1.y - vertex.y;
  const v2x = p2.x - vertex.x;
  const v2y = p2.y - vertex.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
  // Phase 192 (Scoring-agent CRIT-C1) — degenerate input guard. If
  // two of (p1, vertex, p2) coincide (a MediaPipe glitch can collapse
  // landmarks on a bad detection), mag1 or mag2 is 0 → 0/0 = NaN →
  // Math.acos(NaN) = NaN → that NaN propagates into every downstream
  // metric using this helper (gonial, nasolabial, nasal-dorsum,
  // facial-convexity, mentolabial, nose-tip, forehead-inclination),
  // corrupting the overall score for the entire scan.
  if (mag1 === 0 || mag2 === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}
