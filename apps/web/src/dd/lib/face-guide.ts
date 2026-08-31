import type { Landmarks } from "@/types";

/**
 * Phase 140 — real-time framing & pose guidance for live camera preview.
 *
 * Takes the latest set of facial landmarks (normalized 0-1 coordinates
 * relative to the video frame) and produces a friendly nudge for the
 * user — "หันตรง" / "ขยับเข้าใกล้" / "ก้มหน้าเล็กน้อย".
 *
 * Cheap to compute (single landmark math, no allocations beyond the
 * return object) so the live loop can run at 5-10 Hz without affecting
 * the viewfinder framerate.
 *
 * Phase 620 — extended with a `target` pose parameter so the same
 * yaw/pitch signals can guide a user into any of 4 poses (front / left /
 * right / up) for the guided live-scan sequence, not just "front and
 * ready". Defaults to "front" so every existing call site (single-pose
 * capture) is unaffected.
 */

export type GuideStatus = "no-face" | "framing" | "pose" | "ready";

export interface FaceGuide {
  status: GuideStatus;
  /** Friendly Thai message ("หันตรง", "ขยับเข้าใกล้กล้อง", ...). */
  hint_th: string;
  /** Same message in English. */
  hint_en: string;
  /** Composite 0-1 score: how ready the frame is for a clean scan. */
  readiness: number;
}

/** The 4 poses the guided live-scan sequence walks the user through. */
export type PoseTarget = "front" | "left" | "right" | "up";

/** Anchor landmark indices we read off the FaceMesh output. */
const NOSE_TIP = 1;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;
const CHIN = 152;
const FOREHEAD = 10;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_OUTER = 263;

// Empirically-chosen targets: face takes ~40% of frame width, sits
// within ±10% of frame center. Same for every pose target — framing
// requirements don't change just because the user is about to turn
// their head.
const TOO_SMALL = 0.25;
const TOO_BIG = 0.6;
const CENTER_TOL_X = 0.14;
const CENTER_TOL_Y = 0.15;

// "Ready" bands for a front-facing, level pose. noseRel is the nose
// tip's vertical position relative to the eye line, as a fraction of
// face height — see the readiness check below for the full derivation.
const FRONT_YAW = [-0.08, 0.08] as const;
const FRONT_PITCH = [0.18, 0.42] as const;

/**
 * Per-target acceptance bands. LEFT/RIGHT require a deliberately
 * turned yaw instead of centered; UP requires a deliberately lifted
 * chin (lower noseRel — see the Phase 140 comment above the pitch
 * check: low noseRel means the head is tilted back/up).
 *
 * Ranges were chosen to be clearly outside the "front" ready band
 * (no ambiguous middle ground where a small head movement flips the
 * detected target) while still being a comfortable, reachable turn —
 * roughly a 20-35° yaw and a mild chin lift, not a hard profile shot.
 */
const POSE_TARGET_RANGES: Record<
  PoseTarget,
  { yaw: readonly [number, number]; pitch: readonly [number, number] }
> = {
  front: { yaw: FRONT_YAW, pitch: FRONT_PITCH },
  left: { yaw: [0.16, 0.34], pitch: FRONT_PITCH },
  right: { yaw: [-0.34, -0.16], pitch: FRONT_PITCH },
  up: { yaw: FRONT_YAW, pitch: [0.02, 0.16] },
};

