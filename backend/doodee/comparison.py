"""Two scored scans read side by side, against the one published reference.

Nothing is measured here. Both scans already carry `analysis_data.reference_scores` — the twelve
spans the Thai study publishes a mean and an SD for, each with the observed value, the z against
that mean, and a score — so a comparison is a transform of data both analysis screens are already
showing. No landmark detection, no model call, no second scoring pass.

**The raw difference is the least interesting number on this screen, and on its own it is
misleading.** Alar width 0.279 against 0.271 is a difference of 0.008, which reads as a fact about
two noses until you notice that the published SD is 0.021 of nasion-gnathion: both faces sit
inside the range most of the reference cohort occupies, and the gap between them is a third of the
spread you would find between any two people picked at random. So every row here is reported in
the unit the reference makes available — standard deviations of the published cohort — and a row
whose two readings both sit inside one SD of the mean is reported as *not distinguishable*, in
those words, no matter how many decimal places separate the raw values.

That rule is not a display nicety. `findings.severity_for` already draws exactly this line for one
face ("Sits where most people sit. Not something to change."), and a comparison screen that turns
two such readings into a winner would contradict the analysis screen sitting one tab away.

The bands, the vocabulary and the labels are imported rather than restated. A second copy of
"within the typical range" is a second thing to keep in step, and the day the two disagree is the
day one of them is lying about the same measurement.

WHAT THIS DOES NOT SAY. Nothing here ranks two faces. `percentile.py` explains why at length: the
z is two-tailed, so "further from the mean" is *more unusual*, not worse, and a comparison that
sorted on it would crown the most atypical face. What a difference between two scans of one person
honestly supports is a direction — toward the published mean or away from it — and that is the
only verdict this module produces.
"""

from .development_plan import METRIC_LABELS, MIN_INTERESTING_Z
from .findings import SEVERITY_TEXT, TYPICAL_WITHIN, severity_for
from .percentile import cohort_is_comparable
from .reference_scoring import CATEGORIES, VIEW_OF, views_from_metrics


SCORED_STATUS = "experimental_reference_similarity"

# `reference_scoring.metric_score` maps one standard deviation to twenty points
# (`100 - 20 * abs(z)`), so a category or view score converts back into SDs by dividing by this.
# Named rather than written as a literal 20 in three places, because it is the scorer's number and
# would be silently wrong here the moment the scorer changed it.
SCORE_POINTS_PER_SD = 20

# A category or view score at or above this is an average |z| inside one SD — the same line
# `findings.TYPICAL_WITHIN` draws for a single metric, expressed in the units a category score
# comes in.
TYPICAL_SCORE = 100 - SCORE_POINTS_PER_SD * TYPICAL_WITHIN

# The two scans must have been scored against the same published numbers, or the z-scores answer
# different questions and subtracting them is meaningless. `reference_for()` returns a different
# mean and SD per profile, so a user who answered "feminine" for one scan and "neutral" for the
# next has two sets of distances to two different targets; the difference between them would be
# their answer to a settings question, rendered as a change in their face. `version` is checked
# for the same reason one step out: a future cohort would move the mean under both scans.
#
# This is the same judgement `skin_engine.comparison_break` makes for skin readings, and it is
# resolved the same way — refuse to join them, and say which fact stopped it.
REFERENCE_KEYS = ("profile", "version")

MOVEMENT_TEXT = {
    "toward_reference": (
        "ขยับเข้าใกล้ค่าอ้างอิงมากขึ้น",
        "Moved closer to the reference.",
    ),
    "away_from_reference": (
        "ขยับออกห่างจากค่าอ้างอิงมากขึ้น",
        "Moved further from the reference.",
    ),
    # The rule this screen exists to respect. Said as a sentence rather than left to a greyed-out
    # row, because a reader who sees two different numbers will read a difference into them unless
    # something states plainly that there is none to read.
    "both_within_typical_range": (
        "ทั้งสองค่าอยู่ในช่วงที่คนส่วนใหญ่อยู่ ตัวเลขจะต่างกันเท่าไรก็ไม่ถือว่าต่างกันจริง",
        "Both readings sit where most people sit. No amount of raw difference makes them "
        "meaningfully different.",
    ),
    "difference_below_half_sd": (
        "ต่างกันไม่ถึงครึ่งค่าเบี่ยงเบนมาตรฐานของกลุ่มอ้างอิง เล็กเกินกว่าจะแยกออกจากความคลาดเคลื่อนของการวัด",
        "Less than half a standard deviation apart — too small to separate from the error in "
        "measuring a face off a photograph.",
    ),
}

