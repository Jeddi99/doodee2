const tests = (...items) => items.map(([id, th, en]) => ({ id, th, en }));
const preset = (id, th, en, values, level = 'non-invasive') => [id, th, values, en, level];

export const STUDIO_CATEGORIES = [
  {
    id: 'general', icon: '✦', label: 'ภาพรวม', labelEn: 'General', availableCount: 8,
    tests: tests(
      ['first-impression', 'ภาพลักษณ์แรกพบ', 'First impression'],
      ['proportions', 'สัดส่วนใบหน้า', 'Facial proportions'],
      ['symmetry', 'ความสมมาตร', 'Facial symmetry'],
      ['youthfulness', 'ภาพลักษณ์ตามช่วงวัย', 'Perceived youthfulness'],
    ),
    sliders: [], presets: [],
  },
  {
    id: 'faceShape', icon: '⬡', label: 'ทรงหน้า', labelEn: 'Face shape', availableCount: 5, composite: true,
    tests: tests(
      ['shape', 'การจำแนกทรงหน้า', 'Shape classification'],
      ['length-width', 'อัตราส่วนยาวต่อกว้าง', 'Length-to-width ratio'],
      ['forehead-jaw', 'สมดุลหน้าผากต่อกราม', 'Forehead-to-jaw balance'],
      ['cheek-jaw', 'สมดุลแก้มต่อกราม', 'Cheek-to-jaw balance'],
      ['thirds', 'สัดส่วนใบหน้าสามส่วน', 'Facial thirds'],
    ),
    sliders: [],
    presets: [
      preset('oval', 'วงรีสมดุล', 'Balanced oval', { cheekFiller: 30, jawBotox: 46, chinLength: 38, jawDefinition: 35 }),
      preset('round', 'กลมนุ่ม', 'Soft round', { cheekFiller: 58, jawBotox: 12, chinLength: 16, jawDefinition: 12 }),
      preset('square', 'เหลี่ยมคม', 'Defined square', { cheekFiller: 20, jawBotox: 0, chinLength: 24, jawDefinition: 82 }),
      preset('heart', 'หัวใจ', 'Heart shape', { cheekFiller: 58, jawBotox: 68, chinLength: 42, jawDefinition: 46 }),
      preset('diamond', 'ไดมอนด์', 'Diamond shape', { cheekFiller: 24, cheekboneReduction: 0, jawBotox: 54, chinLength: 46, jawDefinition: 62 }),
    ],
  },
  {
    id: 'brows', icon: '〰', label: 'คิ้ว', labelEn: 'Brows', availableCount: 14,
    tests: tests(
      ['brow-shape', 'รูปทรงคิ้ว', 'Brow shape'],
      ['brow-fullness', 'ความหนาและความแน่น', 'Thickness and fullness'],
      ['brow-position', 'ตำแหน่งคิ้ว', 'Brow position'],
      ['brow-symmetry', 'ความสมมาตรของคิ้ว', 'Brow symmetry'],
      ['brow-tilt', 'องศาหางคิ้ว', 'Brow tilt'],
    ),
    sliders: [
      ['browArch', 'ความโก่งของคิ้ว', 'Brow arch'],
      ['browThickness', 'ความหนาของคิ้ว', 'Brow thickness'],
      ['browTailLift', 'ระดับยกหางคิ้ว', 'Brow tail lift'],
    ],
    presets: [
      preset('brow-straight', 'คิ้วตรงละมุน', 'Soft straight', { browArch: 18, browThickness: 42, browTailLift: 16 }, 'self-care'),
      preset('brow-natural', 'โค้งธรรมชาติ', 'Natural arch', { browArch: 42, browThickness: 48, browTailLift: 32 }, 'self-care'),
      preset('brow-defined', 'โก่งคมชัด', 'Defined arch', { browArch: 72, browThickness: 58, browTailLift: 50 }, 'self-care'),
      preset('brow-lifted', 'ยกหางคิ้ว', 'Lifted tail', { browArch: 52, browThickness: 44, browTailLift: 78 }, 'self-care'),
      preset('brow-full', 'คิ้วฟูเต็ม', 'Full brow', { browArch: 35, browThickness: 82, browTailLift: 30 }, 'self-care'),
    ],
  },
  {
    id: 'eyes', icon: '◉', label: 'ดวงตา', labelEn: 'Eyes', availableCount: 26,
    tests: tests(
      ['eye-shape', 'รูปทรงดวงตา', 'Eye shape'],
      ['canthal-tilt', 'องศาหางตา', 'Canthal tilt'],
      ['eyelid-exposure', 'พื้นที่เปลือกตา', 'Eyelid exposure'],
      ['eye-spacing', 'ระยะห่างดวงตา', 'Eye spacing'],
      ['undereye', 'สภาพใต้ตา', 'Under-eye condition'],
    ),
    sliders: [
      ['canthalTiltLift', 'ระดับยกหางตา', 'Outer-corner lift'],
      ['underEyeFiller', 'ความเรียบใต้ตา', 'Under-eye support'],
      ['eyelidDepth', 'ความชัดชั้นตา', 'Eyelid definition'],
    ],
    presets: [
      preset('eye-almond', 'อัลมอนด์สมดุล', 'Balanced almond', { canthalTiltLift: 38, eyelidDepth: 45 }),
      preset('eye-round', 'กลมละมุน', 'Soft round', { canthalTiltLift: 8, eyelidDepth: 26, underEyeFiller: 28 }),
      preset('eye-lifted', 'ยกหางตา', 'Lifted outer corner', { canthalTiltLift: 76, eyelidDepth: 42 }),
      preset('eye-defined', 'ชั้นตาคมชัด', 'Defined crease', { eyelidDepth: 78, canthalTiltLift: 32 }, 'surgery'),
      preset('eye-refreshed', 'ใต้ตาสดใส', 'Refreshed under-eye', { underEyeFiller: 72, eyelidDepth: 32 }),
    ],
  },
  {
    id: 'nose', icon: '△', label: 'จมูก', labelEn: 'Nose', availableCount: 17,
    tests: tests(
      ['nose-shape', 'รูปทรงจมูก', 'Nose shape'],
      ['nose-width', 'ความกว้างจมูก', 'Nose width'],
      ['tip-projection', 'ระยะยื่นปลายจมูก', 'Tip projection'],
      ['bridge', 'ความสูงและแนวสัน', 'Bridge height and shape'],
      ['tip-definition', 'องศาและความชัดปลาย', 'Tip rotation and definition'],
    ),
    sliders: [
      ['noseBridgeHeight', 'ความสูงสันจมูก', 'Bridge height'],
      ['noseTipDrop', 'ความยาวปลายจมูก', 'Tip projection'],
      ['noseWingSlim', 'ความเรียวปีกจมูก', 'Alar width'],
    ],
    presets: [
      preset('nose-natural', 'ตรงธรรมชาติ', 'Natural straight', { noseBridgeHeight: 34, noseTipDrop: 28, noseWingSlim: 22 }),
      preset('nose-slope', 'สโลปละมุน', 'Soft slope', { noseBridgeHeight: 48, noseTipDrop: 44, noseWingSlim: 25 }),
      preset('nose-defined', 'สันคมชัด', 'Defined bridge', { noseBridgeHeight: 78, noseTipDrop: 38, noseWingSlim: 34 }, 'surgery'),
      preset('nose-tip', 'ปลายเรียว', 'Refined tip', { noseBridgeHeight: 34, noseTipDrop: 72, noseWingSlim: 48 }),
      preset('nose-narrow', 'ฐานเรียว', 'Narrow base', { noseBridgeHeight: 40, noseTipDrop: 35, noseWingSlim: 82 }, 'surgery'),
      preset('nose-upturn', 'ปลายเชิดเล็กน้อย', 'Gentle upturn', { noseBridgeHeight: 46, noseTipDrop: 16, noseWingSlim: 40 }),
    ],
  },
  {
    id: 'lips', icon: '♡', label: 'ริมฝีปาก', labelEn: 'Lips', availableCount: 16,
    tests: tests(
      ['lip-shape', 'รูปทรงริมฝีปาก', 'Lip shape'],
      ['lip-fullness', 'ความอิ่มของริมฝีปาก', 'Lip fullness'],
      ['lip-ratio', 'สัดส่วนปากบนต่อล่าง', 'Upper-to-lower ratio'],
      ['cupid-bow', 'ความชัดปากกระจับ', 'Cupid’s bow definition'],
      ['corner-tilt', 'องศามุมปาก', 'Oral commissure tilt'],
    ),
    sliders: [
      ['lipVolume', 'ความอิ่มริมฝีปาก', 'Lip fullness'],
      ['lipCornerLift', 'ระดับยกมุมปาก', 'Corner lift'],
      ['cupidBowSharpness', 'ความชัดปากกระจับ', 'Cupid’s bow'],
    ],
    presets: [
      preset('lip-balanced', 'สมดุลธรรมชาติ', 'Natural balance', { lipVolume: 32, lipCornerLift: 24, cupidBowSharpness: 34 }),
      preset('lip-full', 'อิ่มละมุน', 'Soft full', { lipVolume: 74, lipCornerLift: 28, cupidBowSharpness: 38 }),
      preset('lip-cupid', 'กระจับชัด', 'Defined cupid', { lipVolume: 45, cupidBowSharpness: 82 }),
      preset('lip-lifted', 'มุมปากยก', 'Lifted corners', { lipVolume: 38, lipCornerLift: 78, cupidBowSharpness: 42 }),
      preset('lip-slim', 'เรียวคม', 'Refined slim', { lipVolume: 15, lipCornerLift: 35, cupidBowSharpness: 58 }, 'surgery'),
    ],
  },
  {
    id: 'cheeks', icon: '●', label: 'แก้ม', labelEn: 'Cheeks', availableCount: 13,
    tests: tests(
      ['cheek-projection', 'ความนูนของโหนกแก้ม', 'Cheek projection'],
      ['cheek-position', 'ตำแหน่งโหนกแก้ม', 'Cheek position'],
      ['cheek-definition', 'ความชัดของแก้ม', 'Cheek definition'],
      ['cheek-symmetry', 'ความสมมาตรของแก้ม', 'Cheek symmetry'],
      ['cheek-jaw', 'สมดุลแก้มต่อกราม', 'Cheek-to-jaw balance'],
    ),
    sliders: [
      ['cheekFiller', 'วอลลุ่มแก้ม', 'Cheek volume'],
      ['nasolabialLift', 'ระดับยกกลางหน้า', 'Midface lift'],
      ['cheekboneReduction', 'ลดความเด่นโหนกแก้ม', 'Cheekbone softening'],
    ],
    presets: [
      preset('cheek-natural', 'ธรรมชาติ', 'Natural', { cheekFiller: 25, nasolabialLift: 20, cheekboneReduction: 12 }),
      preset('cheek-high', 'โหนกแก้มสูง', 'High cheek', { cheekFiller: 52, nasolabialLift: 46, cheekboneReduction: 0 }),
      preset('cheek-volume', 'กลางหน้าอิ่ม', 'Midface support', { cheekFiller: 76, nasolabialLift: 54, cheekboneReduction: 10 }),
      preset('cheek-soft', 'โหนกแก้มนุ่ม', 'Soft contour', { cheekFiller: 35, nasolabialLift: 30, cheekboneReduction: 72 }, 'surgery'),
      preset('cheek-lifted', 'แก้มยกกระชับ', 'Lifted cheek', { cheekFiller: 45, nasolabialLift: 80, cheekboneReduction: 18 }),
    ],
  },
  {
    id: 'jaw', icon: '◇', label: 'ขากรรไกร', labelEn: 'Jaw', availableCount: 11,
    tests: tests(
      ['jaw-width', 'ความกว้างกราม', 'Jaw width'],
      ['jaw-angle', 'มุมขากรรไกร', 'Jaw angle'],
      ['jaw-contour', 'ความชัดแนวกราม', 'Jaw contour'],
      ['jaw-symmetry', 'ความสมมาตรขากรรไกร', 'Jaw symmetry'],
      ['jaw-neck', 'รอยต่อกรามกับคอ', 'Jaw-to-neck transition'],
    ),
    sliders: [
      ['jawBotox', 'ความเรียวกราม', 'Jaw slimming'],
      ['jawDefinition', 'ความคมกรอบหน้า', 'Jaw definition'],
      ['hifuLifting', 'ระดับยกกรอบหน้า', 'Lower-face lift'],
    ],
    presets: [
      preset('jaw-soft', 'กรอบหน้านุ่ม', 'Soft contour', { jawBotox: 28, jawDefinition: 24, hifuLifting: 22 }),
      preset('jaw-vline', 'วีไลน์', 'V-line', { jawBotox: 78, jawDefinition: 52, hifuLifting: 48 }),
      preset('jaw-straight', 'ตรงสมดุล', 'Balanced straight', { jawBotox: 34, jawDefinition: 58, hifuLifting: 30 }),
      preset('jaw-square', 'เหลี่ยมคม', 'Defined square', { jawBotox: 0, jawDefinition: 84, hifuLifting: 35 }, 'surgery'),
      preset('jaw-slim', 'กรามเรียว', 'Slim jaw', { jawBotox: 88, jawDefinition: 36, hifuLifting: 56 }),
    ],
  },
  {
    id: 'chin', icon: '▽', label: 'คาง', labelEn: 'Chin', availableCount: 8,
    tests: tests(
      ['chin-projection', 'ระยะยื่นคาง', 'Chin projection'],
      ['chin-height', 'ความสูงคาง', 'Chin height'],
      ['chin-width', 'ความกว้างคาง', 'Chin width'],
      ['chin-symmetry', 'ความสมมาตรคาง', 'Chin symmetry'],
      ['mentolabial', 'ความสัมพันธ์ปากล่างกับคาง', 'Mentolabial relationship'],
    ),
    sliders: [
      ['chinLength', 'ความยาวคาง', 'Chin length'],
      ['chinProjection', 'ระยะยื่นคาง', 'Chin projection'],
      ['chinTaper', 'ความเรียวปลายคาง', 'Chin taper'],
    ],
    presets: [
      preset('chin-balanced', 'สมดุล', 'Balanced', { chinLength: 34, chinProjection: 36, chinTaper: 30 }),
      preset('chin-project', 'คางมีมิติ', 'Projected', { chinLength: 38, chinProjection: 78, chinTaper: 36 }),
      preset('chin-long', 'คางยาว', 'Elongated', { chinLength: 80, chinProjection: 52, chinTaper: 48 }, 'surgery'),
      preset('chin-soft', 'สั้นละมุน', 'Soft short', { chinLength: 15, chinProjection: 24, chinTaper: 18 }),
      preset('chin-taper', 'ปลายเรียว', 'Tapered', { chinLength: 55, chinProjection: 44, chinTaper: 82 }),
    ],
  },
  {
    id: 'smile', icon: '⌣', label: 'รอยยิ้ม', labelEn: 'Smile', availableCount: 13,
    tests: tests(
      ['smile-width', 'ความกว้างรอยยิ้ม', 'Smile width'],
      ['tooth-display', 'การเห็นฟัน', 'Tooth display'],
      ['smile-arc', 'แนวโค้งรอยยิ้ม', 'Smile arc'],
      ['smile-tilt', 'องศามุมปาก', 'Corner tilt'],
      ['gingival-display', 'การเห็นแนวเหงือก', 'Gingival display'],
    ),
    sliders: [
      ['smileWidth', 'ความกว้างรอยยิ้ม', 'Smile width'],
      ['smileLift', 'ระดับยกมุมปาก', 'Smile lift'],
      ['smileArc', 'ความโค้งรอยยิ้ม', 'Smile arc'],
    ],
    presets: [
      preset('smile-natural', 'ยิ้มธรรมชาติ', 'Natural smile', { smileWidth: 32, smileLift: 30, smileArc: 32 }, 'self-care'),
      preset('smile-soft', 'ยิ้มละมุน', 'Gentle lift', { smileWidth: 42, smileLift: 58, smileArc: 45 }, 'self-care'),
      preset('smile-wide', 'ยิ้มกว้าง', 'Wide smile', { smileWidth: 82, smileLift: 62, smileArc: 52 }, 'self-care'),
      preset('smile-youthful', 'โค้งสดใส', 'Youthful arc', { smileWidth: 58, smileLift: 74, smileArc: 82 }, 'self-care'),
    ],
  },
  {
    id: 'neck', icon: '│', label: 'คอ', labelEn: 'Neck', availableCount: 11,
    tests: tests(
      ['neck-length', 'ความยาวคอ', 'Neck length'],
      ['neck-width', 'ความกว้างคอ', 'Neck width'],
      ['neck-posture', 'แนวท่าทางคอ', 'Neck posture'],
      ['jaw-neck-angle', 'มุมกรามต่อคอ', 'Jaw-to-neck angle'],
      ['neck-skin', 'พื้นผิวและสีผิวคอ', 'Neck texture and tone'],
    ),
    sliders: [], presets: [],
  },
  {
    id: 'ears', icon: '◖', label: 'หู', labelEn: 'Ears', availableCount: 12,
    tests: tests(
      ['ear-protrusion', 'ระดับกางของใบหู', 'Ear protrusion'],
      ['ear-position', 'ตำแหน่งใบหู', 'Ear position'],
      ['ear-size', 'ขนาดใบหู', 'Ear size'],
      ['ear-symmetry', 'ความสมมาตรของหู', 'Ear symmetry'],
      ['ear-shape', 'รูปทรงติ่งและขอบหู', 'Lobe and helix shape'],
    ),
    sliders: [], presets: [],
  },
  {
    id: 'skin', icon: '✨', label: 'ผิว', labelEn: 'Skin', availableCount: 20,
    tests: tests(
      ['skin-evenness', 'ความสม่ำเสมอของสีผิว', 'Tone evenness'],
      ['acne-scars', 'สิวและรอยสิว', 'Acne and scarring'],
      ['pigmentation', 'เม็ดสีและรอยแดง', 'Pigmentation and redness'],
      ['pores-texture', 'รูขุมขนและพื้นผิว', 'Pores and texture'],
      ['lines-oil', 'ริ้วรอยและความมัน', 'Lines and oiliness'],
    ),
    sliders: [], presets: [],
  },
];

