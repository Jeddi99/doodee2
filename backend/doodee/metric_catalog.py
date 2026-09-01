"""The 85 facial characteristics this product talks about, and what backs each one.

Three different things get called "a metric" around here and they are not interchangeable:

  * `analysis_engine` metrics — ratios and angles measured off this face, against this face.
    Always produced, never compared to anyone else.
  * `reference_scoring` metrics — the twelve spans the published Thai study reports a mean and
    an SD for, so a z-score is possible. Everything else has no norm to score against.
  * the characteristics below — what a person actually asks about ("is my jaw wide?").

One characteristic usually needs several measurements, and several characteristics often share
one measurement, so the mapping is many-to-many and cannot be inferred from a key name. This
file is where it is written down.

`status` is derived, not declared: an entry is `measured` when something real backs it and
`not_measured` otherwise. That keeps the two from drifting apart — deleting a metric key from
the engine turns its characteristics into `not_measured` here rather than leaving a row that
claims a number nobody computes.

An entry being `not_measured` is a product statement, not a to-do. `note_th`/`note_en` say why,
and the reason is usually that a single 2D photo does not carry the information — no amount of
work on this file changes that. Those notes are meant to be shown, not hidden: telling someone
"we do not measure your hairline" is the honest answer, and inventing a hairline score is not.
"""

from functools import lru_cache

from .analysis_engine import PROFILE_VIEWS


def _profile(name):
    """A profile metric under both view prefixes, since each side is measured separately."""
    return tuple(f"{view}_{name}" for view in PROFILE_VIEWS)


def _item(number, id, group, name_th, name_en, metrics=(), reference=(), skin_signals=(),
          procedures=(), note_th=None, note_en=None):
    return {
        "number": number,
        "id": id,
        "group": group,
        "name_th": name_th,
        "name_en": name_en,
        "metrics": tuple(metrics),
        "reference": tuple(reference),
        # A third family, kept apart from `metrics` on purpose. These come from `skin_engine`
        # off the close front photograph of a skin scan, not from the landmark geometry, so a
        # face scan can produce every metric here and none of these. Folding them into
        # `metrics` would make `catalog_for` — which is handed a scan's metric keys — report a
        # skin row as available on a scan that never looked at skin.
        "skin_signals": tuple(skin_signals),
        "procedures": tuple(procedures),
        "status": "measured" if metrics or reference or skin_signals else "not_measured",
        "note_th": note_th,
        "note_en": note_en,
    }


# Reasons that apply to more than one entry, written once so they stay phrased the same way.
_NO_DEPTH_TH = "ภาพ 2 มิติภาพเดียวไม่มีข้อมูลความลึก จึงแยกไม่ได้ว่าเป็นเนื้อที่หนาขึ้นหรือโครงกระดูกที่กว้างกว่า"
_NO_DEPTH_EN = "One 2D photo carries no depth, so a fuller soft tissue and a wider bone underneath look the same."
_NEEDS_MODEL_TH = "ต้องใช้โมเดลเฉพาะทางที่แยกลักษณะนี้ออกจากผิวรอบข้าง ซึ่งแอปนี้ไม่มี — จุด 478 จุดบอกได้แค่ตำแหน่ง ไม่ได้บอกลักษณะพื้นผิว"
_NEEDS_MODEL_EN = "Needs a model trained to tell this apart from the skin around it, which this app does not have. The 478 points give position only, never surface character."

