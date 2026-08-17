"""Questions that are answered by reading the numbers, not by asking a model.

Most of what people ask a chat about their own scan is a lookup: what was measured, which
measurement is furthest from the reference, what a score means, who the reference group is.
An LLM answering those has to be *told* the numbers anyway (see chat.scan_context), so routing
them through one buys nothing and costs money, latency and a chance of the number coming back
subtly wrong. Computed here they are exact, instant, free, and work with no API key at all.

Deliberately not an intent classifier. These answers are reachable only by `topic`, which the
client sends when a suggestion chip is pressed — an explicit, unambiguous request. Free text
always goes to the model. Guessing which lookup a typed sentence meant would eventually answer
the wrong question confidently, and for a product that talks to people about their own faces
that is worse than paying for a turn.

Wording follows the same rule as percentile.py and ScoreCardPanel: `metric_score()` measures
distance from a Thai reference mean, so "furthest from the reference" is a fact and "your worst
feature" is not. Direction is always stated, because neither side of the mean is better.
"""

from .reference_scoring import CATEGORIES, UNSUPPORTED_CATEGORIES

SCORED_STATUS = "experimental_reference_similarity"

# Names live here rather than being imported from the web app's METRIC_COPY: the answer text is
# built server-side so the mobile app gets it too, and the wording has to sit next to the rules
# above that constrain it. METRIC_COPY keeps its own job — the card copy on /analysis.
METRIC_LABELS = {
    "midface_height": ("ความสูงกลางใบหน้า", "Midface height"),
    "lower_face_height": ("ความสูงส่วนล่างของใบหน้า", "Lower face height"),
    "intercanthal": ("ระยะห่างหัวตา", "Intercanthal distance"),
    "eye_fissure": ("ความกว้างตา", "Eye fissure width"),
    "alar_width": ("ความกว้างฐานจมูก", "Alar width"),
    "nasofrontal_angle": ("มุมหน้าผาก–สันจมูก", "Nasofrontal angle"),
    "nasolabial_angle": ("มุมปลายจมูก–ริมฝีปากบน", "Nasolabial angle"),
    "upper_lip_length": ("ความยาวริมฝีปากบน", "Upper lip length"),
    "upper_vermillion": ("ความหนาริมฝีปากบน", "Upper vermillion height"),
    "lower_vermillion": ("ความหนาริมฝีปากล่าง", "Lower vermillion height"),
    "chin_height": ("ความสูงคาง", "Chin height"),
    "facial_convexity_angle": ("มุมความโค้งด้านข้าง", "Facial convexity angle"),
}

CATEGORY_LABELS = {
    "proportions": ("สัดส่วนรวม", "Overall proportions"),
    "eyes": ("ดวงตา", "Eyes"),
    "nose": ("จมูก", "Nose"),
    "lips": ("ริมฝีปาก", "Lips"),
    "chin": ("คาง", "Chin"),
}

UNSUPPORTED_LABELS = {
    "brows": ("คิ้ว", "brows"),
    "cheeks": ("แก้ม", "cheeks"),
    "jaw": ("กราม", "jaw"),
    "smile": ("รอยยิ้ม", "smile"),
    "neck": ("ลำคอ", "neck"),
    "skin": ("ผิว", "skin"),
}


def _pick(pair, lang):
    return pair[0] if lang == "th" else pair[1]


def _metric_label(key, lang):
    return _pick(METRIC_LABELS.get(key, (key, key)), lang)


def _scores(analysis_data):
    scores = (analysis_data or {}).get("reference_scores")
    if not isinstance(scores, dict) or scores.get("status") != SCORED_STATUS:
        return None
    return scores


def _sorted_metrics(scores):
    """Scored metrics by distance from the reference mean, furthest first."""
    return sorted(
        (m for m in (scores.get("metrics") or []) if m.get("normalized_deviation") is not None),
        key=lambda m: abs(float(m["normalized_deviation"])),
        reverse=True,
    )


def _direction(z, lang):
    """Which side of the reference mean, in words. Neither side is better."""
    if lang == "th":
        return "มากกว่าค่าอ้างอิง" if z > 0 else "น้อยกว่าค่าอ้างอิง"
    return "larger than the reference" if z > 0 else "smaller than the reference"


def _measurements(scores, lang):
    lines = []
    for metric in scores.get("metrics") or []:
        unit = ("องศา" if metric["unit"] == "degree" else "สัดส่วน") if lang == "th" else metric["unit"]
        lines.append(
            f"• {_metric_label(metric['key'], lang)}: {metric['observed']} {unit} "
            f"({'อ้างอิง' if lang == 'th' else 'reference'} {metric['reference']}, "
            f"{'คะแนน' if lang == 'th' else 'score'} {metric['score']}/100)"
        )
    body = "\n".join(lines)
    if lang == "th":
        return (
            f"วัดได้ {len(lines)} ค่า จากภาพที่คุณถ่าย ทุกค่าเทียบกับกลุ่มอ้างอิงคนไทย "
            f"{(scores.get('reference') or {}).get('sample_size', 240)} คน:\n\n{body}"
        )
    return (
        f"{len(lines)} measurements were taken from your photos, each compared with a reference "
        f"of {(scores.get('reference') or {}).get('sample_size', 240)} Thai adults:\n\n{body}"
    )


