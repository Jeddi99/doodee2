// Turning a server error code into something a person can act on.
//
// The API answers failures with a machine code — `too_many_selections`, or `code:region` when the
// failure belongs to one region, such as `profile_photos_required:chin`. Those codes used to
// reach the screen verbatim, which reads as a crash to anyone who is not the developer.
//
// The region is parsed out rather than string-matched at the call site, so the view can offer to
// remove exactly the region the server rejected.
//
// Its own module, with no imports, so it can be tested with `node --test`.

const MESSAGES = {
  profile_photos_required: {
    th: (region) => `สแกนนี้ไม่มีภาพด้านข้าง จึงจำลอง${region ? `${region}` : 'บริเวณนี้'}จากมุมด้านข้างไม่ได้`,
    en: (region) => `This scan has no side photos, so ${region || 'this region'} cannot be simulated from the side.`,
  },
  preset_region_mismatch: {
    th: (region) => `แบบที่เลือกไม่ตรงกับ${region ? region : 'บริเวณนี้'} ลองเลือกแบบใหม่`,
    en: (region) => `The chosen shape does not belong to ${region || 'this region'}. Pick another one.`,
  },
  information_only_preset: {
    th: () => 'หัตถการนี้ให้ข้อมูลอย่างเดียว ไม่มีภาพจำลอง',
    en: () => 'This procedure is information only and has no simulated image.',
  },
  too_many_selections: {
    th: () => 'เลือกจำลองได้สูงสุด 6 บริเวณต่อภาพ เอาบางบริเวณออกก่อน',
    en: () => 'Up to 6 regions can be simulated in one image. Remove one first.',
  },
  mixed_source_view: {
    th: () => 'แบบของมุมหน้าตรงกับมุมด้านข้างรวมอยู่ในภาพเดียวกันไม่ได้ เพราะเป็นคนละภาพต้นฉบับ',
    en: () => 'Front and side shapes cannot share one image; they come from different photos.',
  },
  reference_cannot_stack: {
    th: () => 'โหมดเทียบค่าอ้างอิงทำได้ครั้งละบริเวณเดียว',
    en: () => 'Compare-to-reference works on one region at a time.',
  },
  already_near_reference: {
    th: () => 'บริเวณนี้อยู่ใกล้ค่าเฉลี่ยมากจนการปรับจะมองไม่เห็นความต่าง',
    en: () => 'This region already sits so close to the mean that a change would be invisible.',
  },
  preview_in_progress: {
    th: () => 'กำลังสร้างภาพก่อนหน้าอยู่ รอสักครู่แล้วลองอีกครั้ง',
    en: () => 'A preview is still rendering. Wait a moment and try again.',
  },
  preview_rate_limited: {
    th: () => 'สร้างภาพถี่เกินไป พักสักครู่แล้วลองใหม่',
    en: () => 'Too many previews in a short time. Pause for a moment and try again.',
  },
  monthly_preview_quota_reached: {
    th: () => 'ใช้ preview ครบตามโควตาของเดือนนี้แล้ว',
    en: () => 'You have used this month’s preview quota.',
  },
  simulation_requires_entitlement: {
    th: () => 'การสร้างภาพจำลองต้องมีสิทธิ์ก่อน',
    en: () => 'Generating simulated images needs an entitlement.',
  },
  source_expired: {
    th: () => 'ภาพสแกนต้นฉบับหมดอายุแล้ว ต้องสแกนใหม่',
    en: () => 'The source scan has expired. A new scan is needed.',
  },
  face_count: {
    th: () => 'ตรวจไม่พบใบหน้าเดียวที่ชัดเจนในภาพสแกนนี้',
    en: () => 'No single clear face was found in this scan.',
  },
  invalid_image: {
    th: () => 'ภาพสแกนนี้ใช้สร้างภาพจำลองไม่ได้',
    en: () => 'This scan image cannot be used to build a simulation.',
  },
  invalid_face_dimensions: {
    th: () => 'วัดสัดส่วนจากภาพสแกนนี้ไม่ได้',
    en: () => 'Proportions could not be measured from this scan.',
  },
  preview_unavailable: {
    th: () => 'สร้างภาพไม่สำเร็จ ลองใหม่อีกครั้ง',
    en: () => 'The image could not be rendered. Try again.',
  },
  simulation_failed: {
    th: () => 'สร้างภาพไม่สำเร็จ ลองใหม่อีกครั้ง',
    en: () => 'The image could not be rendered. Try again.',
  },
};

// Malformed requests the user cannot fix by choosing differently — a client bug, so they get one
// plain sentence rather than wording that implies they did something wrong.
const CLIENT_FAULT = ['duplicate_region', 'empty_selections', 'invalid_selection', 'invalid_preset', 'conflicting_selection_fields'];
for (const code of CLIENT_FAULT) {
  MESSAGES[code] = {
    th: () => 'คำขอไม่ถูกต้อง ลองเลือกใหม่อีกครั้ง',
    en: () => 'That request was not valid. Try selecting again.',
  };
}

const CODE = /^([a-z_]+)(?::([a-z_]+))?$/;

/**
 * @param message  the raw string thrown by the API layer
 * @param isTh     render Thai rather than English
 * @param regionLabel  maps a region id to its display name
 * @returns `{ code, region, text }` — `code`/`region` are null when the server sent prose
 */
export function describeSimulationError(message, isTh, regionLabel = (id) => id) {
  if (!message || typeof message !== 'string') return { code: null, region: null, text: '' };
  const match = CODE.exec(message.trim());
  const [, code, region] = match || [];
  const entry = code ? MESSAGES[code] : null;
  if (!entry) {
    // An unmapped code or an English sentence from the server. The user still gets a sentence they
    // can read, and the raw value rides along so a bug report stays diagnosable.
    return {
      code: code || null,
      region: region || null,
      text: isTh ? `สร้างภาพจำลองไม่สำเร็จ ลองใหม่อีกครั้ง (${message})` : message,
    };
  }
  return { code, region: region || null, text: entry[isTh ? 'th' : 'en'](region ? regionLabel(region) : null) };
}
