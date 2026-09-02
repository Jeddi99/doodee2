// Turning a failed scan's error code into the two things the person needs: which photograph, and
// what was wrong with it.
//
// `tasks.process_scan` writes a machine code into `Scan.error_code` — `pose_left_profile:roll:+2`,
// `blurry_image:front`, `missing_views` — and a fixed sentence into `error_message` that ends
// "Retake the indicated images." Nothing indicated them. The server knew the view and the
// correction and threw both away at the screen, so a scan that failed by two degrees of head tilt
// on one photograph read as the product refusing to work, with no way to tell which of the three
// to take again.
//
// Sign conventions are the ones `pose_targets.json` and `packages/shared/capture-quality.ts`
// share, and this file must not invent its own: positive yaw is the head turned to the subject's
// RIGHT, positive pitch is the chin DOWN. The delta the server sends is the correction to apply —
// value + delta lands on the boundary — so its sign is the direction to move, not the direction
// the head was.
//
// Roll is deliberately given no direction. The correction sign is well defined, but "tilt your
// head to the right" is read against the mirror-image of yourself on a screen and half of everyone
// applies it backwards; "keep it level" cannot be misread and is the whole instruction anyway.
//
// Its own module, with no imports, so it can be tested with `node --test`.

const VIEWS = {
  front: { th: 'หน้าตรง', en: 'Front' },
  front_smile: { th: 'หน้าตรง (ยิ้ม)', en: 'Front, smiling' },
  left_oblique: { th: 'เฉียงซ้าย', en: 'Left 45°' },
  right_oblique: { th: 'เฉียงขวา', en: 'Right 45°' },
  left_profile: { th: 'ซ้าย 90°', en: 'Left 90°' },
  right_profile: { th: 'ขวา 90°', en: 'Right 90°' },
  basal: { th: 'ใต้คาง', en: 'From below' },
};

// What to do about it, per axis and per direction of the correction.
const POSE = {
  yaw: {
    '-': { th: 'หันไปทางซ้ายอีกนิด', en: 'turn a little further to your left' },
    '+': { th: 'หันไปทางขวาอีกนิด', en: 'turn a little further to your right' },
  },
  pitch: {
    '-': { th: 'เงยคางขึ้นอีกนิด', en: 'raise your chin a little' },
    '+': { th: 'ก้มคางลงอีกนิด', en: 'lower your chin a little' },
  },
  roll: {
    '-': { th: 'ตั้งศีรษะให้ตรง อย่าเอียง', en: 'keep your head level, not tilted' },
    '+': { th: 'ตั้งศีรษะให้ตรง อย่าเอียง', en: 'keep your head level, not tilted' },
  },
};

// Failures that belong to one photograph but are not about the angle of the head.
const PER_VIEW = {
  invalid_image: {
    th: () => 'เปิดไฟล์นี้เป็นรูปภาพไม่ได้',
    en: () => 'this file could not be opened as an image',
  },
  poor_lighting: {
    th: () => 'แสงไม่พอหรือสว่างจนล้น วัดจากรูปนี้ไม่ได้',
    en: () => 'the light was too dim or too blown out to measure',
  },
  blurry_image: {
    th: () => 'ภาพเบลอเกินกว่าจะวัดได้',
    en: () => 'it is too blurry to measure',
  },
  // `analysis_engine` raises this for zero faces, for more than one, and for a detection it
  // cannot trust. It cannot tell them apart, so neither does this: claiming "no face found"
  // about a photograph with two people in it sends the user looking for the wrong problem.
  face_count: {
    th: () => 'อ่านใบหน้าไม่ได้ — ในรูปต้องมีใบหน้าเดียวและเห็นครบทั้งหน้า',
    en: () => 'no single clear face could be read — one whole face, and only one, has to be in frame',
  },
  invalid_face_dimensions: {
    th: () => 'วัดสัดส่วนใบหน้าจากรูปนี้ไม่ได้',
    en: () => 'the proportions of the face could not be measured from it',
  },
};