# Only these two are a difference. Everything else in MOVEMENT_TEXT is this module declining to
# call one, which is a result rather than a missing answer.
MEANINGFUL_MOVEMENTS = ("toward_reference", "away_from_reference")

NOTE_TH = (
    "ตัวเลขทั้งหมดเทียบกับค่าอ้างอิงชุดเดียวกัน ความต่างรายงานเป็นหน่วยค่าเบี่ยงเบนมาตรฐานของกลุ่มอ้างอิง "
    "ไม่ใช่การตัดสินว่าใบหน้าไหนดีกว่ากัน และค่าที่วัดจากภาพถ่ายคนละครั้งมีผลจากมุมกล้อง แสง และท่าทางศีรษะเสมอ"
)
NOTE_EN = (
    "Both sides are measured against the same reference, and every difference is reported in "
    "standard deviations of that cohort. This is not a ranking of two faces, and two photographs "
    "taken at different moments always differ by camera angle, light and head posture as well."
)


def _scores(analysis_data):
    """The scored payload of one scan, or None when there is nothing scoreable in it.

    Same guard as `percentile.score_card` and `development_plan.build`: a minor's scan carries
    `minor_not_scored`, an unfinished one carries nothing at all, and neither is an argument this
    module can be handed.
    """
    if not isinstance(analysis_data, dict):
        return None
    scores = analysis_data.get("reference_scores")
    if not isinstance(scores, dict) or scores.get("status") != SCORED_STATUS:
        return None
    return scores


def reference_mismatch(earlier, later):
    """Which reference fact stops these two scans being compared, or None.

    Returned as the field name rather than as a boolean so the refusal can say *what* differed;
    "your two scans were scored against different reference groups" is an answer a user can act on
    and "not comparable" is not.
    """
    first = (earlier or {}).get("reference") or {}
    second = (later or {}).get("reference") or {}
    for key in REFERENCE_KEYS:
        if first.get(key) != second.get(key):
            return key
    return None


def _movement(z_earlier, z_later):
    """What honestly happened to one measurement between two scans.

    Order of the checks matters and is the whole rule. "Both inside the typical range" is tested
    first because it is the strongest statement available and it holds regardless of how far apart
    the two raw numbers are — that is precisely the case a spreadsheet gets wrong. Only once the
    pair has cleared both refusals is a direction named.

    `MIN_INTERESTING_Z` is borrowed from `development_plan`, where it is the distance below which
    "the measurement sits inside normal variation for the cohort and there is nothing to say about
    it". It is applied here to the gap between two faces rather than to one face's distance from
    the mean. Different quantity, same unit and the same judgement: half a published SD is under
    the noise a single uncontrolled photograph carries, so a smaller gap is not a finding.
    """
    gap = abs(z_later - z_earlier)
    if abs(z_earlier) < TYPICAL_WITHIN and abs(z_later) < TYPICAL_WITHIN:
        return "both_within_typical_range", gap
    if gap < MIN_INTERESTING_Z:
        return "difference_below_half_sd", gap
    # Distance from the published mean, not the signed value: a measurement crossing from -1.4 to
    # +1.1 got closer to the reference even though the number went up.
    return ("toward_reference" if abs(z_later) < abs(z_earlier) else "away_from_reference"), gap


def _side(metric):
    """One scan's half of a metric row, with the band it falls in already named."""
    z = float(metric.get("normalized_deviation") or 0)
    severity = severity_for(z)
    return {
        "observed": metric.get("observed"),
        "normalized_deviation": z,
        "score": metric.get("score"),
        "severity": severity,
        "severity_th": SEVERITY_TEXT[severity][0],
        "severity_en": SEVERITY_TEXT[severity][1],
    }


