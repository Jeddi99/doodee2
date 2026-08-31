/**
 * Phase 190 — Centralized error → user-facing message translator.
 *
 * Raw `err.message` strings from network failures (e.g. "Failed to
 * fetch", "image-failed", "TypeError: ..."), library internals, or
 * unhandled server payloads are scary and not actionable. This helper
 * maps them to short, plain-language Thai/English strings the user can
 * actually understand.
 *
 * Usage at call sites:
 *
 *   try { ... }
 *   catch (e) {
 *     setError(humanizeError(e, lang));
 *   }
 *
 * The original raw message stays in console.warn for ops.
 */

import type { Lang } from "@/lib/i18n";

type Pair = { th: string; en: string };

const GENERIC: Pair = {
  th: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง",
  en: "Something went wrong. Please try again.",
};

const NETWORK: Pair = {
  th: "เชื่อมต่ออินเทอร์เน็ตขาดหาย ลองตรวจสัญญาณแล้วลองใหม่",
  en: "Network connection lost. Check your signal and try again.",
};

const TIMEOUT: Pair = {
  th: "ระบบตอบกลับช้าเกินกำหนด ลองอีกครั้งใน 1-2 นาที",
  en: "The server took too long to respond. Please try again in a moment.",
};

const RATE_LIMITED: Pair = {
  th: "ใช้งานบ่อยเกินไป รอสักครู่แล้วลองใหม่",
  en: "Too many requests. Please wait a moment and try again.",
};

const UNAUTHORIZED: Pair = {
  th: "เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่",
  en: "Your session expired. Please sign in again.",
};

const QUOTA: Pair = {
  th: "ครบจำนวนการใช้งานสำหรับช่วงนี้แล้ว",
  en: "You've reached your usage limit for now.",
};

const IMAGE_FAILED: Pair = {
  th: "สร้างภาพไม่สำเร็จ — ลองสร้างใหม่อีกครั้ง",
  en: "Image generation failed. Please try generating again.",
};

const IMAGE_UNAVAILABLE: Pair = {
  th: "ระบบสร้างภาพยังไม่พร้อมใช้งาน ลองใหม่ภายหลัง",
  en: "Reference image service is unavailable right now. Please try again later.",
};

const AI_FAILED: Pair = {
  th: "AI ตอบกลับไม่ทัน — ลองอีกครั้ง",
  en: "The AI didn't respond. Please try again.",
};

const FACE_NOT_FOUND: Pair = {
  th: "ระบบอ่านใบหน้าในรูปนี้ไม่ได้ กรุณาใช้รูปที่เห็นใบหน้าชัดเจน",
  en: "We couldn't read a face in this photo. Use a photo where the face is clearly visible.",
};

const POSE_BAD: Pair = {
  th: "หันหน้าตรงและให้ใบหน้าอยู่กลางกรอบ แล้วลองใหม่",
  en: "Please face straight forward and center your face, then try again.",
};

const STORAGE_FULL: Pair = {
  th: "พื้นที่เก็บข้อมูลในเครื่องเต็ม ลองล้างประวัติเก่าก่อน",
  en: "Local storage is full. Try clearing some history first.",
};

const SCAN_FAILED: Pair = {
  th: "ไม่สามารถวิเคราะห์รูปได้ ลองใหม่อีกครั้ง หรือใช้ไฟล์รูปมาตรฐาน",
  en: "Couldn't analyze the photo. Try again or use a standard image file.",
};

const SYSTEM_FAILED: Pair = {
  th: "อุปกรณ์ไม่สามารถโหลดระบบ AI ได้ (อาจหน่วยความจำเต็มหรือเน็ตขัดข้อง) ลองปิดแอปแล้วเข้าใหม่",
  en: "Device failed to load AI (out of memory or network issue). Try reloading the app.",
};

const PREVIEW_WEAK: Pair = {
  th: "ภาพที่ได้ยังไม่แสดงทิศทางของหัตถการชัดพอ กรุณาลองรูปอื่นหรือสร้างใหม่",
  en: "The result did not show a reliable treatment-direction change. Try another photo or generate again.",
};

const PREVIEW_NOT_APPLICABLE: Pair = {
  th: "รูปนี้ยังไม่เห็นลักษณะที่หัตถการนี้ต้องแก้ ระบบจึงไม่สร้างภาพที่อาจทำให้เข้าใจผิด",
  en: "This photo does not show the concern this preview is designed to change, so DooDee did not generate a misleading result.",
};