const extraAdjustmentKeys = ['skinSmoothness', 'glassSkinGlow'];
export const ZERO_ADJUSTMENTS = Object.fromEntries([
  ...STUDIO_CATEGORIES.flatMap(({ sliders }) => sliders.map(([key]) => [key, 0])),
  ...extraAdjustmentKeys.map((key) => [key, 0]),
]);

export const STUDIO_SOURCES = [
  {
    id: 'anthropometry',
    categories: ['general', 'faceShape', 'eyes', 'nose', 'lips', 'cheeks', 'jaw', 'chin'],
    title: 'Facial Anthropometric Measurements and Principles',
    url: 'https://pubmed.ncbi.nlm.nih.gov/37487528/',
  },
  {
    id: 'diversity',
    categories: ['general', 'faceShape'],
    title: 'Cultural and Ethnic Perceptions of Facial Aesthetics',
    url: 'https://pubmed.ncbi.nlm.nih.gov/37313510/',
  },
  {
    id: 'fillers',
    categories: ['eyes', 'nose', 'lips', 'cheeks', 'jaw', 'chin'],
    title: 'Dermal Fillers Risks and Safety — ASPS',
    url: 'https://www.plasticsurgery.org/cosmetic-procedures/dermal-fillers/safety',
  },
  {
    id: 'skin-care',
    categories: ['skin'],
    title: 'Acne skin-care guidance — AAD',
    url: 'https://www.aad.org/public/diseases/acne/skin-care/tips',
  },
];

