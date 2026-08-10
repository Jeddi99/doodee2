"""Closed catalog for educational local facial simulations.

Legacy values are intentionally retained only as inputs to the documented
legacy/1000 conversion. They are visual limits, not treatment amounts.
"""


def _preset(id, region, name_th, name_en, legacy_value, measurement_key, movement, source_view="front", related=()):
    delta = max(-0.05, min(0.05, legacy_value / 1000))
    return {
        "id": id,
        "region": region,
        "name_th": name_th,
        "name_en": name_en,
        "warpable": True,
        "source_view": source_view,
        "delta": round(delta, 4),
        "measurement_key": measurement_key,
        "movement": movement,
        "related_procedures": list(related)[:3],
        "status": "educational_simulation",
    }


PROCEDURES = (
    _preset("eyes-open", "eyes", "เปิดดวงตา", "More open", 40, "eye_aspect_ratio", "eye_open", related=("Blepharoplasty",)),
    _preset("eyes-soft", "eyes", "ลดความเปิดดวงตา", "Softer opening", -40, "eye_aspect_ratio", "eye_open", related=("Blepharoplasty",)),
    _preset("outer-corner-lift", "eyes", "ยกหางตา", "Outer corners raised", 30, "outer_corner_position", "eye_corner", related=("Canthoplasty", "Brow lift")),
    _preset("outer-corner-lower", "eyes", "ลดหางตา", "Outer corners lowered", -30, "outer_corner_position", "eye_corner", related=("Canthoplasty",)),
    _preset("nose-narrow", "nose", "ฐานจมูกแคบลง", "Narrower alar base", -40, "alar_width_ratio", "width", related=("Alar base reduction", "Open rhinoplasty", "Closed rhinoplasty")),
    _preset("nose-wide", "nose", "ฐานจมูกกว้างขึ้น", "Wider alar base", 40, "alar_width_ratio", "width", related=("Rhinoplasty",)),
    _preset("nose-tip-projection", "nose", "ปลายจมูกยื่นขึ้น", "More tip projection", 45, "nose_projection_ratio", "profile", "profile", ("Open rhinoplasty", "Closed rhinoplasty", "Nasal filler")),
    _preset("nose-tip-retraction", "nose", "ปลายจมูกถอยลง", "Less tip projection", -45, "nose_projection_ratio", "profile", "profile", ("Open rhinoplasty", "Closed rhinoplasty")),
    _preset("lip-volume", "lips", "ริมฝีปากอิ่มขึ้น", "Fuller lips", 50, "lip_height_ratio", "lip_height", related=("Lip filler", "Fat grafting")),
    _preset("lip-thin", "lips", "ริมฝีปากบางลง", "Thinner lips", -50, "lip_height_ratio", "lip_height", related=("Lip reduction",)),
    _preset("lip-wide", "lips", "ริมฝีปากกว้างขึ้น", "Wider lips", 40, "mouth_width_ratio", "lip_width", related=("Lip filler",)),
    _preset("lip-narrow", "lips", "ริมฝีปากแคบลง", "Narrower lips", -40, "mouth_width_ratio", "lip_width", related=("Lip contouring",)),
    _preset("cheek-wide", "cheeks", "แนวแก้มกว้างขึ้น", "Wider cheeks", 50, "zygomatic_width_ratio", "width", related=("Cheek filler", "Fat grafting", "Cheek implant")),
    _preset("cheek-narrow", "cheeks", "แนวแก้มแคบลง", "Narrower cheeks", -50, "zygomatic_width_ratio", "width", related=("Cheek contouring",)),
    _preset("cheek-lift", "cheeks", "ยกแนวแก้ม", "Cheeks raised", 30, "cheek_position", "vertical", related=("Cheek filler", "Thread lift")),
    _preset("cheek-lower", "cheeks", "ลดแนวแก้ม", "Cheeks lowered", -30, "cheek_position", "vertical", related=("Cheek contouring",)),
    _preset("jaw-narrow", "jaw", "แนวกรามแคบลง", "Narrower jaw", -50, "jaw_width_ratio", "width", related=("Jaw contouring", "Mandibular angle reduction")),
    _preset("jaw-wide", "jaw", "แนวกรามกว้างขึ้น", "Wider jaw", 50, "jaw_width_ratio", "width", related=("Jaw filler",)),
    _preset("jaw-angle-lift", "jaw", "ยกมุมกราม", "Jaw angles raised", 30, "jaw_angle_position", "vertical", related=("Jaw contouring", "Thread lift")),
    _preset("jaw-angle-lower", "jaw", "ลดมุมกราม", "Jaw angles lowered", -30, "jaw_angle_position", "vertical", related=("Jaw filler",)),
    _preset("chin-long", "chin", "คางยาวขึ้น", "Longer chin", 45, "chin_height_ratio", "chin_height", related=("Chin filler", "Chin implant", "Genioplasty")),
    _preset("chin-short", "chin", "คางสั้นลง", "Shorter chin", -45, "chin_height_ratio", "chin_height", related=("Genioplasty",)),
    _preset("chin-projection", "chin", "คางยื่นขึ้น", "More chin projection", 50, "chin_projection_ratio", "profile", "profile", ("Chin filler", "Chin implant", "Genioplasty")),
    _preset("chin-retraction", "chin", "คางถอยลง", "Less chin projection", -50, "chin_projection_ratio", "profile", "profile", ("Genioplasty",)),
)


def get_preset(preset_id):
    return next((preset for preset in PROCEDURES if preset["id"] == preset_id), None)
