// What each measured ratio means, and which two points on the face it came from.
//
// A mirror of the catalogue in `backend/doodee/analysis_engine.py`: `key` and `category` must match
// what the server produces, and `span`/`denominator` must match the landmark pairs it divides. A
// backend test asserts the key sets stay identical, so adding a metric server-side without naming
// it here fails loudly instead of showing the user a raw key.
//
// `span` is the distance the metric measures; `denominator` is what it is divided by. Both are drawn
// — the measured one solid, the denominator dashed — so a reader can see what is being compared to
// what. `null` means the metric is not a single distance and gets no line.

const FACE_WIDTH = [234, 454];    // tragion to tragion
const FACE_HEIGHT = [10, 152];    // trichion to menton

export const FACE_METRICS = [
  {
    key: 'face_width_to_height', category: 'harmony',
    name_th: 'ความกว้างต่อความสูงใบหน้า', name_en: 'Face width to height',
    about_th: 'ความกว้างใบหน้าเทียบความสูงทั้งใบหน้า', about_en: 'Face width against total face height',
    span: FACE_WIDTH, denominator: FACE_HEIGHT,
  },
  {
    key: 'upper_face_height_ratio', category: 'harmony',
    name_th: 'ความสูงส่วนบนของใบหน้า', name_en: 'Upper face height',
    about_th: 'ไรผมถึงหัวคิ้ว เทียบความสูงทั้งใบหน้า', about_en: 'Hairline to nasion, against total face height',
    span: [10, 168], denominator: FACE_HEIGHT,
  },
  {
    key: 'midface_height_ratio', category: 'harmony',
    name_th: 'ความสูงกลางใบหน้า (เท่ากับความยาวจมูก)', name_en: 'Midface height (same span as nose length)',
    about_th: 'หัวคิ้วถึงใต้จมูก เทียบความสูงทั้งใบหน้า — ช่วงนี้เป็นช่วงเดียวกับความยาวจมูก จึงแสดงแถวเดียว',
    about_en: 'Nasion to subnasale against total face height. This is the same span as nose length, so it is listed once.',
    span: [168, 2], denominator: FACE_HEIGHT,
  },
  {
    key: 'lower_face_height_ratio', category: 'harmony',
    name_th: 'ความสูงส่วนล่างของใบหน้า', name_en: 'Lower face height',
    about_th: 'ใต้จมูกถึงปลายคาง เทียบความสูงทั้งใบหน้า', about_en: 'Subnasale to menton, against total face height',
    span: [2, 152], denominator: FACE_HEIGHT,
  },
  {
    key: 'right_eye_width_ratio', category: 'eyes',
    name_th: 'ความกว้างตาขวา', name_en: 'Right eye width',
    about_th: 'หัวตาถึงหางตาข้างขวา เทียบความกว้างใบหน้า', about_en: 'Inner to outer corner, right eye, against face width',
    span: [33, 133], denominator: FACE_WIDTH,
  },
  {
    key: 'left_eye_width_ratio', category: 'eyes',
    name_th: 'ความกว้างตาซ้าย', name_en: 'Left eye width',
    about_th: 'หัวตาถึงหางตาข้างซ้าย เทียบความกว้างใบหน้า', about_en: 'Inner to outer corner, left eye, against face width',
    span: [362, 263], denominator: FACE_WIDTH,
  },
  {
    key: 'intercanthal_ratio', category: 'eyes',
    name_th: 'ระยะระหว่างหัวตา', name_en: 'Intercanthal distance',
    about_th: 'ระยะระหว่างหัวตาสองข้าง เทียบความกว้างใบหน้า', about_en: 'Between the inner eye corners, against face width',
    span: [133, 362], denominator: FACE_WIDTH,
  },
  {
    key: 'right_brow_eye_gap_ratio', category: 'eyes',
    name_th: 'ระยะคิ้ว-ตาขวา', name_en: 'Right brow to eye gap',
    about_th: 'คิ้วถึงเปลือกตาบนข้างขวา เทียบความสูงใบหน้า', about_en: 'Brow to upper lid, right side, against face height',
    span: [105, 159], denominator: FACE_HEIGHT,
  },
  {
    key: 'left_brow_eye_gap_ratio', category: 'eyes',
    name_th: 'ระยะคิ้ว-ตาซ้าย', name_en: 'Left brow to eye gap',
    about_th: 'คิ้วถึงเปลือกตาบนข้างซ้าย เทียบความสูงใบหน้า', about_en: 'Brow to upper lid, left side, against face height',
    span: [334, 386], denominator: FACE_HEIGHT,
  },
  {
    key: 'right_eye_aspect_ratio', category: 'eyes',
    name_th: 'ความสูงต่อความกว้างตาขวา', name_en: 'Right eye aspect ratio',
    about_th: 'ความสูงของตาขวา เทียบความกว้างของตาขวาเอง', about_en: 'Right eye height against its own width',
    span: [159, 145], denominator: [33, 133],
  },
  {
    key: 'left_eye_aspect_ratio', category: 'eyes',
    name_th: 'ความสูงต่อความกว้างตาซ้าย', name_en: 'Left eye aspect ratio',
    about_th: 'ความสูงของตาซ้าย เทียบความกว้างของตาซ้ายเอง', about_en: 'Left eye height against its own width',
    span: [386, 374], denominator: [362, 263],
  },
  {
    key: 'nose_length_ratio', category: 'nose',
    name_th: 'ความยาวจมูก', name_en: 'Nose length',
    about_th: 'หัวคิ้วถึงใต้จมูก', about_en: 'Nasion to subnasale',
    span: [168, 2], denominator: FACE_HEIGHT,
  },
  {
    key: 'alar_width_ratio', category: 'nose',
    name_th: 'ความกว้างฐานจมูก', name_en: 'Alar base width',
    about_th: 'ระยะระหว่างปีกจมูกสองข้าง เทียบความกว้างใบหน้า', about_en: 'Between the alar bases, against face width',
    span: [98, 327], denominator: FACE_WIDTH,
  },
  {
    key: 'mouth_width_ratio', category: 'lips_mouth',
    name_th: 'ความกว้างปาก', name_en: 'Mouth width',
    about_th: 'ระยะระหว่างมุมปากสองข้าง เทียบความกว้างใบหน้า', about_en: 'Between the mouth corners, against face width',
    span: [61, 291], denominator: FACE_WIDTH,
  },
  {
    key: 'philtrum_ratio', category: 'lips_mouth',
    name_th: 'ความยาวร่องริมฝีปากบน', name_en: 'Philtrum length',
    about_th: 'ใต้จมูกถึงขอบริมฝีปากบน เทียบความสูงใบหน้า', about_en: 'Subnasale to the upper lip border, against face height',
    span: [2, 0], denominator: FACE_HEIGHT,
  },
  {
    key: 'upper_lower_lip_ratio', category: 'lips_mouth',
    name_th: 'ริมฝีปากบนต่อล่าง', name_en: 'Upper to lower lip',
    about_th: 'ความหนาริมฝีปากบน เทียบความหนาริมฝีปากล่าง', about_en: 'Upper vermillion height against the lower',
    span: [0, 13], denominator: [14, 17],
  },
  {
    key: 'jaw_width_ratio', category: 'jaw_chin',
    name_th: 'ความกว้างมุมกราม', name_en: 'Jaw angle width',
    about_th: 'ระยะระหว่างมุมกรามสองข้าง เทียบความกว้างใบหน้า', about_en: 'Between the mandibular angles, against face width',
    span: [172, 397], denominator: FACE_WIDTH,
  },
  {
    key: 'chin_height_ratio', category: 'jaw_chin',
    name_th: 'ความสูงคาง', name_en: 'Chin height',
    about_th: 'ขอบริมฝีปากล่างถึงปลายคาง เทียบความสูงใบหน้า', about_en: 'Lower lip border to menton, against face height',
    span: [17, 152], denominator: FACE_HEIGHT,
  },
  {
    key: 'chin_width_ratio', category: 'jaw_chin',
    name_th: 'ความกว้างคาง', name_en: 'Chin width',
    about_th: 'ความกว้างของปลายคาง เทียบความกว้างใบหน้า', about_en: 'Width across the chin, against face width',
    span: [176, 400], denominator: FACE_WIDTH,
  },
  {
    key: 'zygomatic_width_ratio', category: 'cheeks',
    name_th: 'ความกว้างโหนกแก้ม', name_en: 'Cheekbone width',
    about_th: 'ระยะระหว่างโหนกแก้มสองข้าง เทียบความกว้างใบหน้า', about_en: 'Between the cheekbones, against face width',
    span: [116, 345], denominator: FACE_WIDTH,
  },
  // Differences between two distances, not a distance — there is no single line to draw.
  {
    key: 'eye_width_asymmetry', category: 'symmetry',
    name_th: 'ความต่างความกว้างตาสองข้าง', name_en: 'Eye width difference',
    about_th: 'ผลต่างความกว้างตาซ้ายกับขวา ยิ่งใกล้ 0 ยิ่งเท่ากัน', about_en: 'Difference between left and right eye width; closer to 0 is more equal',
    span: null, denominator: null,
  },
  {
    key: 'brow_gap_asymmetry', category: 'symmetry',
    name_th: 'ความต่างระยะคิ้ว-ตาสองข้าง', name_en: 'Brow gap difference',
    about_th: 'ผลต่างระยะคิ้ว-ตาซ้ายกับขวา ยิ่งใกล้ 0 ยิ่งเท่ากัน', about_en: 'Difference between left and right brow-to-eye gaps; closer to 0 is more equal',
    span: null, denominator: null,
  },
  {
    key: 'mandible_asymmetry', category: 'symmetry',
    name_th: 'ความต่างความยาวขากรรไกรสองข้าง', name_en: 'Mandible length difference',
    about_th: 'ผลต่างระยะจากข้างใบหน้าถึงปลายคางสองข้าง ยิ่งใกล้ 0 ยิ่งเท่ากัน', about_en: 'Difference between the two side-to-menton distances; closer to 0 is more equal',
    span: null, denominator: null,
  },
  // Measured on the side photos, which this page does not display.
  {
    key: 'left_profile_nose_projection_ratio', category: 'side_profile',
    name_th: 'การยื่นของจมูก (ด้านซ้าย)', name_en: 'Nose projection (left)',
    about_th: 'วัดจากภาพด้านข้าง หน้านี้แสดงเฉพาะภาพหน้าตรง จึงไม่มีเส้น', about_en: 'Measured on the side photo, which this page does not show',
    span: null, denominator: null,
  },
  {
    key: 'left_profile_facial_convexity_ratio', category: 'side_profile',
    name_th: 'ความโค้งด้านข้างของใบหน้า (ด้านซ้าย)', name_en: 'Facial convexity (left)',
    about_th: 'วัดจากภาพด้านข้าง หน้านี้แสดงเฉพาะภาพหน้าตรง จึงไม่มีเส้น', about_en: 'Measured on the side photo, which this page does not show',
    span: null, denominator: null,
  },
  {
    key: 'right_profile_nose_projection_ratio', category: 'side_profile',
    name_th: 'การยื่นของจมูก (ด้านขวา)', name_en: 'Nose projection (right)',
    about_th: 'วัดจากภาพด้านข้าง หน้านี้แสดงเฉพาะภาพหน้าตรง จึงไม่มีเส้น', about_en: 'Measured on the side photo, which this page does not show',
    span: null, denominator: null,
  },
  {
    key: 'right_profile_facial_convexity_ratio', category: 'side_profile',
    name_th: 'ความโค้งด้านข้างของใบหน้า (ด้านขวา)', name_en: 'Facial convexity (right)',
    about_th: 'วัดจากภาพด้านข้าง หน้านี้แสดงเฉพาะภาพหน้าตรง จึงไม่มีเส้น', about_en: 'Measured on the side photo, which this page does not show',
    span: null, denominator: null,
  },
];

