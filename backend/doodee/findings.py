"""Turning scored metrics into a short list of what stands out about a face.

The numbers are already there — every scored metric carries a z-score against a published
population mean — but a table of twelve ratios is not something anyone reads. This groups them into
what is close to the reference and what is far from it, names them from the metric catalogue, and
says which direction each one sits.

Each finding also carries a plainly worded verdict. That is a deliberate product decision, asked for
directly: someone who cannot see what is actually different about their face cannot decide what to
do about it, and softened wording hides the finding instead of delivering it.

Direct is not the same as cruel, and the line between them is whether the sentence is actionable.
"The chin is shorter than the reference, so the lower face reads short and the jawline has no clear
finish" names something a person can look at, measure again, or take to a clinician. "You have an
ugly chin" names nothing and helps no one. So every verdict describes the geometry and what it does
to the face, at the severity the measurement supports, and stops there: no verdicts about the
person, no guesses about how others see them, and no adjective the number does not license.
"""

from functools import lru_cache

from .metric_catalog import CATALOG

# Bands on |z|, the distance from the published mean in standard deviations. These are the ordinary
# reading of a normal distribution rather than tuned thresholds: inside one SD is where most of the
# reference population sits, and past two SDs is outside about 95% of it.
#
# Four bands rather than three because the screen no longer prints the deviation itself. With the
# number visible, "within the typical range" covered everything from a hair off the mean to a full
# SD away and the reader could see which they had; without it, that one word had to carry both, and
# a measurement sitting almost exactly on the reference deserves to be told apart from one merely
# inside the band. Half an SD is the middle of the typical range, so it splits it evenly.
EXCELLENT_WITHIN = 0.5
TYPICAL_WITHIN = 1.0
SEVERE_BEYOND = 2.0

DIRECTION_TEXT = {
    "above": ("มากกว่าค่าอ้างอิง", "above the reference"),
    "below": ("น้อยกว่าค่าอ้างอิง", "below the reference"),
}

SEVERITY_TEXT = {
    "excellent": ("ใกล้ค่าอ้างอิงมาก", "Very close to the reference"),
    "typical": ("อยู่ในช่วงปกติ", "Within the typical range"),
    "moderate": ("ต่างจากค่าอ้างอิงพอสังเกตได้", "Noticeably different from the reference"),
    "severe": ("ต่างจากค่าอ้างอิงมาก", "Far from the reference"),
}

# Ordered least to most severe, so a client can render a legend or a scale without hard-coding the
# order and getting it wrong.
SEVERITY_ORDER = ("excellent", "typical", "moderate", "severe")