export function evaluateFaceGuide(
  landmarks: Landmarks | null,
  target: PoseTarget = "front"
): FaceGuide {
  if (!landmarks || landmarks.length === 0) {
    return {
      status: "no-face",
      hint_th: "ให้ใบหน้าอยู่ในกรอบก่อน",
      hint_en: "Place your face inside the frame",
      readiness: 0,
    };
  }

  const nose = landmarks[NOSE_TIP];
  const leftCheek = landmarks[LEFT_CHEEK];
  const rightCheek = landmarks[RIGHT_CHEEK];
  const chin = landmarks[CHIN];
  const forehead = landmarks[FOREHEAD];
  const lEye = landmarks[LEFT_EYE_OUTER];
  const rEye = landmarks[RIGHT_EYE_OUTER];

  if (!nose || !leftCheek || !rightCheek || !chin || !forehead || !lEye || !rEye) {
    return {
      status: "no-face",
      hint_th: "ขยับให้เห็นทั้งใบหน้า",
      hint_en: "Make sure your whole face is visible",
      readiness: 0,
    };
  }

  // ----- 1. Framing: face size + on-screen position -----
  const faceW = Math.abs(rightCheek.x - leftCheek.x);
  const faceH = Math.abs(chin.y - forehead.y);
  const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
  const faceCenterY = (forehead.y + chin.y) / 2;

  if (faceW < TOO_SMALL) {
    return {
      status: "framing",
      hint_th: "ขยับเข้าใกล้กล้องอีกนิด",
      hint_en: "Move a bit closer to the camera",
      readiness: 0.2,
    };
  }
  if (faceW > TOO_BIG) {
    return {
      status: "framing",
      hint_th: "ถอยห่างกล้องเล็กน้อย",
      hint_en: "Pull back from the camera a little",
      readiness: 0.2,
    };
  }

  // X-offset (horizontal centering). Move-camera language — user
  // moves their face, not "tilt camera".
  if (faceCenterX < 0.5 - CENTER_TOL_X) {
    return {
      status: "framing",
      hint_th: "ขยับไปทางขวาเล็กน้อย",
      hint_en: "Shift slightly to the right",
      readiness: 0.35,
    };
  }
  if (faceCenterX > 0.5 + CENTER_TOL_X) {
    return {
      status: "framing",
      hint_th: "ขยับไปทางซ้ายเล็กน้อย",
      hint_en: "Shift slightly to the left",
      readiness: 0.35,
    };
  }
  if (faceCenterY < 0.5 - CENTER_TOL_Y) {
    return {
      status: "framing",
      hint_th: "ขยับลงนิดนึง",
      hint_en: "Move down a touch",
      readiness: 0.35,
    };
  }
  if (faceCenterY > 0.5 + CENTER_TOL_Y) {
    return {
      status: "framing",
      hint_th: "ขยับขึ้นนิดนึง",
      hint_en: "Move up a touch",
      readiness: 0.35,
    };
  }

  // ----- 2. Pose: yaw (head turn) + pitch (head tilt) -----
  // Yaw heuristic: when the head is turned, the nose tip moves
  // toward one cheek relative to the cheek-midpoint. A face looking
  // straight ahead has nose ~50% between cheeks.
  const cheekMidX = (leftCheek.x + rightCheek.x) / 2;
  const noseYawOffset = (nose.x - cheekMidX) / faceW; // -0.5..0.5

  // Pitch heuristic: in a perfectly head-on photo, the nose tip sits
  // roughly halfway down the face. Lower noseRel → head tilted back/up;
  // higher → tilted down. See range comments above.
  const eyeMidY = (lEye.y + rEye.y) / 2;
  const noseRel = (nose.y - eyeMidY) / faceH;

  const { yaw: yawRange, pitch: pitchRange } = POSE_TARGET_RANGES[target];

  if (target === "front") {
    if (noseYawOffset < yawRange[0]) {
      return {
        status: "pose",
        hint_th: "หันหน้ามาทางขวา (ของคุณ) นิดหน่อย",
        hint_en: "Turn slightly to your right",
        readiness: 0.5,
      };
    }
    if (noseYawOffset > yawRange[1]) {
      return {
        status: "pose",
        hint_th: "หันหน้ามาทางซ้าย (ของคุณ) นิดหน่อย",
        hint_en: "Turn slightly to your left",
        readiness: 0.5,
      };
    }
  } else if (target === "left") {
    if (noseYawOffset < yawRange[0]) {
      return {
        status: "pose",
        hint_th: "หันหน้าไปทางซ้าย (ของคุณ) เพิ่มอีกนิด",
        hint_en: "Turn a bit further to your left",
        readiness: 0.5,
      };
    }
    if (noseYawOffset > yawRange[1]) {
      return {
        status: "pose",
        hint_th: "หันกลับมาทางขวาเล็กน้อย — หันเยอะไปหน่อย",
        hint_en: "Turn back slightly — that's a bit too far",
        readiness: 0.5,
      };
    }
  } else if (target === "right") {
    if (noseYawOffset > yawRange[1]) {
      return {
        status: "pose",
        hint_th: "หันหน้าไปทางขวา (ของคุณ) เพิ่มอีกนิด",
        hint_en: "Turn a bit further to your right",
        readiness: 0.5,
      };
    }
    if (noseYawOffset < yawRange[0]) {
      return {
        status: "pose",
        hint_th: "หันกลับมาทางซ้ายเล็กน้อย — หันเยอะไปหน่อย",
        hint_en: "Turn back slightly — that's a bit too far",
        readiness: 0.5,
      };
    }
  } else {
    // "up" target: yaw must stay centered like "front".
    if (noseYawOffset < yawRange[0]) {
      return {
        status: "pose",
        hint_th: "หันหน้ามาทางขวา (ของคุณ) นิดหน่อย",
        hint_en: "Turn slightly to your right",
        readiness: 0.5,
      };
    }
    if (noseYawOffset > yawRange[1]) {
      return {
        status: "pose",
        hint_th: "หันหน้ามาทางซ้าย (ของคุณ) นิดหน่อย",
        hint_en: "Turn slightly to your left",
        readiness: 0.5,
      };
    }
  }

  if (target === "up") {
    if (noseRel > pitchRange[1]) {
      return {
        status: "pose",
        hint_th: "เงยหน้าขึ้นอีกนิด",
        hint_en: "Lift your chin up a bit more",
        readiness: 0.65,
      };
    }
    if (noseRel < pitchRange[0]) {
      return {
        status: "pose",
        hint_th: "เงยน้อยลงนิดนึง — เงยเยอะไปหน่อย",
        hint_en: "Ease off slightly — that's a bit too far",
        readiness: 0.65,
      };
    }
  } else {
    if (noseRel > pitchRange[1]) {
      return {
        status: "pose",
        hint_th: "เงยหน้าขึ้นเล็กน้อย",
        hint_en: "Lift your chin a little",
        readiness: 0.65,
      };
    }
    if (noseRel < pitchRange[0]) {
      return {
        status: "pose",
        hint_th: "ก้มหน้าลงเล็กน้อย",
        hint_en: "Tilt your chin down a touch",
        readiness: 0.65,
      };
    }
  }

  // ----- 3. Roll (head tilt left/right) -----
  // When the head is rolled, the two eyes sit at different y values.
  // Applies to every target — a rolled head is never a clean capture.
  const rollAbs = Math.abs(lEye.y - rEye.y);
  if (rollAbs > 0.04) {
    return {
      status: "pose",
      hint_th: "ตั้งศีรษะให้ตรง (อย่าเอียง)",
      hint_en: "Straighten your head — don't tilt sideways",
      readiness: 0.75,
    };
  }

  // ----- Ready -----
  const readyHints: Record<PoseTarget, { th: string; en: string }> = {
    front: { th: "พร้อมแล้ว — กดถ่ายได้เลย", en: "Ready — tap to capture" },
    left: { th: "ท่านี้ใช้ได้ — กำลังถ่าย", en: "Good angle — capturing" },
    right: { th: "ท่านี้ใช้ได้ — กำลังถ่าย", en: "Good angle — capturing" },
    up: { th: "ท่านี้ใช้ได้ — กำลังถ่าย", en: "Good angle — capturing" },
  };
  return {
    status: "ready",
    hint_th: readyHints[target].th,
    hint_en: readyHints[target].en,
    readiness: 1,
  };
}
