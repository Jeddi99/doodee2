"""แผนพัฒนาตนเอง — what a user can actually do, derived from their own measurements.

Rule-based and deterministic. No model call, no token cost, and nothing that can be
hallucinated: every number here is read straight off `analysis_data.reference_scores`, which the
analysis screen is already showing, and every suggestion comes from a fixed table below.

**This plan operates inside exactly the same envelope as `chat.py`**, and for the same reason:
`reference_scoring.metric_score()` measures distance from a Thai reference mean, not quality. So

* metrics are ordered by *distance from the reference*, never by desirability. "ห่างจากค่าอ้างอิง
  มากที่สุด" is a fact; "your worst feature" is not, and this module must never produce the second
  one by accident — which is why nothing here is called a weakness, a problem or a fix.
* the suggested actions are all reversible and need no clinician: grooming, hair and brow shape,
  skin habits, posture, sleep, and photography. That list is not a stylistic choice; it is the
  set `chat.py`'s rules permit, kept identical so the product says one thing in both places.
* related procedures are *named*, never recommended, and every item says so.
* no expected gain is ever stated. No number for one exists anywhere in this system, so any
  figure would be invented.

A great deal of what moves these particular ratios is the camera rather than the face — focal
length, camera height and head tilt change apparent nose width, face length and chin projection
more than most people expect. Saying so is both true and the most useful thing here, so it leads.
"""

from .reference_scoring import CATEGORIES
from .reference_scoring import CATEGORIES as REFERENCE_CATEGORIES


SCORED_STATUS = "experimental_reference_similarity"

# Below this the measurement sits inside normal variation for the cohort and there is nothing to
# say about it. Roughly half an SD.
MIN_INTERESTING_Z = 0.5
# Enough to act on, few enough to read. requirement.md asks for a plan, not an audit. Five is also
# the number of scored categories, and one item per category is the cap that actually binds.
MAX_ITEMS = 5

# The published measurements, in Thai and English. Needed because a plan row has to name the
# measurement rather than only its category: "จมูก" appears against both alar width and the
# nasolabial angle, and a card headed "จมูก · สูงกว่าค่าอ้างอิง" sitting next to one headed
# "จมูก · ต่ำกว่าค่าอ้างอิง" reads as a bug rather than as two different measurements.
#
# Separate from `apps/web/src/data/faceMetrics.js`, which labels the analysis_engine catalogue —
# a different key set (`midface_height_ratio`/`harmony`) for a different screen.
METRIC_LABELS = {
    "midface_height": ("ความสูงกลางใบหน้า", "Midface height"),
    "lower_face_height": ("ความสูงส่วนล่างของใบหน้า", "Lower face height"),
    "intercanthal": ("ระยะระหว่างหัวตา", "Intercanthal width"),
    "eye_fissure": ("ความกว้างของตา", "Eye fissure width"),
    "alar_width": ("ความกว้างฐานจมูก", "Alar base width"),
    "nasofrontal_angle": ("มุมหน้าผาก–สันจมูก", "Nasofrontal angle"),
    "nasolabial_angle": ("มุมจมูก–ริมฝีปาก", "Nasolabial angle"),
    "upper_lip_length": ("ความยาวริมฝีปากบน", "Upper lip length"),
    "upper_vermillion": ("ความหนาริมฝีปากบน", "Upper lip thickness"),
    "lower_vermillion": ("ความหนาริมฝีปากล่าง", "Lower lip thickness"),
    "chin_height": ("ความสูงคาง", "Chin height"),
    "facial_convexity_angle": ("มุมความโค้งของใบหน้าด้านข้าง", "Facial convexity angle"),
}

# Which measurements a scored category is made of, inverted from the scorer's own table rather
# than written again. `proportions` (midface and lower-face height) reaches nothing: no procedure
# in the catalogue moves overall face proportions, and inventing a mapping so the row looks
# complete would be inventing a treatment.
CATEGORY_KEYS = {}
for _key, _category in REFERENCE_CATEGORIES.items():
    CATEGORY_KEYS.setdefault(_category, []).append(_key)