def _metric_row(key, earlier, later):
    movement, gap = _movement(
        float(earlier.get("normalized_deviation") or 0),
        float(later.get("normalized_deviation") or 0),
    )
    observed_earlier = float(earlier.get("observed") or 0)
    observed_later = float(later.get("observed") or 0)
    label_th, label_en = METRIC_LABELS.get(key, ("", ""))
    return {
        "key": key,
        "category": earlier.get("category") or CATEGORIES.get(key, ""),
        "view": earlier.get("view") or VIEW_OF.get(key, ""),
        "unit": earlier.get("unit"),
        # Named from the one table that labels these twelve keys, which is also what the plan
        # screen prints. Two screens describing the same measurement must use the same words.
        "label_th": label_th or key,
        "label_en": label_en or key,
        # The published value both sides were scored against, so the screen can place the two
        # readings relative to it rather than only relative to each other.
        "reference": earlier.get("reference"),
        "earlier": _side(earlier),
        "later": _side(later),
        "difference": round(observed_later - observed_earlier, 5),
        # None rather than a division by zero, and None rather than a large percentage of a tiny
        # denominator: an angle or a ratio that reads near zero makes a percent change meaningless.
        "difference_percent": (
            round((observed_later - observed_earlier) / observed_earlier * 100, 2)
            if observed_earlier else None
        ),
        # The difference that actually means something: how far apart the two sit in standard
        # deviations of the published cohort.
        "deviation_gap": round(gap, 3),
        "movement": movement,
        "movement_th": MOVEMENT_TEXT[movement][0],
        "movement_en": MOVEMENT_TEXT[movement][1],
        "meaningful": movement in MEANINGFUL_MOVEMENTS,
    }


def _paired_scores(earlier_items, later_items):
    """Category or view scores from both scans, paired by key.

    Both lists carry `{"key", "score", "metric_count"}`, so one function serves both. The
    meaningfulness test is the metric rule converted into score units: two averages that both sit
    at or above `TYPICAL_SCORE` are two averages inside one SD of the mean, and a gap smaller than
    half an SD is `MIN_INTERESTING_Z * SCORE_POINTS_PER_SD` points.
    """
    later_by_key = {item.get("key"): item for item in later_items}
    rows = []
    for item in earlier_items:
        other = later_by_key.get(item.get("key"))
        if other is None:
            continue
        first, second = item.get("score"), other.get("score")
        if first is None or second is None:
            continue
        difference = second - first
        both_typical = first >= TYPICAL_SCORE and second >= TYPICAL_SCORE
        rows.append({
            "key": item.get("key"),
            "earlier": first,
            "later": second,
            "difference": difference,
            "metric_count": item.get("metric_count"),
            "meaningful": (
                not both_typical
                and abs(difference) >= MIN_INTERESTING_Z * SCORE_POINTS_PER_SD
            ),
        })
    return rows


def _views(scores):
    """A scan's per-view scores, derived from its metrics when it predates per-view scoring.

    Same back-fill `scan_assessment` does, and for the same reason: the metrics already imply the
    two numbers, and re-running the worker over an old scan to add a score would change its
    measurements as a side effect.
    """
    return scores.get("views") or views_from_metrics(scores.get("metrics") or [])


