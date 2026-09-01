// Decides what the capture screen may claim about a photo it just took.
//
// The manual shutter exists so a broken detector cannot strand anyone, but it used to skip
// every check: an off-target photo was uploaded silently and the server then threw away the
// whole scan, and a photo taken before the detector found a face was never cropped. These
// helpers keep the client honest about both, before the upload rather than after.

// Views whose landmarks produce measurements. Must match measured_views() in
// backend/doodee/analysis_engine.py: an off-target pose here fails the entire scan, while
// other views only raise an advisory.
const PROFILE_VIEWS = ['left_profile', 'right_profile'];

export function isMeasuredView(view, scanMode) {
  if (view === 'front') return true;
  if (!PROFILE_VIEWS.includes(view)) return false;
  return scanMode === 'standard' || scanMode === 'full';
}

/**
 * True when pressing the manual shutter should ask for confirmation first.
 *
 * `poseEnforced` is what the confirmation is actually for: it warns that an off-target frame will
 * cost the whole scan. Where the server has pose rejection switched off that consequence does not
 * exist, so a second press would be asking someone to confirm a penalty they cannot incur —
 * pressing the shutter is simply taken at its word.
 */
export const needsCaptureConfirmation = (status, poseEnforced = true) => poseEnforced && status !== 'ready';

/** What was true at the moment the shutter fired, kept for the review screen. */
export function captureQuality(status, faceBox, view, scanMode) {
  return {
    status,
    onTarget: status === 'ready',
    cropped: Boolean(faceBox),
    measured: isMeasuredView(view, scanMode),
  };
}

/**
 * The badge for one photo on the review screen.
 *
 * `rejected` marks a view the server has already refused by name, which outranks anything
 * observed on device.
 */
export function reviewBadge(quality, rejected = false) {
  if (rejected) return { tone: 'error', reason: 'rejected' };
  if (!quality) return { tone: 'ok', reason: 'passed' };
  const tone = quality.measured ? 'error' : 'warning';
  // No face was ever found, so nothing can be claimed about the pose — say that instead.
  if (!quality.cropped) return { tone, reason: 'not_cropped' };
  if (!quality.onTarget) return { tone, reason: 'off_target' };
  return { tone: 'ok', reason: 'passed' };
}

/** Views that will fail the scan on upload, so the user can retake before spending the time. */
export function viewsRiskingRejection(captureQualities, views) {
  return views.filter((view) => {
    const quality = captureQualities[view];
    return Boolean(quality && quality.measured && (!quality.onTarget || !quality.cropped));
  });
}