# Reversible, no clinician, honest. Everything here is either a photographic fact or ordinary
# grooming; nothing claims to change a measurement of the face itself, because nothing on this
# list does.
CATEGORY_ACTIONS = {
    "proportions": [
        {
            "th": "ถ่ายรูปให้กล้องอยู่ระดับสายตาพอดี",
            "en": "Shoot with the camera level with your eyes.",
            "why_th": "กล้องเงยหรือก้มเปลี่ยนสัดส่วนความยาวใบหน้าในภาพได้มาก ทั้งที่ใบหน้าไม่ได้เปลี่ยน",
            "why_en": "Tilting the camera changes apparent face length far more than most people expect.",
        },
        {
            "th": "ลองทรงผมที่เปลี่ยนกรอบหน้า เช่น ความยาวหน้าม้าหรือปริมาณด้านข้าง",
            "en": "Try a haircut that reframes the face — fringe length, or volume at the sides.",
            "why_th": "กรอบผมเปลี่ยนสัดส่วนที่คนมองเห็น โดยไม่ต้องแตะอะไรที่ถาวร",
            "why_en": "The hair frame changes the proportion people perceive, and nothing about it is permanent.",
        },
    ],
    "eyes": [
        {
            "th": "นอนให้พอและลดโซเดียมช่วงเย็น แล้วสแกนซ้ำตอนเช้า",
            "en": "Sleep enough, go easy on salt in the evening, and rescan in the morning.",
            "why_th": "ความบวมรอบดวงตาเปลี่ยนไปในแต่ละวัน ค่าที่วัดวันเดียวจึงไม่ใช่ค่าประจำตัว",
            "why_en": "Puffiness around the eyes varies day to day, so a single day's reading is not a fixed trait.",
        },
        {
            "th": "จัดทรงคิ้ว โดยเฉพาะความหนาและตำแหน่งหางคิ้ว",
            "en": "Shape the brows, especially thickness and where the tail sits.",
            "why_th": "คิ้วเป็นกรอบของดวงตา เปลี่ยนสิ่งที่คนมองเห็นได้ทันทีและกลับคืนได้",
            "why_en": "Brows frame the eye. They change what is perceived immediately and grow back.",
        },
    ],
    "nose": [
        {
            "th": "ถ่ายด้วยเลนส์ระยะ 50–85 มม. และถอยห่างจากกล้อง อย่าใช้กล้องหน้าใกล้ๆ",
            "en": "Shoot at a 50–85 mm equivalent and step back. Not a selfie at arm's length.",
            "why_th": "เลนส์มุมกว้างระยะใกล้ทำให้จมูกดูกว้างและยื่นกว่าความเป็นจริงอย่างชัดเจน",
            "why_en": "A wide lens up close visibly widens the nose and exaggerates its projection.",
        },
        {
            "th": "หลีกเลี่ยงแสงตรงจากด้านหน้า ใช้แสงเฉียงเล็กน้อย",
            "en": "Avoid flat frontal light; use a slightly angled source.",
            "why_th": "แสงตรงลบเงาสันจมูก ทำให้สัดส่วนที่วัดได้จากภาพเพี้ยนไป",
            "why_en": "Flat light erases the shadow along the bridge and distorts what the photo measures.",
        },
    ],
    "lips": [
        {
            "th": "ดูแลความชุ่มชื้นของริมฝีปากและผลัดผิวเบาๆ",
            "en": "Keep lips hydrated and exfoliate gently.",
            "why_th": "ริมฝีปากแห้งทำให้ขอบไม่ชัด ซึ่งมีผลต่อค่าที่วัดจากภาพ",
            "why_en": "Dry lips have a less defined border, which affects what the photo measures.",
        },
        {
            "th": "ลองใช้ดินสอเขียนขอบปากและสีที่ต่างกัน",
            "en": "Try a lip pencil and different shades.",
            "why_th": "ขอบและสีเปลี่ยนความอิ่มที่คนมองเห็นได้ และล้างออกได้",
            "why_en": "Border and colour change perceived fullness, and both wash off.",
        },
    ],
    "chin": [
        {
            "th": "สังเกตท่าทางศีรษะ อย่าก้มหรือยื่นคางเข้าหากล้อง",
            "en": "Watch your head posture — do not tuck or push the chin toward the camera.",
            "why_th": "การเอียงศีรษะเปลี่ยนความยาวคางและระยะยื่นที่วัดได้จากภาพอย่างมาก",
            "why_en": "Head tilt changes measured chin height and projection substantially.",
        },
        {
            "th": "ถ้าไว้หนวดเครา ลองปรับความยาวและแนวขอบ",
            "en": "If you have facial hair, try adjusting its length and the line of the edge.",
            "why_th": "แนวเคราเปลี่ยนรูปคางที่คนมองเห็น และกลับคืนได้เสมอ",
            "why_en": "A beard line changes the perceived chin shape and always grows back.",
        },
    ],
}