/**
 * Skin metrics, deliberately not shown.
 *
 * `visible_tone_unevenness` and friends come from `gray.std()/64` and a Laplacian variance over the
 * face mask, so they track room lighting and camera sharpening more than skin. They also are not
 * proportions. Listed here rather than deleted so the key-sync test can account for them.
 */
export const SKIN_KEYS = ['visible_tone_unevenness', 'visible_redness', 'visible_texture'];

/**
 * `nose_length_ratio` is nasion→subnasale over face height — the identical landmarks and denominator
 * as `midface_height_ratio`, so the two always hold the same number. Shown once, under the midface
 * row, rather than as two rows that look like a calculation error.
 */
export const MERGED_INTO = { nose_length_ratio: 'midface_height_ratio' };

export const METRIC_CATEGORIES = ['harmony', 'eyes', 'nose', 'lips_mouth', 'jaw_chin', 'cheeks', 'symmetry', 'side_profile'];

export const CATEGORY_LABELS = {
  harmony: ['สัดส่วนรวมของใบหน้า', 'Overall proportions'],
  eyes: ['ดวงตาและคิ้ว', 'Eyes and brows'],
  nose: ['จมูก', 'Nose'],
  lips_mouth: ['ปากและริมฝีปาก', 'Mouth and lips'],
  jaw_chin: ['กรามและคาง', 'Jaw and chin'],
  cheeks: ['โหนกแก้ม', 'Cheekbones'],
  symmetry: ['ความสมมาตร', 'Symmetry'],
  side_profile: ['ด้านข้าง', 'Side profile'],
};