def _extreme(scores, lang, furthest=True):
    ranked = _sorted_metrics(scores)
    if not ranked:
        return None
    metric = ranked[0] if furthest else ranked[-1]
    z = float(metric["normalized_deviation"])
    label = _metric_label(metric["key"], lang)
    if lang == "th":
        if furthest:
            return (
                f"{label} ห่างจากค่าเฉลี่ยกลุ่มอ้างอิงมากที่สุด — ห่าง {abs(z):.2f} SD "
                f"ในทาง{_direction(z, lang)} (วัดได้ {metric['observed']} เทียบกับ {metric['reference']}) "
                f"ได้ {metric['score']}/100\n\n"
                "ห่างจากค่าเฉลี่ยไม่ได้แปลว่าแย่ และไม่ได้แปลว่าต้องแก้ "
                "มันแปลว่าค่านี้พบได้น้อยกว่าในกลุ่มอ้างอิงเท่านั้น"
            )
        return (
            f"{label} ใกล้ค่าเฉลี่ยกลุ่มอ้างอิงมากที่สุด — ห่างเพียง {abs(z):.2f} SD "
            f"(วัดได้ {metric['observed']} เทียบกับ {metric['reference']}) ได้ {metric['score']}/100"
        )
    if furthest:
        return (
            f"{label} sits furthest from the reference mean — {abs(z):.2f} SD "
            f"{_direction(z, lang)} (measured {metric['observed']} against {metric['reference']}), "
            f"scoring {metric['score']}/100.\n\n"
            "Being far from the mean does not mean worse, and does not mean it needs changing. "
            "It means this value is less common in the reference group."
        )
    return (
        f"{label} sits closest to the reference mean — {abs(z):.2f} SD away "
        f"(measured {metric['observed']} against {metric['reference']}), scoring {metric['score']}/100."
    )


def _categories(scores, lang):
    lines = [
        f"• {_pick(CATEGORY_LABELS.get(c['key'], (c['key'], c['key'])), lang)}: "
        f"{c['score']}/100 ({c['metric_count']} {'ค่า' if lang == 'th' else 'measurements'})"
        for c in scores.get("categories") or []
    ]
    overall = scores.get("overall_score")
    if lang == "th":
        return f"คะแนนรวม {overall}/100 มาจากค่าเฉลี่ยของแต่ละหมวด:\n\n" + "\n".join(lines)
    return f"Your overall index is {overall}/100, the mean of these categories:\n\n" + "\n".join(lines)


def _score_meaning(scores, lang):
    overall = scores.get("overall_score")
    if lang == "th":
        return (
            f"คะแนนของคุณคือ {overall}/100 คำนวณจาก 100 − 20 × |z| โดย z คือจำนวน SD "
            "ที่ค่าที่วัดได้ห่างจากค่าเฉลี่ยของกลุ่มอ้างอิง\n\n"
            "คะแนนใกล้ 100 = ค่านั้นใกล้ค่าเฉลี่ยของคนไทยในกลุ่มอ้างอิง\n"
            "คะแนนต่ำ = ค่านั้นพบได้น้อยในกลุ่มอ้างอิง ไม่ว่าจะมากกว่าหรือน้อยกว่าค่าเฉลี่ย\n\n"
            "นี่เป็นการวัดความใกล้ค่าเฉลี่ย ไม่ใช่การให้คะแนนความสวยงาม "
            "ไม่มีตัวเลขไหนในนี้ที่บอกว่าหน้าตาดีหรือไม่ดี"
        )
    return (
        f"Your overall index is {overall}/100, computed as 100 − 20 × |z|, where z is how many "
        "standard deviations a measurement sits from the reference mean.\n\n"
        "Near 100 = close to the average of the Thai reference group.\n"
        "Lower = uncommon in that group, whether larger or smaller than average.\n\n"
        "This measures closeness to an average, not attractiveness. No number here says whether "
        "a face looks good."
    )


def _reference_group(scores, lang):
    reference = scores.get("reference") or {}
    inside_age = scores.get("cohort_match") == "within_reference_age_range"
    inside_pop = scores.get("population_match") == "within_reference_population"
    if lang == "th":
        text = (
            f"กลุ่มอ้างอิงคือ{reference.get('population', 'คนไทย')} {reference.get('sample_size', 240)} คน "
            f"อายุ {reference.get('age_range', '18-35')} ปี จากงานวิจัยที่ตีพิมพ์ไว้\n\n"
        )
        if inside_age and inside_pop:
            return text + "คุณอยู่ในกลุ่มนี้ การเทียบจึงใช้ได้"
        return text + (
            "คุณอยู่นอกกลุ่มนี้ (อายุหรือประชากรไม่ตรง) ตัวเลขยังวัดได้ตามปกติ "
            "แต่การเทียบกับกลุ่มอ้างอิงใช้กับคุณไม่ได้ และเราไม่ได้ปรับคะแนนให้"
        )
    text = (
        f"The reference is {reference.get('sample_size', 240)} "
        f"{reference.get('population', 'Thai adults')} aged {reference.get('age_range', '18-35')}, "
        "from a published study.\n\n"
    )
    if inside_age and inside_pop:
        return text + "You fall inside that group, so the comparison applies to you."
    return text + (
        "You fall outside it, by age or population. The measurements still stand, but the "
        "comparison does not apply to you, and the score is not rescaled for it."
    )