CATALOG = (
    # --- Facial proportions -------------------------------------------------------------
    _item(1, "facial_thirds", "proportions", "สัดส่วนใบหน้า 3 ส่วน", "Facial thirds",
          metrics=("upper_face_height_ratio", "midface_height_ratio", "lower_face_height_ratio", "facial_thirds_balance"),
          reference=("midface_height", "lower_face_height")),
    _item(2, "fwhr", "proportions", "อัตราส่วนความกว้างต่อความสูงใบหน้า (FWHR)", "Facial width-to-height ratio (FWHR)",
          metrics=("bizygomatic_to_upper_face_ratio", "face_width_to_height")),
    _item(3, "face_width", "proportions", "ความกว้างใบหน้า", "Face width",
          metrics=("face_width_to_height",),
          note_th="รายงานเป็นอัตราส่วนเท่านั้น ภาพถ่ายไม่มีมาตราส่วน จึงบอกเป็นมิลลิเมตรไม่ได้",
          note_en="Reported as a ratio only. A photo has no scale in it, so no millimetre value is possible."),
    _item(4, "face_height", "proportions", "ความสูงใบหน้า", "Face height",
          metrics=("face_width_to_height",),
          note_th="รายงานเป็นอัตราส่วนเท่านั้น ภาพถ่ายไม่มีมาตราส่วน จึงบอกเป็นมิลลิเมตรไม่ได้",
          note_en="Reported as a ratio only. A photo has no scale in it, so no millimetre value is possible."),
    _item(5, "midface_ratio", "proportions", "สัดส่วนกลางใบหน้า", "Midface ratio",
          metrics=("midface_height_ratio",), reference=("midface_height",)),
    _item(6, "midface_length", "proportions", "ความยาวกลางใบหน้า", "Midface length",
          metrics=("midface_height_ratio",), reference=("midface_height",)),
    _item(7, "lower_third", "proportions", "สัดส่วนใบหน้าส่วนล่าง", "Lower-third proportion",
          metrics=("lower_face_height_ratio",), reference=("lower_face_height",)),
    _item(8, "upper_third", "proportions", "สัดส่วนใบหน้าส่วนบน", "Upper-third proportion",
          metrics=("upper_face_height_ratio",)),
    _item(9, "facial_symmetry", "proportions", "ความสมมาตรของใบหน้า", "Facial symmetry",
          metrics=("eye_width_asymmetry", "brow_gap_asymmetry", "mandible_asymmetry", "alar_asymmetry", "lip_corner_asymmetry"),
          note_th="วัดความต่างซ้าย-ขวาของ 5 จุด ไม่ใช่คะแนนสมมาตรของทั้งใบหน้า และการหันหน้าเพียงไม่กี่องศาก็ทำให้ค่าเปลี่ยนได้",
          note_en="Five left-against-right differences, not a whole-face symmetry score. A head turned a few degrees moves these."),
    _item(10, "facial_harmony", "proportions", "ความกลมกลืนของสัดส่วนโดยรวม", "Facial harmony / overall proportions",
          metrics=("facial_thirds_balance", "bizygomatic_to_upper_face_ratio", "face_width_to_height"),
          note_th="รวมค่าสัดส่วนหลายตัวเข้าด้วยกัน ไม่ใช่คะแนนความสวย — ความกลมกลืนเป็นเรื่องของรสนิยมและวัฒนธรรม",
          note_en="Several proportions read together, not an attractiveness score. Harmony is a matter of taste and culture."),

    # --- Eyes ---------------------------------------------------------------------------
    _item(11, "eye_shape", "eyes", "รูปทรงดวงตา", "Eye shape",
          metrics=("right_eye_aspect_ratio", "left_eye_aspect_ratio", "right_canthal_tilt_deg", "left_canthal_tilt_deg"),
          procedures=("eyes-open", "eyes-soft")),
    _item(12, "eye_size", "eyes", "ขนาดดวงตา", "Eye size",
          metrics=("right_eye_width_ratio", "left_eye_width_ratio", "right_eye_aspect_ratio", "left_eye_aspect_ratio"),
          reference=("eye_fissure",), procedures=("eyes-open", "eyes-soft")),
    _item(13, "eye_width", "eyes", "ความกว้างดวงตา", "Eye width",
          metrics=("right_eye_width_ratio", "left_eye_width_ratio"), reference=("eye_fissure",)),
    _item(14, "eye_spacing", "eyes", "ระยะห่างระหว่างดวงตา", "Eye spacing",
          metrics=("intercanthal_ratio", "eye_separation_ratio"), reference=("intercanthal",)),
    _item(15, "intercanthal_distance", "eyes", "ระยะระหว่างหัวตา", "Intercanthal distance",
          metrics=("intercanthal_ratio",), reference=("intercanthal",)),
    _item(16, "canthal_tilt", "eyes", "ความเอียงหางตา", "Canthal tilt",
          metrics=("right_canthal_tilt_deg", "left_canthal_tilt_deg"),
          procedures=("outer-corner-lift", "outer-corner-lower")),
    _item(17, "eye_aspect_ratio", "eyes", "อัตราส่วนความสูงต่อความกว้างของตา", "Eye aspect ratio",
          metrics=("right_eye_aspect_ratio", "left_eye_aspect_ratio"), procedures=("eyes-open", "eyes-soft")),
    _item(18, "eye_symmetry", "eyes", "ความสมมาตรของดวงตาสองข้าง", "Eye symmetry",
          metrics=("eye_width_asymmetry",)),
    _item(19, "upper_eyelid_exposure", "eyes", "การเปิดของเปลือกตาบน", "Upper-eyelid exposure",
          note_th="ต้องใช้ตำแหน่งรอยพับเปลือกตา แต่จุดเปลือกตาบนของ mesh อยู่ที่ขอบขนตาเท่านั้น ไม่ได้อยู่ที่รอยพับ",
          note_en="Needs the position of the lid crease, and the mesh's upper-lid points sit on the lash line, not on the crease."),
    _item(20, "under_eye_area", "eyes", "ใต้ตา / เปลือกตาล่าง", "Under-eye / lower-eyelid area",
          skin_signals=("undereye_shadow",),
          note_th="วัดได้เฉพาะความเข้มของเงาใต้ตาเทียบกับแก้มตัวเอง ไม่ได้วัดความลึกของร่องหรือถุงใต้ตา",
          note_en="Only the shadow under the eye against this face's own cheek. Not the depth of a hollow or a bag."),
    _item(21, "eye_to_face_proportion", "eyes", "สัดส่วนดวงตาต่อใบหน้า", "Eye-to-face proportion",
          metrics=("right_eye_width_ratio", "left_eye_width_ratio")),
    _item(22, "eye_separation_ratio", "eyes", "อัตราส่วนระยะห่างดวงตาต่อความกว้างโหนกแก้ม", "Eye separation ratio",
          metrics=("eye_separation_ratio",),
          note_th="ตัวหารคือระยะระหว่างจุด landmark แก้มสองข้าง ซึ่งกว้างกว่าจุด zygion ที่ใช้วัดจริง ค่าที่ได้จึงต่ำกว่าเลข 0.45 ที่มักอ้างถึงอย่างเป็นระบบ ห้ามนำไปเทียบกับตัวเลขนั้นตรง ๆ",
          note_en="The denominator is the span between the two cheek landmarks, which is wider than the zygion points the published figure uses, so this reads systematically below the 0.45 often quoted. Not comparable to that number directly."),

    # --- Eyebrows -----------------------------------------------------------------------
    _item(23, "eyebrow_position", "brows", "ตำแหน่งคิ้ว", "Eyebrow position",
          metrics=("right_brow_eye_gap_ratio", "left_brow_eye_gap_ratio"),
          procedures=("brow-lift", "brow-lower")),
    _item(24, "eyebrow_height", "brows", "ความสูงของคิ้ว", "Eyebrow height",
          metrics=("right_brow_eye_gap_ratio", "left_brow_eye_gap_ratio"),
          procedures=("brow-lift", "brow-lower")),
    _item(25, "eyebrow_shape", "brows", "รูปทรงคิ้ว", "Eyebrow shape",
          note_th="ต้องรู้ตำแหน่งจุดสูงสุดของส่วนโค้ง แต่จุดคิ้วของ mesh เกาะตามสันกระดูกเบ้าตา ไม่ได้เกาะขอบคิ้วที่กันหรือเขียนไว้",
          note_en="Needs where the arch peaks, and the mesh's brow points follow the bony ridge rather than the edge of the brow as it was plucked or drawn."),
    _item(26, "eyebrow_tilt", "brows", "ความเอียงของคิ้ว", "Eyebrow tilt",
          metrics=("right_brow_tilt_deg", "left_brow_tilt_deg"),
          procedures=("brow-tail-lift", "brow-tail-lower")),
    _item(27, "brow_to_eye_distance", "brows", "ระยะจากคิ้วถึงตา", "Brow-to-eye distance",
          metrics=("right_brow_eye_gap_ratio", "left_brow_eye_gap_ratio", "brow_gap_asymmetry"),
          procedures=("brow-lift", "brow-lower")),

    # --- Nose ---------------------------------------------------------------------------
    _item(28, "nose_width", "nose", "ความกว้างจมูก", "Nose width",
          metrics=("alar_width_ratio",), reference=("alar_width",), procedures=("nose-narrow", "nose-wide")),
    _item(29, "nose_length", "nose", "ความยาวจมูก", "Nose length",
          metrics=("nose_length_ratio",), reference=("midface_height",)),
    _item(30, "nose_to_face_width", "nose", "อัตราส่วนความกว้างจมูกต่อใบหน้า", "Nose-to-face width ratio",
          metrics=("alar_width_ratio",), procedures=("nose-narrow", "nose-wide")),
    _item(31, "nose_proportion", "nose", "สัดส่วนจมูก (กว้างต่อยาว)", "Nose proportion",
          metrics=("nose_proportion_ratio",)),
    _item(32, "alar_width", "nose", "ความกว้างฐานปีกจมูก", "Alar width",
          metrics=("alar_width_ratio",), reference=("alar_width",), procedures=("nose-narrow", "nose-wide")),
    _item(33, "nose_symmetry", "nose", "ความสมมาตรของจมูก", "Nose symmetry",
          metrics=("alar_asymmetry",)),
    _item(34, "nasal_tip_projection", "nose", "การยื่นของปลายจมูก (จากภาพด้านข้าง)", "Nasal tip projection",
          metrics=_profile("nose_projection_ratio"),
          procedures=("nose-tip-projection", "nose-tip-retraction")),
    _item(35, "nasofrontal_angle", "nose", "มุมหน้าผาก-จมูก", "Nasofrontal angle",
          reference=("nasofrontal_angle",)),
    _item(36, "nasolabial_angle", "nose", "มุมจมูก-ริมฝีปาก", "Nasolabial angle",
          reference=("nasolabial_angle",)),

    # --- Lips / mouth -------------------------------------------------------------------
    _item(37, "mouth_width", "lips", "ความกว้างปาก", "Mouth width",
          metrics=("mouth_width_ratio",), procedures=("lip-wide", "lip-narrow")),
    _item(38, "lip_width", "lips", "ความกว้างริมฝีปาก", "Lip width",
          metrics=("mouth_width_ratio",), procedures=("lip-wide", "lip-narrow")),
    _item(39, "upper_lip_height", "lips", "ความหนาริมฝีปากบน", "Upper-lip height",
          reference=("upper_vermillion",), procedures=("lip-volume", "lip-thin")),
    _item(40, "lower_lip_height", "lips", "ความหนาริมฝีปากล่าง", "Lower-lip height",
          reference=("lower_vermillion",), procedures=("lip-volume", "lip-thin")),
    _item(41, "upper_lower_lip_ratio", "lips", "อัตราส่วนริมฝีปากบนต่อล่าง", "Upper/lower lip ratio",
          metrics=("upper_lower_lip_ratio",)),
    _item(42, "lip_fullness", "lips", "ความอิ่มของริมฝีปาก", "Lip fullness",
          metrics=("lip_fullness_ratio",), reference=("upper_vermillion", "lower_vermillion"),
          procedures=("lip-volume", "lip-thin")),
    _item(43, "lip_symmetry", "lips", "ความสมมาตรของริมฝีปาก", "Lip symmetry",
          metrics=("lip_corner_asymmetry",)),
    _item(44, "mouth_to_nose_proportion", "lips", "สัดส่วนปากต่อจมูก", "Mouth-to-nose proportion",
          metrics=("mouth_to_nose_ratio",)),
    _item(45, "philtrum_length", "lips", "ความยาวร่องริมฝีปากบน", "Philtrum length",
          metrics=("philtrum_ratio",), reference=("upper_lip_length",)),
    _item(46, "philtrum_proportion", "lips", "สัดส่วนร่องริมฝีปากบน", "Philtrum proportion",
          metrics=("philtrum_ratio", "chin_philtrum_ratio")),

    # --- Jaw / chin ---------------------------------------------------------------------
    _item(47, "jaw_width", "jaw_chin", "ความกว้างกราม", "Jaw width",
          metrics=("jaw_width_ratio",), procedures=("jaw-narrow", "jaw-wide")),
    _item(48, "jaw_to_face_width", "jaw_chin", "อัตราส่วนความกว้างกรามต่อใบหน้า", "Jaw-to-face width ratio",
          metrics=("jaw_width_ratio",), procedures=("jaw-narrow", "jaw-wide")),
    _item(49, "jaw_shape", "jaw_chin", "รูปทรงกราม", "Jaw shape",
          metrics=("jaw_width_ratio", "chin_width_ratio", "right_gonial_angle_deg", "left_gonial_angle_deg"),
          procedures=("jaw-narrow", "jaw-wide", "jaw-angle-lift")),
    _item(50, "gonial_angle", "jaw_chin", "มุมกราม", "Gonial angle",
          metrics=("right_gonial_angle_deg", "left_gonial_angle_deg"),
          procedures=("jaw-angle-lift", "jaw-angle-lower"),
          note_th="วัดจากภาพหน้าตรงเป็นค่าประมาณ มุมกรามจริงอ่านจากฟิล์มเอกซเรย์ด้านข้าง ค่านี้บอกได้แค่ว่ากรามดูเหลี่ยมแค่ไหนจากด้านหน้า",
          note_en="A front-view approximation. The real gonial angle is read off a lateral radiograph; this only tracks how square the jaw looks from the front."),
    _item(51, "chin_width", "jaw_chin", "ความกว้างคาง", "Chin width",
          metrics=("chin_width_ratio",)),
    _item(52, "chin_height", "jaw_chin", "ความสูงคาง", "Chin height",
          metrics=("chin_height_ratio",), reference=("chin_height",), procedures=("chin-long", "chin-short")),
    _item(53, "chin_projection", "jaw_chin", "การยื่นของคาง", "Chin projection",
          metrics=_profile("chin_projection_ratio"), procedures=("chin-projection", "chin-retraction")),
    _item(54, "chin_to_philtrum_ratio", "jaw_chin", "อัตราส่วนคางต่อร่องริมฝีปากบน", "Chin-to-philtrum ratio",
          metrics=("chin_philtrum_ratio",)),
    _item(55, "mandibular_projection", "jaw_chin", "การยื่นของขากรรไกรล่าง", "Mandibular projection",
          metrics=_profile("facial_convexity_ratio"), reference=("facial_convexity_angle",)),
    _item(56, "jawline_definition", "jaw_chin", "ความคมของแนวกราม", "Jawline definition",
          note_th="เป็นเรื่องของความคมชัดของขอบเงา ไม่ใช่ระยะทาง ค่าที่วัดได้จะเปลี่ยนตามทิศทางแสงมากกว่าตามรูปกราม",
          note_en="A matter of edge contrast rather than a distance. Any number for it moves with the direction of the light more than with the jaw."),

    # --- Cheek / midface ----------------------------------------------------------------
    _item(57, "cheekbone_width", "cheeks", "ความกว้างโหนกแก้ม", "Cheekbone width",
          metrics=("zygomatic_width_ratio",), procedures=("cheek-wide", "cheek-narrow")),
    _item(58, "bizygomatic_width", "cheeks", "ความกว้างระหว่างโหนกแก้ม", "Bizygomatic width",
          metrics=("zygomatic_width_ratio", "bizygomatic_to_upper_face_ratio"),
          procedures=("cheek-wide", "cheek-narrow")),
    _item(59, "cheekbone_prominence", "cheeks", "ความเด่นของโหนกแก้ม", "Cheekbone prominence",
          metrics=("cheekbone_prominence_ratio",), procedures=("cheek-wide", "cheek-narrow", "cheek-lift")),
    _item(60, "midface_projection", "cheeks", "การยื่นของกลางใบหน้า", "Midface projection",
          note_th="จุดสูงสุดของโหนกแก้มไม่ได้อยู่บนแนวกลางใบหน้า ในภาพด้านข้างจึงตกอยู่ฝั่งไกลที่ mesh ประมาณเอา ไม่ได้มองเห็นจริง",
          note_en="The malar high point is not on the midline, so on a profile photo it falls on the far side, where the mesh infers rather than sees."),
    _item(61, "midface_width", "cheeks", "ความกว้างกลางใบหน้า", "Midface width",
          metrics=("zygomatic_width_ratio",)),
    _item(62, "facial_convexity", "cheeks", "ความโค้งนูนของใบหน้า", "Facial convexity",
          metrics=_profile("facial_convexity_ratio"), reference=("facial_convexity_angle",)),

    # --- Side profile -------------------------------------------------------------------
    _item(63, "facial_profile_angle", "side_profile", "มุมด้านข้างของใบหน้า", "Facial profile angle",
          reference=("facial_convexity_angle",), metrics=_profile("facial_convexity_ratio")),
    _item(64, "facial_convexity_angle", "side_profile", "มุมความโค้งนูนของใบหน้า", "Facial convexity angle",
          reference=("facial_convexity_angle",)),
    _item(65, "nasofrontal_angle_profile", "side_profile", "มุมหน้าผาก-จมูก", "Nasofrontal angle",
          reference=("nasofrontal_angle",)),
    _item(66, "nasolabial_angle_profile", "side_profile", "มุมจมูก-ริมฝีปาก", "Nasolabial angle",
          reference=("nasolabial_angle",)),
    _item(67, "mentolabial_angle", "side_profile", "มุมร่องใต้ริมฝีปากล่าง-คาง", "Mentolabial angle",
          metrics=_profile("mentolabial_angle_deg"),
          note_th="วัดจากจุด landmark ที่ร่องใต้ริมฝีปาก ซึ่งตื้นกว่าจุด B ที่ใช้ทางคลินิก ค่าที่ได้จึงสูงกว่าช่วง 120-130 องศาที่อ้างในตำราอย่างเป็นระบบ ใช้เทียบการเปลี่ยนแปลงของหน้าเดียวกันได้ แต่ห้ามเทียบกับค่าในตำราตรง ๆ",
          note_en="Taken at a landmark in the labiomental fold, which is shallower than the clinical B point, so it reads systematically higher than the 120-130 degrees textbooks quote. Usable for comparing one face against itself, not against a published figure."),
    _item(68, "chin_projection_profile", "side_profile", "การยื่นของคาง (ด้านข้าง)", "Chin projection",
          metrics=_profile("chin_projection_ratio"), procedures=("chin-projection", "chin-retraction")),
    _item(69, "nose_projection", "side_profile", "การยื่นของจมูก", "Nose projection",
          metrics=_profile("nose_projection_ratio"), procedures=("nose-tip-projection", "nose-tip-retraction")),
    _item(70, "lip_projection", "side_profile", "การยื่นของริมฝีปาก", "Lip projection",
          metrics=_profile("upper_lip_eline_ratio") + _profile("lower_lip_eline_ratio")),
    _item(71, "e_line", "side_profile", "เส้น E-line (Ricketts)", "E-line / Ricketts aesthetic line",
          metrics=_profile("upper_lip_eline_ratio") + _profile("lower_lip_eline_ratio"),
          note_th="ค่าเป็นบวกเมื่อริมฝีปากอยู่หน้าเส้น เป็นลบเมื่ออยู่หลังเส้น และใช้ปลายคางแทนจุด pogonion",
          note_en="Positive when the lip sits in front of the line, negative when behind. Menton stands in for pogonion."),
    _item(72, "jaw_chin_relationship", "side_profile", "ความสัมพันธ์ของกรามกับคาง", "Jaw/chin relationship",
          metrics=_profile("chin_projection_ratio") + _profile("mentolabial_angle_deg"),
          reference=("facial_convexity_angle",)),

    # --- Skin / soft tissue -------------------------------------------------------------
    _item(73, "skin_quality", "skin", "คุณภาพผิวโดยรวม", "Skin quality",
          skin_signals=("tone_spread", "texture", "cheek_redness", "nose_redness", "tzone_shine"),
          note_th="เป็นค่าที่อ่านจากภาพถ่ายเท่านั้น เปลี่ยนตามแสงและการปรับภาพของกล้องมากพอ ๆ กับตามผิวจริง ไม่ใช่การวินิจฉัย",
          note_en="Read off one photo, and it moves with the lighting and the camera's sharpening about as much as with the skin. Not a diagnosis."),
    _item(74, "skin_texture", "skin", "พื้นผิวของผิวหน้า", "Skin texture",
          skin_signals=("texture",)),
    _item(75, "acne", "skin", "สิว", "Acne",
          note_th="ต้องใช้โมเดลตรวจจับรอยโรคและเกณฑ์การให้ระดับทางคลินิก ค่าความแปรปรวนของภาพแยกสิวออกจากกระหรือเงาไม่ได้",
          note_en="Needs a lesion detector and a clinical grading scale. An image-variance number cannot tell a spot from a freckle or a shadow."),
    _item(76, "pigmentation", "skin", "ความสม่ำเสมอของสีผิว", "Pigmentation",
          skin_signals=("tone_spread",),
          note_th="บอกได้แค่ว่าสีผิวไม่สม่ำเสมอแค่ไหน ไม่ได้บอกว่าอยู่ตรงไหนหรือเป็นชนิดใด",
          note_en="Only how uneven the tone is, never where it is or what kind."),
    _item(77, "wrinkles", "skin", "ริ้วรอย", "Wrinkles / fine lines",
          note_th="ในภาพนิ่งภาพเดียว ริ้วรอยถาวรกับรอยพับจากการแสดงสีหน้าหน้าตาเหมือนกัน ต้องใช้โมเดลเฉพาะและภาพที่หน้านิ่งจริง",
          note_en="In a single still, a settled line and a crease from expression look the same. Needs a dedicated model and a genuinely neutral capture."),
    _item(78, "under_eye_darkness", "skin", "ความคล้ำใต้ตา", "Under-eye darkness",
          skin_signals=("undereye_shadow",),
          note_th="เทียบความสว่างใต้ตากับแก้มของหน้าเดียวกัน จึงตัดผลของสีผิวและแสงห้องออกไปได้บางส่วน แต่เงาจากไฟที่ส่องจากด้านบนก็ให้ค่าเดียวกัน",
          note_en="The band under the eye against this face's own cheek, which divides out most of skin tone and room light. A lamp above the head still reads the same."),
    _item(79, "facial_adiposity", "skin", "ปริมาณไขมันบนใบหน้า", "Facial adiposity / facial fat",
          note_th=_NO_DEPTH_TH, note_en=_NO_DEPTH_EN),
    _item(80, "facial_leanness", "skin", "ความคมของโครงหน้า", "Facial leanness",
          note_th=_NO_DEPTH_TH, note_en=_NO_DEPTH_EN),

    # --- Hair / grooming ----------------------------------------------------------------
    _item(81, "hairline", "hair", "แนวไรผม", "Hairline",
          note_th="จุดบนสุดของ mesh ถูกวางไว้ที่ตำแหน่งคงที่บนหน้าผาก ไม่ใช่ที่ไรผมจริง ผมหน้าม้าหรือหมวกก็ทำให้เลื่อนได้",
          note_en="The mesh's topmost point is pinned to a fixed spot on the forehead, not to the actual hairline. A fringe or a hat moves it."),
    _item(82, "hair_density", "hair", "ความหนาแน่นของเส้นผม", "Hair density/appearance",
          note_th="ไม่มีจุด landmark อยู่ในบริเวณเส้นผมเลย " + _NEEDS_MODEL_TH,
          note_en="There are no landmarks in hair at all. " + _NEEDS_MODEL_EN),
    _item(83, "eyebrow_grooming", "hair", "การจัดแต่งคิ้ว", "Eyebrow grooming",
          note_th="เป็นการตัดสินเรื่องการจัดแต่ง ไม่ใช่สัดส่วนที่วัดได้ และขึ้นกับความชอบของแต่ละคน",
          note_en="A judgement about grooming rather than a proportion, and one that depends on personal taste."),
    _item(84, "facial_hair", "hair", "หนวดเครา", "Facial hair",
          note_th=_NEEDS_MODEL_TH, note_en=_NEEDS_MODEL_EN),
    _item(85, "hairstyle_compatibility", "hair", "ความเข้ากันของทรงผม", "Hairstyle compatibility",
          note_th="เป็นคำแนะนำด้านการแต่งตัว ไม่ใช่การวัด ขึ้นกับความชอบและโอกาสที่ใช้ ซึ่งแอปนี้ไม่มีข้อมูล",
          note_en="A styling recommendation, not a measurement. It turns on preference and occasion, which this app knows nothing about."),
)

