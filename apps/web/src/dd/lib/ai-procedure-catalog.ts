export type ProcedureKey =
  | "rhinoplasty"
  | "jawline_contour"
  | "canthoplasty"
  | "buccal_fat"
  | "chin_augmentation"
  | "brow_lift"
  | "lip_enhancement"
  | "double_eyelid"
  | "skin_smoothing"
  | "facial_thinning"
  | "body_fat_reduction"
  | "jawline_filler"
  | "jaw_reduction"
  | "v_line_surgery"
  | "cheekbone_reduction"
  | "facial_fat_grafting"
  | "double_chin_liposuction"
  | "nose_filler"
  | "alar_reduction"
  | "tip_refinement"
  | "ptosis_correction"
  | "eye_bag_removal"
  | "under_eye_fat_repositioning"
  | "under_eye_rejuvenation"
  | "lip_lift"
  | "skin_booster"
  | "rejuran"
  | "juvelook"
  | "pico_laser"
  | "acne_scar_removal"
  // Phase 133 — non-surgical procedures (botox + fillers). UI groups
  // these under their own categories so users can compare invasive vs
  // non-invasive options for the same concern.
  | "botox_forehead"
  | "botox_glabellar"
  | "botox_crows_feet"
  | "botox_masseter"
  | "filler_lip"
  | "filler_nasolabial"
  | "filler_tear_trough"
  | "filler_chin"
  | "temple_filler"
  | "midface_support_filler"
  | "marionette_line_filler"
  | "gummy_smile_botox"
  | "chin_dimpling_botox"
  | "melasma_pigment_plan"
  | "skin_laxity_tightening"
  | "lower_face_laxity_plan"
  | "hairline_balance_consult"
  | "smile_line_dental_consult"
  | "upper_blepharoplasty_consult"
  | "neck_laxity_consult"
  | "orthodontic_bite_consult"
  | "vascular_redness_derm_consult"
  | "dermatology_referral"
  | "forehead_volume_consult"
  | "thread_lift_consult"
  | "lip_asymmetry_consult"
  | "nasal_asymmetry_consult"
  | "scar_revision_consult"
  | "rf_microneedling_texture_consult"
  | "ultrasound_rf_laxity_consult"
  | "fractional_laser_resurfacing_consult"
  | "subcision_acne_scar_consult"
  | "genioplasty_consult"
  | "hairline_restoration_consult"
  | "smile_design_veneers_consult";

export type ProcedureCategory =
  | "nose"
  | "jaw"
  | "eyes"
  | "lips"
  | "skin"
  | "overall"
  | "botox"
  | "filler";

export type ProcedureKind = "surgical" | "injectable" | "non_invasive";

export interface ProcedureDef {
  key: ProcedureKey;
  label_th: string;
  label_en: string;
  hint_th: string;
  hint_en: string;
  /** Prompt template appended after the universal instruction. */
  category: ProcedureCategory;
  /** Phase 133 — surgical / injectable / non_invasive. UI uses this to
   *  show downtime + invasiveness chips so users see the trade-off. */
  kind: ProcedureKind;
}

