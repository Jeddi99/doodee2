/**
 * Choosing which frame of a sweep to keep, and proving the analyser can read it.
 *
 * Three problems are solved together here, because they are the same problem seen from different
 * ends.
 *
 * A frame that satisfies the pose target is not necessarily the *best* frame that will satisfy it.
 * Turning a head through the window passes through many acceptable frames, and shooting the first
 * one discards every better one behind it. So candidates are scored and the best is held.
 *
 * A frame the capture screen can measure is not necessarily one the server can. The screen tracks
 * a face from frame to frame and keeps a lock through the turn; the server gets one still image
 * and has to find the face in it cold. A real scan died on a sharp, well-framed profile that no
 * confidence threshold from 0.6 down to 0.1 could find a face in. So a held candidate is verified
 * with the same still-image detector the server uses before it is accepted at all.
 *
 * And that verification produces exactly what the server would have computed — so the landmarks
 * are kept and travel with the photo, letting the server fall back to them in the rare case its
 * own detection still comes up empty.
 */

/**
 * How much better a frame must score to take over from the one being held.
 *
 * Without a margin, near-identical scores swap the held frame constantly, and every swap costs a
 * canvas draw and throws away a frame that had already been proven readable.
 */
export const CANDIDATE_MARGIN = .02;

export function beatsBestCandidate(best, next) {
  return best === null || next > best + CANDIDATE_MARGIN;
}

/** Nothing held yet for this view. */
export const emptyCandidate = () => ({ score: null, canvas: null, landmarks: null, pose: null, verified: false });

/**
 * Draw `crop` of `video` into a canvas that is reused across candidates.
 *
 * Reused rather than freshly allocated because this runs several times a second while the pose
 * holds, and a new canvas per frame is a new GPU surface per frame.
 */
export function drawCandidate(canvas, video, crop, maxEdge = 1600) {
  const scale = Math.min(1, maxEdge / Math.max(crop.width, crop.height));
  const width = Math.round(crop.width * scale);
  const height = Math.round(crop.height * scale);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;
  context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  return canvas;
}

/**
 * Landmarks in the coordinates of the cropped photo rather than the camera frame.
 *
 * The server measures the image it receives, which is the crop. Landmarks read off the full frame
 * describe a different rectangle, and feeding those in unchanged would stretch every ratio by the
 * ratio of the two rectangles.
 */
export function landmarksInCropSpace(landmarks, crop, videoWidth, videoHeight) {
  if (!landmarks?.length || !crop?.width || !crop?.height) return null;
  return landmarks.map((point) => [
    // Rounded to five places: the extra precision is noise from a 512-wide detector input, and it
    // would triple the size of a payload that carries 478 of these.
    Number((((point.x * videoWidth) - crop.x) / crop.width).toFixed(5)),
    Number((((point.y * videoHeight) - crop.y) / crop.height).toFixed(5)),
    Number((point.z ?? 0).toFixed(5)),
  ]);
}

/**
 * Offer `video`'s current frame as a candidate.
 *
 * `score` comes from candidateScore() in the shared package, which is where the judgement about
 * what makes a frame good lives. This function only decides whether to keep it. Returns `current`
 * unchanged when the frame did not win, and draws only when it did, so a losing frame is free.
 */
export function offerCandidate(current, { score, video, crop, canvas }) {
  if (!beatsBestCandidate(current.score, score)) return current;
  if (!drawCandidate(canvas, video, crop)) return current;
  // A new frame is unverified by definition; whatever was proven about the last one does not
  // transfer to different pixels.
  return { ...emptyCandidate(), score, canvas };
}

/**
 * Run the still-image detector over a held candidate.
 *
 * This is the check that matters: it is the same running mode, model and thresholds the server
 * uses, so a pass here is a pass there. A candidate that fails is dropped rather than uploaded,
 * and the sweep continues — the alternative is a scan that dies minutes later with nothing the
 * person can act on.
 */
export async function verifyCandidate(candidate, { detectStill, crop, videoWidth, videoHeight }) {
  if (!candidate.canvas || candidate.verified) return candidate;
  let result;
  try {
    result = await detectStill(candidate.canvas);
  } catch {
    // A detector that will not load says nothing about the photo. Treating that as a failed frame
    // would make the scan impossible on a device where it cannot run at all, so the candidate is
    // passed through unverified and the server keeps the final say.
    return { ...candidate, verified: true, landmarks: null, pose: null, detectorUnavailable: true };
  }
  if (!result?.landmarks?.length) return { ...candidate, verified: false, unreadable: true };
  return {
    ...candidate,
    verified: true,
    unreadable: false,
    landmarks: landmarksInCropSpace(result.landmarks, crop, videoWidth, videoHeight),
    pose: result.pose ?? null,
  };
}
