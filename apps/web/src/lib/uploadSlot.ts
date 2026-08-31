/**
 * Deciding whether a picked photograph can fill a capture slot, and which slot.
 *
 * Kept apart from both React and the worker: every operation that touches a canvas, a bitmap or a
 * `postMessage` arrives as a port, so the decisions here — reject or accept, which slot, warn or
 * block — are ordinary functions over data and can be tested under `node --test`, where none of
 * those things exist.
 *
 * ## Why the gate runs twice
 *
 * `measurePose` rejects a face shorter than 0.22 of the frame ("move closer") and one more than
 * 0.24 off centre ("centre your face"). That describes almost every real photograph of a person
 * standing a metre and a half away: measured face heights there sit around 0.15 to 0.20, usually
 * off centre. Run the gate on the raw file and it refuses good photographs, with advice that
 * cannot be followed — nobody can move closer inside a picture already taken.
 *
 * So the crop comes first. `faceCropRect` targets a face filling 0.6 of the frame, centred, which
 * is the middle of the band that passes — framing is satisfied by construction. The full gate then
 * runs on the cropped image, which has a second benefit worth more than the tidiness: brightness,
 * sharpness and pose are measured on *exactly the pixels that will be uploaded*, a stronger
 * guarantee than the live path gives, since that measures a whole frame and submits a crop of it.
 *
 * What cropping cannot fix is checked before it, by `stillFramingCode`: whether there is a face at
 * all, and whether it is large enough in real pixels to be worth measuring.
 */

import {
  findMatchingCaptureStep,
  getFaceBox,
  measurePose,
  stillFramingCode,
  type FaceObservation,
  type FaceBox,
  type FrameQuality,
  type LandmarkPoint,
  type QualityCode,
} from "../scanQuality.ts";

/** What the worker answers for one still. `landmarks: null` means it found no face. */
export type StillReading = {
  landmarks: LandmarkPoint[] | null;
  frameQuality?: FrameQuality;
  observation?: FaceObservation;
};

/**
 * The DOM-shaped work, injected.
 *
 * `Source` is deliberately opaque — this module never looks inside it, it only hands it back to
 * the ports. In the browser it is an `ImageBitmap`; in a test it is whatever the test likes.
 */
export type UploadPorts<Source> = {
  /** Decode and orient, returning a full-size source to crop from and a small one to detect on. */
  decode: (file: File) => Promise<{ full: Source; detect: Source; width: number; height: number }>;
  detect: (source: Source) => Promise<StillReading>;
  crop: (source: Source, width: number, height: number, box: FaceBox | null) => string;
  /** Read an encoded crop back, so it can be measured as it will be submitted. */
  reread: (dataUrl: string) => Promise<Source>;
  /** Why a decode threw — HEIC, oversized, or simply not an image. */
  classifyFailure: (file: File) => QualityCode;
  /** Whether a roll angle means the photograph itself is rotated rather than the head tilted. */
  isSideways: (roll: number) => boolean;
  /** Release a source once nothing else needs it. */
  release?: (source: Source) => void;
};

export type UploadOutcome =
  | {
      ok: true;
      /** Where it landed. May differ from the slot the user aimed at — see `resolveStep`. */
      stepIndex: number;
      dataUrl: string;
      /**
       * Accepted, but the reading is worse for it. Today only `relax_expression`.
       *
       * A smile is not a rejection on this path even though it is one for live capture, and the
       * asymmetry is deliberate: the server's `_pose_error` compares yaw, pitch and roll and
       * nothing else — `smile` is never read anywhere in `analysis_engine.py`. In front of a
       * camera, "relax your expression" is a thing the user can do in a second, so blocking costs
       * nothing. About a file it is the client refusing a photograph the server would have
       * analysed happily, from someone who may have no unsmiling photograph at all. Warning rather
       * than ignoring, because a smile really does move the mouth and cheek landmarks the
       * catalogue measures.
       */
      warning: QualityCode | null;
    }
  | { ok: false; code: QualityCode };

/**
 * Which slot this photograph belongs in.
 *
 * A user picks the wrong file, or a phone camera saved a selfie mirrored, and the head in the
 * picture faces the other way. Answering "turn farther left" about a file is meaningless, so
 * before rejecting, ask whether the photograph fits some *other* slot that is still empty. If it
 * does, put it there and say so. `findMatchingCaptureStep` already skips filled slots and already
 * picks the nearest angle, so this reuses the routing the camera path uses when the user turns
 * their head to whichever angle they like.
 */
export function resolveStep(
  landmarks: LandmarkPoint[],
  filled: readonly (string | null)[],
  requestedStep: number,
  frameQuality: FrameQuality | undefined,
  observation: FaceObservation | undefined,
): { stepIndex: number; quality: ReturnType<typeof measurePose> } {
  const requested = measurePose(landmarks, requestedStep, frameQuality, 1, observation);
  if (requested.valid || requested.code === "relax_expression") {
    return { stepIndex: requestedStep, quality: requested };
  }
  const matched = findMatchingCaptureStep(landmarks, filled, requestedStep, frameQuality, observation);
  if (matched === requestedStep || filled[matched]) return { stepIndex: requestedStep, quality: requested };
  const alternative = measurePose(landmarks, matched, frameQuality, 1, observation);
  if (alternative.valid || alternative.code === "relax_expression") {
    return { stepIndex: matched, quality: alternative };
  }
  // Nothing fits. Report against the slot the user actually aimed at, so the reason matches the
  // tile they pressed rather than one they never touched.
  return { stepIndex: requestedStep, quality: requested };
}

export async function prepareUpload<Source>(
  file: File,
  requestedStep: number,
  filled: readonly (string | null)[],
  ports: UploadPorts<Source>,
): Promise<UploadOutcome> {
  let decoded;
  try {
    decoded = await ports.decode(file);
  } catch {
    return { ok: false, code: ports.classifyFailure(file) };
  }

  const { full, detect, width, height } = decoded;
  const done = () => {
    ports.release?.(full);
    if (detect !== full) ports.release?.(detect);
  };

  const first = await ports.detect(detect);
  const box = first.landmarks ? getFaceBox(first.landmarks) : null;
  const framing = stillFramingCode(box, height);
  if (framing) {
    done();
    return { ok: false, code: framing };
  }
  // Checked before the crop, because cropping a sideways photograph produces a sideways crop and
  // then the pose gate reports "keep your head level" about a picture that needs rotating.
  if (first.observation && ports.isSideways(first.observation.roll)) {
    done();
    return { ok: false, code: "sideways" };
  }
  // A second face is a reason to stop before cropping: `faceCropRect` would frame one of them and
  // silently discard the fact that the photograph was of two people.
  if ((first.observation?.faceCount ?? 1) > 1) {
    done();
    return { ok: false, code: "multiple_faces" };
  }

  const dataUrl = ports.crop(full, width, height, box);
  done();
  if (!dataUrl) return { ok: false, code: "unreadable_image" };

  const cropped = await ports.reread(dataUrl);
  const second = await ports.detect(cropped);
  ports.release?.(cropped);
  if (!second.landmarks) return { ok: false, code: "no_face" };

  const { stepIndex, quality } = resolveStep(
    second.landmarks, filled, requestedStep, second.frameQuality, second.observation,
  );
  if (!quality.valid && quality.code !== "relax_expression") return { ok: false, code: quality.code };
  return { ok: true, stepIndex, dataUrl, warning: quality.valid ? null : "relax_expression" };
}