const BODY_CAPTURE_REQUIRED: Pair = {
  th: "หัตถการรูปร่างต้องใช้ภาพเต็มตัว ระบบจะไม่ใช้รูปใบหน้าสร้างผลลัพธ์แทน",
  en: "Body procedures require a full-body photo. A face photo will not be used as a substitute.",
};

const COMBO_OVERLAP: Pair = {
  th: "หัตถการที่เลือกแก้บริเวณซ้ำกัน กรุณาแยกสร้างทีละรายการ",
  en: "These procedures edit overlapping regions. Generate them separately.",
};

/**
 * Translate any thrown value into a short, actionable message for the
 * current language. Never returns an internal stack frame, error code,
 * or raw network detail.
 */
export function humanizeError(err: unknown, lang: Lang = "th"): string {
  const raw = extractRaw(err).toLowerCase();
  const pick = pickMessage(raw);
  return pick[lang];
}

function pickMessage(msg: string): Pair {
  if (msg.includes("preview-input-unsupported:body-capture-required")) {
    return BODY_CAPTURE_REQUIRED;
  }
  if (msg.includes("preview-combo-overlap")) {
    return COMBO_OVERLAP;
  }
  if (
    msg.includes("preview-effect-not-applicable") ||
    msg.includes("preview-postcheck:effect-not-applicable")
  ) {
    return PREVIEW_NOT_APPLICABLE;
  }
  if (
    msg.includes("preview-semantic-rejected") ||
    msg.includes("preview-locality-rejected") ||
    msg.includes("preview-provider-rejected")
  ) {
    return PREVIEW_WEAK;
  }
  if (
    msg.includes("preview-landmarks-unavailable") ||
    msg.includes("preview-mask-unavailable")
  ) {
    return FACE_NOT_FOUND;
  }
  // Order matters — match the most specific phrases first.
  if (msg.includes("face") && (msg.includes("not found") || msg.includes("no face"))) {
    return FACE_NOT_FOUND;
  }
  if (msg.includes("pose-rejected") || msg.includes("yaw") || msg.includes("pitch")) {
    return POSE_BAD;
  }
  if (msg.includes("rate limit") || msg.includes("rate_limit") || msg.includes("429")) {
    return RATE_LIMITED;
  }
  if (msg.includes("ai_image_failed:0")) {
    return NETWORK;
  }
  if (
    msg.includes("ai_image_provider_credit_required") ||
    msg.includes("image_provider_credit_required")
  ) {
    return IMAGE_UNAVAILABLE;
  }
  if (msg.includes("ai_image_failed:402") || msg.includes("out_of_previews")) {
    return QUOTA;
  }
  if (msg.includes("ai_image_failed:503") || msg.includes("ai_unavailable")) {
    return IMAGE_UNAVAILABLE;
  }
  if (msg.includes("ai_image_failed:504")) {
    return TIMEOUT;
  }
  if (
    msg.includes("ai_image_failed:500") ||
    msg.includes("ai_image_failed:502")
  ) {
    return IMAGE_FAILED;
  }
  if (
    msg.includes("quota") ||
    msg.includes("limit reached") ||
    msg.includes("upgrade required")
  ) {
    return QUOTA;
  }
  if (
    msg.includes("auth-token-missing") ||
    msg.includes("unauthor") ||
    msg.includes("401") ||
    msg.includes("forbidden") ||
    msg.includes("403")
  ) {
    return UNAUTHORIZED;
  }
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("etimedout") || msg.includes("504")) {
    return TIMEOUT;
  }
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("offline") ||
    msg.includes("dns")
  ) {
    return NETWORK;
  }
  if (msg.includes("quotaexceedederror") || msg.includes("storage full")) {
    return STORAGE_FULL;
  }
  if (msg.includes("mediapipe-detect") || msg.includes("wasm") || msg.includes("webgl")) {
    return SYSTEM_FAILED;
  }
  if (msg.includes("image-failed") || msg.includes("image_failed") || msg.includes("image gen")) {
    return IMAGE_FAILED;
  }
  if (msg.includes("ai-failed") || msg.includes("ai_failed") || msg.includes("ai_")) {
    return AI_FAILED;
  }
  return GENERIC;
}

function extractRaw(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "number") return String(err);
  try {
    // JSON.stringify(undefined) and stringifying symbols/functions yield
    // undefined, not a string — coerce so callers never get a non-string.
    return JSON.stringify(err) ?? "";
  } catch {
    return "";
  }
}
