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
  {
    key: 'lip_fullness_ratio', category: 'lips_mouth',
    name_th: 'ความอิ่มของริมฝีปาก', name_en: 'Lip fullness',
    about_th: 'ความหนารวมของริมฝีปากบนและล่าง เทียบความสูงใบหน้า', about_en: 'Upper and lower vermillion together, against face height',
    span: [0, 17], denominator: FACE_HEIGHT,
  },
  {
    key: 'bizygomatic_to_upper_face_ratio', category: 'harmony',
    name_th: 'ความกว้างโหนกแก้มต่อความสูงใบหน้าส่วนบน (FWHR)', name_en: 'Bizygomatic width to upper face height (FWHR)',
    about_th: 'ความกว้างระหว่างโหนกแก้ม เทียบระยะหัวคิ้วถึงขอบริมฝีปากบน — คนละค่ากับความกว้างต่อความสูงทั้งใบหน้าด้านบน',
    about_en: 'Cheekbone to cheekbone against nasion-to-upper-lip. Not the same as the whole-face width-to-height above.',
    span: [116, 345], denominator: [168, 0],
  },
  {
    key: 'facial_thirds_balance', category: 'harmony',
    name_th: 'ความสม่ำเสมอของใบหน้า 3 ส่วน', name_en: 'Facial thirds balance',
    about_th: 'ส่วนที่ห่างจาก 1 ใน 3 มากที่สุด ยิ่งใกล้ 0 ยิ่งแบ่งสามส่วนได้เท่ากัน', about_en: 'The third that sits furthest from an even split; closer to 0 is more even',
    span: null, denominator: null,
  },
  {
    key: 'eye_separation_ratio', category: 'eyes',
    name_th: 'ระยะห่างดวงตาต่อความกว้างโหนกแก้ม', name_en: 'Eye separation ratio',
    about_th: 'ระยะระหว่างหัวตา เทียบความกว้างโหนกแก้ม ไม่ใช่ความกว้างใบหน้าทั้งหมด — ตัวหารกว้างกว่าที่งานวิจัยใช้ ค่าจึงต่ำกว่าเลข 0.45 ที่มักอ้างถึง',
    about_en: 'Between the inner corners, against cheekbone width rather than whole face width. The denominator is wider than the published one, so this reads below the 0.45 often quoted',
    span: [133, 362], denominator: [116, 345],
  },
  {
    key: 'nose_proportion_ratio', category: 'nose',
    name_th: 'สัดส่วนจมูก กว้างต่อยาว', name_en: 'Nose width to length',
    about_th: 'ความกว้างฐานจมูก เทียบความยาวจมูกของตัวเอง', about_en: 'Alar base width against the nose\u2019s own length',
    span: [98, 327], denominator: [168, 2],
  },
  {
    key: 'mouth_to_nose_ratio', category: 'lips_mouth',
    name_th: 'ความกว้างปากต่อความกว้างจมูก', name_en: 'Mouth width to nose width',
    about_th: 'ความกว้างปาก เทียบความกว้างฐานจมูก', about_en: 'Mouth width against alar base width',
    span: [61, 291], denominator: [98, 327],
  },
  {
    key: 'chin_philtrum_ratio', category: 'jaw_chin',
    name_th: 'ความสูงคางต่อความยาวร่องริมฝีปากบน', name_en: 'Chin height to philtrum length',
    about_th: 'ความสูงคาง เทียบความยาวร่องริมฝีปากบน สองระยะนี้อยู่ในใบหน้าส่วนล่างด้วยกัน', about_en: 'Chin height against philtrum length \u2014 two spans that share the lower third',
    span: [17, 152], denominator: [2, 0],
  },
  {
    key: 'cheekbone_prominence_ratio', category: 'cheeks',
    name_th: 'ความเด่นของโหนกแก้มเทียบกราม', name_en: 'Cheekbone prominence against the jaw',
    about_th: 'ความกว้างโหนกแก้ม เทียบความกว้างมุมกราม ค่ามากคือส่วนบนของใบหน้ากว้างกว่าส่วนล่าง', about_en: 'Cheekbone width against jaw-angle width; higher means the face is wider up top than at the jaw',
    span: [116, 345], denominator: [172, 397],
  },
  {
    key: 'right_canthal_tilt_deg', unit: 'degree', category: 'eyes',
    name_th: 'ความเอียงหางตาขวา', name_en: 'Right canthal tilt',
    about_th: 'หางตาสูงกว่าหัวตากี่องศา ค่าบวกคือหางตาเชิดขึ้น', about_en: 'How many degrees the outer corner sits above the inner one; positive is an upward tilt',
    span: [133, 33], denominator: null,
  },
  {
    key: 'left_canthal_tilt_deg', unit: 'degree', category: 'eyes',
    name_th: 'ความเอียงหางตาซ้าย', name_en: 'Left canthal tilt',
    about_th: 'หางตาสูงกว่าหัวตากี่องศา ค่าบวกคือหางตาเชิดขึ้น', about_en: 'How many degrees the outer corner sits above the inner one; positive is an upward tilt',
    span: [362, 263], denominator: null,
  },
  {
    key: 'right_brow_tilt_deg', unit: 'degree', category: 'eyes',
    name_th: 'ความเอียงคิ้วขวา', name_en: 'Right brow tilt',
    about_th: 'หางคิ้วสูงกว่าหัวคิ้วกี่องศา ค่าบวกคือหางคิ้วยกขึ้น', about_en: 'How many degrees the brow tail sits above its head; positive is an upward tilt',
    span: [107, 70], denominator: null,
  },
  {
    key: 'left_brow_tilt_deg', unit: 'degree', category: 'eyes',
    name_th: 'ความเอียงคิ้วซ้าย', name_en: 'Left brow tilt',
    about_th: 'หางคิ้วสูงกว่าหัวคิ้วกี่องศา ค่าบวกคือหางคิ้วยกขึ้น', about_en: 'How many degrees the brow tail sits above its head; positive is an upward tilt',
    span: [336, 300], denominator: null,
  },
  {
    key: 'right_gonial_angle_deg', unit: 'degree', category: 'jaw_chin',
    name_th: 'มุมกรามขวา (ประมาณจากด้านหน้า)', name_en: 'Right gonial angle (front-view estimate)',
    about_th: 'มุมที่มุมกรามข้างขวา ระหว่างแนวข้างใบหน้ากับแนวไปปลายคาง — มุมกรามจริงอ่านจากฟิล์มด้านข้าง ค่านี้บอกได้แค่ความเหลี่ยมที่เห็นจากด้านหน้า',
    about_en: 'The angle at the right jaw corner, between the side of the face and the line to the chin. The real gonial angle comes off a side radiograph; this only tracks how square the jaw looks from the front.',
    span: null, denominator: null,
  },
  {
    key: 'left_gonial_angle_deg', unit: 'degree', category: 'jaw_chin',
    name_th: 'มุมกรามซ้าย (ประมาณจากด้านหน้า)', name_en: 'Left gonial angle (front-view estimate)',
    about_th: 'มุมที่มุมกรามข้างซ้าย ระหว่างแนวข้างใบหน้ากับแนวไปปลายคาง — มุมกรามจริงอ่านจากฟิล์มด้านข้าง ค่านี้บอกได้แค่ความเหลี่ยมที่เห็นจากด้านหน้า',
    about_en: 'The angle at the left jaw corner, between the side of the face and the line to the chin. The real gonial angle comes off a side radiograph; this only tracks how square the jaw looks from the front.',
    span: null, denominator: null,
  },
  {
    key: 'alar_asymmetry', category: 'symmetry',
    name_th: 'ความต่างของปีกจมูกสองข้าง', name_en: 'Alar difference',
    about_th: 'ผลต่างระยะจากปลายจมูกถึงปีกจมูกซ้ายกับขวา ยิ่งใกล้ 0 ยิ่งเท่ากัน', about_en: 'Difference between the two nose-tip-to-alar distances; closer to 0 is more equal',
    span: null, denominator: null,
  },
  {
    key: 'lip_corner_asymmetry', category: 'symmetry',
    name_th: 'ความต่างของมุมปากสองข้าง', name_en: 'Mouth corner difference',
    about_th: 'ผลต่างระยะจากปลายจมูกถึงมุมปากซ้ายกับขวา ยิ่งใกล้ 0 ยิ่งเท่ากัน', about_en: 'Difference between the two nose-tip-to-mouth-corner distances; closer to 0 is more equal',
    span: null, denominator: null,
  },
  {
    key: 'left_profile_upper_lip_eline_ratio', category: 'side_profile',
    name_th: 'ริมฝีปากบนเทียบเส้น E (ด้านซ้าย)', name_en: 'Upper lip against the E-line (left)',
    about_th: 'เส้นจากปลายจมูกถึงปลายคาง (Ricketts) ค่าบวกคือริมฝีปากยื่นล้ำเส้น ค่าลบคืออยู่หลังเส้น', about_en: 'Nose tip to chin (Ricketts). Positive means the lip sits in front of the line, negative behind it',
    span: null, denominator: null,
  },
  {
    key: 'left_profile_lower_lip_eline_ratio', category: 'side_profile',
    name_th: 'ริมฝีปากล่างเทียบเส้น E (ด้านซ้าย)', name_en: 'Lower lip against the E-line (left)',
    about_th: 'เส้นจากปลายจมูกถึงปลายคาง (Ricketts) ค่าบวกคือริมฝีปากยื่นล้ำเส้น ค่าลบคืออยู่หลังเส้น', about_en: 'Nose tip to chin (Ricketts). Positive means the lip sits in front of the line, negative behind it',
    span: null, denominator: null,
  },
  {
    key: 'left_profile_mentolabial_angle_deg', unit: 'degree', category: 'side_profile',
    name_th: 'มุมร่องใต้ริมฝีปากล่าง (ด้านซ้าย)', name_en: 'Mentolabial angle (left)',
    about_th: 'มุมที่ร่องระหว่างริมฝีปากล่างกับคาง ค่ามากคือร่องตื้น', about_en: 'The angle of the fold between the lower lip and the chin; larger is a shallower fold',
    span: null, denominator: null,
  },
  {
    key: 'left_profile_chin_projection_ratio', category: 'side_profile',
    name_th: 'การยื่นของคาง (ด้านซ้าย)', name_en: 'Chin projection (left)',
    about_th: 'วัดจากภาพด้านข้าง หน้านี้แสดงเฉพาะภาพหน้าตรง จึงไม่มีเส้น', about_en: 'Measured on the side photo, which this page does not show',
    span: null, denominator: null,
  },
  {
    key: 'right_profile_upper_lip_eline_ratio', category: 'side_profile',
    name_th: 'ริมฝีปากบนเทียบเส้น E (ด้านขวา)', name_en: 'Upper lip against the E-line (right)',
    about_th: 'เส้นจากปลายจมูกถึงปลายคาง (Ricketts) ค่าบวกคือริมฝีปากยื่นล้ำเส้น ค่าลบคืออยู่หลังเส้น', about_en: 'Nose tip to chin (Ricketts). Positive means the lip sits in front of the line, negative behind it',
    span: null, denominator: null,
  },
  {
    key: 'right_profile_lower_lip_eline_ratio', category: 'side_profile',
    name_th: 'ริมฝีปากล่างเทียบเส้น E (ด้านขวา)', name_en: 'Lower lip against the E-line (right)',
    about_th: 'เส้นจากปลายจมูกถึงปลายคาง (Ricketts) ค่าบวกคือริมฝีปากยื่นล้ำเส้น ค่าลบคืออยู่หลังเส้น', about_en: 'Nose tip to chin (Ricketts). Positive means the lip sits in front of the line, negative behind it',
    span: null, denominator: null,
  },
  {
    key: 'right_profile_mentolabial_angle_deg', unit: 'degree', category: 'side_profile',
    name_th: 'มุมร่องใต้ริมฝีปากล่าง (ด้านขวา)', name_en: 'Mentolabial angle (right)',
    about_th: 'มุมที่ร่องระหว่างริมฝีปากล่างกับคาง ค่ามากคือร่องตื้น', about_en: 'The angle of the fold between the lower lip and the chin; larger is a shallower fold',
    span: null, denominator: null,
  },
  {
    key: 'right_profile_chin_projection_ratio', category: 'side_profile',
    name_th: 'การยื่นของคาง (ด้านขวา)', name_en: 'Chin projection (right)',
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

/**
 * The three side measurements are angles, not distances, which is why their spans above are null.
 *
 * `[arm, vertex, arm]`, in the order `analysis_engine.PROFILE_REFERENCE_GEOMETRY` declares them:
 * nasofrontal is angle(10, 168, 1), nasolabial angle(1, 2, 0), convexity angle(168, 2, 152). Kept
 * in the server's order so the rays named here are the arms of the number it computed — a diagram
 * of a different angle that happens to look plausible is worse than no diagram, and
 * `faceMetrics.test.js` reads the server's table and fails if these two ever drift apart.
 *
 * These are indices, not coordinates. Nothing draws from them: the scan carries the points the
 * server measured at, in `analysis_data.metric_geometry`, and `lib/metricLines.js` draws those.
 * This table is the reviewable statement of *which* points those are meant to be, which is the
 * half a coordinate cannot tell you.
 */
export const REFERENCE_METRIC_ANGLES = {
  nasofrontal_angle: [10, 168, 1],
  nasolabial_angle: [1, 2, 0],
  facial_convexity_angle: [168, 2, 152],
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
