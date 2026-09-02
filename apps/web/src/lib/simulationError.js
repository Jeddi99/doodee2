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
  canonical_required: {
    th: () => 'หัตถการจากแคตตาล็อกต้องใช้ภาพครบทั้งสามมุม สแกนนี้มีไม่ครบ จึงจำลองให้ไม่ได้',
    en: () => 'Catalog procedures need all three photographs. This scan does not have them, so it cannot be simulated.',
  },
  mixed_catalogs: {
    th: () => 'รวมหัตถการกับรูปทรงไว้ในภาพเดียวกันไม่ได้ เลือกอย่างใดอย่างหนึ่ง',
    en: () => 'Procedures and shapes cannot share one image. Choose one or the other.',
  },
  duplicate_procedure: {
    th: () => 'หัตถการเดียวกันถูกเลือกซ้ำ เอาออกหนึ่งรายการก่อน',
    en: () => 'The same procedure was chosen twice. Remove one of them.',
  },
  unknown_procedure: {
    th: () => 'ไม่พบหัตถการที่เลือกในแคตตาล็อก',
    en: () => 'That procedure is not in the catalog.',
  },
  procedure_out_of_scope: {
    th: (name) => `${name || 'หัตถการนี้'}ไม่ได้อยู่ในขอบเขตของภาพใบหน้า จึงจำลองไม่ได้`,
    en: (name) => `${name || 'That procedure'} is outside the scope of a face photograph, so it cannot be simulated.`,
  },
  invalid_intensity_level: {
    th: () => 'ระดับความเข้มที่เลือกอยู่นอกช่วง 1–5',
    en: () => 'The chosen intensity is outside the 1–5 range.',
  },
  unknown_view: {
    th: () => 'มุมภาพที่ขอไม่ได้ถูกสร้างไว้',
    en: () => 'That camera angle is not one of the rendered views.',
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
  // Saving keeps the image on the server for 30 days; it is not what put the picture on screen.
  // So the sentence names what is still possible rather than stopping at the refusal — the image
  // being looked at can still be downloaded, and that is the thing most people wanted anyway.
  monthly_save_quota_reached: {
    th: () => 'ใช้สิทธิ์บันทึกภาพครบตามโควตาของเดือนนี้แล้ว ภาพที่เห็นอยู่ยังดาวน์โหลดเก็บไว้ได้',
    en: () => 'You have used this month’s save quota. The image on screen can still be downloaded.',
  },
  // A 503 from the shared render queue, not a refusal of anything the user chose. Waiting is the
  // whole answer, so the sentence says that and nothing else.
  heavy_queue_busy: {
    th: () => 'ตอนนี้มีงานสร้างภาพรออยู่เต็มคิว รอสักครู่แล้วลองใหม่อีกครั้ง',
    en: () => 'The rendering queue is full right now. Wait a moment and try again.',
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

// The suffix names whichever thing the failure belongs to: a region id (`chin`) for the shape
// catalog, or a procedure's source ref (`1.7`) for the clinical one. Digits and dots are in the
// class for the second — without them `procedure_out_of_scope:1.7` fails to parse and the raw
// code reaches the screen, which is exactly what this module exists to prevent.
const CODE = /^([a-z_]+)(?::([a-z0-9_.]+))?$/;

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