# Side views are shot with the head turned far enough that the screen cannot be seen, so the
# capture gate accepts up to 18 degrees of head tilt on them rather than the 10 it once did —
# without that, scanning alone was not possible at all. Tilt within that window still skews what a
# profile measures, so every side_profile item carries the caveat instead of a chosen few: the
# reader cannot tell from a number which of them the tilt happened to affect.
_TILT_NOTE_TH = ("ภาพด้านข้างยอมรับการเอียงศีรษะได้ถึง 18 องศา เพื่อให้ถ่ายเองคนเดียวได้ "
                 "การเอียงในช่วงนี้ทำให้ค่าที่วัดจากภาพด้านข้างคลาดเคลื่อนได้บ้าง "
                 "จึงควรใช้เทียบการเปลี่ยนแปลงของตัวเองมากกว่าอ่านเป็นค่าสัมบูรณ์")
_TILT_NOTE_EN = ("Side views accept up to 18 degrees of head tilt so the scan can be taken alone. "
                 "Tilt inside that window still skews what a profile measures, so read these as a "
                 "trend against your own earlier scans rather than as absolute figures.")

CATALOG = tuple(
    item if item["group"] != "side_profile" else {
        **item,
        "note_th": f"{item['note_th']} · {_TILT_NOTE_TH}" if item.get("note_th") else _TILT_NOTE_TH,
        "note_en": f"{item['note_en']} · {_TILT_NOTE_EN}" if item.get("note_en") else _TILT_NOTE_EN,
    }
    for item in CATALOG
)

