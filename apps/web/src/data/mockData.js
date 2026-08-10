// Mock data aligned with DooDee (ดูดี) AI Pre-Consultation Platform Architecture

export const PRESET_MODELS = [
  {
    id: 'asian-female-1',
    name: 'สกาย (Asian Female - Golden Ratio)',
    gender: 'female',
    avatar: '/upgrade-assets/doodee-supplied-female-before.png',
    overallScore: 7.6,
    tier: 'S-Tier (Golden Harmony)',
    qualityGate: {
      lighting: 98,
      blur: 'Low (Clean)',
      pose: 'Centered (0.4°)',
      faceSize: 'Optimal (68%)',
      eyeOpenness: 'Clear'
    },
    metrics: [
      {
        category: 'Facial Harmony (ความได้สัดส่วน)',
        score: 7.2,
        metrics: [
          { name: 'Upper/Middle/Lower Ratio (สัดส่วน 3 ส่วน)', value: '1 : 1.02 : 0.98', status: 'Optimal', score: 7.2 },
          { name: 'Rule of Fifths Width (สัดส่วนแนวขวาง 5 ส่วน)', value: '0.99', status: 'High Symmetry', score: 7.3 },
        ]
      },
      {
        category: 'Angularity & Jawline (โครงหน้าและกรอบหน้า)',
        score: 7.6,
        metrics: [
          { name: 'Jaw Angle (มุมกราม)', value: '124.5°', status: 'Soft & Defined', score: 7.6 },
          { name: 'Cheekbone Prominence', value: '86%', status: 'Elevated', score: 7.5 }
        ]
      },
      {
        category: 'Eye Area & Brows (ดวงตาและคิ้ว)',
        score: 7.4,
        metrics: [
          { name: 'Canthal Tilt (มุมเอียงของหางตา)', value: '+4.2°', status: 'Positive Tilt', score: 7.4 },
        ]
      },
      {
        category: 'Dimorphism (ความโดดเด่นของอัตลักษณ์)',
        score: 7.7,
        metrics: [
          { name: 'Midface Ratio', value: '0.98', status: 'Feminine Ideal', score: 7.7 }
        ]
      },
      {
        category: 'Facial Features (องค์ประกอบเครื่องหน้า)',
        score: 7.8,
        metrics: [
          { name: 'Nasal Width Index', value: '34.2mm', status: 'Proportional', score: 7.8 }
        ]
      },
      {
        category: 'Symmetry (ความสมมาตร ซ้าย-ขวา)',
        score: 7.8,
        metrics: [
          { name: 'Eye Level Symmetry', value: '99.1%', status: 'Balanced', score: 7.8 }
        ]
      }
    ]
  },
  {
    id: 'asian-male-1',
    name: 'เควิน (Asian Male - Sculpted Jaw)',
    gender: 'male',
    avatar: '/upgrade-assets/doodee-supplied-male-before.png',
    overallScore: 7.6,
    tier: 'A-Tier (High Definition)',
    qualityGate: {
      lighting: 95,
      blur: 'Low',
      pose: 'Centered (0.8°)',
      faceSize: 'Optimal (71%)',
      eyeOpenness: 'Clear'
    },
    metrics: [
      {
        category: 'Facial Harmony (ความได้สัดส่วน)',
        score: 7.2,
        metrics: [
          { name: 'Upper/Middle/Lower Ratio', value: '1 : 1.05 : 1.02', status: 'Masculine Ratio', score: 7.2 }
        ]
      }
    ]
  }
];

const PROFILE_PRESET_IDS = {
  nose: ['nose-natural', 'nose-slope', 'nose-defined', 'nose-tip', 'nose-narrow', 'nose-upturn'],
  jaw: ['jaw-soft', 'jaw-vline', 'jaw-straight', 'jaw-square', 'jaw-slim'],
  chin: ['chin-balanced', 'chin-project', 'chin-long', 'chin-soft', 'chin-taper'],
};

const profilePresets = (gender, angle) => Object.fromEntries(
  Object.entries(PROFILE_PRESET_IDS).map(([category, ids]) => [
    category,
    Object.fromEntries(ids.map((id) => [
      id,
      `/upgrade-assets/profile-${gender}-${angle}-${category}-${id}.webp`,
    ])),
  ]),
);