def compare(earlier_data, later_data, redacted=False):
    """The comparison of two scans, or None when the two cannot honestly be compared.

    `earlier` and `later` are ordered by capture time by the caller. The order is load-bearing:
    every difference is `later - earlier`, so the sign reads as "what changed", which is the
    question two scans of one person are actually asked.

    Returns None for the same reasons `development_plan.build` does — a scan that is not scored,
    a minor's scan, an unfinished one — and additionally when the two were scored against
    different published references. `reference_mismatch()` names which fact differed, so a caller
    can answer with the reason rather than with a shrug.

    `redacted=True` is the partial-depth form. Which categories are withheld is decided by
    `percentile.redact` rather than by a second rule here, because two withholding rules for one
    product means the day they disagree, one of them is leaking.
    """
    earlier = _scores(earlier_data)
    later = _scores(later_data)
    if not earlier or not later:
        return None
    if reference_mismatch(earlier, later):
        return None

    earlier_metrics = {
        item["key"]: item for item in (earlier.get("metrics") or [])
        if isinstance(item, dict) and item.get("key")
    }
    later_metrics = {
        item["key"]: item for item in (later.get("metrics") or [])
        if isinstance(item, dict) and item.get("key")
    }
    shared = [key for key in earlier_metrics if key in later_metrics]
    rows = [_metric_row(key, earlier_metrics[key], later_metrics[key]) for key in shared]
    # Biggest genuine difference first. `meaningful` leads rather than the gap alone, because a
    # large gap between two readings that both sit inside the typical range is exactly the row
    # this screen must not open with — it is the most impressive number and the least real one.
    rows.sort(key=lambda row: (row["meaningful"], row["deviation_gap"]), reverse=True)

    overall_earlier, overall_later = earlier.get("overall_score"), later.get("overall_score")
    payload = {
        "status": "reference_comparison",
        "overall": {
            "earlier": overall_earlier,
            "later": overall_later,
            "difference": (
                overall_later - overall_earlier
                if overall_earlier is not None and overall_later is not None else None
            ),
        },
        "categories": _paired_scores(earlier.get("categories") or [], later.get("categories") or []),
        "views": _paired_scores(_views(earlier), _views(later)),
        "metrics": rows,
        "meaningful_count": sum(1 for row in rows if row["meaningful"]),
        "compared_metrics": len(rows),
        # Scored on one scan and not the other — a missing side photograph is the usual cause.
        # Reported rather than dropped, the same way `findings_for` reports `unnamed`: a
        # measurement that quietly vanishes from a comparison looks like one that did not change.
        "unshared_metrics": sorted(
            set(earlier_metrics) ^ set(later_metrics),
        ),
        # The reference both were scored against. Singular by construction: a mismatch has already
        # returned None above, so there is exactly one to report.
        "reference": earlier.get("reference"),
        "cohort_comparable": cohort_is_comparable(earlier) and cohort_is_comparable(later),
        "note_th": NOTE_TH,
        "note_en": NOTE_EN,
        "redacted": False,
    }
    return _redact(payload, later) if redacted else payload


def _redact(payload, later):
    """The partial-depth comparison.

    Withholding happens here, before the response is built, so the locked figures never reach the
    client at all. A client that receives every number and blurs three of them has withheld
    nothing.

    Which categories go is `percentile.redact`'s answer, taken by handing it the *later* scan's
    category scores — the current state of the face, and the same pillar the score card would
    leave visible for this user, so the two screens cannot open a different one.

    The metric rows are cut on that same line. They used to be cut by position — the first two of
    twelve, whatever category they belonged to — so a reader could watch a withheld measurement
    move between two scans while the category above it showed as locked. Two numbers and a
    difference is more than the category score they were meant to be paying for.

    Keys and labels stay on the withheld rows. Seeing that eight more measurements were compared
    is the honest shape of a teaser; hiding them would misrepresent how much was actually done.
    """
    from .percentile import redact

    locked_categories = set(redact({"categories": later.get("categories") or []})["locked_categories"])
    visible = [row for row in payload["metrics"] if row["category"] not in locked_categories]
    hidden = [row for row in payload["metrics"] if row["category"] in locked_categories]
    return {
        **payload,
        "categories": [
            item if item["key"] not in locked_categories else {
                "key": item["key"], "earlier": None, "later": None, "difference": None,
                "metric_count": item.get("metric_count"), "meaningful": None, "locked": True,
            }
            for item in payload["categories"]
        ],
        "metrics": [
            *visible,
            *({"key": row["key"], "category": row["category"],
               "label_th": row["label_th"], "label_en": row["label_en"], "locked": True}
              for row in hidden),
        ],
        "locked_categories": sorted(locked_categories),
        "locked_metrics": [row["key"] for row in hidden],
        # Still true and still worth showing: the count of what was compared does not become a
        # paid figure just because most of the rows are withheld.
        "meaningful_count": payload["meaningful_count"],
        "redacted": True,
    }