export const PROCEDURES: ProcedureDef[] = [
  {
    key: "rhinoplasty",
    label_th: "เสริมจมูก",
    label_en: "Rhinoplasty",
    hint_th: "ลดสันจมูก / แต่งปลายจมูกให้เรียว",
    hint_en: "Refine bridge + tip",
    category: "nose",
    kind: "surgical",
  },
  {
    key: "jawline_contour",
    label_th: "ขากรรไกรคมขึ้น",
    label_en: "Jawline contour",
    hint_th: "เพิ่มความชัดของแนวขากรรไกร",
    hint_en: "Refine lower-face definition",
    category: "jaw",
    kind: "surgical",
  },
  {
    key: "canthoplasty",
    label_th: "ยกหางตา",
    label_en: "Canthal lift",
    hint_th: "ยก outer canthus ขึ้น 2-4° (almond eyes)",
    hint_en: "Lift outer canthi 2-4°",
    category: "eyes",
    kind: "surgical",
  },
  {
    key: "buccal_fat",
    label_th: "ลดไขมันกระพุ้งแก้ม",
    label_en: "Buccal fat reduction",
    hint_th: "ลดความอิ่มของแก้มอย่างระมัดระวัง",
    hint_en: "Reduce cheek fullness conservatively",
    category: "jaw",
    kind: "surgical",
  },
  {
    key: "chin_augmentation",
    label_th: "เสริมคาง",
    label_en: "Chin augmentation",
    hint_th: "เพิ่ม projection ของคางเล็กน้อย",
    hint_en: "Improve chin projection",
    category: "jaw",
    kind: "surgical",
  },
  {
    key: "brow_lift",
    label_th: "ยกคิ้ว",
    label_en: "Brow lift",
    hint_th: "ยกตำแหน่งคิ้ว + เปิดดวงตา",
    hint_en: "Lift brows, open eyes",
    category: "eyes",
    kind: "surgical",
  },
  {
    key: "lip_enhancement",
    label_th: "เสริมริมฝีปาก",
    label_en: "Lip enhancement",
    hint_th: "เพิ่ม volume ริมฝีปากเล็กน้อย",
    hint_en: "Add visible lip volume",
    category: "lips",
    kind: "surgical",
  },
  {
    key: "double_eyelid",
    label_th: "ทำตาสองชั้น",
    label_en: "Double eyelid",
    hint_th: "เพิ่ม crease ของเปลือกตา",
    hint_en: "Add an upper-lid crease",
    category: "eyes",
    kind: "surgical",
  },
  {
    key: "skin_smoothing",
    label_th: "ผิวเรียบเนียน",
    label_en: "Skin retexture",
    hint_th: "ลดรอยสิว/รอยแดง/รูขุมขน",
    hint_en: "Reduce blemishes / pores",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "facial_thinning",
    label_th: "หน้าเรียวขึ้น",
    label_en: "Facial fullness review",
    hint_th: "ลดความเต็มของใบหน้าแบบระมัดระวัง",
    hint_en: "Conservative facial fullness review",
    category: "overall",
    kind: "surgical",
  },
  // ---------- Phase 133 — non-surgical injectables ----------
  {
    key: "botox_forehead",
    label_th: "ลดริ้วรอยหน้าผาก",
    label_en: "Forehead line smoothing",
    hint_th: "ลดริ้วรอยตามแนวนอนของหน้าผาก",
    hint_en: "Soften horizontal forehead lines",
    category: "botox",
    kind: "injectable",
  },
  {
    key: "botox_glabellar",
    label_th: "ลดรอย 11 ระหว่างคิ้ว",
    label_en: "Frown-line smoothing",
    hint_th: "ลดเลือนรอย 11 ระหว่างคิ้ว",
    hint_en: "Soften visible vertical glabellar lines",
    category: "botox",
    kind: "injectable",
  },
  {
    key: "botox_crows_feet",
    label_th: "ลดรอยหางตา",
    label_en: "Crow's-feet smoothing",
    hint_th: "ลดรอยย่นข้างหางตาขณะยิ้ม",
    hint_en: "Smooth lateral eye creases",
    category: "botox",
    kind: "injectable",
  },
  {
    key: "botox_masseter",
    label_th: "โบท็อกซ์กราม",
    label_en: "Masseter Botox",
    hint_th: "ลดความหนาของกล้ามเนื้อกราม ไม่ได้ลดกระดูก",
    hint_en: "Reduce bulky masseter muscle, not jaw bone",
    category: "botox",
    kind: "injectable",
  },
  {
    key: "filler_lip",
    label_th: "ฟิลเลอร์ปาก",
    label_en: "Lip Filler",
    hint_th: "เติมทรงริมฝีปากให้ชัดและสมดุลขึ้น",
    hint_en: "Add balanced shape and volume to the lips",
    category: "filler",
    kind: "injectable",
  },
  {
    key: "filler_nasolabial",
    label_th: "ลดร่องแก้ม",
    label_en: "Nasolabial fold softening",
    hint_th: "ลดความลึกของร่องแก้มจมูก-มุมปาก",
    hint_en: "Soften nasolabial folds",
    category: "filler",
    kind: "injectable",
  },
  {
    key: "filler_tear_trough",
    label_th: "ปรับร่องใต้ตา",
    label_en: "Under-eye hollow correction",
    hint_th: "ลดร่องคล้ำใต้ตา / เปลือกตาล่างเรียบขึ้น",
    hint_en: "Fill under-eye hollows",
    category: "filler",
    kind: "injectable",
  },
  {
    key: "filler_chin",
    label_th: "ฟิลเลอร์คาง",
    label_en: "Chin Filler",
    hint_th: "เพิ่มมิติปลายคางโดยไม่ต้องผ่าตัด",
    hint_en: "Add chin projection without surgery",
    category: "filler",
    kind: "injectable",
  },
  {
    key: "body_fat_reduction",
    label_th: "ลดน้ำหนัก / ลดไขมันส่วนเกิน",
    label_en: "Weight / Fat Reduction",
    hint_th: "ลดไขมันสะสมทั่วร่างกายเพื่อให้กรอบหน้าและใต้คางชัดขึ้นแบบธรรมชาติ",
    hint_en: "Reduce overall body fat so the jawline and under-chin definition improve naturally",
    category: "overall",
    kind: "non_invasive",
  },
  {
    key: "jawline_filler",
    label_th: "ฟิลเลอร์กรอบหน้า",
    label_en: "Jawline Filler",
    hint_th: "เติมกรอบหน้าให้คมขึ้นแบบไม่ผ่าตัด",
    hint_en: "Sharper soft-tissue jaw contour without surgery",
    category: "filler",
    kind: "injectable",
  },
  {
    key: "jaw_reduction",
    label_th: "ผ่าตัดกราม",
    label_en: "Jaw Reduction Surgery",
    hint_th: "ลดความกว้างของกรามและมุมขากรรไกร",
    hint_en: "Reduce jaw width and mandibular angle",
    category: "jaw",
    kind: "surgical",
  },
  {
    key: "v_line_surgery",
    label_th: "ศัลยกรรมวีไลน์",
    label_en: "V-Line Surgery",
    hint_th: "ปรับกรามและคางให้เรียวเป็น V-line",
    hint_en: "Taper jaw and chin into a V-line silhouette",
    category: "jaw",
    kind: "surgical",
  },
  {
    key: "cheekbone_reduction",
    label_th: "ลดโหนกแก้ม",
    label_en: "Cheekbone Reduction",
    hint_th: "ลดความเด่นของโหนกแก้มด้านข้าง",
    hint_en: "Soften prominent lateral cheekbones",
    category: "jaw",
    kind: "surgical",
  },
  {
    key: "facial_fat_grafting",
    label_th: "เติมไขมันหน้า",
    label_en: "Facial Fat Grafting",
    hint_th: "เติมวอลลุ่มใบหน้าให้ดูสดขึ้น",
    hint_en: "Restore soft facial volume",
    category: "overall",
    kind: "surgical",
  },
  {
    key: "double_chin_liposuction",
    label_th: "ดูดไขมันเหนียง",
    label_en: "Double Chin Liposuction",
    hint_th: "ลดไขมันใต้คางให้คอและกรอบหน้าชัดขึ้น",
    hint_en: "Define the neck and submental angle",
    category: "jaw",
    kind: "surgical",
  },
  {
    key: "nose_filler",
    label_th: "ฟิลเลอร์จมูก",
    label_en: "Nose Filler",
    hint_th: "เติมสันจมูก/ปลายจมูกแบบไม่ผ่าตัด",
    hint_en: "Non-surgical bridge and tip refinement",
    category: "filler",
    kind: "injectable",
  },
  {
    key: "alar_reduction",
    label_th: "ตัดปีกจมูก",
    label_en: "Alar Reduction",
    hint_th: "ลดความกว้างของปีกจมูก",
    hint_en: "Reduce alar base width",
    category: "nose",
    kind: "surgical",
  },
  {
    key: "tip_refinement",
    label_th: "ปรับปลายจมูก",
    label_en: "Tip Refinement",
    hint_th: "ปรับปลายจมูกให้เรียวและชัดขึ้น",
    hint_en: "Refine a rounded nasal tip",
    category: "nose",
    kind: "surgical",
  },
  {
    key: "ptosis_correction",
    label_th: "แก้กล้ามเนื้อตาอ่อนแรง",
    label_en: "Ptosis Correction",
    hint_th: "เปิดตาให้ชัดขึ้นเมื่อหนังตาดูตก",
    hint_en: "Open droopy upper eyelids",
    category: "eyes",
    kind: "surgical",
  },
  {
    key: "eye_bag_removal",
    label_th: "ผ่าตัดถุงใต้ตา",
    label_en: "Eye Bag Removal",
    hint_th: "ลดถุงใต้ตาและความบวมใต้ตา",
    hint_en: "Reduce lower-eyelid bags",
    category: "eyes",
    kind: "surgical",
  },
  {
    key: "under_eye_fat_repositioning",
    label_th: "จัดเรียงไขมันใต้ตา",
    label_en: "Under-Eye Fat Repositioning",
    hint_th: "กระจายถุงใต้ตาให้รอยต่อแก้มเรียบขึ้น",
    hint_en: "Smooth the lower lid to cheek transition",
    category: "eyes",
    kind: "surgical",
  },
  {
    key: "under_eye_rejuvenation",
    label_th: "ฟื้นฟูใต้ตา",
    label_en: "Under-Eye Rejuvenation",
    hint_th: "ลดความคล้ำและความล้าใต้ตาแบบไม่ผ่าตัด",
    hint_en: "Refresh tired under-eyes non-surgically",
    category: "eyes",
    kind: "non_invasive",
  },
  {
    key: "lip_lift",
    label_th: "ยกมุมปาก / ยกริมฝีปากบน",
    label_en: "Lip Lift",
    hint_th: "ยกริมฝีปากบนและมุมปากให้ดูสดขึ้น",
    hint_en: "Lift upper lip and mouth corners",
    category: "lips",
    kind: "surgical",
  },
  {
    key: "skin_booster",
    label_th: "สกินบูสเตอร์",
    label_en: "Skin Booster",
    hint_th: "เพิ่มความฉ่ำและความเรียบของผิว",
    hint_en: "Hydrated, smoother skin glow",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "rejuran",
    label_th: "รีจูรัน",
    label_en: "Rejuran",
    hint_th: "ฟื้นฟูผิว ลดรอยแดงและผิวล้า",
    hint_en: "Regenerative skin recovery look",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "juvelook",
    label_th: "จูวีลุค",
    label_en: "Juvelook",
    hint_th: "ผิวเนียนขึ้นพร้อมวอลลุ่มบางจุด",
    hint_en: "Smoother skin with subtle collagen volume",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "pico_laser",
    label_th: "เลเซอร์พิโค",
    label_en: "Pico Laser",
    hint_th: "ลดจุดด่างดำ รอยสิว และสีผิวไม่สม่ำเสมอ",
    hint_en: "Reduce pigmentation and acne marks",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "acne_scar_removal",
    label_th: "รักษาหลุมสิว",
    label_en: "Acne Scar Removal",
    hint_th: "ลดหลุมสิวและพื้นผิวขรุขระ",
    hint_en: "Improve pitted acne scars and uneven texture",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "temple_filler",
    label_th: "ฟิลเลอร์ขมับ",
    label_en: "Temple Filler",
    hint_th: "พยุงขมับตอบให้กรอบหน้าดูนุ่มขึ้น",
    hint_en: "Support hollow temples",
    category: "filler",
    kind: "injectable",
  },
  {
    key: "midface_support_filler",
    label_th: "ฟิลเลอร์พยุงกลางหน้า",
    label_en: "Midface Support Filler",
    hint_th: "พยุงหน้าแก้มและร่องใต้ตาแบบไม่ผ่าตัด",
    hint_en: "Subtle cheek and under-eye support",
    category: "filler",
    kind: "injectable",
  },
  {
    key: "marionette_line_filler",
    label_th: "ฟิลเลอร์ร่องมุมปาก",
    label_en: "Marionette Line Filler",
    hint_th: "ลดเงาร่องมุมปากและช่วงล่างของใบหน้า",
    hint_en: "Soften mouth-corner shadows",
    category: "filler",
    kind: "injectable",
  },
  {
    key: "gummy_smile_botox",
    label_th: "โบท็อกซ์ลดเห็นเหงือก",
    label_en: "Gummy Smile Botox",
    hint_th: "ลดการยกริมฝีปากบนเมื่อยิ้ม หากเห็นชัดในภาพ",
    hint_en: "Reduce upper-lip lift when smiling",
    category: "botox",
    kind: "injectable",
  },
  {
    key: "chin_dimpling_botox",
    label_th: "โบท็อกซ์คางย่น",
    label_en: "Chin Dimpling Botox",
    hint_th: "ลดผิวคางเป็นปุ่มหรือรอยเกร็งของกล้ามเนื้อคาง",
    hint_en: "Soften mentalis dimpling",
    category: "botox",
    kind: "injectable",
  },
  {
    key: "melasma_pigment_plan",
    label_th: "แผนดูแลฝ้าและเม็ดสี",
    label_en: "Melasma / Pigment Plan",
    hint_th: "ลดฝ้า จุดด่างดำ และสีผิวไม่สม่ำเสมอแบบระมัดระวัง",
    hint_en: "Conservative pigment-evening plan",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "skin_laxity_tightening",
    label_th: "ยกกระชับผิวไม่ผ่าตัด",
    label_en: "Non-Surgical Skin Tightening",
    hint_th: "พยุงผิวหย่อนเล็กน้อยโดยไม่เปลี่ยนโครงหน้า",
    hint_en: "Subtle laxity support",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "lower_face_laxity_plan",
    label_th: "แผนพยุงกรอบหน้าล่าง",
    label_en: "Lower-Face Laxity Plan",
    hint_th: "ประเมินแก้มล่าง กรอบหน้า และใต้คางแบบอนุรักษ์นิยม",
    hint_en: "Conservative lower-face support",
    category: "overall",
    kind: "non_invasive",
  },
  {
    key: "hairline_balance_consult",
    label_th: "ปรึกษาสมดุลไรผม",
    label_en: "Hairline Balance Consult",
    hint_th: "ดูสัดส่วนหน้าผากและกรอบไรผมก่อนเลือกแนวทาง",
    hint_en: "Forehead and hairline framing",
    category: "overall",
    kind: "non_invasive",
  },
  {
    key: "smile_line_dental_consult",
    label_th: "ปรึกษาสัดส่วนรอยยิ้ม",
    label_en: "Smile-Line / Dental Consult",
    hint_th: "ดูแนวรอยยิ้ม ฟัน และริมฝีปากเมื่อเห็นชัด",
    hint_en: "Smile-line and dental framing",
    category: "overall",
    kind: "non_invasive",
  },
  {
    key: "upper_blepharoplasty_consult",
    label_th: "ปรึกษาหนังตาบน",
    label_en: "Upper Eyelid Consult",
    hint_th: "ประเมินหนังตาบนหรือชั้นตาที่ดูหนักแบบไม่วินิจฉัย",
    hint_en: "Review upper-eyelid hooding or fold heaviness",
    category: "eyes",
    kind: "surgical",
  },
  {
    key: "neck_laxity_consult",
    label_th: "ปรึกษาความหย่อนใต้คาง / คอ",
    label_en: "Neck / Submental Laxity Consult",
    hint_th: "ประเมินมุมคอ ใต้คาง และผิวหย่อนที่เห็นในภาพ",
    hint_en: "Review visible neck and submental support",
    category: "overall",
    kind: "non_invasive",
  },
  {
    key: "orthodontic_bite_consult",
    label_th: "ปรึกษาการสบฟัน / จัดฟัน",
    label_en: "Orthodontic / Bite Consult",
    hint_th: "ใช้เมื่อรอยยิ้มหรือแนวฟันเห็นชัดและควรถามหมอฟันเพิ่ม",
    hint_en: "Review visible smile alignment before dental assessment",
    category: "overall",
    kind: "non_invasive",
  },
  {
    key: "vascular_redness_derm_consult",
    label_th: "ปรึกษารอยแดง / เส้นเลือดผิว",
    label_en: "Redness / Vascular Skin Consult",
    hint_th: "ประเมินรอยแดงกระจายหรือเส้นเลือดฝอยที่เห็นชัดโดยไม่วินิจฉัย",
    hint_en: "Review visible redness or small vessels without diagnosis",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "dermatology_referral",
    label_th: "ปรึกษาแพทย์ผิวหนัง",
    label_en: "Dermatology Referral",
    hint_th: "ใช้กับไฝ รอยโรค ผื่น หรือผิวที่ควรให้แพทย์ดูก่อนความงาม",
    hint_en: "Flag visible skin findings for clinician review",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "forehead_volume_consult",
    label_th: "ปรึกษาสมดุลหน้าผาก",
    label_en: "Forehead Volume Consult",
    hint_th: "ดูความโค้งหน้าผากและขมับแบบไม่เปลี่ยนโครงหน้า",
    hint_en: "Review forehead and temple contour conservatively",
    category: "filler",
    kind: "injectable",
  },
  {
    key: "thread_lift_consult",
    label_th: "ปรึกษายกกระชับด้วยไหม",
    label_en: "Thread-Lift Consult",
    hint_th: "ทบทวนแก้มล่างและกรอบหน้าแบบไม่ขายผลลัพธ์",
    hint_en: "Review lower-face support without outcome claims",
    category: "overall",
    kind: "surgical",
  },
  {
    key: "lip_asymmetry_consult",
    label_th: "ปรึกษาสมดุลริมฝีปาก",
    label_en: "Lip Balance Consult",
    hint_th: "ดูสัดส่วนริมฝีปากและมุมปากเมื่อเห็นชัด",
    hint_en: "Review visible lip proportion or asymmetry",
    category: "lips",
    kind: "injectable",
  },
  {
    key: "nasal_asymmetry_consult",
    label_th: "ปรึกษาสมดุลแกนจมูก",
    label_en: "Nasal Asymmetry Consult",
    hint_th: "ดูแกนจมูก ปลายจมูก หรือรูจมูกที่ไม่เท่ากันแบบไม่วินิจฉัย",
    hint_en: "Review visible nasal axis or nostril imbalance",
    category: "nose",
    kind: "surgical",
  },
  {
    key: "scar_revision_consult",
    label_th: "ปรึกษารอยแผลเป็น",
    label_en: "Scar Revision Consult",
    hint_th: "ทบทวนรอยแผลเป็นที่เห็นชัดโดยไม่ลบรอยที่ควรให้แพทย์ดู",
    hint_en: "Review visible scars without hiding medical findings",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "rf_microneedling_texture_consult",
    label_th: "ปรึกษา RF microneedling / ผิวไม่เรียบ",
    label_en: "RF Microneedling Texture Consult",
    hint_th: "ทบทวนหลุมสิว รูขุมขน ผิวไม่เรียบ หรือหย่อนเล็กน้อย",
    hint_en: "Review acne-scar texture, pores, roughness, or mild laxity",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "ultrasound_rf_laxity_consult",
    label_th: "ปรึกษา HIFU / RF ยกกระชับ",
    label_en: "Ultrasound / RF Laxity Consult",
    hint_th: "ทบทวนความหย่อนเล็กน้อยของแก้มล่าง ใต้คาง หรือกรอบหน้า",
    hint_en: "Review mild lower-face, submental, or jawline laxity",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "fractional_laser_resurfacing_consult",
    label_th: "ปรึกษาเลเซอร์ปรับผิว",
    label_en: "Fractional Laser Resurfacing Consult",
    hint_th: "ทบทวนพื้นผิว หลุมสิว ริ้วเล็ก หรือผิวไม่เรียบ",
    hint_en: "Review texture, acne-scar edges, fine lines, or uneven surface",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "subcision_acne_scar_consult",
    label_th: "ปรึกษา subcision หลุมสิว",
    label_en: "Subcision Acne-Scar Consult",
    hint_th: "ทบทวนหลุมสิวชนิดเป็นเงาบุ๋มหรือรอยกลิ้ง",
    hint_en: "Review rolling or depressed acne-scar shadows",
    category: "skin",
    kind: "non_invasive",
  },
  {
    key: "genioplasty_consult",
    label_th: "ปรึกษาโครงสร้างคาง",
    label_en: "Genioplasty Consult",
    hint_th: "ทบทวน projection ความยาว หรือจุดกึ่งกลางของคาง",
    hint_en: "Review chin projection, vertical height, or chin-point position",
    category: "jaw",
    kind: "surgical",
  },
  {
    key: "hairline_restoration_consult",
    label_th: "ปรึกษาไรผม / กรอบหน้าผม",
    label_en: "Hairline Restoration Consult",
    hint_th: "ทบทวนไรผม กรอบหน้า และสัดส่วนหน้าผากเมื่อเห็นชัด",
    hint_en: "Review hairline framing and forehead proportion when visible",
    category: "overall",
    kind: "non_invasive",
  },
  {
    key: "smile_design_veneers_consult",
    label_th: "ปรึกษา smile design / วีเนียร์",
    label_en: "Smile Design / Veneers Consult",
    hint_th: "ทบทวนรูปยิ้ม ฟัน เหงือก และริมฝีปากเมื่อเห็นฟันชัด",
    hint_en: "Review smile, teeth, gum line, and lip frame when visible",
    category: "overall",
    kind: "non_invasive",
  },
];

export function findProcedure(key: ProcedureKey): ProcedureDef | undefined {
  return PROCEDURES.find((p) => p.key === key);
}

// ============================================================================
// Phase 611 — Curated core catalog: 5 facial areas + body.
// ============================================================================
//
// The full PROCEDURES list grew to 60+ keys with many near-duplicate
// outcomes (v_line_surgery ≈ jaw_reduction, jawline_contour ≈ jawline
// filler, three overlapping under-eye keys, ...). The user-facing picker
// and the AI recommender now run on this curated subset: one key per
// visibly-distinct outcome, organized by the 5 areas users actually think
// in (nose / eyes / chin+jaw / cheeks / forehead+temples) plus weight
// loss. Legacy keys stay valid for old saved previews and deep links —
// they are just no longer offered or recommended.

export type ProcedureArea =
  | "nose"
  | "eyes"
  | "chin_jaw"
  | "cheeks"
  | "forehead"
  | "body";

export interface ProcedureAreaDef {
  key: ProcedureArea;
  label_th: string;
  label_en: string;
}

export const PROCEDURE_AREAS: ProcedureAreaDef[] = [
  { key: "nose", label_th: "จมูก", label_en: "Nose" },
  { key: "eyes", label_th: "ดวงตา", label_en: "Eyes" },
  { key: "chin_jaw", label_th: "คางและแนวกราม", label_en: "Chin & Jawline" },
  { key: "cheeks", label_th: "แก้มและโหนกแก้ม", label_en: "Cheeks" },
  { key: "forehead", label_th: "หน้าผากและขมับ", label_en: "Forehead & Temples" },
  { key: "body", label_th: "รูปร่าง", label_en: "Body" },
];

export const CORE_PROCEDURES: Record<ProcedureArea, ProcedureKey[]> = {
  nose: ["rhinoplasty", "tip_refinement", "alar_reduction"],
  eyes: [
    "double_eyelid",
    "canthoplasty",
    "eye_bag_removal",
    "filler_tear_trough",
    "botox_crows_feet",
  ],
  chin_jaw: [
    "chin_augmentation",
    "filler_chin",
    "jaw_reduction",
    "botox_masseter",
    "thread_lift_consult",
  ],
  cheeks: [
    "cheekbone_reduction",
    "buccal_fat",
    "filler_nasolabial",
    "midface_support_filler",
  ],
  forehead: ["forehead_volume_consult", "temple_filler", "botox_forehead"],
  body: ["body_fat_reduction"],
};

export function coreProcedureKeys(): ProcedureKey[] {
  return PROCEDURE_AREAS.flatMap((area) => CORE_PROCEDURES[area.key]);
}