export const PROFILE_DEMO_ASSETS = {
  female: {
    front: {
      current: '/upgrade-assets/doodee-supplied-female-before.png'
    },
    left: {
      current: '/upgrade-assets/doodee-female-left-before.png',
      simulation: '/upgrade-assets/doodee-female-left-after.png',
      presets: profilePresets('female', 'left'),
      frame: { scale: 1.42, x: '1%', y: '11%' }
    },
    right: {
      current: '/upgrade-assets/doodee-female-right-before.png',
      simulation: '/upgrade-assets/doodee-female-right-after.png',
      presets: profilePresets('female', 'right'),
      frame: { scale: 1.42, x: '-1%', y: '11%' }
    }
  },
  male: {
    front: {
      current: '/upgrade-assets/doodee-supplied-male-before.png'
    },
    left: {
      current: '/upgrade-assets/doodee-male-left-before.png',
      simulation: '/upgrade-assets/doodee-male-left-after.png',
      presets: profilePresets('male', 'left'),
      frame: { scale: 1.3, x: '1%', y: '9%' }
    },
    right: {
      current: '/upgrade-assets/doodee-male-right-before.png',
      simulation: '/upgrade-assets/doodee-male-right-after.png',
      presets: profilePresets('male', 'right'),
      frame: { scale: 1.3, x: '-1%', y: '9%' }
    }
  }
};

// -------------------------------------------------------------
// MODULE 2: SURGERY FLOW DATA
// -------------------------------------------------------------
export const SURGERY_POSITIONS = [
  { id: 'forehead', nameTh: 'หน้าผาก', nameEn: 'Forehead', top: '18%', left: '50%' },
  { id: 'eyes', nameTh: 'ตา', nameEn: 'Eyes', top: '35%', left: '32%' },
  { id: 'nose', nameTh: 'จมูก', nameEn: 'Nose', top: '48%', left: '50%' },
  { id: 'cheeks', nameTh: 'แก้ม', nameEn: 'Cheeks', top: '55%', left: '26%' },
  { id: 'jaw', nameTh: 'กราม', nameEn: 'Jawline', top: '68%', left: '24%' },
  { id: 'chin', nameTh: 'คาง', nameEn: 'Chin', top: '80%', left: '50%' },
  { id: 'lips', nameTh: 'ริมฝีปาก', nameEn: 'Lips', top: '66%', left: '50%' }
];