// The stomion — the midpoint of the upper and lower inner lip — is computed, not a landmark.
export const STOMION = 'stomion';

/**
 * The other metric family: `reference_scores.metrics`.
 *
 * These divide by n–gn (nasion to menton) so they can be compared against published Thai millimetre
 * means, whereas `FACE_METRICS` divides by face width or height. Same landmarks in several cases,
 * different denominators, therefore different numbers — which is why the page shows the two
 * families as separate sections rather than one table.
 */
export const REFERENCE_DENOMINATOR = [168, 152];

export const REFERENCE_METRIC_SPANS = {
  midface_height: [168, 2],
  lower_face_height: [2, 152],
  intercanthal: [133, 362],
  // The average of both eye fissures, so both are drawn.
  eye_fissure: [[33, 133], [362, 263]],
  alar_width: [98, 327],
  upper_lip_length: [2, 0],
  upper_vermillion: [0, 13],
  lower_vermillion: [14, 17],
  chin_height: [STOMION, 152],
  nasofrontal_angle: null,
  nasolabial_angle: null,
  facial_convexity_angle: null,
};

export const REFERENCE_METRIC_LABELS = {
  midface_height: ['ความสูงกลางใบหน้า', 'Midface height'],
  lower_face_height: ['ความสูงส่วนล่างของใบหน้า', 'Lower face height'],
  intercanthal: ['ระยะระหว่างหัวตา', 'Intercanthal distance'],
  eye_fissure: ['ความกว้างตา (เฉลี่ยสองข้าง)', 'Eye fissure width (both averaged)'],
  alar_width: ['ความกว้างฐานจมูก', 'Alar base width'],
  upper_lip_length: ['ความยาวริมฝีปากบน', 'Upper lip length'],
  upper_vermillion: ['ความหนาริมฝีปากบน', 'Upper vermillion height'],
  lower_vermillion: ['ความหนาริมฝีปากล่าง', 'Lower vermillion height'],
  chin_height: ['ความสูงคาง', 'Chin height'],
  nasofrontal_angle: ['มุมหน้าผาก-จมูก', 'Nasofrontal angle'],
  nasolabial_angle: ['มุมจมูก-ริมฝีปาก', 'Nasolabial angle'],
  facial_convexity_angle: ['มุมความโค้งใบหน้า', 'Facial convexity angle'],
};

/** Rows to display: the catalogue minus skin, minus anything folded into another row. */
export const displayedMetrics = (metrics) => {
  const measured = new Map((metrics || []).map((metric) => [metric.key, metric]));
  return FACE_METRICS
    .filter((entry) => !MERGED_INTO[entry.key] && measured.has(entry.key))
    .map((entry) => ({ ...entry, measured: measured.get(entry.key) }));
};