# What each measurement looks like when it sits above or below the reference, said plainly.
#
# Written per direction because the two are different faces: an intercanthal distance above the
# reference reads as wide-set eyes and below it as close-set, and one phrase cannot cover both.
VERDICTS = {
    ("midface_height", "above"): (
        "กลางใบหน้ายาวกว่าค่าอ้างอิง ช่วงระหว่างตาถึงปลายจมูกดูยืด ทั้งใบหน้าจึงดูยาว",
        "The midface is longer than the reference, stretching the span from eyes to nose base and lengthening the whole face.",
    ),
    ("midface_height", "below"): (
        "กลางใบหน้าสั้นกว่าค่าอ้างอิง ตากับปากอยู่ใกล้กัน ใบหน้าดูอัดแน่นช่วงกลาง",
        "The midface is shorter than the reference, crowding the eyes and mouth together and compressing the middle of the face.",
    ),
    ("lower_face_height", "above"): (
        "ส่วนล่างของใบหน้ายาวกว่าค่าอ้างอิง คางและกรามกินพื้นที่มากกว่าที่สัดส่วนรองรับ ใบหน้าดูล่างหนัก",
        "The lower face is longer than the reference. Chin and jaw take more of the face than the proportion supports, making it bottom-heavy.",
    ),
    ("lower_face_height", "below"): (
        "ส่วนล่างของใบหน้าสั้นกว่าค่าอ้างอิง ช่วงปากถึงคางถูกบีบ ทำให้คางดูไม่มีน้ำหนัก",
        "The lower face is shorter than the reference. The mouth-to-chin span is compressed, leaving the chin without weight.",
    ),
    ("intercanthal", "above"): (
        "หัวตาสองข้างห่างกันมากกว่าค่าอ้างอิง ตาดูแยกห่างและดั้งจมูกช่วงบนดูกว้าง",
        "The inner eye corners sit further apart than the reference. The eyes read wide-set and the upper nasal bridge broad.",
    ),
    ("intercanthal", "below"): (
        "หัวตาสองข้างชิดกันมากกว่าค่าอ้างอิง ตาดูอยู่ใกล้กัน และช่วงกลางใบหน้าดูแคบ",
        "The inner eye corners sit closer than the reference. The eyes read close-set and the central face narrow.",
    ),
    ("eye_fissure", "above"): (
        "ตากว้างกว่าค่าอ้างอิง ดวงตาเด่นกว่าส่วนอื่นของใบหน้า",
        "The eye opening is wider than the reference, so the eyes dominate the rest of the face.",
    ),
    ("eye_fissure", "below"): (
        "ตาแคบกว่าค่าอ้างอิง ดวงตาดูเล็กเมื่อเทียบกับความกว้างใบหน้า",
        "The eye opening is narrower than the reference, so the eyes read small against the width of the face.",
    ),
    ("alar_width", "above"): (
        "ปีกจมูกกว้างกว่าค่าอ้างอิง ฐานจมูกกินความกว้างใบหน้ามาก จมูกจึงเป็นจุดที่สายตาไปหยุดก่อน",
        "The nasal base is wider than the reference. It takes up much of the face's width, so the nose is where the eye stops first.",
    ),
    ("alar_width", "below"): (
        "ปีกจมูกแคบกว่าค่าอ้างอิง ฐานจมูกดูเล็กเมื่อเทียบกับความกว้างใบหน้า",
        "The nasal base is narrower than the reference and reads small against the width of the face.",
    ),
    ("upper_lip_length", "above"): (
        "ร่องริมฝีปากบนยาวกว่าค่าอ้างอิง ระยะจากจมูกถึงปากมาก ทำให้ปากดูอยู่ต่ำและช่วงล่างใบหน้าดูยาว",
        "The upper lip is longer than the reference. The nose-to-mouth distance is large, setting the mouth low and lengthening the lower face.",
    ),
    ("upper_lip_length", "below"): (
        "ร่องริมฝีปากบนสั้นกว่าค่าอ้างอิง ปากอยู่ใกล้จมูก ทำให้ช่วงกลางถึงล่างของใบหน้าดูอัด",
        "The upper lip is shorter than the reference. The mouth sits close under the nose, compressing the mid-to-lower face.",
    ),
    ("upper_vermillion", "above"): (
        "ริมฝีปากบนหนากว่าค่าอ้างอิง ปากบนเด่นกว่าปากล่าง",
        "The upper lip is fuller than the reference and dominates the lower lip.",
    ),
    ("upper_vermillion", "below"): (
        "ริมฝีปากบนบางกว่าค่าอ้างอิง ปากดูแบนและเส้นปากบนไม่ชัด",
        "The upper lip is thinner than the reference, flattening the mouth and blurring its upper edge.",
    ),
    ("lower_vermillion", "above"): (
        "ริมฝีปากล่างหนากว่าค่าอ้างอิง ปากล่างถ่วงน้ำหนักลงและเด่นกว่าปากบน",
        "The lower lip is fuller than the reference, pulling the weight of the mouth downward and past the upper lip.",
    ),
    ("lower_vermillion", "below"): (
        "ริมฝีปากล่างบางกว่าค่าอ้างอิง ปากล่างไม่รับน้ำหนักปากบน ทำให้ปากดูไม่สมดุล",
        "The lower lip is thinner than the reference and fails to balance the upper, leaving the mouth uneven.",
    ),
    ("chin_height", "above"): (
        "คางยาวกว่าค่าอ้างอิง คางยื่นลงและกินสัดส่วนช่วงล่างของใบหน้า",
        "The chin is longer than the reference, running down and taking over the lower third of the face.",
    ),
    ("chin_height", "below"): (
        "คางสั้นกว่าค่าอ้างอิง ส่วนล่างของใบหน้าจึงดูสั้น และแนวกรามไม่มีจุดจบที่ชัด",
        "The chin is shorter than the reference, so the lower face reads short and the jawline has no clear finish.",
    ),
    ("nasofrontal_angle", "above"): (
        "มุมหน้าผาก-จมูกเปิดกว้างกว่าค่าอ้างอิง ดั้งจมูกช่วงบนตื้น รอยต่อหน้าผากกับจมูกไม่มีจุดหัก จมูกจึงดูไม่มีสัน",
        "The nasofrontal angle is more open than the reference. The upper bridge is shallow with no break between forehead and nose, so the nose reads without a defined ridge.",
    ),
    ("nasofrontal_angle", "below"): (
        "มุมหน้าผาก-จมูกแคบกว่าค่าอ้างอิง รอยต่อหน้าผากกับดั้งหักลูก ดั้งจมูกดูสูงและเป็นสันชัด",
        "The nasofrontal angle is tighter than the reference. The forehead-to-bridge break is deep, so the bridge reads high and sharply ridged.",
    ),
    ("nasolabial_angle", "above"): (
        "มุมจมูก-ริมฝีปากกว้างกว่าค่าอ้างอิง ปลายจมูกเชิดขึ้น เห็นรูจมูกจากด้านหน้ามากกว่าปกติ",
        "The nasolabial angle is wider than the reference. The nasal tip rotates upward and shows more nostril from the front than is typical.",
    ),
    ("nasolabial_angle", "below"): (
        "มุมจมูก-ริมฝีปากแคบกว่าค่าอ้างอิง ปลายจมูกตกลง ทำให้จมูกดูยาวและกดทับช่วงริมฝีปากบน",
        "The nasolabial angle is tighter than the reference. The tip drops, lengthening the nose and pressing down on the upper lip.",
    ),
    ("facial_convexity_angle", "above"): (
        "ด้านข้างใบหน้านูนมากกว่าค่าอ้างอิง ช่วงกลางหน้ายื่นออกและคางถอยหลังเมื่อเทียบกัน โปรไฟล์จึงดูไม่ตรง",
        "The profile is more convex than the reference. The midface projects while the chin sits back behind it, so the profile does not read straight.",
    ),
    ("facial_convexity_angle", "below"): (
        "ด้านข้างใบหน้าแบนกว่าค่าอ้างอิง ช่วงกลางหน้าไม่ยื่น โปรไฟล์จึงขาดมิติจากด้านข้าง",
        "The profile is flatter than the reference. The midface does not project, so the side view lacks depth.",
    ),
}

