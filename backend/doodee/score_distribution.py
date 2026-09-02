"""Where one score sits among the scores this deployment has actually produced.

The comparison is against real scans in this database and nothing else. It would be easy to draw a
smooth bell curve from an assumed mean and standard deviation and label someone "top 13%" on their
first visit — the shape would look right and the number would be fiction. So the sample size travels
with every answer, and `reliable` says plainly whether there is enough of it to mean anything.

The curve the score screen draws follows the same rule. It is a kernel density estimate of the
scores that exist, not a normal distribution fitted to them: with two users it is two bumps, and
with one it is a single spike beside the marker. That is the honest picture, and it is the reason
`sample_size` is on the chart rather than in a footnote — a shape that looks like a population when
there is no population is the one thing this module exists to avoid.

One scan per person. Without that, somebody who scans eighteen times becomes eighteen people and
drags the distribution toward their own face.
"""

from math import exp, sqrt

# Below this the percentile is arithmetic on too few people to describe a population. Thirty is the
# usual rule-of-thumb floor for treating a sample mean as informative; it is not a promise that
# thirty is plenty, only the point below which a percentile should not be shown as a fact.
RELIABLE_SAMPLE_SIZE = 30

# Ten buckets over the 0-100 score, which is enough shape to see where you fall without implying a
# resolution the sample cannot support.
BUCKET_COUNT = 10

# Points on the density curve. Odd so there is a sample exactly at the midpoint, and coarse enough
# that the payload stays small next to the findings it travels with.
CURVE_POINTS = 51

# Bounds on the kernel width, in score points.
#
# The floor: with one score Silverman's rule gives a bandwidth of zero and the curve becomes an
# infinite spike, which plots as nothing at all.
#
# The ceiling: Silverman's rule is derived for a sample large enough to estimate a spread from, and
# over two or three scores it returns a width wider than the gap between them -- two people who
# scored 25 and 75 came out as one hill centred on 50, which is precisely the invented population
# this module refuses to draw. Ten points is wide enough that a real sample is never over-smoothed
# by the cap (Silverman lands near six for a hundred scores) and narrow enough that distinct scores
# stay distinct.
MIN_BANDWIDTH = 4.0
MAX_BANDWIDTH = 10.0


def _overall(reference_scores):
    return reference_scores.get("overall_score")


def _view(view):
    """Reader for one view's score, falling back to deriving it from the stored metrics.

    The fallback is what keeps the comparison population from being nearly empty: every scan
    analysed before per-view scoring existed carries the metrics but not the summary, and without
    this each view would be compared against only the handful of scans made since.
    """
    from .reference_scoring import views_from_metrics

    def read(reference_scores):
        summarised = reference_scores.get("views") or views_from_metrics(reference_scores.get("metrics") or [])
        for item in summarised:
            if item.get("key") == view:
                return item.get("score")
        return None
    return read


# The comparisons the score screen draws. Every one is a separate population: a scan from before
# per-view scoring existed contributes to the overall curve and to neither view, which is correct —
# it has no front score to compare against, and inventing one from its overall would put the same
# face in two places.
POPULATIONS = {"overall": _overall, "front": _view("front"), "side": _view("side")}


def latest_scores(exclude_user_id=None, read=_overall):
    """One score per user, from their most recent completed scan.

    `read` picks which score off that scan, so the same one-scan-per-person rule covers the overall
    comparison and the per-view ones without three near-identical queries.

    `exclude_user_id` leaves the person being ranked out of the population they are ranked against.
    Excluding only the scan being viewed is not enough: their earlier scans are still their own
    face, and a percentile measured against yourself says nothing at all.
    """
    return all_latest_scores(exclude_user_id, {"only": read})["only"]


def all_latest_scores(exclude_user_id=None, readers=None):
    """`{name: [scores]}` for several readers in one pass over the scans."""
    found = all_latest_by_user(readers)
    return {
        name: [score for user_id, score in scores.items() if user_id != exclude_user_id]
        for name, scores in found.items()
    }