export function coreProcedureList(): ProcedureDef[] {
  return coreProcedureKeys()
    .map((key) => findProcedure(key))
    .filter((p): p is ProcedureDef => Boolean(p));
}

export function procedureArea(key: ProcedureKey): ProcedureArea | null {
  for (const area of PROCEDURE_AREAS) {
    if (CORE_PROCEDURES[area.key].includes(key)) return area.key;
  }
  return null;
}

// ============================================================================
// Phase 134 — procedure info (pros/cons/downtime/cost) shown after image gen
// ============================================================================
//
// Curated, real-world cosmetic-medicine information per procedure. Static
// rather than AI-generated so the numbers (downtime, baht price range)
// don't drift between calls. Costs are rough Thai-market 2025 averages —
// the UI labels them "โดยประมาณ" so users know to confirm with a clinic.

export interface ProcedureInfo {
  pros_th: string[];
  pros_en: string[];
  cons_th: string[];
  cons_en: string[];
  /** Recovery window — how long until you'd want to be seen in public. */
  downtime_th: string;
  downtime_en: string;
  /** How long the result lasts (filler/botox wear off; surgery is permanent). */
  duration_th: string;
  duration_en: string;
  /** Approximate cost in THB at mid-tier Bangkok clinics, 2025. */
  cost_thb: string;
  /** Can this be undone? (Filler with hyaluronidase = yes; surgery = no.) */
  reversible: boolean;
  /** Subjective discomfort during + immediately after. */
  pain_level: "low" | "mid" | "high";
}

function compactInfo(args: {
  prosTh: string[];
  prosEn: string[];
  consTh: string[];
  consEn: string[];
  downtimeTh: string;
  downtimeEn: string;
  durationTh: string;
  durationEn: string;
  costThb: string;
  reversible: boolean;
  painLevel: ProcedureInfo["pain_level"];
}): ProcedureInfo {
  return {
    pros_th: args.prosTh,
    pros_en: args.prosEn,
    cons_th: args.consTh,
    cons_en: args.consEn,
    downtime_th: args.downtimeTh,
    downtime_en: args.downtimeEn,
    duration_th: args.durationTh,
    duration_en: args.durationEn,
    cost_thb: args.costThb,
    reversible: args.reversible,
    pain_level: args.painLevel,
  };
}