const candidates = [
  { id: 'skin-foundation', categoryId: 'skin', gap: 0.82, impact: 0.78, safety: 0.98, level: 'self-care', budget: 'low', downtime: 'none', th: 'วางพื้นฐานดูแลผิวก่อน', en: 'Start with the skin foundation', whyTh: 'ผิวที่สม่ำเสมอช่วยให้ภาพรวมดูสดใสโดยไม่เปลี่ยนโครงหน้า', whyEn: 'More even-looking skin improves the overall impression without changing facial structure.' },
  { id: 'brow-balance', categoryId: 'brows', gap: 0.66, impact: 0.72, safety: 0.97, level: 'self-care', budget: 'low', downtime: 'none', th: 'จัดสมดุลคิ้ว', en: 'Balance the brows', whyTh: 'คิ้วช่วยกำหนดกรอบดวงตาและทดลองได้ง่ายก่อนหัตถการ', whyEn: 'Brows frame the eyes and are easy to test before considering procedures.' },
  { id: 'nose-balance', categoryId: 'nose', gap: 0.78, impact: 0.9, safety: 0.52, level: 'surgery', budget: 'high', downtime: 'long', th: 'ทดลองสัดส่วนจมูก', en: 'Explore nose proportions', whyTh: 'จมูกอยู่กึ่งกลางใบหน้า จึงมีผลต่อสมดุลกับปากและคาง', whyEn: 'The nose sits at the facial center and affects balance with the lips and chin.' },
  { id: 'jaw-balance', categoryId: 'jaw', gap: 0.72, impact: 0.84, safety: 0.68, level: 'non-invasive', budget: 'medium', downtime: 'short', th: 'ปรับสมดุลกรอบหน้า', en: 'Balance the jawline', whyTh: 'กรอบหน้ามีผลต่อทรงหน้าโดยรวมและควรดูร่วมกับแก้มและคาง', whyEn: 'The jawline shapes the overall outline and should be reviewed with the cheeks and chin.' },
  { id: 'eye-refresh', categoryId: 'eyes', gap: 0.62, impact: 0.75, safety: 0.72, level: 'non-invasive', budget: 'medium', downtime: 'short', th: 'เพิ่มความสดใสรอบดวงตา', en: 'Refresh the eye area', whyTh: 'บริเวณดวงตามีผลต่อภาพแรกพบ แต่ควรเริ่มจากตัวเลือกที่เปลี่ยนน้อย', whyEn: 'The eye area affects first impressions, but subtle options should come first.' },
  { id: 'smile-first', categoryId: 'smile', gap: 0.58, impact: 0.7, safety: 0.96, level: 'self-care', budget: 'low', downtime: 'none', th: 'ทดลองสมดุลรอยยิ้ม', en: 'Explore smile balance', whyTh: 'การปรับมุมปากและการแสดงสีหน้าทดลองได้โดยไม่ต้องทำหัตถการ', whyEn: 'Corner position and expression can be explored without a procedure.' },
];