# REMOVED, on purpose: `SYNTHETIC_FLAG`, `retire_seed_scores`, and the `synthetic` argument and
# `synthetic_sample_size` field on `distribution_of`.
#
# They were the seeding machinery: a `seed_demo_scores` management command would write a handful of
# invented scored users so a new deployment's chart had a shape, `SYNTHETIC_FLAG` marked them,
# `retire_seed_scores` stopped counting them once the real sample reached RELIABLE_SAMPLE_SIZE, and
# the count travelled to the client so the screen could say the curve was not real people.
#
# None of it worked here. The command was never ported, so nothing ever wrote the flag; and even in
# the repository the command *does* live in, the assessment view never passes `synthetic=`, so the
# count is structurally zero there too and the screen's "these are placeholders" line is
# unreachable in both. Porting the command would therefore have seeded fake users into the
# comparison population *and still* not produced the warning that is supposed to make that
# acceptable — the warning is the entire justification for the seeding, and it does not fire.
#
# It also should not come back without a much better reason. This module exists to refuse invented
# populations: its first paragraph is about not drawing a smooth curve nobody has the data for.
# Writing fabricated scores into the table that every percentile is computed against is that same
# problem with an extra step, on a product about to take money.
#
# If the shape of an empty chart is the real complaint, the honest fixes are to draw nothing and
# say why, or to say "you are the first" — both of which need no fake rows in the database.


def all_latest_by_user(readers=None):
    """`{name: {user_id: score}}` for several readers in one pass over the scans.

    Keyed by user rather than flattened because the score screen needs two populations out of the
    same walk and they differ by exactly one person: the curve is drawn from everyone including the
    reader, and the percentile is computed against everyone except them.

    Those are different questions, which is why the earlier version -- one population, the reader
    always excluded -- left the chart empty for the only user of a new deployment. A percentile
    measured against yourself says nothing, but a curve is a picture of the scores that exist, and
    yours is one of them.

    A user is taken at their newest scan per reader independently, so a newest scan that predates
    per-view scoring does not hide the person from the view populations entirely — their newest scan
    that *has* a front score is the one that counts there.
    """
    from .models import Scan
    from .reference_scoring import views_from_metrics

    readers = readers or POPULATIONS
    newest = {name: {} for name in readers}
    # Two columns rather than model instances. Every completed scan in the deployment is read on
    # every score screen, and building a `Scan` per row -- deferred-field machinery included -- to
    # look at one JSON column was the bulk of the work; `iterator` keeps the whole table from being
    # held in memory at once as well.
    #
    # Walk oldest to newest and overwrite. On Windows two rapid inserts can receive the same clock
    # tick; SQLite preserves insertion order for that tie, while descending order intermittently
    # returned the first scan and ignored the repeat scan created immediately after it.
    rows = (
        Scan.objects.filter(status=Scan.Status.COMPLETED)
        .order_by("user_id", "created_at")
        .values_list("user_id", "analysis_data")
    )
    for user_id, analysis_data in rows.iterator():
        reference_scores = (analysis_data or {}).get("reference_scores") or {}
        # Derived once and handed to every reader. The front and side readers each fall back to
        # deriving the per-view summary from the stored metrics, so on a scan analysed before
        # per-view scoring existed the same derivation ran twice for every row in the table.
        if "views" not in reference_scores and reference_scores:
            reference_scores = {
                **reference_scores,
                "views": views_from_metrics(reference_scores.get("metrics") or []),
            }
        for name, read in readers.items():
            score = read(reference_scores)
            if isinstance(score, (int, float)) and not isinstance(score, bool):
                newest[name][user_id] = float(score)
    # Keyed by user, not flattened: the caller decides who to leave out, and it differs per
    # question -- the curve keeps everyone, the percentile drops the reader.
    return newest