export const PROCEDURE_INFO: Record<ProcedureKey, ProcedureInfo> = {
  // -------------------- Surgical --------------------
  rhinoplasty: {
    pros_th: [
      "ปรับโครงสร้างจมูกได้มากกว่าแนวทางไม่ผ่าตัด แต่ต้องประเมินโดยแพทย์",
      "ปรับได้ทั้งสันจมูก, ปลายจมูก, ปีกจมูก",
      "เหมาะเป็นหัวข้อปรึกษาเมื่อสัน ปลาย หรือฐานจมูกเป็นประเด็นหลัก",
    ],
    pros_en: [
      "Can address nasal structure beyond non-surgical options when appropriate",
      "Can refine bridge, tip, and alar base in one procedure",
      "Best framed as a specialist consult when bridge, tip, or base is the main concern",
    ],
    cons_th: [
      "ผ่าตัด ใช้ยาดมสลบ — มีความเสี่ยงทั่วไปของการผ่าตัด",
      "บวมเห็นชัด 1-2 สัปดาห์; รูปสุดท้ายเห็นจริงที่ 3-12 เดือน",
      "Revision rate ~5-10% — บางเคสต้องผ่าซ้ำ",
      "แก้กลับยากมาก ถ้าไม่พอใจรูป",
    ],
    cons_en: [
      "Surgery under general anesthesia — carries the usual surgical risks",
      "Visible swelling 1-2 weeks; final shape settles 3-12 months",
      "Revision rate ~5-10% — some cases need a second operation",
      "Very hard to undo if you don't like the result",
    ],
    downtime_th: "พัก 1-2 สัปดาห์ (เฝือก/ผ้าก๊อซ), หลีกเลี่ยงออกกำลังหนัก 4-6 สัปดาห์",
    downtime_en: "1-2 weeks (cast/dressing), avoid heavy exercise 4-6 weeks",
    duration_th: "ถาวร",
    duration_en: "Permanent",
    cost_thb: "60,000 – 200,000 บาท",
    reversible: false,
    pain_level: "mid",
  },
  jawline_contour: {
    pros_th: [
      "ประเมินกรอบขากรรไกรในเคสที่โครงสร้างเป็นตัวกำหนดจริง",
      "เป็นหัวข้อปรึกษาระดับโครงสร้าง ไม่ใช่คำแนะนำให้ผ่าตัดทันที",
    ],
    pros_en: [
      "Reviews jawline structure when bone or deep support is the true driver",
      "A structural consult topic, not advice to proceed with surgery",
    ],
    cons_th: [
      "ผ่าตัดใหญ่ ใช้ยาดมสลบ พักฟื้น 2-4 สัปดาห์",
      "เสี่ยงเส้นประสาทใบหน้าชาชั่วคราว (1-6 เดือน)",
      "ค่าใช้จ่ายสูง — มักทำพร้อมหัตถการอื่น",
      "ถ้าตัดมากเกินแก้มอาจตอบหรือโครงหน้าดูแข็ง",
    ],
    cons_en: [
      "Major surgery, general anesthesia, 2-4 week recovery",
      "Temporary facial-nerve numbness (1-6 months) possible",
      "Expensive, often bundled with other procedures",
      "Aggressive contouring can make the face look hollow or unnatural",
    ],
    downtime_th: "2-4 สัปดาห์ (บวม + ฟกช้ำ)",
    downtime_en: "2-4 weeks (swelling + bruising)",
    duration_th: "ถาวร",
    duration_en: "Permanent",
    cost_thb: "120,000 – 350,000 บาท",
    reversible: false,
    pain_level: "high",
  },
  canthoplasty: {
    pros_th: [
      "ประเมินการพยุงหางตาเฉพาะเคสที่เห็นประเด็นชัด",
      "ควรปรึกษาแพทย์เฉพาะทางรอบดวงตาก่อนตัดสินใจ",
    ],
    pros_en: [
      "Reviews lateral canthal support only when the concern is visible",
      "Requires specialist periorbital assessment before any decision",
    ],
    cons_th: [
      "ผ่าตัดบริเวณรอบดวงตา — เสี่ยงตาแห้ง, asymmetry",
      "Revision rate สูง ~10-15% ถ้าหมอไม่เชี่ยวชาญ",
      "พักฟื้น 1-2 สัปดาห์, เห็นรูปจริง 3-6 เดือน",
      "ถ้ายกมากเกินจะดูไม่ธรรมชาติ",
    ],
    cons_en: [
      "Periorbital surgery — risk of dry eye, asymmetry",
      "Revision rate ~10-15% with non-specialist surgeons",
      "1-2 week downtime; final shape at 3-6 months",
      "Over-lifted result can look unnatural",
    ],
    downtime_th: "1-2 สัปดาห์ (บวม), 1-3 เดือน (ผลสุดท้าย)",
    downtime_en: "1-2 weeks (swelling), 1-3 months (final settle)",
    duration_th: "ถาวร",
    duration_en: "Permanent",
    cost_thb: "40,000 – 120,000 บาท",
    reversible: false,
    pain_level: "mid",
  },
  buccal_fat: {
    pros_th: [
      "ประเมินความอิ่มของแก้มในเคสที่เนื้อแก้มเป็นประเด็นจริง",
      "ควรชั่งน้ำหนักเรื่องแก้มตอบ ความสมดุลของใบหน้า และความย้อนกลับไม่ได้",
    ],
    pros_en: [
      "Reviews cheek fullness only when buccal volume is clearly relevant",
      "Requires caution around aging, hollowness, and irreversibility",
    ],
    cons_th: [
      "อาจทำให้แก้มตอบเกินจริง เพราะแก้มเป็นส่วนพยุงมิติใบหน้า",
      "ถอนคืนไม่ได้ — ถ้าเอาออกมากเกิน จะดูโทรม",
      "เสี่ยงเส้นประสาทใบหน้า, ปากเบี้ยวชั่วคราว",
      "พักฟื้นในปาก 1-2 สัปดาห์ กินเหลวๆ",
    ],
    cons_en: [
      "Can make cheeks look overly hollow because cheek fat supports facial dimension",
      "Not reversible — over-removal leaves you looking gaunt",
      "Risk of facial nerve injury, temporary mouth asymmetry",
      "Intraoral recovery — liquid/soft diet 1-2 weeks",
    ],
    downtime_th: "1-2 สัปดาห์ (ในปาก + บวม), 3 เดือน (เห็นผลจริง)",
    downtime_en: "1-2 weeks (oral + swelling), 3 months (final result)",
    duration_th: "ถาวร",
    duration_en: "Permanent",
    cost_thb: "35,000 – 90,000 บาท",
    reversible: false,
    pain_level: "mid",
  },
  chin_augmentation: {
    pros_th: [
      "ใช้คุยเรื่องคางและ profile เมื่อโครงสร้างคางเป็นประเด็นชัด",
      "ควรเทียบทางเลือกผ่าตัดและไม่ผ่าตัดกับแพทย์ก่อน",
    ],
    pros_en: [
      "Useful for chin/profile discussion when structural support is clearly relevant",
      "Compare surgical and non-surgical options with a specialist first",
    ],
    cons_th: [
      "เสี่ยง implant เคลื่อน, infection (~1-3%)",
      "พักฟื้นบวม 1-2 สัปดาห์",
      "ถ้ายังไม่แน่ใจ ควรเริ่มจากการปรึกษาและจำลองรูปคางก่อน",
    ],
    cons_en: [
      "Risk of implant displacement, infection (~1-3%)",
      "1-2 week swelling recovery",
      "If unsure, start with a specialist consult and chin-shape simulation",
    ],
    downtime_th: "1-2 สัปดาห์",
    downtime_en: "1-2 weeks",
    duration_th: "ถาวร",
    duration_en: "Permanent",
    cost_thb: "30,000 – 80,000 บาท",
    reversible: false,
    pain_level: "mid",
  },
  brow_lift: {
    pros_th: [
      "ช่วยตั้งคำถามเรื่องตำแหน่งคิ้วและหนังตาบนเมื่อเห็นชัด",
      "ควรประเมินร่วมกับรูปตา หน้าผาก และความสมมาตร",
    ],
    pros_en: [
      "Frames brow-position and upper-lid questions when visible",
      "Should be assessed with eyelid, forehead, and symmetry context",
    ],
    cons_th: [
      "ผ่าตัดบริเวณหน้าผาก/หนังศีรษะ — แผลเป็นในเส้นผม",
      "อาจชาบริเวณหน้าผาก 3-6 เดือน",
      "ถ้ายกมากจะดูประหลาดใจตลอดเวลา",
    ],
    cons_en: [
      "Incisions in forehead/scalp — hidden in hairline",
      "Temporary forehead numbness 3-6 months",
      "Over-lifting creates a perpetually surprised look",
    ],
    downtime_th: "2 สัปดาห์ (บวม), 3 เดือน (ผลสุดท้าย)",
    downtime_en: "2 weeks (swelling), 3 months (final result)",
    duration_th: "5-10 ปี",
    duration_en: "5-10 years",
    cost_thb: "60,000 – 150,000 บาท",
    reversible: false,
    pain_level: "mid",
  },
  lip_enhancement: {
    pros_th: [
      "ใช้คุยเรื่องรูปริมฝีปากและ cupid's bow ในเคสที่เหมาะสม",
      "ควรเทียบกับทางเลือกที่ย้อนกลับได้ก่อนหากยังไม่แน่ใจ",
    ],
    pros_en: [
      "Reviews lip shape and cupid's bow in selected cases",
      "Compare with reversible options first when goals are uncertain",
    ],
    cons_th: [
      "ผ่าตัดในปาก/รอบปาก — มีแผลเป็นเล็ก",
      "ถ้าทำมากเกินจะ duck-lip ถอนไม่ได้",
      "บางเคสใช้หัตถการไม่ผ่าตัดก็ให้ผลลัพธ์เพียงพอแล้ว",
    ],
    cons_en: [
      "Incisions in/around lips — small permanent scars",
      "Over-correction creates a duck-lip that's hard to reverse",
      "Some cases can achieve the same goal with non-surgical care",
    ],
    downtime_th: "1 สัปดาห์ (บวม + เย็บ)",
    downtime_en: "1 week (swelling + sutures)",
    duration_th: "ถาวร",
    duration_en: "Permanent",
    cost_thb: "25,000 – 70,000 บาท",
    reversible: false,
    pain_level: "mid",
  },
  double_eyelid: {
    pros_th: [
      "ใช้คุยเรื่องชั้นตาและหนังตาบนโดยยังเคารพรูปตาเดิม",
      "มีหลายเทคนิค ต้องเลือกจากผิวหนัง ไขมัน และรูปตาจริง",
    ],
    pros_en: [
      "Reviews eyelid crease and upper-lid skin while preserving eye identity",
      "Technique depends on skin, fat, and actual eyelid anatomy",
    ],
    cons_th: [
      "asymmetry rate ~5-10% — ตาสองข้างไม่เท่ากัน",
      "พักฟื้น 1-2 สัปดาห์ + เห็นรูปจริง 3-6 เดือน",
      "ถ้าทำชั้นสูงเกินจะดู surprised หรือ Western — ไม่กลมกลืน",
    ],
    cons_en: [
      "Asymmetry rate ~5-10% — eyes may not match exactly",
      "1-2 week downtime; final settle 3-6 months",
      "Over-high crease looks 'surprised' or overly Western",
    ],
    downtime_th: "1-2 สัปดาห์ (incisional), 3-5 วัน (buried suture)",
    downtime_en: "1-2 weeks (incisional), 3-5 days (buried suture)",
    duration_th: "ถาวร (incisional) / 5-10 ปี (buried)",
    duration_en: "Permanent (incisional) / 5-10 years (buried)",
    cost_thb: "25,000 – 70,000 บาท",
    reversible: false,
    pain_level: "low",
  },
  skin_smoothing: {
    pros_th: [
      "ไม่ผ่าตัด — laser / chemical peel / facial",
      "อาจช่วยเรื่องรอยสิว รูขุมขน หรือรอยแดงในเคสที่เหมาะสม",
      "ราคาเข้าถึงได้, ทำเป็นคอร์สได้",
    ],
    pros_en: [
      "Non-surgical — laser / chemical peel / facials",
      "Can support acne marks, pore appearance, or redness in selected cases",
      "Accessible price, can be done as a course",
    ],
    cons_th: [
      "ต้องทำซ้ำ — ผลไม่ถาวร",
      "บางเทคนิคทำให้ผิวลอก แดง 3-7 วัน",
      "ไวต่อแดดมากขึ้น — ต้องครีมกันแดดเข้ม",
    ],
    cons_en: [
      "Needs repeat sessions — results aren't permanent",
      "Some techniques cause peeling/redness for 3-7 days",
      "Increased sun sensitivity — strict SPF required",
    ],
    downtime_th: "0-7 วัน ขึ้นกับเทคนิค",
    downtime_en: "0-7 days depending on technique",
    duration_th: "3-12 เดือน ต่อคอร์ส",
    duration_en: "3-12 months per course",
    cost_thb: "3,000 – 25,000 บาท ต่อครั้ง",
    reversible: true,
    pain_level: "low",
  },
  facial_thinning: {
    pros_th: [
      "ใช้แยกสาเหตุกรอบหน้าล่างจากกระดูก ไขมัน กล้ามเนื้อ และผิว",
      "เหมาะเป็นหัวข้อปรึกษาเมื่อภาพบอกประเด็นชัด ไม่ใช่ทางลัดสำหรับทุกคน",
    ],
    pros_en: [
      "Separates lower-face width causes: bone, fat, muscle, and skin",
      "A consult topic only when the visible anatomy clearly supports it",
    ],
    cons_th: [
      "ผ่าตัดใหญ่ — มักรวม buccal fat + jaw shaving + masseter",
      "พักฟื้น 2-4 สัปดาห์",
      "ควรประเมินทางเลือกที่เสี่ยงต่ำกว่าและย้อนกลับได้ก่อน",
    ],
    cons_en: [
      "Major surgery — often combines buccal fat + jaw shaving + masseter",
      "2-4 week recovery",
      "Lower-risk and more reversible options should be assessed first",
    ],
    downtime_th: "2-4 สัปดาห์",
    downtime_en: "2-4 weeks",
    duration_th: "ถาวร",
    duration_en: "Permanent",
    cost_thb: "150,000 – 400,000 บาท",
    reversible: false,
    pain_level: "high",
  },

  // -------------------- Botox --------------------
  botox_forehead: {
    pros_th: [
      "ไม่ผ่าตัด, ทำเสร็จกลับบ้านได้เลย",
      "เห็นผล 3-7 วัน, ลดริ้วรอยหน้าผากชัด",
      "ใช้เวลาฉีดแค่ 10 นาที",
    ],
    pros_en: [
      "Non-surgical, walk-in / walk-out in 10 minutes",
      "Visible results in 3-7 days",
      "Distinctly smoother forehead lines",
    ],
    cons_th: [
      "ผลอยู่ 3-4 เดือน — ต้องฉีดซ้ำ",
      "ถ้าฉีดมากเกินจะดูแข็ง ขมวดคิ้วไม่ได้",
      "1-3% เจอ ptosis ชั่วคราว (คิ้ว/หนังตาตก) ถ้าโดนกล้ามผิดมัด",
    ],
    cons_en: [
      "Lasts 3-4 months — needs repeat injections",
      "Over-injection looks frozen / unable to express",
      "1-3% temporary ptosis if injected into the wrong muscle",
    ],
    downtime_th: "ไม่ต้องพัก (อาจมีจุดแดงเล็ก ๆ 1-2 ชม.)",
    downtime_en: "None (tiny red spots may last 1-2 hours)",
    duration_th: "3-4 เดือน",
    duration_en: "3-4 months",
    cost_thb: "3,000 – 8,000 บาท",
    reversible: false,
    pain_level: "low",
  },
  botox_glabellar: {
    pros_th: [
      "ช่วยให้รอย 11 ระหว่างคิ้วดูนุ่มลงในเคสที่เหมาะสม",
      "อาจลดการขยับซ้ำของกล้ามเนื้อบริเวณนี้ชั่วคราว",
      "เป็นหัวข้อปรึกษาที่ใช้เวลาพักน้อยเมื่อแพทย์เห็นว่าเหมาะ",
    ],
    pros_en: [
      "Can soften visible '11' lines between the brows in selected cases",
      "May temporarily reduce repeated muscle activity in this area",
      "A low-downtime consult topic when a clinician finds it appropriate",
    ],
    cons_th: [
      "ผลอยู่ 3-4 เดือน",
      "ถ้าฉีดผิดที่จะคิ้วตก (eyebrow ptosis) 4-8 สัปดาห์",
    ],
    cons_en: [
      "Lasts 3-4 months",
      "Wrong placement → eyebrow ptosis for 4-8 weeks",
    ],
    downtime_th: "ไม่ต้องพัก",
    downtime_en: "None",
    duration_th: "3-4 เดือน",
    duration_en: "3-4 months",
    cost_thb: "2,500 – 6,000 บาท",
    reversible: false,
    pain_level: "low",
  },
  botox_crows_feet: {
    pros_th: [
      "หางตาเรียบเนียน เวลายิ้มไม่มีรอยย่นเด่น",
      "ไม่กระทบรูปตา ยังยิ้มได้ปกติ",
    ],
    pros_en: [
      "Smoother lateral eye area when smiling",
      "Eye shape unchanged, expression natural",
    ],
    cons_th: [
      "ผลอยู่ 3-4 เดือน",
      "ถ้าฉีดต่ำเกินจะกระทบกล้ามแก้ม ทำให้ยิ้มเบี้ยว",
    ],
    cons_en: [
      "Lasts 3-4 months",
      "Too-low placement can affect cheek muscles, distort smile",
    ],
    downtime_th: "ไม่ต้องพัก",
    downtime_en: "None",
    duration_th: "3-4 เดือน",
    duration_en: "3-4 months",
    cost_thb: "3,000 – 7,000 บาท",
    reversible: false,
    pain_level: "low",
  },
  botox_masseter: {
    pros_th: [
      "ลดความหนาของกล้ามเนื้อกรามใน 4-8 สัปดาห์",
      "ไม่ผ่าตัด, กลับคืนได้ถ้าไม่ฉีดต่อ",
      "ช่วยลดการกัดฟัน (bruxism) ด้วย",
    ],
    pros_en: [
      "Reduces bulky chewing-muscle fullness within 4-8 weeks",
      "Non-surgical and reversible if you stop",
      "Bonus: reduces teeth-grinding (bruxism)",
    ],
    cons_th: [
      "ต้องฉีดซ้ำทุก 4-6 เดือน",
      "ฉีดแรง ๆ อาจทำให้แก้มตอบหรือใบหน้าดูแข็ง",
      "เคี้ยวอาหารแข็งลำบาก 1-2 สัปดาห์แรก",
    ],
    cons_en: [
      "Needs repeat every 4-6 months",
      "Over-injection can make cheeks look hollow or the face look stiff",
      "Hard foods are difficult to chew for 1-2 weeks",
    ],
    downtime_th: "ไม่ต้องพัก (อาจปวดเมื่อเคี้ยว 1-2 สัปดาห์)",
    downtime_en: "None (mild chewing soreness 1-2 weeks)",
    duration_th: "4-6 เดือน",
    duration_en: "4-6 months",
    cost_thb: "6,000 – 15,000 บาท",
    reversible: false,
    pain_level: "low",
  },

  // -------------------- Filler --------------------
  filler_lip: {
    pros_th: [
      "ปากอวบขึ้นทันที — เห็นผลตอนเดินออกจากคลินิก",
      "ปรับได้ตามต้องการ, ละลายคืนได้",
      "ไม่ผ่าตัด — ใช้สารเติมเต็ม HA ที่คลินิกใช้ทั่วไป",
    ],
    pros_en: [
      "Instantly fuller lips — visible on leaving the clinic",
      "Adjustable; can be dissolved if you don't like it",
      "Non-surgical, uses clinic-standard HA volumizing gel",
    ],
    cons_th: [
      "บวมเห็นชัด 2-5 วัน (ดูเหมือนใหญ่กว่าผลจริง)",
      "ผลอยู่ 6-12 เดือน, ต้องเติม",
      "ถ้าทำเยอะเกินจะ duck-lip — ต้องละลายออกก่อนเริ่มใหม่",
      "เสี่ยง vascular occlusion (rare แต่ร้ายแรง)",
    ],
    cons_en: [
      "Visible swelling 2-5 days (looks bigger than the final result)",
      "Lasts 6-12 months, needs top-ups",
      "Over-injection = duck lip — must dissolve before retrying",
      "Risk of vascular occlusion (rare but serious)",
    ],
    downtime_th: "2-5 วัน (บวม), 1-2 สัปดาห์ (รอยช้ำ)",
    downtime_en: "2-5 days (swelling), up to 2 weeks (any bruising)",
    duration_th: "6-12 เดือน",
    duration_en: "6-12 months",
    cost_thb: "8,000 – 25,000 บาท ต่อ syringe",
    reversible: true,
    pain_level: "low",
  },
  filler_nasolabial: {
    pros_th: [
      "ลดร่องแก้ม-มุมปากเห็นผลทันที — ใบหน้าดูนุ่มและต่อเนื่องขึ้น",
      "ละลายคืนได้ด้วย hyaluronidase",
    ],
    pros_en: [
      "Immediate softening of nasolabial folds — smoother lower-face transition",
      "Reversible via hyaluronidase",
    ],
    cons_th: [
      "ผลอยู่ 9-18 เดือน",
      "ถ้าฉีดมากเกินจะดู puffy mid-face",
      "เสี่ยง vascular occlusion ในเส้นเลือดบริเวณนี้ (rare)",
    ],
    cons_en: [
      "Lasts 9-18 months",
      "Over-injection creates puffy mid-face",
      "Risk of vascular occlusion in this region (rare)",
    ],
    downtime_th: "2-5 วัน (อาจช้ำ)",
    downtime_en: "2-5 days (possible bruising)",
    duration_th: "9-18 เดือน",
    duration_en: "9-18 months",
    cost_thb: "12,000 – 30,000 บาท ต่อ syringe",
    reversible: true,
    pain_level: "low",
  },
  filler_tear_trough: {
    pros_th: [
      "ลดความหมองคล้ำใต้ตาทันที",
      "ละลายคืนได้ด้วย hyaluronidase",
    ],
    pros_en: [
      "May soften under-eye shadows when anatomy is suitable",
      "Reversible via hyaluronidase",
    ],
    cons_th: [
      "บริเวณบาง — เสี่ยงเป็นก้อน (Tyndall effect, ฟ้า ๆ)",
      "ต้องเลือกหมอที่มีประสบการณ์มาก",
      "ถ้าฉีดมากเกินจะดูบวมตลอดเวลา",
      "ผลอยู่ 12-18 เดือน",
    ],
    cons_en: [
      "Thin-skinned area — risk of lumps / Tyndall (blue tint)",
      "Choose a highly experienced injector",
      "Over-injection can look persistently puffy and may be hard to correct",
      "Lasts 12-18 months",
    ],
    downtime_th: "3-7 วัน (อาจช้ำชัด)",
    downtime_en: "3-7 days (bruising can be visible)",
    duration_th: "12-18 เดือน",
    duration_en: "12-18 months",
    cost_thb: "12,000 – 30,000 บาท ต่อ syringe",
    reversible: true,
    pain_level: "low",
  },
  filler_chin: {
    pros_th: [
      "เสริมคางทันที ไม่ต้องผ่าตัด — ทดสอบรูปคางก่อนผ่าจริง",
      "ละลายคืนได้",
    ],
    pros_en: [
      "Instant chin projection — useful as a 'trial' before surgery",
      "Reversible",
    ],
    cons_th: [
      "ผลอยู่ 12-24 เดือน",
      "ปริมาณเยอะ → ต้องใช้ 2-3 syringe ต่อครั้ง (ราคารวมสูง)",
      "หากต้องทำซ้ำระยะยาว ควรเทียบกับทางเลือกอื่นกับแพทย์ก่อน",
    ],
    cons_en: [
      "Lasts 12-24 months",
      "Often needs 2-3 syringes per session (higher total cost)",
      "Long-term repeat treatment should be compared with other options by a clinician",
    ],
    downtime_th: "1-3 วัน",
    downtime_en: "1-3 days",
    duration_th: "12-24 เดือน",
    duration_en: "12-24 months",
    cost_thb: "16,000 – 50,000 บาท (2-3 syringe)",
    reversible: true,
    pain_level: "low",
  },
  body_fat_reduction: compactInfo({
    prosTh: [
      "ช่วยให้ใบหน้าดูเบาลงโดยไม่เปลี่ยนกระดูก",
      "เหมาะกับคนที่แก้ม/ใต้คางดูเต็มจากเนื้อเยื่ออ่อน",
    ],
    prosEn: [
      "Makes the face look lighter without changing bone structure",
      "Good for cheek or under-chin fullness driven by soft tissue",
    ],
    consTh: [
      "ผลขึ้นกับสาเหตุของความเต็มของใบหน้า",
      "ถ้าปัญหาเป็นกระดูกหรือกล้ามเนื้อ ผลจะจำกัด",
    ],
    consEn: [
      "Result depends on why the face looks full",
      "Limited when the issue is bone or muscle rather than fat",
    ],
    downtimeTh: "0-7 วัน ขึ้นกับวิธี",
    downtimeEn: "0-7 days depending on method",
    durationTh: "3-24 เดือน ขึ้นกับวิธี",
    durationEn: "3-24 months depending on method",
    costThb: "8,000 – 60,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  jawline_filler: compactInfo({
    prosTh: [
      "เห็นกรอบหน้าชัดขึ้นทันทีโดยไม่ผ่าตัด",
      "ปรับระดับได้และละลายคืนได้ถ้าใช้ HA filler",
    ],
    prosEn: [
      "Instant jawline definition without surgery",
      "Adjustable and dissolvable when HA filler is used",
    ],
    consTh: [
      "ผลอยู่ชั่วคราว ต้องเติมซ้ำ",
      "ถ้าเติมมากเกินไปอาจดูแข็งหรือหน้ากว้างกว่าเดิม",
    ],
    consEn: [
      "Temporary and needs maintenance",
      "Overfilling can look stiff or make the face wider",
    ],
    downtimeTh: "1-5 วัน",
    downtimeEn: "1-5 days",
    durationTh: "12-24 เดือน",
    durationEn: "12-24 months",
    costThb: "16,000 – 60,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  jaw_reduction: compactInfo({
    prosTh: [
      "ใช้คุยเรื่องความกว้างกรามเมื่อสาเหตุอาจเป็นโครงสร้างกระดูก",
      "ต้องประเมินความสมดุลใบหน้าและความเสี่ยงกับแพทย์เฉพาะทาง",
    ],
    prosEn: [
      "Reviews jaw width when the driver may be bony structure",
      "Requires specialist assessment of balance and risk before decisions",
    ],
    consTh: [
      "เป็นการผ่าตัดใหญ่ ต้องพักฟื้นและเลือกแพทย์เฉพาะทาง",
      "ถ้าลดมากเกินไปอาจทำให้หน้าดูตอบหรือไม่เป็นธรรมชาติ",
    ],
    consEn: [
      "Major surgery requiring specialist planning and recovery",
      "Over-reduction can make the face look hollow or unnatural",
    ],
    downtimeTh: "2-4 สัปดาห์",
    downtimeEn: "2-4 weeks",
    durationTh: "ถาวร",
    durationEn: "Permanent",
    costThb: "120,000 – 350,000 บาท",
    reversible: false,
    painLevel: "high",
  }),
  v_line_surgery: compactInfo({
    prosTh: [
      "ปรับกรามและคางให้เป็นทรง V ได้ชัด",
      "เหมาะกับเคสโครงหน้าล่างกว้างหรือคางสั้นร่วมด้วย",
    ],
    prosEn: [
      "Can reshape jaw and chin when the lower-face structure truly supports it",
      "Useful when wide lower face and short chin appear together",
    ],
    consTh: [
      "เป็นการผ่าตัดโครงสร้าง ความเสี่ยงและเวลาพักฟื้นสูง",
      "ต้องระวังไม่ให้ผลออกมาดูเรียวเกินจริง",
    ],
    consEn: [
      "Structural surgery with meaningful risk and downtime",
      "Over-tapering can look unrealistic",
    ],
    downtimeTh: "3-6 สัปดาห์",
    downtimeEn: "3-6 weeks",
    durationTh: "ถาวร",
    durationEn: "Permanent",
    costThb: "180,000 – 450,000 บาท",
    reversible: false,
    painLevel: "high",
  }),
  cheekbone_reduction: compactInfo({
    prosTh: [
      "ลดความกว้างด้านข้างของโหนกแก้มได้ชัด",
      "ช่วยให้กรอบหน้าดูนุ่มลงเมื่อโหนกแก้มเด่นมาก",
    ],
    prosEn: [
      "Can reduce lateral cheekbone width when clearly structural",
      "Softens the face when cheekbones dominate the silhouette",
    ],
    consTh: [
      "ผ่าตัดกระดูก ต้องวางแผนละเอียดและพักฟื้นนาน",
      "ลดมากเกินไปอาจทำให้ midface แบนหรือหย่อนในอนาคต",
    ],
    consEn: [
      "Bone surgery with detailed planning and longer recovery",
      "Over-reduction can flatten the midface or affect aging",
    ],
    downtimeTh: "3-6 สัปดาห์",
    downtimeEn: "3-6 weeks",
    durationTh: "ถาวร",
    durationEn: "Permanent",
    costThb: "150,000 – 400,000 บาท",
    reversible: false,
    painLevel: "high",
  }),
  facial_fat_grafting: compactInfo({
    prosTh: [
      "เติมวอลลุ่มด้วยเนื้อเยื่อตัวเอง ดูนุ่มและเป็นธรรมชาติ",
      "ช่วยแก้หน้าตอบหรือร่องลึกหลายบริเวณพร้อมกัน",
    ],
    prosEn: [
      "Uses the patient's own tissue for soft, natural volume",
      "Can restore several hollow areas in one plan",
    ],
    consTh: [
      "ไขมันบางส่วนอาจยุบ ต้องเติมซ้ำ",
      "ถ้าเติมมากเกินไปอาจดูบวมและแก้ยากกว่าฟิลเลอร์",
    ],
    consEn: [
      "Some transferred fat can resorb, requiring touch-up",
      "Overfilling can look puffy and is harder to reverse than filler",
    ],
    downtimeTh: "1-2 สัปดาห์",
    downtimeEn: "1-2 weeks",
    durationTh: "หลายปี / กึ่งถาวร",
    durationEn: "Years / semi-permanent",
    costThb: "60,000 – 180,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  double_chin_liposuction: compactInfo({
    prosTh: [
      "ทำให้มุมคอและกรอบหน้าชัดขึ้นเมื่อมีไขมันใต้คาง",
      "ผลอยู่ได้นานถ้าน้ำหนักคงที่",
    ],
    prosEn: [
      "Defines the neck angle and jawline when submental fat is present",
      "Can be long-lasting when anatomy and weight remain stable",
    ],
    consTh: [
      "อาจบวมช้ำและต้องใส่ผ้ารัด",
      "ถ้าผิวหย่อนมากอาจต้องใช้การยกกระชับร่วมด้วย",
    ],
    consEn: [
      "Can bruise and usually needs compression",
      "Loose skin may require tightening as well",
    ],
    downtimeTh: "1-2 สัปดาห์",
    downtimeEn: "1-2 weeks",
    durationTh: "ถาวรถ้าน้ำหนักคงที่",
    durationEn: "Long-lasting; depends on weight and anatomy",
    costThb: "35,000 – 120,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  nose_filler: compactInfo({
    prosTh: [
      "ปรับสันจมูกได้ทันทีโดยไม่ผ่าตัด",
      "เหมาะกับการลองทรงก่อนตัดสินใจทำถาวร",
    ],
    prosEn: [
      "May refine bridge contour without surgery in selected cases",
      "Can help compare temporary contouring with surgical rhinoplasty",
    ],
    consTh: [
      "ผลชั่วคราวและต้องใช้แพทย์ที่ชำนาญมาก",
      "บริเวณจมูกมีความเสี่ยงหลอดเลือดสูงกว่าหลายจุด",
    ],
    consEn: [
      "Temporary and requires a highly experienced injector",
      "The nose is a higher-risk vascular area",
    ],
    downtimeTh: "1-5 วัน",
    downtimeEn: "1-5 days",
    durationTh: "9-18 เดือน",
    durationEn: "9-18 months",
    costThb: "10,000 – 30,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  alar_reduction: compactInfo({
    prosTh: [
      "ลดปีกจมูกกว้างได้ตรงจุด",
      "ทำให้ฐานจมูกสมดุลขึ้นในมุมหน้าตรง",
    ],
    prosEn: [
      "Directly reduces wide alar base",
      "Improves front-view nasal balance",
    ],
    consTh: [
      "มีแผลบริเวณฐานปีกจมูก ต้องออกแบบให้เนียน",
      "ถ้าตัดมากไปอาจดูจมูกแคบหรือแข็งเกินจริง",
    ],
    consEn: [
      "Leaves an alar-base scar that must be carefully designed",
      "Over-reduction can look pinched or unnatural",
    ],
    downtimeTh: "1-2 สัปดาห์",
    downtimeEn: "1-2 weeks",
    durationTh: "ถาวร",
    durationEn: "Permanent",
    costThb: "20,000 – 70,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  tip_refinement: compactInfo({
    prosTh: [
      "ปลายจมูกดูเรียวและชัดขึ้นโดยไม่จำเป็นต้องเปลี่ยนทั้งจมูก",
      "ช่วยให้จมูกดูแพงขึ้นแบบละเอียด",
    ],
    prosEn: [
      "Makes the tip cleaner without changing the whole nose",
      "A high-detail refinement that can elevate the nose subtly",
    ],
    consTh: [
      "ผลขึ้นกับกระดูกอ่อนและความหนาของผิวปลายจมูก",
      "ถ้าทำมากเกินไปปลายจมูกอาจดูแหลมหรือไม่เป็นธรรมชาติ",
    ],
    consEn: [
      "Result depends on cartilage and tip skin thickness",
      "Over-refinement can look pointy or unnatural",
    ],
    downtimeTh: "1-3 สัปดาห์",
    downtimeEn: "1-3 weeks",
    durationTh: "ถาวร",
    durationEn: "Permanent",
    costThb: "40,000 – 150,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  ptosis_correction: compactInfo({
    prosTh: [
      "ช่วยให้ตาดูเปิดและสมดุลขึ้นเมื่อหนังตาตกจริง",
      "ผลชัดกว่าการทำชั้นตาอย่างเดียวในเคสกล้ามเนื้ออ่อนแรง",
    ],
    prosEn: [
      "Opens and balances eyes when true lid droop is present",
      "More effective than crease creation alone for ptosis cases",
    ],
    consTh: [
      "ต้องประเมินโดยจักษุ/ศัลยแพทย์เฉพาะทาง",
      "เสี่ยงตาแห้งหรือสองข้างไม่เท่ากัน ต้องติดตามผล",
    ],
    consEn: [
      "Requires specialist evaluation",
      "Risk of dryness or asymmetry, requiring follow-up",
    ],
    downtimeTh: "1-2 สัปดาห์",
    downtimeEn: "1-2 weeks",
    durationTh: "ถาวร",
    durationEn: "Permanent",
    costThb: "40,000 – 120,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  eye_bag_removal: compactInfo({
    prosTh: [
      "ลดถุงใต้ตาเห็นชัด ทำให้หน้าดูพักผ่อนมากขึ้น",
      "ผลอยู่นานกว่า filler หรือ treatment เบาๆ",
    ],
    prosEn: [
      "Can reduce under-eye bags and tired appearance when anatomy supports it",
      "Longer-lasting than filler or light treatments",
    ],
    consTh: [
      "ผ่าตัดบริเวณใต้ตา ต้องระวังตาแห้งและแผลเป็น",
      "ถ้าเอาไขมันออกมากเกินไปอาจดูตาลึก",
    ],
    consEn: [
      "Lower-eyelid surgery carries dryness and scar considerations",
      "Over-removal can create a hollow look",
    ],
    downtimeTh: "1-2 สัปดาห์",
    downtimeEn: "1-2 weeks",
    durationTh: "หลายปี",
    durationEn: "Years",
    costThb: "35,000 – 120,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  under_eye_fat_repositioning: compactInfo({
    prosTh: [
      "แก้ทั้งถุงใต้ตาและร่องใต้ตาในแผนเดียว",
      "ช่วยให้รอยต่อใต้ตากับแก้มเรียบเป็นธรรมชาติ",
    ],
    prosEn: [
      "Addresses both bags and hollow transition in one plan",
      "Creates a smoother lower lid-to-cheek transition",
    ],
    consTh: [
      "เป็นหัตถการละเอียด ต้องเลือกแพทย์ที่ชำนาญใต้ตา",
      "บวมช้ำเห็นได้ 1-2 สัปดาห์",
    ],
    consEn: [
      "Delicate operation requiring strong lower-eyelid expertise",
      "Visible swelling/bruising for 1-2 weeks",
    ],
    downtimeTh: "1-2 สัปดาห์",
    downtimeEn: "1-2 weeks",
    durationTh: "หลายปี",
    durationEn: "Years",
    costThb: "45,000 – 150,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  under_eye_rejuvenation: compactInfo({
    prosTh: [
      "ช่วยให้ใต้ตาดูสดขึ้นโดยไม่ต้องผ่าตัด",
      "เหมาะกับความคล้ำ ผิวล้า และริ้วเล็ก",
    ],
    prosEn: [
      "Refreshes under-eyes without surgery",
      "Useful for dullness, tired skin, and fine lines",
    ],
    consTh: [
      "ผลไม่แรงเท่าการแก้ถุงใต้ตาที่เป็นโครงสร้าง",
      "ต้องทำเป็นคอร์สหรือดูแลต่อเนื่อง",
    ],
    consEn: [
      "Less powerful for structural bags",
      "Usually needs a course or maintenance",
    ],
    downtimeTh: "0-3 วัน",
    downtimeEn: "0-3 days",
    durationTh: "3-12 เดือน",
    durationEn: "3-12 months",
    costThb: "8,000 – 35,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  lip_lift: compactInfo({
    prosTh: [
      "ช่วยให้ปากบนดูชัดขึ้นโดยไม่ต้องเติมวอลลุ่มเยอะ",
      "ทำให้สัดส่วนปากกับจมูกดูสมดุลขึ้นในบางเคส",
    ],
    prosEn: [
      "Improves upper-lip show without heavy volume",
      "Can balance nose-to-mouth proportions in selected cases",
    ],
    consTh: [
      "มีแผลใต้ฐานจมูก ต้องออกแบบรอยแผลดี",
      "ถ้ายกมากเกินไปอาจเห็นฟันหรือดูแข็ง",
    ],
    consEn: [
      "Scar under the nose needs careful planning",
      "Over-lifting can show too much teeth or look stiff",
    ],
    downtimeTh: "1-2 สัปดาห์",
    downtimeEn: "1-2 weeks",
    durationTh: "ถาวร",
    durationEn: "Permanent",
    costThb: "30,000 – 90,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  skin_booster: compactInfo({
    prosTh: [
      "ผิวดูฉ่ำและเรียบขึ้นโดยไม่เปลี่ยนรูปหน้า",
      "พักฟื้นน้อย เหมาะกับการบำรุงก่อนงานสำคัญ",
    ],
    prosEn: [
      "Adds hydration and smoothness without reshaping the face",
      "Low downtime, useful before events",
    ],
    consTh: [
      "ผลไม่ถาวร ต้องทำซ้ำเป็นรอบ",
      "อาจมีตุ่มหรือรอยเข็ม 1-3 วัน",
    ],
    consEn: [
      "Temporary and needs repeat sessions",
      "Small bumps or injection marks can last 1-3 days",
    ],
    downtimeTh: "1-3 วัน",
    downtimeEn: "1-3 days",
    durationTh: "3-6 เดือน",
    durationEn: "3-6 months",
    costThb: "6,000 – 25,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  rejuran: compactInfo({
    prosTh: [
      "ช่วยให้ผิวแข็งแรงขึ้นและลดรอยแดง/ผิวล้า",
      "เหมาะกับคนที่ต้องการฟื้นผิวมากกว่าการเติมทรง",
    ],
    prosEn: [
      "Improves skin resilience, redness, and tired texture",
      "Good when the goal is skin recovery, not shape change",
    ],
    consTh: [
      "มักต้องทำเป็นคอร์สและผลขึ้นกับสภาพผิวจริง",
      "มีตุ่ม/รอยเข็มหลังทำชั่วคราว",
    ],
    consEn: [
      "Usually requires a course and depends on actual skin condition",
      "Temporary bumps or needle marks are common",
    ],
    downtimeTh: "1-5 วัน",
    downtimeEn: "1-5 days",
    durationTh: "3-6 เดือน",
    durationEn: "3-6 months",
    costThb: "8,000 – 25,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  juvelook: compactInfo({
    prosTh: [
      "ช่วยเรื่องผิวและวอลลุ่มบางจุดพร้อมกัน",
      "ผลค่อยเป็นค่อยไป ดูธรรมชาติกว่าการเติมหนักทันที",
    ],
    prosEn: [
      "Targets both skin texture and subtle volume",
      "Gradual result can look more natural than heavy instant filling",
    ],
    consTh: [
      "ต้องใช้เวลาและอาจต้องหลายครั้ง",
      "ถ้าวางผิดชั้นอาจเป็นก้อน ต้องเลือกแพทย์ชำนาญ",
    ],
    consEn: [
      "Needs time and often multiple sessions",
      "Wrong placement can create lumps, so expertise matters",
    ],
    downtimeTh: "1-5 วัน",
    downtimeEn: "1-5 days",
    durationTh: "6-18 เดือน",
    durationEn: "6-18 months",
    costThb: "12,000 – 35,000 บาท",
    reversible: false,
    painLevel: "low",
  }),
  pico_laser: compactInfo({
    prosTh: [
      "ช่วยลดรอยดำ รอยสิว และสีผิวไม่สม่ำเสมอ",
      "ไม่เปลี่ยนรูปหน้า เหมาะกับการยกระดับผิว",
    ],
    prosEn: [
      "Reduces pigmentation, acne marks, and uneven tone",
      "Improves skin quality without changing facial shape",
    ],
    consTh: [
      "ต้องทำเป็นคอร์สและกันแดดเคร่งครัด",
      "อาจแดงหรือไวต่อแดดหลังทำ",
    ],
    consEn: [
      "Needs a course and strict sun protection",
      "Temporary redness and sun sensitivity can occur",
    ],
    downtimeTh: "0-5 วัน",
    downtimeEn: "0-5 days",
    durationTh: "ขึ้นกับปัญหาและการดูแลผิว",
    durationEn: "Depends on pigment and skincare maintenance",
    costThb: "3,000 – 15,000 บาท ต่อครั้ง",
    reversible: true,
    painLevel: "low",
  }),
  acne_scar_removal: compactInfo({
    prosTh: [
      "อาจช่วยให้หลุมสิวและพื้นผิวขรุขระดูเรียบขึ้นเมื่อวางแผนต่อเนื่อง",
      "ช่วยตั้งคำถามเรื่องผิวสัมผัสและการแต่งหน้าที่ควรประเมินกับแพทย์",
    ],
    prosEn: [
      "Can improve the appearance of pitted scars when planned as a course",
      "Frames texture and makeup-finish questions for clinician assessment",
    ],
    consTh: [
      "ต้องใช้หลายวิธีร่วมกัน เช่น subcision, laser, microneedling",
      "ใช้เวลาเป็นเดือนและอาจมีแดง/ตกสะเก็ดหลังทำ",
    ],
    consEn: [
      "Often requires combined methods such as subcision, laser, microneedling",
      "Takes months and can involve redness or crusting",
    ],
    downtimeTh: "3-10 วัน ต่อครั้ง",
    downtimeEn: "3-10 days per session",
    durationTh: "ผลสะสม / หลายเดือน",
    durationEn: "Cumulative over months",
    costThb: "5,000 – 35,000 บาท ต่อครั้ง",
    reversible: false,
    painLevel: "mid",
  }),
  temple_filler: compactInfo({
    prosTh: [
      "ช่วยพยุงขมับตอบและทำให้กรอบหน้าดูนุ่มขึ้น",
      "ปรับได้ทีละน้อยและละลายคืนได้เมื่อใช้ HA filler",
    ],
    prosEn: [
      "Supports hollow temples and softens the face frame",
      "Can be adjusted gradually and dissolved when HA filler is used",
    ],
    consTh: [
      "ต้องใช้แพทย์ที่ชำนาญเพราะเป็นบริเวณเสี่ยงหลอดเลือด",
      "เติมมากเกินไปอาจทำให้หน้าดูบวมกว้างหรือไม่เป็นธรรมชาติ",
    ],
    consEn: [
      "Requires an experienced injector because the temple is vascular",
      "Overfilling can make the face look wide, puffy, or unnatural",
    ],
    downtimeTh: "1-5 วัน",
    downtimeEn: "1-5 days",
    durationTh: "12-24 เดือน",
    durationEn: "12-24 months",
    costThb: "18,000 – 60,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  midface_support_filler: compactInfo({
    prosTh: [
      "ช่วยพยุงหน้าแก้มและรอยต่อใต้ตาโดยไม่ผ่าตัด",
      "เหมาะกับเคสที่ดูอ่อนล้าจาก volume support ลดลง",
    ],
    prosEn: [
      "Supports cheek and lower-eyelid transition without surgery",
      "Useful when tiredness is driven by reduced volume support",
    ],
    consTh: [
      "เติมมากเกินไปอาจทำให้หน้าแก้มบวมและใต้ตาดูหนัก",
      "ผลขึ้นกับตำแหน่งฉีดและชนิด filler อย่างมาก",
    ],
    consEn: [
      "Overfilling can make cheeks puffy and under-eyes heavy",
      "Result depends strongly on placement and filler choice",
    ],
    downtimeTh: "2-7 วัน",
    downtimeEn: "2-7 days",
    durationTh: "12-24 เดือน",
    durationEn: "12-24 months",
    costThb: "18,000 – 70,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  marionette_line_filler: compactInfo({
    prosTh: [
      "ช่วยลดเงาร่องมุมปากและช่วงล่างของใบหน้า",
      "เป็นทางเลือกไม่ผ่าตัดเมื่อร่องยังไม่ลึกมาก",
    ],
    prosEn: [
      "Softens mouth-corner shadows and lower-face folds",
      "Non-surgical option when the fold is not advanced",
    ],
    consTh: [
      "ถ้าเติมมากเกินไปมุมปากอาจดูหนาหรือแข็ง",
      "ถ้ามีผิวหย่อนชัด ผลของ filler อย่างเดียวอาจจำกัด",
    ],
    consEn: [
      "Overfilling can make mouth corners look heavy or stiff",
      "Limited when skin laxity is the main driver",
    ],
    downtimeTh: "1-5 วัน",
    downtimeEn: "1-5 days",
    durationTh: "9-18 เดือน",
    durationEn: "9-18 months",
    costThb: "12,000 – 40,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  gummy_smile_botox: compactInfo({
    prosTh: [
      "ช่วยลดการยกริมฝีปากบนเมื่อยิ้มในบางเคส",
      "ไม่ผ่าตัดและเห็นผลค่อยเป็นค่อยไปในไม่กี่วัน",
    ],
    prosEn: [
      "Can reduce excessive upper-lip lift in selected cases",
      "Non-surgical with gradual effect over several days",
    ],
    consTh: [
      "ใช้ได้เฉพาะบางสาเหตุของการเห็นเหงือก ไม่ใช่ทุกเคส",
      "ฉีดมากเกินไปอาจทำให้ยิ้มดูแข็งหรือปากบนตก",
    ],
    consEn: [
      "Only fits some causes of gum show, not every case",
      "Over-treatment can make the smile stiff or drop the upper lip",
    ],
    downtimeTh: "ไม่ต้องพัก",
    downtimeEn: "None",
    durationTh: "3-4 เดือน",
    durationEn: "3-4 months",
    costThb: "3,000 – 8,000 บาท",
    reversible: false,
    painLevel: "low",
  }),
  chin_dimpling_botox: compactInfo({
    prosTh: [
      "ช่วยลดผิวคางเป็นปุ่มจากกล้ามเนื้อ mentalis ในบางเคส",
      "ไม่เปลี่ยนขนาดคางหรือโครงหน้า",
    ],
    prosEn: [
      "Can soften mentalis-related chin dimpling in selected cases",
      "Does not change chin size or facial structure",
    ],
    consTh: [
      "ผลอยู่ชั่วคราวและต้องประเมินว่ารอยย่นมาจากกล้ามเนื้อจริงหรือไม่",
      "ฉีดผิดตำแหน่งอาจกระทบการขยับริมฝีปากล่าง",
    ],
    consEn: [
      "Temporary and requires confirming that muscle activity is the cause",
      "Wrong placement can affect lower-lip movement",
    ],
    downtimeTh: "ไม่ต้องพัก",
    downtimeEn: "None",
    durationTh: "3-4 เดือน",
    durationEn: "3-4 months",
    costThb: "2,500 – 7,000 บาท",
    reversible: false,
    painLevel: "low",
  }),
  melasma_pigment_plan: compactInfo({
    prosTh: [
      "ช่วยวางแผนเรื่องฝ้า จุดด่างดำ และสีผิวไม่สม่ำเสมอ",
      "ไม่เปลี่ยนโครงหน้าและมักเริ่มแบบค่อยเป็นค่อยไปได้",
    ],
    prosEn: [
      "Supports planning for melasma, pigment, and uneven tone",
      "Does not reshape the face and can be approached gradually",
    ],
    consTh: [
      "ฝ้าและเม็ดสีต้องดูแลต่อเนื่อง ผลไม่ใช่ถาวรถ้าโดนแดดหรือฮอร์โมนกระตุ้น",
      "บางเลเซอร์หรือยาทาผิดวิธีอาจทำให้ผิวไวหรือคล้ำขึ้น",
    ],
    consEn: [
      "Pigment needs ongoing care and can recur with sun or hormonal triggers",
      "Wrong laser or topical plan can irritate or worsen pigmentation",
    ],
    downtimeTh: "0-7 วัน ขึ้นกับวิธี",
    downtimeEn: "0-7 days depending on method",
    durationTh: "ต้องดูแลต่อเนื่อง",
    durationEn: "Requires maintenance",
    costThb: "3,000 – 25,000 บาท ต่อครั้ง",
    reversible: true,
    painLevel: "low",
  }),
  skin_laxity_tightening: compactInfo({
    prosTh: [
      "ช่วยพยุงผิวหย่อนเล็กน้อยโดยไม่ผ่าตัด",
      "เหมาะกับผู้ที่ต้องการแนวทางค่อยเป็นค่อยไปและพักฟื้นน้อย",
    ],
    prosEn: [
      "Can support mild laxity without surgery",
      "Good for gradual improvement with low downtime",
    ],
    consTh: [
      "ผลจำกัดเมื่อผิวหย่อนมากหรือมีโครงสร้างลึกเป็นสาเหตุ",
      "มักต้องทำเป็นคอร์สและผลขึ้นกับเครื่อง/เทคนิค",
    ],
    consEn: [
      "Limited when laxity is advanced or structurally driven",
      "Often needs a course and depends on device/technique",
    ],
    downtimeTh: "0-7 วัน",
    downtimeEn: "0-7 days",
    durationTh: "3-12 เดือน",
    durationEn: "3-12 months",
    costThb: "8,000 – 80,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  lower_face_laxity_plan: compactInfo({
    prosTh: [
      "ช่วยแยกประเด็นแก้มล่าง กรอบหน้า และใต้คางก่อนเลือกวิธี",
      "เน้นแนวทางอนุรักษ์นิยมก่อนตัดสินใจเรื่องผ่าตัด",
    ],
    prosEn: [
      "Separates lower-cheek, jawline, and submental causes before choosing a path",
      "Keeps planning conservative before any surgical decision",
    ],
    consTh: [
      "เป็นหัวข้อวางแผน ไม่ใช่หัตถการเดียวที่รับประกันผล",
      "อาจต้องประเมินหลายปัจจัย เช่น ไขมัน ผิว กล้ามเนื้อ และกระดูก",
    ],
    consEn: [
      "A planning topic, not a single-outcome procedure",
      "May require assessing fat, skin, muscle, and bone separately",
    ],
    downtimeTh: "ขึ้นกับวิธีที่เลือก",
    downtimeEn: "Depends on chosen method",
    durationTh: "ขึ้นกับวิธีที่เลือก",
    durationEn: "Depends on chosen method",
    costThb: "0 – 120,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  hairline_balance_consult: compactInfo({
    prosTh: [
      "ช่วยประเมินสัดส่วนหน้าผากและกรอบไรผมที่มีผลต่อภาพรวมใบหน้า",
      "เป็นหัวข้อปรึกษาก่อนเลือกทำผม เลเซอร์ หรือปลูกผม",
    ],
    prosEn: [
      "Assesses forehead proportion and hairline framing",
      "Useful before choosing styling, laser hair removal, or restoration",
    ],
    consTh: [
      "ภาพเดียวอาจประเมินไรผมไม่ชัดถ้าผมบังหรือมุมกล้องไม่ตรง",
      "ไม่ควรสรุปเรื่องผมบางหรือปลูกผมจากภาพใบหน้าอย่างเดียว",
    ],
    consEn: [
      "A single photo may not show the hairline clearly",
      "Do not infer hair-loss treatment needs from one face photo alone",
    ],
    downtimeTh: "ไม่มี หากเป็นการปรึกษา",
    downtimeEn: "None for consult-only planning",
    durationTh: "ขึ้นกับวิธีที่เลือก",
    durationEn: "Depends on chosen method",
    costThb: "0 – 150,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  smile_line_dental_consult: compactInfo({
    prosTh: [
      "ช่วยดูสัดส่วนรอยยิ้ม ฟัน ริมฝีปาก และเหงือกเมื่อภาพเห็นชัด",
      "เหมาะสำหรับเตรียมคำถามก่อนพบหมอฟันหรือแพทย์ความงาม",
    ],
    prosEn: [
      "Reviews smile, teeth, lips, and gum relationship when visible",
      "Useful for questions before a dental or aesthetic consult",
    ],
    consTh: [
      "ถ้าไม่เห็นฟันหรือรอยยิ้มในภาพ ไม่ควรสรุปจากรูปนี้",
      "ต้องตรวจจริงเพื่อประเมินการสบฟัน เหงือก และสุขภาพช่องปาก",
    ],
    consEn: [
      "If teeth or smile are not visible, this photo is insufficient",
      "Occlusion, gum, and oral health require in-person evaluation",
    ],
    downtimeTh: "ไม่มี หากเป็นการปรึกษา",
    downtimeEn: "None for consult-only planning",
    durationTh: "ขึ้นกับวิธีที่เลือก",
    durationEn: "Depends on chosen method",
    costThb: "0 – 200,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  upper_blepharoplasty_consult: compactInfo({
    prosTh: [
      "ช่วยแยกประเด็นหนังตาบน ชั้นตา และความหนักของเปลือกตาแบบเป็นกลาง",
      "เหมาะสำหรับเตรียมคำถามก่อนพบจักษุแพทย์หรือศัลยแพทย์ตกแต่ง",
    ],
    prosEn: [
      "Separates upper-lid skin, crease, and heaviness questions neutrally",
      "Useful before an oculoplastic or plastic-surgery consult",
    ],
    consTh: [
      "ภาพเดียวไม่สามารถวินิจฉัยกล้ามเนื้อตาหรือการมองเห็นได้",
      "หัตถการรอบดวงตาต้องประเมินตาแห้ง ความสมมาตร และความเสี่ยงเฉพาะบุคคล",
    ],
    consEn: [
      "A single photo cannot diagnose eyelid muscle function or vision issues",
      "Eyelid procedures require assessment of dry eye, symmetry, and individual risk",
    ],
    downtimeTh: "ปรึกษา: ไม่มี / ผ่าตัด: มัก 1-2 สัปดาห์",
    downtimeEn: "Consult: none / surgery: often 1-2 weeks",
    durationTh: "ขึ้นกับวิธีที่เลือก",
    durationEn: "Depends on chosen method",
    costThb: "0 – 90,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  neck_laxity_consult: compactInfo({
    prosTh: [
      "ช่วยแยกประเด็นใต้คาง ผิวคอ กล้ามเนื้อ และกรอบหน้าล่างก่อนเลือกวิธี",
      "เหมาะกับการตั้งคำถามแบบอนุรักษ์นิยมก่อนทำเครื่องมือ ฉีด หรือผ่าตัด",
    ],
    prosEn: [
      "Separates submental, neck-skin, muscle, and lower-face support questions",
      "Supports conservative planning before devices, injectables, or surgery",
    ],
    consTh: [
      "ภาพใบหน้าอาจเห็นคอไม่พอ ต้องประเมินท่ายืนและหลายมุม",
      "ไม่ควรสรุปเรื่องน้ำหนัก สุขภาพ หรือความจำเป็นของผ่าตัดจากภาพเดียว",
    ],
    consEn: [
      "A face photo may not show enough neck anatomy; multiple views help",
      "Do not infer weight, health, or surgical need from one portrait",
    ],
    downtimeTh: "ขึ้นกับวิธีที่เลือก",
    downtimeEn: "Depends on chosen method",
    durationTh: "ขึ้นกับวิธีที่เลือก",
    durationEn: "Depends on chosen method",
    costThb: "0 – 180,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  orthodontic_bite_consult: compactInfo({
    prosTh: [
      "ช่วยเตรียมคำถามเรื่องแนวฟัน รอยยิ้ม และการสบฟันเมื่อภาพเห็นฟันชัด",
      "ช่วยแยกประเด็นที่ควรถามทันตแพทย์ก่อนทำความงามรอบปาก",
    ],
    prosEn: [
      "Helps prepare questions about visible tooth alignment, smile line, and bite",
      "Separates dental questions before aesthetic lip or smile decisions",
    ],
    consTh: [
      "ไม่สามารถวินิจฉัยการสบฟันจากภาพใบหน้าได้",
      "ต้องตรวจในช่องปาก เอกซเรย์ หรือสแกนฟันก่อนตัดสินใจจริง",
    ],
    consEn: [
      "Cannot diagnose bite or malocclusion from a face photo",
      "Requires intraoral exam, X-ray, or dental scan before decisions",
    ],
    downtimeTh: "ไม่มี หากเป็นการปรึกษา",
    downtimeEn: "None for consult-only planning",
    durationTh: "ขึ้นกับแผนทันตกรรม",
    durationEn: "Depends on dental plan",
    costThb: "0 – 200,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  vascular_redness_derm_consult: compactInfo({
    prosTh: [
      "ช่วยตั้งคำถามเรื่องรอยแดง เส้นเลือดฝอย หรือสีผิวไม่สม่ำเสมอที่เห็นชัด",
      "เน้นแนวทางแพทย์ผิวหนังก่อนเลือกเลเซอร์หรือเครื่องมือ",
    ],
    prosEn: [
      "Frames questions about visible redness, small vessels, or uneven tone",
      "Keeps planning dermatology-led before choosing lasers or devices",
    ],
    consTh: [
      "ไม่ควรวินิจฉัย rosacea ภูมิแพ้ผิว หรือโรคผิวจากภาพเดียว",
      "ผิวไทย/เอเชียต้องระวังการระคายเคืองและรอยคล้ำหลังทำ",
    ],
    consEn: [
      "Do not diagnose rosacea, sensitivity, or skin disease from one photo",
      "Thai/Asian skin needs caution around irritation and post-treatment pigment",
    ],
    downtimeTh: "0-7 วัน ขึ้นกับวิธี",
    downtimeEn: "0-7 days depending on method",
    durationTh: "ต้องดูแลต่อเนื่อง",
    durationEn: "Requires maintenance",
    costThb: "2,000 – 25,000 บาท ต่อครั้ง",
    reversible: true,
    painLevel: "low",
  }),
  dermatology_referral: compactInfo({
    prosTh: [
      "ช่วยแยกประเด็นผิวที่ควรให้แพทย์ดูก่อนความงาม",
      "เหมาะเมื่อมีไฝ รอยโรค ผื่น แผล หรือรอยที่ภาพเดียวประเมินไม่ได้",
    ],
    prosEn: [
      "Separates skin findings that should be clinician-reviewed before aesthetics",
      "Useful for moles, lesions, rashes, wounds, or ambiguous marks",
    ],
    consTh: [
      "ไม่ใช่หัตถการความงามและไม่ควรใช้แทนการตรวจผิวหนังจริง",
      "ไม่ควรลบหรือปรับรอยที่อาจมีความหมายทางการแพทย์จากภาพจำลอง",
    ],
    consEn: [
      "Not an aesthetic procedure and not a substitute for skin examination",
      "Medically ambiguous marks should not be removed or altered in previews",
    ],
    downtimeTh: "ไม่มี หากเป็นการปรึกษา",
    downtimeEn: "None for consult-only planning",
    durationTh: "ไม่เกี่ยวข้อง",
    durationEn: "Not applicable",
    costThb: "0 – 5,000 บาท",
    reversible: true,
    painLevel: "low",
  }),
  forehead_volume_consult: compactInfo({
    prosTh: [
      "ช่วยตั้งคำถามเรื่องหน้าผากหรือขมับที่ดูแบนจากภาพเดียว",
      "เหมาะกับการคุยเรื่องสัดส่วนด้านบนของใบหน้าโดยไม่รีบเลือกฟิลเลอร์หรือไขมัน",
    ],
    prosEn: [
      "Frames forehead or temple contour as a consult question from one photo",
      "Useful before choosing filler, fat grafting, or no procedure",
    ],
    consTh: [
      "ภาพหน้าตรงประเมินความนูนจริงของหน้าผากได้จำกัด",
      "ฟิลเลอร์หรือไขมันบริเวณหน้าผากต้องประเมินความเสี่ยงและเทคนิคกับแพทย์",
    ],
    consEn: [
      "A front photo cannot reliably assess true forehead projection",
      "Forehead filler or fat grafting needs clinician assessment of risk and technique",
    ],
    downtimeTh: "ปรึกษา: ไม่มี / ฟิลเลอร์: 1-3 วัน / ไขมัน: 1-2 สัปดาห์",
    downtimeEn: "Consult: none / filler: 1-3 days / fat graft: 1-2 weeks",
    durationTh: "ขึ้นกับวิธีและการประเมินจริง",
    durationEn: "Depends on method and clinician assessment",
    costThb: "8,000 – 80,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  thread_lift_consult: compactInfo({
    prosTh: [
      "ช่วยแยกประเด็นแก้มล่าง กรอบหน้า และความหย่อนที่เห็นในภาพ",
      "เป็นหัวข้อปรึกษาก่อนเลือกไหม เครื่องมือ พลังงาน หรือไม่ทำหัตถการ",
    ],
    prosEn: [
      "Separates lower-cheek, jawline, and mild laxity questions",
      "Useful before choosing threads, devices, injectables, or no procedure",
    ],
    consTh: [
      "ไม่ควรใช้ภาพเดียวสรุปความเหมาะสมของไหมหรือเครื่องมือ",
      "ผลลัพธ์ ความเสี่ยง และความทนอยู่ขึ้นกับเทคนิคและกายวิภาคจริง",
    ],
    consEn: [
      "A single photo cannot determine thread or device suitability",
      "Outcome, risk, and duration depend on technique and anatomy",
    ],
    downtimeTh: "ปรึกษา: ไม่มี / ทำจริงมัก 3-14 วัน",
    downtimeEn: "Consult: none / procedure often 3-14 days",
    durationTh: "ประมาณ 6-18 เดือน หากทำจริง",
    durationEn: "Often 6-18 months if performed",
    costThb: "15,000 – 80,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  lip_asymmetry_consult: compactInfo({
    prosTh: [
      "ช่วยคุยเรื่องสัดส่วนริมฝีปากและมุมปากโดยไม่บังคับให้เติม",
      "เหมาะเมื่อความไม่เท่ากันเห็นชัดและควรดูร่วมกับรอยยิ้มจริง",
    ],
    prosEn: [
      "Frames lip proportion and corner balance without forcing filler",
      "Useful when asymmetry is visible and should be checked with real expression",
    ],
    consTh: [
      "ภาพนิ่งอาจหลอกจากมุมกล้อง แสง หรือจังหวะปาก",
      "ต้องประเมินกล้ามเนื้อ รอยยิ้ม และความเสี่ยงก่อนเลือกวิธี",
    ],
    consEn: [
      "A still photo can be misleading because of angle, lighting, or expression",
      "Expression, muscle activity, and risk need clinician assessment",
    ],
    downtimeTh: "ปรึกษา: ไม่มี / ฟิลเลอร์มัก 1-5 วัน",
    downtimeEn: "Consult: none / filler often 1-5 days",
    durationTh: "ประมาณ 6-12 เดือน หากใช้ฟิลเลอร์",
    durationEn: "Often 6-12 months if HA filler is used",
    costThb: "8,000 – 25,000 บาท",
    reversible: true,
    painLevel: "mid",
  }),
  nasal_asymmetry_consult: compactInfo({
    prosTh: [
      "ช่วยตั้งคำถามเรื่องแกนจมูก ปลายจมูก หรือรูจมูกที่เห็นไม่เท่ากัน",
      "เหมาะกับการเตรียมคำถามก่อนพบแพทย์ โดยไม่สรุปเรื่องผนังกั้นจมูกหรือการหายใจ",
    ],
    prosEn: [
      "Frames visible nasal axis, tip, or nostril imbalance as a consult topic",
      "Useful before a specialist visit without claiming septal or breathing findings",
    ],
    consTh: [
      "ภาพเดียวไม่พอประเมินแกนจมูกสามมิติหรือสาเหตุจริง",
      "หากเกี่ยวกับการหายใจหรือผนังกั้นจมูก ต้องพบแพทย์เฉพาะทาง",
    ],
    consEn: [
      "One photo cannot assess 3D nasal axis or true cause",
      "Breathing or septal concerns require specialist medical evaluation",
    ],
    downtimeTh: "ปรึกษา: ไม่มี / ทำจริงขึ้นกับวิธี",
    downtimeEn: "Consult: none / procedure downtime depends on method",
    durationTh: "ขึ้นกับวิธีและการประเมินจริง",
    durationEn: "Depends on method and clinician assessment",
    costThb: "5,000 – 180,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  scar_revision_consult: compactInfo({
    prosTh: [
      "ช่วยแยกรอยแผลเป็นด้านความงามออกจากรอยที่ควรให้แพทย์ตรวจ",
      "เหมาะกับการคุยเรื่องพื้นผิว รอยนูน รอยบุ๋ม หรือสีผิวที่เห็นชัด",
    ],
    prosEn: [
      "Separates cosmetic scar texture from marks that need clinician review",
      "Useful for visible texture, raised scars, depressed scars, or color change",
    ],
    consTh: [
      "ไม่ควรลบรอยที่อาจมีความหมายทางการแพทย์จากภาพจำลอง",
      "วิธีจริงอาจต้องใช้หลายครั้งและขึ้นกับชนิดของแผลเป็น",
    ],
    consEn: [
      "Medically relevant marks should not be removed in a preview",
      "Real treatment may require a course and depends on scar type",
    ],
    downtimeTh: "ปรึกษา: ไม่มี / ทำจริงมัก 2-14 วัน",
    downtimeEn: "Consult: none / treatment often 2-14 days",
    durationTh: "ขึ้นกับชนิดแผลเป็นและวิธีรักษา",
    durationEn: "Depends on scar type and treatment method",
    costThb: "3,000 – 60,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  rf_microneedling_texture_consult: compactInfo({
    prosTh: [
      "ใช้ตั้งคำถามเรื่องหลุมสิว รูขุมขน ผิวไม่เรียบ หรือความหย่อนเล็กน้อยแบบไม่ผ่าตัด",
      "เหมาะเป็นหัวข้อปรึกษาเมื่อพื้นผิวเป็นประเด็น ไม่ใช่การเปลี่ยนรูปหน้า",
    ],
    prosEn: [
      "Frames acne-scar texture, pores, roughness, or mild laxity without reshaping the face",
      "Useful when texture is the visible concern, not facial-structure change",
    ],
    consTh: [
      "ต้องประเมินชนิดแผลเป็น สีผิวจริง และความเสี่ยงรอยคล้ำก่อนเลือกพลังงาน",
      "ผิวไทย/เอเชียต้องระวังการระคายเคืองและรอยดำหลังทำ",
    ],
    consEn: [
      "Scar type, real skin tone, and pigment risk must be assessed before choosing settings",
      "Thai/Asian skin needs caution around irritation and post-treatment hyperpigmentation",
    ],
    downtimeTh: "1-7 วัน ขึ้นกับพลังงานและความลึก",
    downtimeEn: "1-7 days depending on energy and depth",
    durationTh: "ผลสะสมเป็นคอร์ส / ต้องประเมินจริง",
    durationEn: "Cumulative over a course; requires assessment",
    costThb: "5,000 – 25,000 บาท ต่อครั้ง",
    reversible: false,
    painLevel: "mid",
  }),
  ultrasound_rf_laxity_consult: compactInfo({
    prosTh: [
      "ช่วยตั้งคำถามเรื่องความหย่อนเล็กน้อยของแก้มล่าง ใต้คาง หรือกรอบหน้า",
      "เป็นแนวทางไม่ผ่าตัดสำหรับคุยก่อนเลือกเครื่องมือหรือไม่ทำหัตถการ",
    ],
    prosEn: [
      "Frames mild lower-face, submental, or jawline laxity as a consult question",
      "A non-surgical discussion topic before choosing a device or no procedure",
    ],
    consTh: [
      "ผลจำกัดถ้าความหย่อนเป็นมาก ไขมันเยอะ หรือโครงสร้างลึกเป็นสาเหตุ",
      "ภาพเดียวไม่พอประเมินผิวคอและแรงพยุงจริง ต้องดูหลายมุม",
    ],
    consEn: [
      "Limited when laxity is advanced, fat is dominant, or deeper structure is the driver",
      "One photo is insufficient for neck and tissue-support assessment",
    ],
    downtimeTh: "0-7 วัน ขึ้นกับเครื่องและพลังงาน",
    downtimeEn: "0-7 days depending on device and energy",
    durationTh: "3-12 เดือนโดยประมาณ หากเหมาะสม",
    durationEn: "Often 3-12 months when suitable",
    costThb: "8,000 – 80,000 บาท",
    reversible: true,
    painLevel: "mid",
  }),
  fractional_laser_resurfacing_consult: compactInfo({
    prosTh: [
      "ช่วยตั้งคำถามเรื่องผิวไม่เรียบ หลุมสิว ริ้วเล็ก หรือพื้นผิวหยาบ",
      "เหมาะเมื่อเป้าหมายคือพื้นผิว ไม่ใช่การเปลี่ยนรูปหน้า",
    ],
    prosEn: [
      "Frames texture, acne-scar edges, fine lines, or rough surface as a consult topic",
      "Useful when the goal is surface quality, not facial-shape change",
    ],
    consTh: [
      "มักต้องทำเป็นคอร์สและอาจมีแดง ตกสะเก็ด หรือไวต่อแดด",
      "ผิวไทย/เอเชียต้องระวังรอยดำหลังเลเซอร์และการเลือกพลังงานผิด",
    ],
    consEn: [
      "Often needs a course and can involve redness, crusting, or sun sensitivity",
      "Thai/Asian skin needs caution around post-laser pigmentation and settings",
    ],
    downtimeTh: "3-10 วัน ต่อครั้ง",
    downtimeEn: "3-10 days per session",
    durationTh: "ผลสะสม / หลายเดือน",
    durationEn: "Cumulative over months",
    costThb: "5,000 – 35,000 บาท ต่อครั้ง",
    reversible: false,
    painLevel: "mid",
  }),
  subcision_acne_scar_consult: compactInfo({
    prosTh: [
      "ช่วยตั้งคำถามเรื่องหลุมสิวชนิดรอยกลิ้งหรือรอยบุ๋มที่เห็นเป็นเงา",
      "มักใช้ร่วมกับเลเซอร์หรือ microneedling เมื่อแพทย์ประเมินว่าเหมาะ",
    ],
    prosEn: [
      "Frames rolling or depressed acne scars that show as shadows",
      "Often considered with laser or microneedling after clinician assessment",
    ],
    consTh: [
      "ไม่เหมาะกับทุกชนิดของหลุมสิว และต้องแยกจากรอยดำหรือสิวอักเสบ",
      "อาจบวม ช้ำ หรือมีรอยเข็ม ต้องประเมินผิวจริงก่อน",
    ],
    consEn: [
      "Not suitable for every scar type and must be separated from pigment or active acne",
      "Can cause swelling, bruising, or needle marks; real skin exam matters",
    ],
    downtimeTh: "3-14 วัน",
    downtimeEn: "3-14 days",
    durationTh: "ผลสะสม / ขึ้นกับชนิดแผลเป็น",
    durationEn: "Cumulative; depends on scar type",
    costThb: "5,000 – 30,000 บาท ต่อครั้ง",
    reversible: false,
    painLevel: "mid",
  }),
  genioplasty_consult: compactInfo({
    prosTh: [
      "ช่วยตั้งคำถามเรื่องโครงสร้างคาง projection ความยาว และจุดกึ่งกลางของคาง",
      "ใช้เมื่อประเด็นดูเป็นโครงสร้างคางมากกว่าการเติมฟิลเลอร์เล็กน้อย",
    ],
    prosEn: [
      "Frames chin projection, length, and chin-point position as structural questions",
      "Useful when the concern appears structural rather than mild filler-level support",
    ],
    consTh: [
      "เป็นหัวข้อผ่าตัดโครงสร้าง ต้องประเมินจากหลายมุมและบางเคสต้องดูการสบฟัน",
      "ภาพเดียวไม่สามารถสรุปความเหมาะสม ความเสี่ยง หรือผลลัพธ์สุดท้ายได้",
    ],
    consEn: [
      "Structural surgery topic requiring multiple views and sometimes bite assessment",
      "One photo cannot determine suitability, risk, or final outcome",
    ],
    downtimeTh: "2-6 สัปดาห์",
    downtimeEn: "2-6 weeks",
    durationTh: "ถาวร",
    durationEn: "Permanent",
    costThb: "80,000 – 250,000 บาท",
    reversible: false,
    painLevel: "high",
  }),
  hairline_restoration_consult: compactInfo({
    prosTh: [
      "ช่วยตั้งคำถามเรื่องไรผม กรอบหน้า และสัดส่วนหน้าผากเมื่อเห็นชัด",
      "เหมาะก่อนคุยเรื่องทรงผม เลเซอร์ ปลูกผม หรือการไม่ทำอะไร",
    ],
    prosEn: [
      "Frames hairline, face framing, and forehead proportion when visible",
      "Useful before discussing styling, laser hair removal, restoration, or no procedure",
    ],
    consTh: [
      "ภาพเดียวอาจเห็นไรผมไม่พอ โดยเฉพาะเมื่อผมบังหรือมุมกล้องไม่ตรง",
      "ไม่ควรวินิจฉัยผมบางหรือความจำเป็นต้องปลูกผมจากภาพใบหน้าเดียว",
    ],
    consEn: [
      "One photo may not show enough hairline detail, especially with hair coverage or angle",
      "Do not diagnose hair loss or transplant need from a face photo",
    ],
    downtimeTh: "ปรึกษา: ไม่มี / ทำจริงขึ้นกับวิธี",
    downtimeEn: "Consult: none / procedure downtime depends on method",
    durationTh: "ขึ้นกับวิธีที่เลือก",
    durationEn: "Depends on method",
    costThb: "0 – 200,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
  smile_design_veneers_consult: compactInfo({
    prosTh: [
      "ช่วยตั้งคำถามเรื่องรูปยิ้ม ฟัน เหงือก และกรอบริมฝีปากเมื่อเห็นฟันชัด",
      "เหมาะก่อนคุยกับทันตแพทย์เรื่องวีเนียร์ จัดฟัน หรือการปรับรอยยิ้ม",
    ],
    prosEn: [
      "Frames smile, teeth, gum line, and lip frame when teeth are visible",
      "Useful before discussing veneers, orthodontics, or smile design with a dentist",
    ],
    consTh: [
      "ภาพใบหน้าไม่พอประเมินการสบฟัน สีฟัน สุขภาพเหงือก หรือโครงสร้างฟันจริง",
      "วีเนียร์มักย้อนกลับยาก ต้องตรวจในช่องปากก่อนตัดสินใจ",
    ],
    consEn: [
      "A face photo cannot assess bite, tooth color, gum health, or real tooth structure",
      "Veneers are usually hard to reverse and need an in-person dental exam",
    ],
    downtimeTh: "ปรึกษา: ไม่มี / ทำจริงขึ้นกับแผนทันตกรรม",
    downtimeEn: "Consult: none / procedure downtime depends on dental plan",
    durationTh: "ขึ้นกับแผนทันตกรรม",
    durationEn: "Depends on dental plan",
    costThb: "0 – 250,000 บาท",
    reversible: false,
    painLevel: "mid",
  }),
};

export function findProcedureInfo(key: ProcedureKey): ProcedureInfo | undefined {
  return PROCEDURE_INFO[key];
}

/**
 * Phase 135 — parse a cost string like "8,000 – 25,000 บาท" or
 * "16,000 – 50,000 บาท (2-3 syringe)" into numeric min/max in baht.
 * Returns null when the format isn't recognized so the caller can
 * fall back to a "ราคา: -" placeholder instead of fabricating numbers.
 */
export function parseCostRange(cost: string): { min: number; max: number } | null {
  if (!cost) return null;
  // Strip Thai commas/spaces, capture the FIRST pair of "X-Y" numbers.
  // (Some entries append extra context like "(2-3 syringe)" after the
  // baht figure — we only want the leading range.)
  const match = cost.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*[\-–—]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const min = parseFloat(match[1] ?? "");
  const max = parseFloat(match[2] ?? "");
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
    return null;
  }
  return { min, max };
}

export interface SelectionSummary {
  /** Total min/max cost in THB across all selected procedures. */
  costMin: number;
  costMax: number;
  /** True if any selected procedure had an unparseable cost string. */
  costPartial: boolean;
  /** How many of the selected are injectable / surgical / non-invasive. */
  surgicalCount: number;
  injectableCount: number;
  nonInvasiveCount: number;
  /** Longest single-procedure downtime label (worst-case in plain text). */
  longestDowntimeKey: ProcedureKey | null;
}

/**
 * Summarize a set of selected procedures so the UI can show
 * "งบรวมประมาณ ... · ผ่าตัด N รายการ · ฉีด N รายการ".
 */
export function summarizeSelection(keys: ProcedureKey[]): SelectionSummary {
  let costMin = 0;
  let costMax = 0;
  let costPartial = false;
  let surgicalCount = 0;
  let injectableCount = 0;
  let nonInvasiveCount = 0;
  let longestDowntimeKey: ProcedureKey | null = null;
  let longestDowntimeScore = -1;
  for (const key of keys) {
    const def = findProcedure(key);
    const info = findProcedureInfo(key);
    if (!def || !info) {
      costPartial = true;
      continue;
    }
    if (def.kind === "surgical") surgicalCount += 1;
    else if (def.kind === "injectable") injectableCount += 1;
    else nonInvasiveCount += 1;
    const range = parseCostRange(info.cost_thb);
    if (range) {
      costMin += range.min;
      costMax += range.max;
    } else {
      costPartial = true;
    }
    // Pick the procedure with the longest downtime label as a rough
    // proxy for "worst-case recovery window". This is a heuristic;
    // a future enhancement could parse durations into days.
    const score = downtimeScore(info.downtime_th);
    if (score > longestDowntimeScore) {
      longestDowntimeScore = score;
      longestDowntimeKey = key;
    }
  }
  return {
    costMin,
    costMax,
    costPartial,
    surgicalCount,
    injectableCount,
    nonInvasiveCount,
    longestDowntimeKey,
  };
}

/** Rough downtime severity score — the larger, the longer the recovery.
 *  Used as a heuristic to pick the worst-case label to surface. */
function downtimeScore(downtime: string): number {
  const lower = downtime.toLowerCase();
  if (/ไม่ต้องพัก|none/i.test(lower)) return 0;
  // Look for a leading number range, e.g. "1-2 สัปดาห์", "2-4 สัปดาห์".
  const num = lower.match(/(\d+)\s*[\-–—]\s*(\d+)/);
  const max = num ? parseInt(num[2] ?? "0", 10) : 1;
  if (/สัปดาห์|week/.test(lower)) return max * 7;
  if (/เดือน|month/.test(lower)) return max * 30;
  if (/วัน|day/.test(lower)) return max;
  return 1;
}

/** Format a baht amount with thai-style comma separators. */
export function formatBaht(n: number): string {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(n);
}

export type Intensity = "mild" | "normal" | "strong";

export const MAX_COMBO_PROCEDURES = 3;