const ranks = {
  budget: { low: 0, medium: 1, high: 2 },
  downtime: { none: 0, short: 1, long: 2 },
};

export function applyStudioPreset(adjustments, category, values) {
  const allowed = category.composite
    ? new Set(Object.keys(values))
    : new Set(category.sliders.map(([key]) => key));
  return {
    ...adjustments,
    ...Object.fromEntries(Object.entries(values).filter(([key]) => allowed.has(key))),
  };
}

export function resetStudioCategory(adjustments, category) {
  const keys = category.composite
    ? [...new Set(category.presets.flatMap(([, , values]) => Object.keys(values)))]
    : category.sliders.map(([key]) => key);
  return { ...adjustments, ...Object.fromEntries(keys.map((key) => [key, 0])) };
}

export function lockStudioPreset(session, category, selectedPreset) {
  const lockedPresets = { ...session.lockedPresets, [category.id]: selectedPreset[0] };
  const profilePresetOrigins = { ...session.profilePresetOrigins };
  let compositeOrigin = session.compositeOrigin;
  if (['nose', 'jaw', 'chin'].includes(category.id)) {
    profilePresetOrigins[category.id] = selectedPreset[0];
  }
  if (category.composite) {
    Object.assign(lockedPresets, { cheeks: 'faceShape', jaw: 'faceShape', chin: 'faceShape' });
    delete profilePresetOrigins.jaw;
    delete profilePresetOrigins.chin;
    compositeOrigin = { base: selectedPreset[0], overrides: [] };
  } else if (compositeOrigin && ['cheeks', 'jaw', 'chin'].includes(category.id)) {
    compositeOrigin = { ...compositeOrigin, overrides: [...new Set([...compositeOrigin.overrides, category.id])] };
  }
  return {
    adjustments: applyStudioPreset(session.adjustments, category, selectedPreset[2]),
    lockedPresets,
    profilePresetOrigins,
    compositeOrigin,
  };
}

