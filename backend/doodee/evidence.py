"""Measured tissue movement per procedure, taken from published clinical studies.

Kept apart from the rest of the code on purpose. Everything in here is a claim about the real
world that someone can check against a paper, so it must stay auditable: each entry says how far
tissue actually moved, at what dose, measured how, and where that came from.

The important thing this file records is how small real changes are. A millilitre of lip filler
moves the lip about one millimetre. Before this existed the sliders were scaled by a constant
chosen only to keep the warp mathematically safe, which overstated a masseter toxin result by
about five times and a cheek filler result by roughly ten.

`status` is the part to read first:
    measured   — a study reports this movement in millimetres for a stated dose
    derived    — a study reports the effect, but the millimetres are inferred from related figures
    estimated  — no study found; the number is a placeholder and the UI says so

Doses scale linearly with the effect here. That is a simplification — real tissue response
flattens out at higher volumes — but it holds well enough over the narrow range clinics actually
work in, and it is the assumption the midface study's "mm per mL" figure already makes.
"""

#: Average adult interpupillary distance. Used as the ruler that turns millimetres into pixels,
#: because it is stable across adults and both irises are landmarks MediaPipe already returns.
IPD_MM = 63.0
IRIS_LEFT, IRIS_RIGHT = 468, 473

#: How far the "show me clearly" control may exaggerate the measured movement. Anything above
#: this stops being an aid to seeing the direction of change and starts being a different face.
AMPLIFY_MAX = 3.0