def histogram(scores):
    buckets = [0] * BUCKET_COUNT
    for score in scores:
        index = min(BUCKET_COUNT - 1, max(0, int(score / (100 / BUCKET_COUNT))))
        buckets[index] += 1
    width = 100 / BUCKET_COUNT
    return [
        {"from": round(index * width, 1), "to": round((index + 1) * width, 1), "count": count}
        for index, count in enumerate(buckets)
    ]


def _bandwidth(scores):
    """Silverman's rule of thumb, floored.

    Chosen over a fitted normal because the shape has to come from the data: a rule-of-thumb
    bandwidth over three scores draws three bumps, which is what three people look like.
    """
    count = len(scores)
    if count < 2:
        return MIN_BANDWIDTH
    mean = sum(scores) / count
    deviation = sqrt(sum((score - mean) ** 2 for score in scores) / count)
    return min(MAX_BANDWIDTH, max(MIN_BANDWIDTH, 1.06 * deviation * count ** -0.2))


def density_curve(scores):
    """The sample as a density curve over 0-100: `[{"score": x, "density": y}, ...]`.

    Normalised over the drawn range rather than by the usual kernel constant, so the area under the
    curve is 1 whatever the sample size — which is what lets a one-person spike and a broad hill be
    read against the same axis.

    Over the drawn range specifically, because the score axis has ends. A kernel sitting at 95 puts
    a third of its mass above 100, where no score can exist; keeping the textbook constant would
    make the curve for a high-scoring sample shorter than the curve for a mid-scoring one of the
    same size, and the reader would take that for a smaller population.

    Empty when there is nothing to draw — a flat line at zero would read as "everyone scores
    nothing" rather than as "no data".
    """
    if not scores:
        return []
    width = _bandwidth(scores)
    step = 100 / (CURVE_POINTS - 1)
    weights = [
        sum(exp(-0.5 * ((index * step - score) / width) ** 2) for score in scores)
        for index in range(CURVE_POINTS)
    ]
    area = sum(weights) * step
    if area <= 0:
        return []
    return [
        {"score": round(index * step, 1), "density": round(weight / area, 6)}
        for index, weight in enumerate(weights)
    ]


def distribution_for(score, exclude_user_id=None):
    """How `score` compares with everyone else, and how much to trust the comparison.

    `percentile` is the share of people this score is at least as high as, so 90 means "as high as
    or higher than 90% of them". None when there is nobody to compare against — a first user is not
    in the hundredth percentile of one, they are simply the only measurement there is.
    """
    scores = latest_scores(exclude_user_id)
    return distribution_of(score, scores)


def distribution_of(score, scores, drawn=None):
    """`distribution_for` without the query, so a per-view comparison can reuse it.

    Split out because the score screen asks the same question three times — overall, front and side
    — and running the scan query once per view would read every completed scan three times.

    Two populations, deliberately. `scores` is who this score is *ranked against* and never includes
    the reader; `drawn` is what the curve and the histogram are *drawn from* and does include them.
    Conflating the two is what left a new deployment's only user looking at an empty chart beside a
    score: there was nobody to rank them against, so nothing was drawn either.

    `drawn` defaults to `scores`, so a caller that has only one population keeps the old behaviour.
    """
    drawn = scores if drawn is None else drawn
    sample_size = len(scores)
    shared = {
        "sample_size": sample_size,
        "reliable_at": RELIABLE_SAMPLE_SIZE,
        # The curve and its own count travel together: a shape with no idea how many people are in it
        # is the fiction this module exists to avoid.
        "histogram": histogram(drawn),
        "curve": density_curve(drawn),
        "drawn_sample_size": len(drawn),
        # Whether the reader is one of the scores in the picture, so the caption can say so.
        "includes_you": len(drawn) > sample_size,
    }
    if score is None or not sample_size:
        return {
            **shared,
            "percentile": None,
            "reliable": False,
            "mean": None,
        }
    at_or_below = sum(1 for other in scores if other <= score)
    return {
        **shared,
        "percentile": round(at_or_below / sample_size * 100, 1),
        "reliable": sample_size >= RELIABLE_SAMPLE_SIZE,
        "mean": round(sum(scores) / sample_size, 1),
    }