def _not_measured(scores, lang):
    missing = scores.get("unsupported_categories") or list(UNSUPPORTED_CATEGORIES)
    names = ", ".join(_pick(UNSUPPORTED_LABELS.get(k, (k, k)), lang) for k in missing)
    if lang == "th":
        return (
            f"ไม่ได้วัด: {names}\n\n"
            "ไม่ใช่เพราะไม่สำคัญ แต่เพราะงานวิจัยอ้างอิงที่เราใช้ไม่ได้ตีพิมพ์ค่าเหล่านี้ไว้ "
            "ถ้าไม่มีค่าอ้างอิง การให้คะแนนก็จะเป็นการเดา"
        )
    return (
        f"Not measured: {names}.\n\n"
        "Not because they do not matter, but because the reference study publishes no values for "
        "them. Without a reference, any score would be invented."
    )


def _limits(scores, lang):
    count = len(scores.get("metrics") or [])
    if lang == "th":
        return (
            "ข้อจำกัดที่ควรรู้:\n\n"
            f"• วัดจากภาพถ่าย ไม่ใช่การวัดตัวจริง แสง มุมกล้อง และระยะห่างมีผลต่อตัวเลข\n"
            f"• วัดได้ {count} ค่า ซึ่งเป็นส่วนเล็กๆ ของสิ่งที่ประกอบเป็นใบหน้า\n"
            "• การเทียบเป็นเปอร์เซ็นต์ในการ์ดคะแนนสมมติว่าค่าแต่ละตัวเป็นอิสระต่อกัน "
            "ซึ่งไม่จริงเสียทีเดียว งานวิจัยต้นทางไม่ได้เผยแพร่ความสัมพันธ์ระหว่างค่า\n"
            "• ไม่ใช่คำวินิจฉัยทางการแพทย์ และไม่ใช่คำแนะนำให้ทำหัตถการใดๆ"
        )
    return (
        "Worth knowing:\n\n"
        "• These come from photographs, not from measuring you in person. Lighting, camera angle "
        "and distance all move the numbers.\n"
        f"• {count} measurements is a small slice of what makes up a face.\n"
        "• The score card's percentile assumes the measurements are independent of each other. "
        "They are not, strictly; the source study publishes no correlations.\n"
        "• This is not a medical diagnosis, and not a recommendation to have anything done."
    )


# Order matters: this is the order the suggestion chips appear in.
TOPICS = (
    ("measurements", ("คุณวัดอะไรจากใบหน้าผมบ้าง", "What did you actually measure?"), _measurements),
    ("furthest", ("ค่าไหนห่างจากค่าอ้างอิงมากที่สุด", "Which measurement is furthest from the reference?"),
     lambda s, l: _extreme(s, l, furthest=True)),
    ("closest", ("ค่าไหนใกล้ค่าอ้างอิงที่สุด", "Which measurement is closest to the reference?"),
     lambda s, l: _extreme(s, l, furthest=False)),
    ("score_meaning", ("คะแนนนี้หมายความว่าอะไร", "What does my score actually mean?"), _score_meaning),
    ("categories", ("คะแนนแต่ละหมวดเป็นยังไง", "How does each category score?"), _categories),
    ("reference_group", ("กลุ่มอ้างอิงคือใคร", "Who is the reference group?"), _reference_group),
    ("not_measured", ("อะไรที่ไม่ได้วัด", "What was not measured?"), _not_measured),
    ("limits", ("ตัวเลขพวกนี้มีข้อจำกัดอะไร", "What are the limits of these numbers?"), _limits),
)

_BY_ID = {topic_id: (question, builder) for topic_id, question, builder in TOPICS}


def available_topics(analysis_data, lang="th"):
    """The questions this scan can answer for free, in chip order.

    Empty when the scan has no scores yet, so the client shows no chips rather than chips that
    answer with nothing.
    """
    scores = _scores(analysis_data)
    if not scores:
        return []
    return [
        {"topic": topic_id, "question": _pick(question, lang)}
        for topic_id, question, builder in TOPICS
        if builder(scores, lang) is not None
    ]


def answer(topic_id, analysis_data, lang="th"):
    """`(question, answer)` for a topic, or None when this scan cannot answer it."""
    entry = _BY_ID.get(topic_id)
    scores = _scores(analysis_data)
    if not entry or not scores:
        return None
    question, builder = entry
    text = builder(scores, lang)
    if text is None:
        return None
    return _pick(question, lang), text