GROUPS = ("proportions", "eyes", "brows", "nose", "lips", "jaw_chin", "cheeks", "side_profile", "skin", "hair")

GROUP_LABELS = {
    "proportions": ("สัดส่วนใบหน้า", "Facial proportions"),
    "eyes": ("ดวงตา", "Eyes / eye area"),
    "brows": ("คิ้ว", "Eyebrows"),
    "nose": ("จมูก", "Nose"),
    "lips": ("ปากและริมฝีปาก", "Lips / mouth"),
    "jaw_chin": ("กรามและคาง", "Jaw / chin"),
    "cheeks": ("แก้มและกลางใบหน้า", "Cheek / midface"),
    "side_profile": ("ด้านข้าง", "Side profile"),
    "skin": ("ผิวและเนื้อเยื่อ", "Skin / soft tissue"),
    "hair": ("ผมและการจัดแต่ง", "Hair / grooming"),
}


@lru_cache(maxsize=1)
def coverage():
    """How much of the catalog this build actually measures, for the disclosure copy.

    Counted rather than written down, so the number on the screen cannot claim more than the
    engine produces.

    Cached and counted in a single pass. CATALOG is a module constant, so the answer is fixed for
    the life of the process, and it was being recounted -- once per group, twice, plus three whole-
    catalog passes -- on every request for the catalogue.
    """
    total_by_group = dict.fromkeys(GROUPS, 0)
    measured_by_group = dict.fromkeys(GROUPS, 0)
    measured = with_reference = from_skin_scan = 0
    for item in CATALOG:
        group = item["group"]
        if group in total_by_group:
            total_by_group[group] += 1
        if item["status"] == "measured":
            measured += 1
            if group in measured_by_group:
                measured_by_group[group] += 1
        if item["reference"]:
            with_reference += 1
        if item["skin_signals"]:
            from_skin_scan += 1
    return {
        "total": len(CATALOG),
        "measured": measured,
        "not_measured": len(CATALOG) - measured,
        "with_reference": with_reference,
        # Rows that only a skin scan can fill. Counted separately because a face scan reporting
        # "72 of 85 measured" would be claiming rows its photographs never looked at.
        "from_skin_scan": from_skin_scan,
        "by_group": {
            group: {"total": total_by_group[group], "measured": measured_by_group[group]}
            for group in GROUPS
        },
    }


def catalog_for(metric_keys=(), reference_keys=(), skin_signal_keys=()):
    """The catalog annotated with what a particular scan actually produced.

    A scan without profile photos has no E-line, a scan of a minor has no reference scores at
    all, and a face scan has no skin signals, so `available` is per scan while `status` is per
    build. The three families are checked separately because they come from different
    photographs and a row can be backed by any one of them.
    """
    metric_keys, reference_keys = set(metric_keys), set(reference_keys)
    skin_signal_keys = set(skin_signal_keys)
    return tuple({
        **item,
        "available": bool((set(item["metrics"]) & metric_keys)
                          or (set(item["reference"]) & reference_keys)
                          or (set(item["skin_signals"]) & skin_signal_keys)),
    } for item in CATALOG)
