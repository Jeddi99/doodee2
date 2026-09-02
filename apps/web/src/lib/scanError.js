// Turning a scan-pipeline server error into a sentence, the way `simulationError.js` already does
// for the render queue.
//
// The capture screens and the assessment screen render whatever `errorMessage()` pulled off the
// response, and some of what the API sends is a machine code rather than prose:
//
//   * `/scans/uploads/` answers 503 with `{"detail": "heavy_queue_busy"}` whenever the Celery
//     queue is saturated, so "heavy_queue_busy" appeared under the heading "Upload failed" —
//     unreadable to anyone who is not holding this repository.
//   * `/scans/<id>/assessment/` and `/scans/<id>/mesh/<view>/` answer 404 with `scan_not_found`
//     and `view_not_captured`.
//   * `request()` in `api.js` marks an unreachable API with `code = "api_unreachable"`.
//   * DRF's throttle answers `scan_create` in English prose regardless of the reader's locale.
//
// A raw code on screen is the same failure as an invented number: the screen is not telling the
// reader what actually happened. So every code that can reach these three screens gets a sentence
// in both languages, and anything unmapped still gets a sentence — with the raw value in
// parentheses, the way `scanFailure.js` carries an unknown code, so a screenshot stays enough to
// diagnose it.
//
// Its own module, with no imports, so it can be tested with `node --test`.

const MESSAGES = {
  // Not a refusal of anything the user did. Waiting is the whole answer.
  heavy_queue_busy: {
    th: 'ตอนนี้คิววิเคราะห์เต็มอยู่ รอสักครู่แล้วส่งใหม่อีกครั้ง',
    en: 'The analysis queue is full right now. Wait a moment and send again.',
  },
  api_unreachable: {
    th: 'ติดต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
    en: 'The app could not reach the server. Check your connection and try again.',
  },
  scan_not_found: {
    th: 'ไม่พบผลสแกนนี้ในบัญชีของคุณ อาจถูกลบไปแล้วหรือหมดอายุตามกำหนดการเก็บข้อมูล',
    en: 'This scan is not on your account. It may have been deleted, or removed on the retention schedule.',
  },
  view_not_captured: {
    th: 'การสแกนครั้งนี้ไม่มีภาพมุมนี้',
    en: 'This scan does not include that angle.',
  },
  no_landmarks: {
    th: 'อ่านจุดบนใบหน้าจากภาพมุมนี้ไม่ได้',
    en: 'The landmarks could not be read from this photograph.',
  },
  stale_consent_version: {
    th: 'ข้อความยินยอมมีการแก้ไข ต้องกดยินยอมกับข้อความชุดใหม่ก่อน',
    en: 'The consent wording has changed. It has to be agreed to again before this can continue.',
  },
};

// DRF renders a throttled request as English prose with a countdown in it, whatever the reader's
// locale ("Request was throttled. Expected available in 3212 seconds."). Matched on the prefix
// because the number changes; the seconds are dropped rather than translated, since "available in
// 3212 seconds" is not how anybody reads a wait.
const THROTTLED = /^request was throttled/i;

/**
 * @param raw   `error.code` when the client set one, otherwise the message the API layer threw
 * @param isTh  render Thai rather than English
 * @returns `{ code, text }` — `code` is null when the server sent prose rather than a code.
 *          `text` is always a sentence, never a bare code.
 */
export function describeScanError(raw, isTh) {
  const lang = isTh ? 'th' : 'en';
  if (!raw || typeof raw !== 'string') {
    return {
      code: null,
      text: isTh ? 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ ลองใหม่อีกครั้ง' : 'Something went wrong. Try again.',
    };
  }
  const value = raw.trim();
  const known = MESSAGES[value];
  if (known) return { code: value, text: known[lang] };
  if (THROTTLED.test(value)) {
    return {
      code: 'throttled',
      text: isTh
        ? 'ส่งสแกนถี่เกินไป รอสักครู่แล้วลองใหม่'
        : 'Too many scans in a short time. Wait a little and try again.',
    };
  }
  // Prose from the server — a DRF validation message — or a code this file has not been taught.
  // Either way the reader gets a sentence, and the raw value rides along in Thai as well so a
  // screenshot of this screen is still enough to diagnose it.
  const looksLikeCode = /^[a-z][a-z0-9_]*$/.test(value);
  if (!looksLikeCode) return { code: null, text: value };
  return {
    code: value,
    text: isTh ? `ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง (${value})` : `That did not go through. Try again (${value}).`,
  };
}

/** `describeScanError` for a thrown Error: reads the client-set code first, then the message. */
export function scanErrorText(error, isTh) {
  const raw = (error && (error.code || error.message)) || '';
  return describeScanError(raw, isTh).text;
}