DISCLAIMER_TH = (
    "แผนนี้สร้างจากค่าที่วัดได้ของคุณเอง ไม่ใช่คำวินิจฉัยหรือคำแนะนำทางการแพทย์ "
    "หัตถการที่ระบุไว้คือ “สิ่งที่เกี่ยวข้องกับค่านี้” ไม่ใช่สิ่งที่แนะนำให้ทำ "
    "มีเพียงแพทย์ที่ตรวจคุณด้วยตัวเองเท่านั้นที่ให้คำแนะนำได้ "
    "และระบบไม่บอกว่าทำอะไรแล้วค่าจะเปลี่ยนไปเท่าไร เพราะไม่มีตัวเลขนั้นอยู่จริง"
)
DISCLAIMER_EN = (
    "This plan is built from your own measurements. It is not a diagnosis and not medical "
    "advice. Any procedure named is related to the measurement, not recommended — only a doctor "
    "who has examined you can advise. Nothing here states how much any action would change a "
    "number, because no such figure exists in this system."
)

LIMITS_TH = (
    "ค่าอ้างอิงมาจากคนไทยอายุ 18–35 ปี จำนวน 240 คน วัดจากภาพถ่ายครั้งเดียวในสภาพแสงที่ไม่ได้ควบคุม "
    "ความคลาดเคลื่อนจึงมีจริง"
)
LIMITS_EN = (
    "The reference is 240 Thai adults aged 18–35, and the measurement comes from a single "
    "photograph in uncontrolled lighting. The error is real."
)
OUTSIDE_COHORT_TH = "คุณอยู่นอกกลุ่มอ้างอิง การเทียบกับค่าเฉลี่ยชุดนี้จึงใช้กับคุณไม่ได้ ตัวเลขด้านล่างเป็นข้อมูลประกอบเท่านั้น"
OUTSIDE_COHORT_EN = (
    "You fall outside the reference group, so this comparison does not apply to you. The numbers "
    "below are context only."
)


def _procedures_toward_reference(category, z):
    """Procedures that move this category's measurements back toward the reference.

    Direction matters, and getting it backwards would be worse than saying nothing: a positive z
    means the measurement is larger than the reference mean, so only procedures that bring it
    down point the right way. That judgement is not made here — it is read off
    `procedure_catalog.MEASUREMENT_PROCEDURES`, the one table that says which procedure moves
    which measurement and which way, so this and the findings screen cannot disagree.

    Named as related, never recommended. Every item carries the disclaimer that says so.
    """
    from .procedure_catalog import procedures_for_measurement

    if not z:
        return []
    needed = "lower" if z > 0 else "raise"
    names = []
    for key in CATEGORY_KEYS.get(category, ()):
        for spec in procedures_for_measurement(key, needed):
            if spec.name_th not in names:
                names.append(spec.name_th)
    return names[:3]