export function setStudioAdjustment(session, category, key, value) {
  const lockedPresets = {
    ...session.lockedPresets,
    [category.id]: session.lockedPresets[category.id] || 'custom',
  };
  let compositeOrigin = session.compositeOrigin;
  if (compositeOrigin && ['cheeks', 'jaw', 'chin'].includes(category.id)) {
    lockedPresets[category.id] = 'custom';
    compositeOrigin = { ...compositeOrigin, overrides: [...new Set([...compositeOrigin.overrides, category.id])] };
  }
  return {
    adjustments: { ...session.adjustments, [key]: Number(value) },
    lockedPresets,
    profilePresetOrigins: session.profilePresetOrigins,
    compositeOrigin,
  };
}

const sheetSnaps = ['peek', 'half', 'full'];

export function nextSheetSnap(current) {
  return sheetSnaps[(sheetSnaps.indexOf(current) + 1) % sheetSnaps.length];
}

export function snapSheetAfterDrag(current, deltaY, viewportHeight) {
  if (Math.abs(deltaY) < 40) return current;
  const direction = deltaY < 0 ? 1 : -1;
  const steps = Math.max(1, Math.round(Math.abs(deltaY) / (viewportHeight * 0.22)));
  const nextIndex = Math.max(0, Math.min(sheetSnaps.length - 1, sheetSnaps.indexOf(current) + direction * steps));
  return sheetSnaps[nextIndex];
}