// Failures that belong to the scan rather than to any one photograph.
const WHOLE_SCAN = {
  missing_views: {
    th: () => 'ภาพที่อัปโหลดไม่ครบทุกมุมที่การสแกนแบบนี้ต้องใช้',
    en: () => 'The upload did not contain every angle this kind of scan needs.',
  },
  // Raised while the metrics are computed, which is past the point where `analyze_images` still
  // knows which photograph it is holding — so this one arrives with no view attached and must
  // not name one. It is also in `PER_VIEW`, for the day the measurement loop learns to say.
  invalid_face_dimensions: {
    th: () => 'วัดสัดส่วนใบหน้าจากภาพชุดนี้ไม่ได้ — ถ่ายใหม่ให้เห็นใบหน้าเต็มและไม่ถูกบัง',
    en: () => 'The proportions of the face could not be measured from these photographs — take them again with the whole face visible and unobstructed.',
  },
  analysis_failed: {
    th: () => 'การวิเคราะห์ล้มเหลวระหว่างประมวลผล ไม่ใช่เพราะรูป — ลองสแกนใหม่อีกครั้ง',
    en: () => 'The analysis failed while running. This was not the photographs — try scanning again.',
  },
};

const POSE_CODE = /^pose_([a-z_]+):(yaw|pitch|roll):([+-]\d+)$/;
const VIEW_CODE = /^([a-z_]+):([a-z_]+)$/;

/**
 * @param errorCode  `Scan.error_code` as the API sent it
 * @param isTh       render Thai rather than English
 * @returns `{ code, view, text }` — `view` is the scan view to retake, or null when the failure
 *          belongs to the whole scan. `text` is always a sentence, never a code.
 */
export function describeScanFailure(errorCode, isTh) {
  const lang = isTh ? 'th' : 'en';
  const unknown = (raw) => ({
    code: null,
    view: null,
    // The raw value rides along in Thai as well, so a screenshot of this screen is still enough
    // to diagnose a code this file has not been taught yet.
    text: isTh
      ? `สแกนนี้วัดไม่สำเร็จ ลองถ่ายใหม่ในที่ที่แสงสม่ำเสมอ${raw ? ` (${raw})` : ''}`
      : `This scan could not be measured. Try again in even light${raw ? ` (${raw})` : ''}.`,
  });
  if (!errorCode || typeof errorCode !== 'string') return unknown('');
  const raw = errorCode.trim();

  const pose = POSE_CODE.exec(raw);
  if (pose && VIEWS[pose[1]]) {
    const [, view, axis, delta] = pose;
    const advice = POSE[axis][delta.startsWith('-') ? '-' : '+'][lang];
    const degrees = Math.abs(Number(delta));
    return {
      code: `pose_${axis}`,
      view,
      text: isTh
        ? `ภาพ “${VIEWS[view].th}” เอียงจากมุมที่ต้องใช้อยู่ประมาณ ${degrees}° — ${advice} แล้วถ่ายมุมนี้ใหม่`
        : `The “${VIEWS[view].en}” photo is about ${degrees}° outside the angle this measurement needs — ${advice}, then take that one again.`,
    };
  }

  const perView = VIEW_CODE.exec(raw);
  if (perView && PER_VIEW[perView[1]] && VIEWS[perView[2]]) {
    const [, code, view] = perView;
    return {
      code,
      view,
      text: isTh
        ? `ภาพ “${VIEWS[view].th}” ${PER_VIEW[code].th()} — ถ่ายมุมนี้ใหม่`
        : `The “${VIEWS[view].en}” photo: ${PER_VIEW[code].en()}. Take that one again.`,
    };
  }

  if (WHOLE_SCAN[raw]) return { code: raw, view: null, text: WHOLE_SCAN[raw][lang]() };
  return unknown(raw);
}