# What "typical" says. There is no direction worth naming when a measurement is where most people
# sit; calling out a small lean either way would be reading noise as a feature.
TYPICAL_VERDICT = (
    "อยู่ในช่วงที่คนส่วนใหญ่อยู่ ไม่ใช่จุดที่ต้องแก้",
    "Sits where most people sit. Not something to change.",
)

EXCELLENT_VERDICT = (
    "ใกล้ค่าอ้างอิงมาก เป็นจุดที่เด่นของใบหน้านี้",
    "Sits very close to the reference. A strong point of this face.",
)


def verdict_for(key, direction, severity):
    """The plainly worded reading of one measurement, Thai and English.

    Falls back to the direction phrase alone for a metric with no verdict written yet, rather than
    inventing one or leaving the finding with nothing to say.
    """
    if severity == "excellent":
        return EXCELLENT_VERDICT
    if severity == "typical":
        return TYPICAL_VERDICT
    written = VERDICTS.get((key, direction))
    if written:
        return written
    return (
        f"ค่านี้{DIRECTION_TEXT[direction][0]}",
        f"This measurement is {DIRECTION_TEXT[direction][1]}.",
    )


def _catalog_by_reference_key():
    """Metric key -> the catalogue item that names it.

    Built from the catalogue rather than a second hand-written table, so an item that changes its
    reference keys cannot silently stop being named here.

    Several items can cite the same measurement — facial_convexity_angle is cited by five, from the
    jaw, the cheeks and the profile — so first-past-the-post picks the wrong name. Taking the item
    whose own id is the metric key resolves it: that item *is* the measurement, while the others
    merely use it as evidence. Naming a convexity angle "mandibular projection" is what this avoids.
    """
    index = {}
    for item in CATALOG:
        for key in item.get("reference", ()):
            if item["id"] == key or key not in index:
                index[key] = item
    return index