export const SURGERY_PRESETS = [
  { id: 'korean', nameTh: 'Korean Style (ละมุนสไตล์เกาหลี)', img: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80' },
  { id: 'natural', nameTh: 'Natural Look (ธรรมชาติไม่หลอกตา)', img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80' },
  { id: 'sharp', nameTh: 'Sharp & Sculpted (สายฝอ คมชัด)', img: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=300&q=80' },
  { id: 'cute', nameTh: 'Cute Babyface (หน้าเด็กคาวาอี้)', img: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=300&q=80' }
];

export const SURGERY_RECOMMENDATIONS = {
  procedures: [
    { nameTh: 'เสริมจมูก (Rhinoplasty)', descTh: 'ปรับมิติสโลปปลายหยดน้ำ เพิ่มความละมุนของใบหน้ากลาง' },
    { nameTh: 'เสริมคาง (Chin Filler)', descTh: 'เติมสัดส่วนคางยาวเพิ่ม 2.5mm รับกับแนวปากและจมูก' },
    { nameTh: 'กราม (Jawline Filler / Botox)', descTh: 'ลดขนาดกล้ามเนื้อกราม ปรับรูปทรง V-Shape' }
  ],
  estimatedCost: '30,000 - 80,000 บาท',
  recoveryTime: '3 - 14 วัน'
};

// -------------------------------------------------------------
// MODULE 3: TREATMENT & SKIN FLOW DATA
// -------------------------------------------------------------
export const SKIN_PROBLEMS = [
  {
    id: 'acne',
    nameTh: 'สิว (Acne)',
    color: '#ef4444',
    dotTop: '38%',
    dotLeft: '45%',
    definition: 'การอุดตันของรูขุมขน และการอักเสบของผิวหนัง',
    cause: 'เชื้อแบคทีเรีย C.acnes, ความมันส่วนเกิน, ฮอร์โมน และความเครียด',
    severity: 'ปานกลาง (Moderate Severity)',
    impact: 'ทำให้เกิดรอยสิว หลุมสิว และผิวไม่เรียบเนียน'
  },
  {
    id: 'acne-marks',
    nameTh: 'รอยสิว (Acne Marks)',
    color: '#f97316',
    dotTop: '45%',
    dotLeft: '35%',
    definition: 'รอยดำและรอยแดงหลังการอักเสบของสิว (PIH/PIE)',
    cause: 'การกระตุ้นเม็ดสีเมลานินและหลอดเลือดขยายตัว',
    severity: 'ปานกลาง',
    impact: 'สีผิวไม่สม่ำเสมอ ต้องใช้เวลานานในการจางลง'
  },
  {
    id: 'wrinkles',
    nameTh: 'ริ้วรอย (Wrinkles)',
    color: '#a855f7',
    dotTop: '25%',
    dotLeft: '52%',
    definition: 'เส้นรอยย่นบริเวณหน้าผากและรอบดวงตา',
    cause: 'การแสดงอารมณ์ คอลลาเจนลดลงตามวัย และแสงแดด',
    severity: 'น้อย (Mild)',
    impact: 'ทำให้ใบหน้าดูล้าและมีอายุเกินจริง'
  },
  {
    id: 'dark-circles',
    nameTh: 'ใต้ตาคล้ำ (Dark Circles)',
    color: '#3b82f6',
    dotTop: '36%',
    dotLeft: '62%',
    definition: 'เม็ดสีเข้มและร่องลึกบริเวณใต้ดวงตา',
    cause: 'การนอนหลับไม่เพียงพอ ภูมิแพ้ และเบ้าตาลึกตามโครงสร้าง',
    severity: 'ปานกลาง',
    impact: 'ทำให้หน้าดูอดนอนและโทรม'
  },
  {
    id: 'large-pores',
    nameTh: 'รูขุมขนกว้าง (Large Pores)',
    color: '#06b6d4',
    dotTop: '54%',
    dotLeft: '55%',
    definition: 'รูขุมขนขยายขนาดบริเวณแก้มและ T-Zone',
    cause: 'น้ำมันใต้ผิวผลิตมากเกินไป และผิวขาดความยืดหยุ่น',
    severity: 'ปานกลาง',
    impact: 'แต่งหน้าไม่ติดเรียบเนียน ผิวดูไม่ละเอียด'
  }
];

export const TREATMENT_RECOMMENDATIONS = [
  { nameTh: 'Pico Laser', descTh: 'ลดการอักเสบ ลดรอยสิว เคลียร์เม็ดสี' },
  { nameTh: 'Acne Injection', descTh: 'ฉีดสิวอักเสบ ยุบเร็วทันใจใน 24 ชม.' },
  { nameTh: 'LED Therapy', descTh: 'แสงบำบัดฆ่าเชื้อแบคทีเรีย ลดรอยแดง' },
  { nameTh: 'Skincare Routine', descTh: 'ปรับสมดุลความมัน บำรุงเกราะป้องกันผิว' }
];

export const TREATMENT_PRIORITIES = {
  priority1: [
    'ลดสิวอักเสบ (Acne Treatment)',
    'ลดรอยแดง (Redness Reduction)',
    'ควบคุมความมัน (Sebum Control)'
  ],
  priority2: [
    'ลดรอยสิว / หลุมสิว (Acne Scars)',
    'กระชับรูขุมขน (Pore Minimizing)',
    'ปรับผิวให้สว่างสม่ำเสมอ (Skin Brightening)'
  ],
  estimatedCost: '15,000 - 35,000 บาท'
};

export const SCAN_HISTORY = [
  {
    id: 'scan-001',
    date: '26 ก.ค. 2026',
    modelName: 'สกาย (Asian Female Baseline)',
    score: 7.6,
    tier: 'S-Tier',
    thumb: '/upgrade-assets/doodee-supplied-female-before.png',
    angles: ['Front', 'Left 90°', 'Right 90°'],
    sideProfileScore: 8.1
  },
  {
    id: 'scan-002',
    date: '15 มิ.ย. 2026',
    modelName: 'เควิน (Asian Male Definition)',
    score: 7.6,
    tier: 'A-Tier',
    thumb: '/upgrade-assets/doodee-supplied-female-before.png',
    angles: ['Front', 'Left 90°', 'Right 90°'],
    sideProfileScore: 7.8
  }
];

export const MULTI_ANGLE_SCAN_STEPS = [
  {
    id: 'front',
    labelTh: 'หน้าตรง',
    labelEn: 'Front',
    angle: '0°',
    instructionTh: 'มองตรง ให้ตา จมูก และปากอยู่กลางกรอบ',
    instructionEn: 'Look straight ahead and center your eyes, nose, and mouth.',
    checksTh: ['ใบหน้าอยู่กลางกรอบ', 'มองตรง ไม่เอียงหน้า', 'แสงสว่างสม่ำเสมอ'],
    checksEn: ['Face centered', 'Eyes looking straight', 'Even lighting']
  },
  {
    id: 'left',
    labelTh: 'ด้านซ้าย',
    labelEn: 'Left 90°',
    angle: '90°',
    instructionTh: 'หันซ้าย 90° ให้เห็นปลายจมูก ริมฝีปาก คาง และแนวคอชัดเจน',
    instructionEn: 'Turn left 90° so the nose tip, lips, chin, and neck line are clear.',
    checksTh: ['หันครบ 90°', 'ปลายจมูกและคางชัด', 'คอไม่ก้มหรือเงย'],
    checksEn: ['90° side angle', 'Nose and chin visible', 'Neck not tilted']
  },
  {
    id: 'right',
    labelTh: 'ด้านขวา',
    labelEn: 'Right 90°',
    angle: '90°',
    instructionTh: 'หันขวา 90° รักษาระดับคางและแนวคอให้นิ่ง',
    instructionEn: 'Turn right 90° and keep the chin and neck line steady.',
    checksTh: ['หันครบ 90°', 'ริมฝีปากและคางไม่ถูกบัง', 'ภาพคมชัด'],
    checksEn: ['90° side angle', 'Lips and chin unobstructed', 'Sharp image']
  }
];

export const SIDE_PROFILE_ANALYSIS = {
  balanceScore: 8.1,
  left: {
    labelTh: 'ด้านซ้าย 90°',
    labelEn: 'Left 90°',
    quality: 97,
    metrics: [
      { id: 'nose', labelTh: 'จมูก', labelEn: 'Nose projection', value: 'Good', score: 8.2 },
      { id: 'lip', labelTh: 'ริมฝีปาก', labelEn: 'Lip support', value: 'Balanced', score: 7.9 },
      { id: 'chin', labelTh: 'คาง', labelEn: 'Chin projection', value: '+1.8 mm', score: 8.0 },
      { id: 'jaw', labelTh: 'กราม', labelEn: 'Jaw angle', value: '124°', score: 8.4 },
      { id: 'neck', labelTh: 'คอ', labelEn: 'Neck transition', value: 'Clear', score: 8.1 }
    ]
  },
  right: {
    labelTh: 'ด้านขวา 90°',
    labelEn: 'Right 90°',
    quality: 95,
    metrics: [
      { id: 'nose', labelTh: 'จมูก', labelEn: 'Nose projection', value: 'Good', score: 8.1 },
      { id: 'lip', labelTh: 'ริมฝีปาก', labelEn: 'Lip support', value: 'Balanced', score: 7.8 },
      { id: 'chin', labelTh: 'คาง', labelEn: 'Chin projection', value: '+1.6 mm', score: 7.9 },
      { id: 'jaw', labelTh: 'กราม', labelEn: 'Jaw angle', value: '126°', score: 8.2 },
      { id: 'neck', labelTh: 'คอ', labelEn: 'Neck transition', value: 'Clear', score: 8.0 }
    ]
  },
  qualityByAngle: [
    { id: 'front', labelTh: 'หน้าตรง', labelEn: 'Front', angleAccuracy: '0.4°', clarity: 98, lighting: 98, coverage: 96 },
    { id: 'left', labelTh: 'ด้านซ้าย', labelEn: 'Left 90°', angleAccuracy: '89.2°', clarity: 97, lighting: 96, coverage: 95 },
    { id: 'right', labelTh: 'ด้านขวา', labelEn: 'Right 90°', angleAccuracy: '90.8°', clarity: 95, lighting: 95, coverage: 94 }
  ]
};

// Try-on shades moved to `src/data/makeup.js` when the page stopped drawing CSS blobs and started
// painting real photographs — they are no longer mock data. Hair colour was dropped with them:
// tinting hair needs image segmentation, which the face landmarker does not provide.