SOURCES = {
    "lip-3d": (
        "Lip Lifting Efficacy of Hyaluronic Acid Filler Injections: A Quantitative Assessment "
        "Using 3-Dimensional Photography",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC9369503/"),
    "chin-3d": (
        "Optimizing Dermal Filler for Chin and Jawline Definition — Prospective Case Series With "
        "Ultrasonographic and 3D Facial Imaging Evaluation",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC12811921/"),
    "masseter-us": (
        "Does Botulinum Toxin Injection into Masseter Muscles Affect Subcutaneous Thickness?",
        "https://pubmed.ncbi.nlm.nih.gov/29117291/"),
    "masseter-guided": (
        "Ultrasound-Guided Botulinum Toxin-A Injections into the Masseter Muscle",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC11511025/"),
    "midface-plla": (
        "Midface Projection Using Biostimulatory Poly-l-Lactic Acid Injectable Implant",
        "https://doi.org/10.1097/DSS.0000000000004434"),
    "nose-anthro": (
        "Filler Rhinoplasty Evaluated by Anthropometric Analysis",
        "https://pubmed.ncbi.nlm.nih.gov/27465254/"),
}

STATUS_LABELS = {
    "measured": ("วัดจากงานวิจัย", "#2f7f5b"),
    "derived": ("แปลงจากงานวิจัย", "#9a7b1f"),
    "estimated": ("ยังไม่มีงานวิจัยรองรับ", "#a3305a"),
}

#: The steps offered instead of a bare 0-100 slider. `share` is the fraction of the studied dose,
#: so the millimetres and the dose on the record always move together.
#:
#: "สูงสุด" deliberately goes past 1.0. Clinics do treat above the dose these studies measured —
#: the chin and jawline series allowed up to 6 mL per patient against the 1-2 mL it measured the
#: projection from, and midface work averages 6.8 mL for an initial session. So the step is
#: anchored to a real reported ceiling rather than invented, but the movement it predicts is a
#: straight-line extrapolation past the measured range, and tissue does not respond in a straight
#: line that far out. Everything above SETTING_MEASURED is labelled as extrapolated for that
#: reason: it shows the direction of a heavy treatment, not a result anyone should expect.
LEVELS = (
    ("light", "เบา", "Light", .45),
    ("medium", "กลาง", "Medium", .72),
    ("strong", "ชัด", "Strong", 1.0),
    ("max", "สูงสุด", "Max", 3.0),
)

#: Above this the dose leaves the range the studies actually measured.
SETTING_MEASURED = 100
SETTING_MAX = 300


def _e(mm, unit, dose, status, procedure, measured, source, note="", reverse=None):
    """mm: movement at the top dose. dose: that top dose, in `unit`.

    `reverse` is what happens when the control is pulled below zero, and it is a whole separate
    entry rather than a minus sign because the opposite direction is a different treatment. A
    wider jaw is filler; a narrower one is toxin into the masseter. Reporting "filler -2.0 cc"
    would be a quantity no clinic can act on, so each direction carries its own procedure name,
    unit and dose.
    """
    return {"mm": mm, "unit": unit, "dose": dose, "status": status, "procedure": procedure,
            "measured": measured, "source": source, "note": note, "reverse": reverse}


_NO_STUDY = "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตรสำหรับทิศนี้"


def _r(unit, dose, procedure, note=""):
    """The downward side of a control. Movement mirrors the upward side; the treatment does not.

    The millimetres are deliberately taken from the forward direction: it is the same measurement
    on the same axis, and inventing a second figure for the reverse would be a medical claim with
    nothing behind it. What is genuinely different -- the procedure, its unit and its dose -- is
    stated here, and the status is always `estimated` because none of these directions were found
    measured in millimetres.
    """
    return {"unit": unit, "dose": dose, "status": "estimated", "procedure": procedure,
            "measured": _NO_STUDY, "source": None, "note": note}


#: control key -> how far the tissue moves at the top of the slider, and what it costs to get it.
EVIDENCE = {
    # ---------------------------------------------------------------- measured
    "chinProjection": _e(
        3.0, "cc", 2.0, "measured", "ฟิลเลอร์คาง (HA)",
        "3D imaging + อัลตราซาวด์ · ยื่นขึ้น 1.8-3.0 มม. ที่ 1-2 cc เฉลี่ย 2.3", "chin-3d",
        reverse=_r("ครั้ง", 1, "ผ่าตัดเลื่อนกระดูกคางถอยหลัง")),
    "lipVolume": _e(
        1.1, "cc", 1.0, "measured", "ฟิลเลอร์ปาก (HA)",
        "3D photography · ปากบนออก 0.7-1.1 มม. ล่าง 0.8-0.9 มม. ที่ 1 cc", "lip-3d",
        reverse=_r("ครั้ง", 1, "ผ่าตัดลดขนาดริมฝีปาก")),
    "jawBotox": _e(
        1.6, "ยูนิต", 100, "measured", "โบทูลินัมท็อกซิน masseter",
        "อัลตราซาวด์ · ความหนา 13.4 → 11.8 มม. ที่ 4 สัปดาห์ (ต่อข้าง)", "masseter-us"),
    "cheekFiller": _e(
        1.6, "cc", 4.5, "measured", "ฟิลเลอร์แก้ม",
        "3D imaging · นูนขึ้น 1.12-1.62 มม. ที่ 2.84-4.88 cc (≈0.33-0.57 มม./cc)",
        "midface-plla"),

    # ---------------------------------------------------------------- derived
    "noseBridgeHeight": _e(
        2.5, "cc", 1.0, "derived", "ฟิลเลอร์สันจมูก",
        "วัดเป็นองศา: nasofrontal +5.7±4.1° · แปลงเป็นความสูงสันโดยประมาณ", "nose-anthro",
        "งานวิจัยรายงานเป็นมุม ไม่ใช่มิลลิเมตร ตัวเลขนี้แปลงมาโดยประมาณ"),
    "noseTipDrop": _e(
        2.0, "cc", 0.5, "derived", "ฟิลเลอร์ปลายจมูก",
        "วัดเป็นองศา: nasolabial +9.4±4.5° (การหมุนปลายจมูก)", "nose-anthro",
        "งานวิจัยรายงานเป็นมุม ตัวเลขนี้แปลงมาโดยประมาณ",
        reverse=_r("ครั้ง", 1, "ผ่าตัดแก้ไขปลายจมูก (ลดการยื่น)")),
    "jawDefinition": _e(
        1.6, "cc", 2.0, "derived", "ฟิลเลอร์กรอบหน้า (ต่อข้าง)",
        "อ้างอิงช่วงเดียวกับงานวิจัยคางและกรอบหน้า 1.5-2 cc ต่อข้าง", "chin-3d"),
    "chinLength": _e(
        3.0, "cc", 2.0, "derived", "ฟิลเลอร์คาง",
        "ใช้ช่วงเดียวกับ chinProjection จากงานวิจัยเดียวกัน", "chin-3d",
        "งานวิจัยวัดระยะยื่น ไม่ได้วัดความยาวคางแยก",
        reverse=_r("ครั้ง", 1, "ผ่าตัดลดขนาดคาง")),
    "hifuLifting": _e(
        1.5, "ครั้ง", 1, "derived", "HIFU / คลื่นวิทยุ",
        "อยู่ในช่วงเดียวกับหัตถการกระชับที่วัดด้วย 3D imaging", "masseter-guided",
        "ยังไม่พบงานวิจัยที่วัดระยะยกเป็นมิลลิเมตรโดยตรง",
        reverse=_r("cc", 2.0, "ฟิลเลอร์กรอบหน้า (เติมมุมกรามให้ต่ำลง)")),

    # ---------------------------------------------------------------- estimated
    "browArch": _e(2.0, "ยูนิต", 12, "estimated", "โบทอกยกคิ้ว",
                   "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None),
    "browThickness": _e(1.5, "กราฟต์", 200, "estimated", "ปลูกคิ้ว",
                        "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None),
    "browHeight": _e(3.0, "ครั้ง", 1, "estimated", "ผ่าตัดยกคิ้ว",
                     "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None,
                     reverse=_r("ยูนิต", 12, "โบทูลินัมท็อกซินปรับแนวคิ้วให้ต่ำลง")),
    "eyeOpening": _e(2.0, "ข้าง", 2, "estimated", "ผ่าตัดเปลือกตาบน",
                     "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None,
                     reverse=_r("ข้าง", 2, "ผ่าตัดแก้ไขเปลือกตาให้หุบลง")),
    "browTailLift": _e(2.5, "ยูนิต", 8, "estimated", "โบทอก / ร้อยไหมหางคิ้ว",
                       "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None,
        reverse=_r("ยูนิต", 8, "โบทูลินัมท็อกซินปรับแนวคิ้ว (ลดหางคิ้ว)")),
    "canthalTiltLift": _e(2.0, "ข้าง", 2, "estimated", "ผ่าตัดเปิด/ตรึงหางตา",
                          "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None,
        reverse=_r("ข้าง", 2, "ผ่าตัดปรับหางตาให้ต่ำลง")),
    "underEyeFiller": _e(1.5, "cc", 1.0, "estimated", "ฟิลเลอร์ร่องใต้ตา",
                         "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None),
    "eyelidDepth": _e(1.5, "ข้าง", 2, "estimated", "ทำตาสองชั้น",
                      "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None,
        reverse=_r("ข้าง", 2, "ผ่าตัดแก้ชั้นตา")),
    "noseWingSlim": _e(1.5, "ข้าง", 2, "estimated", "ตัดปีกจมูก",
                       "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None,
        reverse=_r("ข้าง", 2, "ผ่าตัดปรับฐานจมูกให้กว้างขึ้น")),
    "lipCornerLift": _e(1.5, "ยูนิต", 6, "estimated", "โบทอกมุมปาก",
                        "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None),
    "cupidBowSharpness": _e(1.0, "cc", 0.5, "estimated", "ฟิลเลอร์เก็บทรงปาก",
                            "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None),
    "nasolabialLift": _e(1.5, "cc", 2.0, "estimated", "ฟิลเลอร์ร่องแก้ม / ร้อยไหม",
                         "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None,
        reverse=_r("ข้าง", 2, "ผ่าตัดปรับโหนกแก้มให้ต่ำลง")),
    "cheekboneReduction": _e(2.5, "ข้าง", 2, "estimated", "ผ่าตัดลดโหนกแก้ม",
                             "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None),
    "chinTaper": _e(2.5, "ครั้ง", 1, "estimated", "ผ่าตัดวีไลน์",
                    "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None),
    "smileWidth": _e(1.5, "ข้าง", 2, "estimated", "ยกมุมปาก",
                     "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None,
        reverse=_r("ครั้ง", 1, "ผ่าตัดปรับรูปริมฝีปากให้แคบลง")),
    "smileLift": _e(1.5, "ยูนิต", 6, "estimated", "โบทอกมุมปาก",
                    "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None),
    "smileArc": _e(1.0, "cc", 0.5, "estimated", "ฟิลเลอร์ปรับทรงปาก",
                   "ยังไม่พบงานวิจัยที่วัดเป็นมิลลิเมตร", None),
}


def pixels_per_mm(points):
    """Scale from the face's own irises, so one millimetre means the same on any photo.

    Falls back to the eye-corner span when the iris landmarks are missing, which happens if a
    model without the refined 478-point output is ever swapped in.
    """
    import numpy as np

    iris = float(np.linalg.norm(points[IRIS_LEFT, :2] - points[IRIS_RIGHT, :2]))
    if iris > 1:
        return iris / IPD_MM
    corners = float(np.linalg.norm(points[33, :2] - points[263, :2]))
    return max(corners / (IPD_MM * 1.45), 1e-6)   # outer-corner span runs ~45% wider than the IPD


def bidirectional(key):
    """Whether this control has a treatment for the downward direction as well."""
    entry = EVIDENCE.get(key)
    return bool(entry and entry.get("reverse"))


def side(key, setting):
    """The half of the entry that applies at this setting, or None if there is no such direction.

    A negative setting on a control with no `reverse` is not a milder version of anything -- there
    is no procedure that does it -- so it resolves to nothing rather than silently mirroring the
    upward treatment.
    """
    entry = EVIDENCE.get(key)
    if not entry:
        return None
    if setting >= 0:
        return entry
    reverse = entry.get("reverse")
    if not reverse:
        return None
    # movement is shared with the forward direction on purpose; see `_r`
    return {**reverse, "mm": entry["mm"], "reverse": None}


def millimetres(key, setting, amplify=1.0):
    """How far this control should move tissue, in millimetres, at the given slider value.

    Signed: negative means the tissue moves the other way, which is what lets one control carry a
    measurement in both directions instead of needing two sliders that can contradict each other.
    """
    entry = side(key, setting)
    if not entry or not setting:
        return 0.0
    return entry["mm"] * (float(setting) / 100.0) * float(amplify)


def dose(key, setting):
    """The amount of product that goes with a setting, e.g. 1.4 cc or 72 units.

    Always positive. A dose is a quantity administered; the direction of the change is carried by
    the procedure name and by the millimetres, not by a negative volume.
    """
    entry = side(key, setting)
    if not entry or not setting:
        return 0.0
    amount = entry["dose"] * (abs(float(setting)) / 100.0)
    return round(amount, 2 if entry["unit"] == "cc" else 0)


def record(key, setting, amplify=1.0):
    """One line of the treatment record: what was done, how much, and how far it moves tissue."""
    entry = side(key, setting)
    if entry is None:
        raise KeyError(f"{key} ไม่มีหัตถการสำหรับทิศนี้")
    status, colour = STATUS_LABELS[entry["status"]]
    source = SOURCES.get(entry["source"]) if entry["source"] else None
    beyond = abs(setting) > SETTING_MEASURED
    return {
        "key": key,
        "setting": int(setting),
        "direction": "reverse" if setting < 0 else "forward",
        "extrapolated": beyond,
        "extrapolatedNote": (
            "ปริมาณนี้เกินช่วงที่งานวิจัยวัดไว้ ตัวเลขมิลลิเมตรคำนวณแบบเชิงเส้น "
            "ผลจริงจะน้อยกว่านี้เพราะเนื้อเยื่อตอบสนองไม่เป็นเส้นตรงเมื่อฉีดมาก" if beyond else ""),
        "procedure": entry["procedure"],
        "dose": dose(key, setting),
        "unit": entry["unit"],
        "mm": round(millimetres(key, setting), 2),
        "mmShown": round(millimetres(key, setting, amplify), 2),
        "status": entry["status"],
        "statusLabel": status,
        "statusColour": colour,
        "measured": entry["measured"],
        "note": entry["note"],
        "sourceTitle": source[0] if source else None,
        "sourceUrl": source[1] if source else None,
    }