def _direction(z, lang):
    if z > 0:
        return "สูงกว่าค่าอ้างอิง" if lang == "th" else "above the reference average"
    return "ต่ำกว่าค่าอ้างอิง" if lang == "th" else "below the reference average"


def build(analysis_data, lang="th"):
    """The plan for one scan, or None when the scan cannot support one.

    None — rather than an empty plan — for a minor's scan, an incomplete scoring run, or a scan
    with no reference scores at all. An empty *plan* means something different and is a real
    answer: every measurement sits close to the reference and there is nothing to list.
    """
    if not isinstance(analysis_data, dict):
        return None
    scores = analysis_data.get("reference_scores")
    if not isinstance(scores, dict) or scores.get("status") != SCORED_STATUS:
        return None

    metrics = [
        metric for metric in (scores.get("metrics") or [])
        if isinstance(metric, dict) and metric.get("normalized_deviation") is not None
    ]
    # Ordered by absolute distance from the reference. Deliberately NOT "worst first": the
    # ordering is a statement about distance and nothing else, and the copy that renders it says
    # so in those words.
    ranked = sorted(metrics, key=lambda metric: -abs(float(metric["normalized_deviation"])))

    # One row per category, keeping its furthest measurement. Without this, both nose metrics can
    # qualify and the plan shows "จมูก · สูงกว่าค่าอ้างอิง" directly above "จมูก · ต่ำกว่าค่าอ้างอิง",
    # carrying the same two suggestions twice — the actions are per-category, so a second row from
    # the same category adds a contradiction and no new advice.
    seen_categories = set()
    interesting = []
    for metric in ranked:
        if abs(float(metric["normalized_deviation"])) < MIN_INTERESTING_Z:
            continue
        category = metric.get("category") or CATEGORIES.get(metric.get("key"), "")
        if category in seen_categories:
            continue
        seen_categories.add(category)
        interesting.append(metric)
        if len(interesting) >= MAX_ITEMS:
            break

    comparable = (
        scores.get("cohort_match") == "within_reference_age_range"
        and scores.get("population_match") == "within_reference_population"
    )

    items = []
    for metric in interesting:
        z = float(metric["normalized_deviation"])
        category = metric.get("category") or CATEGORIES.get(metric.get("key"), "")
        actions = CATEGORY_ACTIONS.get(category, [])
        label_th, label_en = METRIC_LABELS.get(metric.get("key"), ("", ""))
        items.append({
            "key": metric.get("key"),
            "category": category,
            # The row is headed by the measurement, not the category, so two rows are never
            # distinguishable only by a number the reader has to compare.
            "label": (label_th if lang == "th" else label_en) or metric.get("key"),
            "observed": metric.get("observed"),
            "reference": metric.get("reference"),
            "unit": metric.get("unit"),
            "normalized_deviation": round(z, 3),
            "score": metric.get("score"),
            "direction": _direction(z, lang),
            "actions": [
                {"action": action[lang], "why": action[f"why_{lang}"]} for action in actions
            ],
            # Named, not recommended. The disclaimer on the plan says this in as many words, and
            # the client renders it beside every list.
            "related_procedures": _procedures_toward_reference(category, z),
        })

    return {
        "lang": lang,
        "items": items,
        "cohort_comparable": comparable,
        "cohort_note": None if comparable else (OUTSIDE_COHORT_TH if lang == "th" else OUTSIDE_COHORT_EN),
        "limits": LIMITS_TH if lang == "th" else LIMITS_EN,
        "disclaimer": DISCLAIMER_TH if lang == "th" else DISCLAIMER_EN,
        # An honest empty state. "Nothing stands out" is a result, not a failure, and saying it
        # plainly beats padding the list with measurements already sitting on the mean.
        "empty_reason": None if items else (
            "ทุกค่าที่วัดได้อยู่ใกล้ค่าอ้างอิง ไม่มีรายการที่ต้องหยิบมาพูดถึง" if lang == "th"
            else "Every measurement sits close to the reference. There is nothing to single out."
        ),
    }