def severity_for(z):
    magnitude = abs(z)
    if magnitude < EXCELLENT_WITHIN:
        return "excellent"
    if magnitude < TYPICAL_WITHIN:
        return "typical"
    return "moderate" if magnitude < SEVERE_BEYOND else "severe"


@lru_cache(maxsize=1)
def _procedures_by_id():
    """The simulatable procedures this deployment offers, by the id `metric_catalog` cites.

    Upstream this returns `{}` — a stub left when the catalogue it joined to went away, which
    quietly made every finding report that nothing could be done about it. Wired to the real
    table here.

    These are the geometric preset ids (`nose-narrow`), not the clinical catalogue's source
    refs. When `procedures.py` is deleted and the clinical catalogue becomes the only one, this
    and the `procedures=` fields in `metric_catalog` both have to be re-pointed — and
    `FindingProcedureLinkTest` goes red until they are, which is the intended alarm.
    """
    from .procedures import PROCEDURES

    return {preset["id"]: {"id": preset["id"], "name_th": preset["name_th"],
                           "name_en": preset["name_en"], "region": preset["region"]}
            for preset in PROCEDURES}


@lru_cache(maxsize=1)
def _procedures_by_reference_key():
    """Metric key -> the procedures that can move it, gathered from *every* catalogue entry citing it.

    Not from the naming entry alone, which is the index `_catalog_by_reference_key` builds for a
    different purpose. The two answer different questions and the difference is not academic: the
    entry that *is* `eye_fissure` lists no procedure, while "eye aperture" cites the same measurement
    and lists two. Reading only the naming entry marked the eye and both lip measurements as having
    nothing available -- three of the five measurements this catalogue can actually simulate.
    """
    by_id = _procedures_by_id()
    found = {}
    for item in CATALOG:
        for key in item.get("reference", ()):
            for procedure_id in item.get("procedures", ()):
                if procedure_id in by_id:
                    found.setdefault(key, {})[procedure_id] = by_id[procedure_id]
    return {key: list(procedures.values()) for key, procedures in found.items()}


def _category_headroom(items, category, key):
    """What the category score would be if this one measurement sat at the reference.

    A statement about the scoring arithmetic and nothing else. Every other measurement is held
    exactly where it was and this one is set to a perfect score, so the answer is "what this metric
    is currently costing the category" -- not a claim that any procedure achieves it, and not a
    predicted outcome. The wording on the screen has to keep that distinction; `findings.py` is the
    module whose whole job is not overstating a number.

    Returns `None` when the category has nothing to gain, so the screen shows no line rather than a
    line reading "8 -> 8".

    `items` is the category's own metrics, indexed once by the caller. Re-filtering the whole metric
    list here made this quadratic in the number of scored metrics for an answer that only ever looks
    at one category.
    """
    if not items:
        return None
    scores = [float(item.get("score") or 0) for item in items]
    now = round(sum(scores) / len(scores))
    at_reference = round(sum(100 if item.get("key") == key else float(item.get("score") or 0) for item in items) / len(items))
    if at_reference <= now:
        return None
    return {"category": category, "now": now, "at_reference": at_reference, "gain": at_reference - now}


