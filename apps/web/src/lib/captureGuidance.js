/**
 * The words the capture screen puts on a failed frame.
 *
 * Split out from the screen because getting the direction wrong is worse than saying nothing: a
 * person told to move the wrong way corrects away from the target and never finds out why. That
 * decision is testable here.
 */

export const QUALITY_TEXT = {

  no_face: ['ยังไม่เห็นใบหน้า', 'No face yet'],
  multiple_faces: ['ต้องมีหนึ่งใบหน้าเท่านั้น', 'Only one face can be visible'],
  too_dark: ['แสงน้อยเกินไป', 'Move to brighter light'],
  too_bright: ['แสงจ้าหรือย้อนแสงเกินไป', 'Reduce glare or backlight'],
  // Distance messages name the direction and the thing to move. "Move closer" leaves open what
  // is moving; someone holding the phone at arm's length with their head turned away cannot work
  // out whether to shift the phone or themselves, and the two are opposite corrections.
  too_far: ['ถือมือถือเข้ามาใกล้หน้าอีกนิด', 'Bring the phone closer to your face'],
  too_close: ['ถือมือถือออกห่างจากหน้าอีกนิด', 'Move the phone further from your face'],
  // Not "centre your face": the crop recentres it anyway, and the only thing being asked for is
  // that none of the head is cut off. Backing the phone off is the fix someone turned to a
  // profile can actually carry out without seeing the screen.
  off_center: ['ถือมือถือออกห่างจากหน้าให้มากขึ้น จะเห็นหน้าครบทั้งหน้า', 'Move the phone further from your face so all of it fits'],
  wrong_pose: ['ปรับศีรษะตามมุมที่ระบุ', 'Match the requested angle'],
  wrong_expression: ['ปรับสีหน้าตามที่ระบุ', 'Match the requested expression'],
  not_stable: ['อยู่นิ่งสักครู่', 'Hold still'],
  ready: ['ดีมาก อยู่นิ่งไว้', 'Good — hold still'],
};

// How big the face was the last time one was seen, in the same units as faceHeightRatio.
// `no_face` is the one status with nothing of its own to measure, and the fix for a face that was
// filling the frame is the opposite of the fix for one that was a speck — so the last known size
// is what turns "we cannot see you" into a move someone can actually make.
export const LOST_WHEN_CLOSE_ABOVE = 0.55;
export const LOST_WHEN_FAR_BELOW = 0.2;

export function qualityText(status, isTh, lastFaceHeight) {
  if (status !== 'no_face') return QUALITY_TEXT[status][isTh ? 0 : 1];
  const base = QUALITY_TEXT.no_face[isTh ? 0 : 1];
  if (lastFaceHeight >= LOST_WHEN_CLOSE_ABOVE) {
    return isTh ? `${base} ถือมือถือออกห่างจากหน้าอีกนิด` : `${base} — move the phone further from your face`;
  }
  if (lastFaceHeight > 0 && lastFaceHeight <= LOST_WHEN_FAR_BELOW) {
    return isTh ? `${base} ถือมือถือเข้ามาใกล้หน้าอีกนิด` : `${base} — bring the phone closer to your face`;
  }
  // Nothing measured yet, so the likelier of the two is offered rather than a shrug: a face that
  // has never been found is usually just outside the frame, which backing off fixes.
  return isTh
    ? `${base} ถือมือถือออกห่างให้เห็นหน้าครบทั้งหน้า`
    : `${base} — hold the phone further back so your whole face fits`;
}