export function getMobileCategoryIds(activeId, recommendations, lockedPresets, limit = 5, angle = 'front') {
  const ids = [
    activeId,
    ...(angle === 'front' ? [] : ['nose', 'chin', 'jaw', 'neck']),
    ...recommendations.map(({ categoryId }) => categoryId),
    ...Object.keys(lockedPresets),
  ];
  return [...new Set(ids)].filter((id) => STUDIO_CATEGORIES.some((category) => category.id === id)).slice(0, limit);
}

export function orderRecommendationsForAngle(recommendations, angle = 'front') {
  if (angle === 'front') return recommendations;
  const profilePriority = ['nose', 'chin', 'jaw', 'neck'];
  return recommendations
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aRank = profilePriority.indexOf(a.item.categoryId);
      const bRank = profilePriority.indexOf(b.item.categoryId);
      return (aRank < 0 ? profilePriority.length : aRank)
        - (bRank < 0 ? profilePriority.length : bRank)
        || a.index - b.index;
    })
    .map(({ item }) => item);
}

export function getProfilePresetBlend(categoryId, adjustments, presetId) {
  const category = STUDIO_CATEGORIES.find(({ id }) => id === categoryId);
  const presetValues = category?.presets.find(([id]) => id === presetId)?.[2];
  if (!presetValues) return 0;
  const ratios = category.sliders
    .map(([key]) => presetValues[key] ? (adjustments[key] || 0) / presetValues[key] : 0);
  return Math.max(0, Math.min(1, ratios.reduce((total, value) => total + value, 0) / ratios.length));
}