def findings_for(reference_scores):
    """`{"strengths": [...], "improvements": [...], "unnamed": [...]}` from a scan's scores.

    Sorted by how far each metric sits from the reference: the closest first among strengths, the
    furthest first among improvements, because that is the order both lists are read in.

    `unnamed` holds scored metrics with no catalogue entry. Returned rather than dropped so a metric
    added to the scorer without a catalogue entry shows up as a gap instead of quietly vanishing
    from the summary.
    """
    if not reference_scores or reference_scores.get("status") != "experimental_reference_similarity":
        return {"strengths": [], "improvements": [], "unnamed": []}

    index = _catalog_by_reference_key()
    metrics = reference_scores.get("metrics", ())
    # Bucketed once. Every finding asks what its category would score without it, and each of those
    # questions used to walk the whole metric list again.
    by_category = {}
    for item in metrics:
        by_category.setdefault(item.get("category"), []).append(item)
    procedures_by_key = _procedures_by_reference_key()
    strengths, improvements, unnamed = [], [], []
    for metric in metrics:
        item = index.get(metric["key"])
        if item is None:
            unnamed.append(metric["key"])
            continue
        z = float(metric.get("normalized_deviation") or 0)
        severity = severity_for(z)
        direction = "above" if z > 0 else "below"
        verdict = verdict_for(metric["key"], direction, severity)
        # The procedures this deployment can actually simulate for this measurement. Joined here
        # rather than on the client so the screen cannot offer one the catalogue has dropped.
        procedures = procedures_by_key.get(metric["key"], [])
        headroom = _category_headroom(by_category.get(metric.get("category"), ()), metric.get("category"), metric["key"])
        finding = {
            "key": metric["key"],
            "catalog_id": item["id"],
            "number": item["number"],
            "group": item["group"],
            "name_th": item["name_th"],
            "name_en": item["name_en"],
            "score": metric.get("score"),
            "observed": metric.get("observed"),
            "reference": metric.get("reference"),
            "unit": metric.get("unit"),
            "normalized_deviation": z,
            "direction": direction,
            "direction_th": DIRECTION_TEXT[direction][0],
            "direction_en": DIRECTION_TEXT[direction][1],
            "severity": severity,
            "severity_th": SEVERITY_TEXT[severity][0],
            "severity_en": SEVERITY_TEXT[severity][1],
            "verdict_th": verdict[0],
            "verdict_en": verdict[1],
            # The measurement caveats the catalogue already carries travel with the finding, so a
            # summary cannot present a number more confidently than the table it came from.
            "note_th": item.get("note_th"),
            "note_en": item.get("note_en"),
            "category": metric.get("category"),
            # Whether anything in the closed procedure catalogue targets this measurement. A finding
            # with nothing behind it is still reported -- hiding a real one because there is no
            # procedure for it would be the dishonest way to order this list -- but it sorts below
            # the ones a person can do something about, because a list that opens on a dead end
            # reads as a verdict rather than as information.
            "actionable": bool(procedures),
            "procedures": [
                {"id": procedure["id"], "region": procedure["region"],
                 "name_th": procedure["name_th"], "name_en": procedure["name_en"],
                 # Kept on the procedure as well as the parent finding so a report generator can
                 # summarise one proposed procedure without losing which face measurement led to it.
                 "reference_measurement": {
                     "key": metric["key"], "observed": metric.get("observed"),
                     "reference": metric.get("reference"), "unit": metric.get("unit"),
                     "normalized_deviation": z,
                 }}
                # No `medical_reference` here. Upstream attaches one from a `medical_references`
                # module keyed by preset id, whose data file does not exist in that repo either —
                # it reads a `data.json` nothing ships. The published dose, unit, millimetres and
                # source for a procedure live in `evidence.py` here, keyed by the control the
                # simulation actually moves, and the simulation panel already shows them.
                for procedure in procedures
            ],
            # What this measurement costs its category, as scoring arithmetic. Never a prediction.
            "headroom": headroom,
        }
        # Both of the inside-the-band severities are strengths. The split is about whether a
        # measurement is something to act on, and neither of them is.
        (strengths if severity in ("excellent", "typical") else improvements).append(finding)

    strengths.sort(key=lambda item: abs(item["normalized_deviation"]))
    # Ordered by what is worth reading first, which is not the same as what is furthest from the
    # reference. Sorting on distance alone put a measurement nothing can address at the top of the
    # list, so the first thing a person read was both the worst news and a dead end.
    #
    # Actionable first, then by how much the category stands to gain, then by distance. Distance
    # stays as the last key because it is the tie-break the earlier two cannot make, and because two
    # findings with the same headroom should still be read worst-first.
    improvements.sort(key=lambda item: (
        item["actionable"],
        (item["headroom"] or {}).get("gain", 0),
        abs(item["normalized_deviation"]),
    ), reverse=True)
    return {"strengths": strengths, "improvements": improvements, "unnamed": unnamed}
