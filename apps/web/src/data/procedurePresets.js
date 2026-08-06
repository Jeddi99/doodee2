// 4 Realistic Procedure Simulation Presets per Category

export const PROCEDURE_PRESETS = {
  nose: [
    {
      id: 'slope_teardrop',
      name_th: 'เสริมจมูกทรงสโลปปลายหยดน้ำ',
      name_en: 'Natural Slope & Teardrop Tip',
      summary_th: 'เน้นสโลปละมุนรับกับหน้าผาก และแต่งปลายหยดน้ำอย่างเป็นธรรมชาติ',
      parameters: { bridge_height: 35, tip_projection: 40, alar_width: -15, tip_angle: 10 },
    },
    {
      id: 'open_rhinoplasty',
      name_th: 'ปรับโครงสร้างจมูกเปิด (Open Rhinoplasty)',
      name_en: 'Structural Open Rhinoplasty',
      summary_th: 'ยืดผนังกั้นห้องจมูก แต่งปลายพุ่งคมชัด และลดขนาดสันจมูกใหญ่',
      parameters: { bridge_height: 50, tip_projection: 60, alar_width: -25, tip_angle: 15 },
    },
    {
      id: 'alar_tip_refinement',
      name_th: 'ตัดปีกจมูกและปรับปลายพุ่ง',
      name_en: 'Alar Reduction & Tip Elevation',
      summary_th: 'กระชับปีกจมูกให้แคบลง รับกับฐานปาก และยกปลายจมูกให้เรียวสวย',
      parameters: { bridge_height: 20, tip_projection: 45, alar_width: -40, tip_angle: 20 },
    },
    {
      id: 'filler_contouring',
      name_th: 'เติมฟิลเลอร์สันจมูกละมุน',
      name_en: 'Nose Bridge Filler Contour',
      summary_th: 'ปรับเติมเฉพาะบริเวณฮัมพ์หรือสันจมูกตอนบนโดยไม่ต้องผ่าตัด',
      parameters: { bridge_height: 25, tip_projection: 15, alar_width: 0, tip_angle: 5 },
    },
  ],

  eyes: [
    {
      id: 'double_eyelid',
      name_th: 'ตาสองชั้นเทคนิคซ่อนแผล',
      name_en: 'Subtle Double Eyelid Crease',
      summary_th: 'สร้างชั้นตาชัดเจนละมุน เหมาะกับรูปตาคนเอเชีย',
      parameters: { eyelid_definition: 45, outer_corner_lift: 15, eye_openness: 20 },
    },
    {
      id: 'canthoplasty_lift',
      name_th: 'เปิดหัวตาและยกหางตา (Canthoplasty)',
      name_en: 'Almond Eye Canthoplasty',
      summary_th: 'ขยายดวงตาให้โตสวยเรียวยาว หางตายกขึ้นดูสดใส',
      parameters: { eyelid_definition: 30, outer_corner_lift: 50, eye_openness: 40 },
    },
    {
      id: 'lower_blepharoplasty',
      name_th: 'จัดเรียงไขมันใต้ตา (Lower Blepharoplasty)',
      name_en: 'Smooth Under-Eye Fat Pad',
      summary_th: 'ลบร่องน้ำตาและถุงใต้ตาให้หน้าดูอ่อนเยาว์พักผ่อนเต็มที่',
      parameters: { eyelid_definition: 10, outer_corner_lift: 10, eye_openness: 15 },
    },
    {
      id: 'endoscopic_brow_lift',
      name_th: 'ยกคิ้วและส่องกล้องดึงหน้าผาก',
      name_en: 'Endoscopic Upper Eye Lift',
      summary_th: 'เพิ่มระยะห่างระหว่างคิ้วและดวงตา ป้องกันหนังตาตก',
      parameters: { eyelid_definition: 35, outer_corner_lift: 40, eye_openness: 30 },
    },
  ],

  lips: [
    {
      id: 'cherry_cupid_filler',
      name_th: 'ฟิลเลอร์ปากทรงกระจับสายเกา',
      name_en: 'Korean Cherry Cupid Bow Filler',
      summary_th: 'เน้นกระจับปากบนอวบอิ่ม สัดส่วนริมฝีปากบนต่อล่าง 1:1.6',
      parameters: { lip_fullness: 50, cupid_bow: 60, corner_lift: 25 },
    },
    {
      id: 'lip_corner_lift',
      name_th: 'ยกมุมปากยิ้ม (Lip Corner Lift)',
      name_en: 'Smile Lip Corner Elevation',
      summary_th: 'ปรับมุมปากที่คว่ำให้ดูอารมณ์ดีและมีเสน่ห์ตลอดเวลา',
      parameters: { lip_fullness: 20, cupid_bow: 30, corner_lift: 65 },
    },
    {
      id: 'hydra_gloss_volume',
      name_th: 'ปรับริมฝีปากอวบอิ่มสมดุล (Hydra Volume)',
      name_en: 'Balanced Plump Lip Volume',
      summary_th: 'เพิ่มปริมาตรริมฝีปากให้เรียบเนียนไร้รอยย่น',
      parameters: { lip_fullness: 60, cupid_bow: 30, corner_lift: 15 },
    },
    {
      id: 'lip_reduction',
      name_th: 'ลดความหนาริมฝีปากละมุน (Lip Reduction)',
      name_en: 'Sleek Lip Reduction',
      summary_th: 'ปรับริมฝีปากที่หนาเกินไปให้เรียวเล็กสมส่วนกับใบหน้า',
      parameters: { lip_fullness: -40, cupid_bow: 40, corner_lift: 20 },
    },
  ],

  cheeks: [
    {
      id: 'midface_fat_grafting',
      name_th: 'ฉีดไขมันเติมเต็มร่องแก้ม (Fat Grafting)',
      name_en: 'Youthful Midface Fat Grafting',
      summary_th: 'เติมเต็มแก้มตอบและร่องแก้มให้ดูละอ่อนและหน้าสดใส',
      parameters: { cheek_volume: 50, cheekbone_prominence: -10, sag_reduction: 40 },
    },
    {
      id: 'hifu_ultherapy_lift',
      name_th: 'ยกกระชับแก้มด้วย Ultherapy / HIFU',
      name_en: 'Cheek Tightening & Contour Lift',
      summary_th: 'เก็บเหนียงและกระชับแก้มย้อยให้เห็นกรอบหน้าชัดขึ้น',
      parameters: { cheek_volume: -20, cheekbone_prominence: 15, sag_reduction: 60 },
    },
    {
      id: 'buccal_fat_removal',
      name_th: 'ตัดไขมันกระพุ้งแก้ม (Buccal Fat Removal)',
      name_en: 'Sculpted Buccal Contour',
      summary_th: 'ตอบโจทย์แก้มยุ้ย ลบความกลมบริเวณกระพุ้งแก้ม',
      parameters: { cheek_volume: -50, cheekbone_prominence: 25, sag_reduction: 30 },
    },
    {
      id: 'cheekbone_contour_filler',
      name_th: 'ฟิลเลอร์โหนกแก้มละมุน (Cheek Filler)',
      name_en: 'Lifted Cheek Apex Filler',
      summary_th: 'สร้างจุดสะท้อนแสงบนโหนกแก้ม ยกลิฟต์โครงหน้าส่วนกลาง',
      parameters: { cheek_volume: 30, cheekbone_prominence: 40, sag_reduction: 35 },
    },
  ],

  jaw: [
    {
      id: 'jawline_botox',
      name_th: 'โบท็อกซ์ลดขนาดกล้ามเนื้อกราม (Jaw Botox)',
      name_en: 'V-Line Jaw Muscle Reduction',
      summary_th: 'ลดความกว้างของกรามล่าง เปลี่ยนใบหน้าเรียวทรงไข่',
      parameters: { jaw_width: -50, jaw_angle: -30, chin_projection: 10 },
    },
    {
      id: 'jaw_angle_resection',
      name_th: 'ผ่าตัดตัดมุมกราม (Jaw Angle Resection)',
      name_en: 'Smooth Oval Jawline Resection',
      summary_th: 'ลบเหลี่ยมกรามที่เป็นมุมฉากออกอย่างถาวร',
      parameters: { jaw_width: -70, jaw_angle: -60, chin_projection: 15 },
    },
    {
      id: 'jawline_thread_lift',
      name_th: 'ร้อยไหมลิฟติ้งกรอบหน้า (Jaw Thread Lift)',
      name_en: 'Sharp Mandibular Thread Lift',
      summary_th: 'ดึงกรอบหน้าล่างให้คมกริบ ลบความหย่อนคล้อย',
      parameters: { jaw_width: -20, jaw_angle: 20, chin_projection: 25 },
    },
    {
      id: 'mandibular_structure_filler',
      name_th: 'ฟิลเลอร์สร้างกรอบหน้าคมชัด (Jaw Filler)',
      name_en: 'Structured Mandibular Definition',
      summary_th: 'เพิ่มความคมของแนวสันกราม ดูสตรองสมส่วน',
      parameters: { jaw_width: 15, jaw_angle: 40, chin_projection: 30 },
    },
  ],

  chin: [
    {
      id: 'silicone_chin_implant',
      name_th: 'เสริมคางซิลิโคนทรงธรรมชาติ (Chin Implant)',
      name_en: 'Natural Balance Chin Implant',
      summary_th: 'ยืดคางที่สั้นถอยให้ยาวรับกับปลายจมูกและริมฝีปาก',
      parameters: { chin_length: 45, chin_projection: 50, v_line_taper: 35 },
    },
    {
      id: 'chin_filler_v_shape',
      name_th: 'ฟิลเลอร์ปรับคางยาวละมุน (V-Shape Filler)',
      name_en: 'Soft V-Shape Chin Filler',
      summary_th: 'ปรับคางเรียวละมุนโดยไม่ต้องพักฟื้น',
      parameters: { chin_length: 30, chin_projection: 30, v_line_taper: 50 },
    },
    {
      id: 'genioplasty_advancement',
      name_th: 'เลื่อนกระดูกคาง (Genioplasty)',
      name_en: 'Structural Chin Advancement',
      summary_th: 'แก้ไขคางหลุบถอยอย่างตรงจุด เพิ่มมิติใบหน้าส่วนล่าง',
      parameters: { chin_length: 50, chin_projection: 65, v_line_taper: 40 },
    },
    {
      id: 'submental_fat_reduction',
      name_th: 'สลายไขมันใต้คาง (Double Chin Melting)',
      name_en: 'Submental Chiseled Neck Contour',
      summary_th: 'กำจัดเหนียงใต้คางให้แนบติดลำคออย่างคมชัด',
      parameters: { chin_length: 10, chin_projection: 20, v_line_taper: 60 },
    },
  ],

  faceShape: [
    {
      id: 'v_shape_contour',
      name_th: 'ปรับโครงหน้า V-Shape ละมุน',
      name_en: 'V-Shape Contour Refinement',
      summary_th: 'เรียบเนียนตั้งแต่โหนกแก้ม กราม จนถึงปลายคาง',
      parameters: { jaw_width: -40, chin_length: 30, cheek_volume: -20 },
    },
    {
      id: 'oval_harmony',
      name_th: 'ปรับใบหน้าทรงไข่สมดุล (Oval Harmony)',
      name_en: 'Classic Oval Facial Harmony',
      summary_th: 'สัดส่วนแนวตั้งและแนวขวางได้ดุลยภาพทองคำ',
      parameters: { jaw_width: -25, chin_length: 20, cheek_volume: 10 },
    },
    {
      id: 'heart_shape_youth',
      name_th: 'ปรับโครงหน้าทรงหัวใจอ่อนเยาว์ (Heart Shape)',
      name_en: 'Youthful Heart Shape Contour',
      summary_th: 'เน้นโหนกแก้มสดใสและคางเรียวเล็ก',
      parameters: { jaw_width: -35, chin_length: 25, cheek_volume: 35 },
    },
    {
      id: 'facial_fat_sculpting',
      name_th: 'จัดเรียงกรอบหน้าไร้เหนียง (Fat Sculpting)',
      name_en: 'Chiseled Facial Outline',
      summary_th: 'ลบมุมเหลี่ยมและไขมันส่วนเกินกรอบหน้า',
      parameters: { jaw_width: -30, chin_length: 15, cheek_volume: -30 },
    },
  ],

  eyebrows: [
    {
      id: 'korean_flat_brows',
      name_th: 'ปรับคิ้วทรงตรงละมุนสายเกา',
      name_en: 'Korean Straight Soft Eyebrows',
      summary_th: 'ลดความโก่ง คิ้วตรงสวยช่วยให้หน้าดูอ่อนเยาว์สดใส',
      parameters: { brow_arch: -40, brow_height: 10, brow_thickness: 20 },
    },
    {
      id: 'soft_arch_brows',
      name_th: 'ปรับคิ้วทรงโค้งละมุน (Soft Arch)',
      name_en: 'Soft Feminine Arch Eyebrows',
      summary_th: 'คิ้วโก่งน้อยๆ เสริมมิติให้ดวงตามีเสน่ห์ชวนมอง',
      parameters: { brow_arch: 25, brow_height: 20, brow_thickness: 10 },
    },
    {
      id: 'lifted_brows',
      name_th: 'ยกหางคิ้วเฉี่ยว (Lifted Brows)',
      name_en: 'High Arch Lifted Eyebrows',
      summary_th: 'ยกหางคิ้วขึ้น เพิ่มความเฉี่ยวและความมั่นใจ',
      parameters: { brow_arch: 50, brow_height: 35, brow_thickness: 0 },
    },
    {
      id: 'full_feather_brows',
      name_th: 'ปรับคิ้วฟุ้งอิ่มธรรมชาติ (Feather Brows)',
      name_en: 'Natural Feathered Eyebrows',
      summary_th: 'เพิ่มความหนาแน่นและเส้นคิ้วธรรมชาติ',
      parameters: { brow_arch: 0, brow_height: 5, brow_thickness: 40 },
    },
  ],

  smile: [
    {
      id: 'gummy_smile_botox',
      name_th: 'ปรับลดรอยยิ้มเห็นเหงือก (Gummy Smile Botox)',
      name_en: 'Gummy Smile Reduction',
      summary_th: 'ปรับการทำงานของกล้ามเนื้อริมฝีปากบน ยิ้มสวยมั่นใจ',
      parameters: { lip_elevation: -35, smile_width: 20, dimple_depth: 0 },
    },
    {
      id: 'dimple_creation',
      name_th: 'สร้างลักยิ้มธรรมชาติ (Dimple Creation)',
      name_en: 'Natural Dimple Creation',
      summary_th: 'เพิ่มจุดลักยิ้มเวลารอยยิ้มสดใส น่าทะนุถนอม',
      parameters: { lip_elevation: 10, smile_width: 15, dimple_depth: 60 },
    },
    {
      id: 'wide_radiant_smile',
      name_th: 'ปรับรอยยิ้มกว้างสดใส (Radiant Smile)',
      name_en: 'Wide Radiant Smile Contour',
      summary_th: 'ขยายความกว้างมุมปากเวลาส่องยิ้มเห็นฟันเรียงสวย',
      parameters: { lip_elevation: 30, smile_width: 50, dimple_depth: 10 },
    },
    {
      id: 'veneer_smile_design',
      name_th: 'ดีไซน์รอยยิ้มดารา (Veneer Smile Design)',
      name_en: 'Hollywood Veneer Smile Proportion',
      summary_th: 'สัดส่วนรอยยิ้มตามหลักทันตกรรมความงาม',
      parameters: { lip_elevation: 25, smile_width: 40, dimple_depth: 20 },
    },
  ],

  skin: [
    {
      id: 'glass_skin_booster',
      name_th: 'รีจูรัน / ชาแนล หน้าฉ่ำวาว (Glass Skin)',
      name_en: 'Korean Rejuran Glass Skin Booster',
      summary_th: 'ลดรูขุมขน ปรับผิวเรียบเนียนฉ่ำวาวสะท้อนแสง',
      parameters: { pore_refinement: 60, texture_smoothness: 70, radiance: 80 },
    },
    {
      id: 'pico_laser_toning',
      name_th: 'พิโคเลเซอร์ ลบรอยดำฝ้ากระ (Pico Toning)',
      name_en: 'Pico Laser Spot & Pigment Toning',
      summary_th: 'ลบจุดด่างดำ ปรับสีผิวสม่ำเสมอกระจ่างใส',
      parameters: { pore_refinement: 40, texture_smoothness: 50, radiance: 65 },
    },
    {
      id: 'collagen_sculptra',
      name_th: 'ฉีดกระตุ้นคอลลาเจน (Sculptra / AestheFill)',
      name_en: 'Collagen Biostimulator Firming',
      summary_th: 'ฟื้นฟูความยืดหยุ่นผิวและโครงสร้างชั้นลึก',
      parameters: { pore_refinement: 30, texture_smoothness: 60, radiance: 50 },
    },
    {
      id: 'acne_scar_subcision',
      name_th: 'เลเซอร์รักษาหลุมสิว (Scar Subcision)',
      name_en: 'Acne Scar Smoothing Subcision',
      summary_th: 'เติมเต็มหลุมสิวให้ผิวเรียบเนียนสม่ำเสมอ',
      parameters: { pore_refinement: 70, texture_smoothness: 80, radiance: 40 },
    },
  ],

  composite: [
    {
      id: 'full_face_harmony',
      name_th: 'ปรับสมดุลสัดส่วนใบหน้าองค์รวม (Full Harmony)',
      name_en: 'Full Facial Golden Ratio Harmony',
      summary_th: 'รวมหัตถการปรับ 3 ส่วน (หน้าผาก-จมูก-คาง) ให้ได้สัดส่วนทองคำ',
      parameters: { harmony_ratio: 80, symmetry_balance: 75 },
    },
    {
      id: 'youth_restoration',
      name_th: 'ย้อนวัยใบหน้า 10 ปี (Full Face Youth Reset)',
      name_en: '10-Year Full Face Youth Restoration',
      summary_th: 'เติมเต็มร่องลึกและยกกระชับโครงหน้าทั้ง 3 ชั้น',
      parameters: { harmony_ratio: 70, symmetry_balance: 65 },
    },
    {
      id: 'celebrity_glam',
      name_th: 'ปรับโครงหน้ามิติโดดเด่น (Celebrity Glam)',
      name_en: 'Celebrity High Definition Glam',
      summary_th: 'เพิ่มมิติกรอบหน้า สันจมูก และโหนกแก้มคมชัดถ่ายรูปสวยทุกมุม',
      parameters: { harmony_ratio: 85, symmetry_balance: 85 },
    },
    {
      id: 'natural_refinement',
      name_th: 'ปรับละมุนธรรมชาติ (Natural Micro Refinement)',
      name_en: 'Subtle Natural Micro Refinement',
      summary_th: 'ปรับเพียงเล็กน้อยเพื่อให้ดูดีขึ้นโดยที่คนอื่นจับไม่ได้',
      parameters: { harmony_ratio: 50, symmetry_balance: 55 },
    },
  ],
};