export function buildDemoAnalysis(goal = 'natural') {
  const statuses = goal === 'defined'
    ? ['balanced', 'strong', 'balanced', 'develop']
    : ['balanced', 'balanced', 'strong', 'develop'];
  return Object.fromEntries(STUDIO_CATEGORIES.map((category, categoryIndex) => [
    category.id,
    category.tests.map((test, testIndex) => ({
      ...test,
      status: statuses[(categoryIndex + testIndex) % statuses.length],
      confidence: testIndex % 3 === 0 ? 'medium' : 'high',
    })),
  ]));
}

export function rankStudioRecommendations(intake) {
  const isMinor = intake.age === 'under18';
  return candidates
    .filter((item) => !isMinor || item.level === 'self-care')
    .filter((item) => intake.treatment === 'all' || item.level === 'self-care' || item.level === intake.treatment)
    .filter((item) => ranks.budget[item.budget] <= ranks.budget[intake.budget])
    .filter((item) => ranks.downtime[item.downtime] <= ranks.downtime[intake.downtime])
    .map((item) => {
      const goalBoost = intake.goal === 'defined' && ['nose', 'jaw'].includes(item.categoryId) ? 0.08 : 0;
      const feasibility = 1 - (ranks.budget[item.budget] + ranks.downtime[item.downtime]) / 4;
      return { ...item, score: item.gap * 0.4 + (item.impact + goalBoost) * 0.3 + feasibility * 0.2 + item.safety * 0.1 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function createStudioSession() {
  return {
    phase: 'intake',
    intake: { age: '25-34', demographic: 'thai-female', goal: 'natural', budget: 'medium', downtime: 'short', treatment: 'all' },
    model: null,
    scanStep: 0,
    analysis: {},
    lockedPresets: {},
    profilePresetOrigins: {},
    adjustments: { ...ZERO_ADJUSTMENTS },
    compositeOrigin: null,
    recommendations: [],
  };
}

export function startOnboardingScan(session, { age, gender, background }, models) {
  return {
    ...session,
    phase: 'scan',
    scanStep: 0,
    model: models.find((item) => item.gender === gender) || models[0],
    analysis: {},
    recommendations: [],
    intake: {
      ...session.intake,
      age,
      demographic: `${background}-${gender}`,
    },
  };
}
