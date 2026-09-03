"""How typical a face is, relative to the published Thai reference cohort.

This deliberately does NOT rank attractiveness. `metric_score()` in reference_scoring.py
computes a two-tailed z: `z = (observed - mean) / sd`, so z = 0 means "closest to the cohort
mean" and a large |z| means "unusual", in either direction. A "top N%" framing built on |z|
would therefore award first place to the most atypical face — the exact inversion of what such
a card appears to claim. Everything here reads as *similarity to the reference*, which is also
what the backend already calls itself: `experimental_reference_similarity`.

Nothing new is measured. The z-scores are already stored on every completed scan at
`analysis_data.reference_scores.metrics[].normalized_deviation`, so this is a pure transform of
data the analysis screen is showing.
"""

from math import erf, exp, sqrt
from statistics import NormalDist

from . import reference_scoring

# Mirrors the guard in reference_target() (reference_scoring.py:103) — never trust an
# analysis_data blob that did not come from a completed adult scoring run.
SCORED_STATUS = "experimental_reference_similarity"

# Below this many scored metrics the composite is too thin to be worth a headline number.
MIN_METRICS = 4


def _chi_square_survival(statistic, degrees_of_freedom):
    """P(X > statistic) for a chi-square with `degrees_of_freedom`.

    Closed form for even df; for odd df the series starts from the normal tail. Written out
    rather than pulled from scipy because scipy is ~90 MB and this is the only place in the
    codebase that would need it — numpy is already a dependency but has no chi-square CDF.
    """
    if statistic <= 0:
        return 1.0
    if degrees_of_freedom <= 0:
        return 0.0

    half = statistic / 2
    if degrees_of_freedom % 2 == 0:
        # Sum_{i=0}^{k-1} (half^i / i!) * e^-half, k = df/2
        term = exp(-half)
        total = term
        for i in range(1, degrees_of_freedom // 2):
            term *= half / i
            total += term
        return min(1.0, max(0.0, total))

    # Odd df: 2 * (1 - Phi(sqrt(statistic))) plus the correction series.
    root = sqrt(statistic)
    total = 2 * (1 - 0.5 * (1 + erf(root / sqrt(2))))
    term = sqrt(2 * statistic / 3.141592653589793) * exp(-half)
    for i in range(3, degrees_of_freedom + 1, 2):
        total += term
        term *= statistic / i
    return min(1.0, max(0.0, total))


def similarity_percentile(reference_scores):
    """Share of the reference cohort this face is *more* typical than, as a percentage.

    Returns None when there is nothing defensible to report: a minor's scan, an incomplete
    scoring run, or too few scored metrics.

    The composite is `chi2 = sum(z^2)` over the scored metrics with `df = len(metrics)`, and
    the percentile is `P(chi2_df > observed) * 100` — the fraction of the cohort expected to
    sit *further* from the mean than this face does.

    **This assumes the metrics are independent.** They are not, strictly: midface and
    lower-face height both scale with the same face, for instance. The published study reports
    no covariance matrix (reference_scoring.py:124-125 says so where the same limitation bites
    reference_target), so a Mahalanobis distance is not available. Independence overstates the
    effective degrees of freedom and therefore pushes the percentile toward the extremes; the
    UI has to state the assumption rather than present this as exact.
    """
    if not isinstance(reference_scores, dict):
        return None
    if reference_scores.get("status") != SCORED_STATUS:
        return None

    metrics = reference_scores.get("metrics") or []
    deviations = [
        float(metric["normalized_deviation"])
        for metric in metrics
        if isinstance(metric, dict) and metric.get("normalized_deviation") is not None
    ]
    if len(deviations) < MIN_METRICS:
        return None

    chi_square = sum(z * z for z in deviations)
    survival = _chi_square_survival(chi_square, len(deviations))
    return round(survival * 100, 1)


def equivalent_z(percentile):
    """The single-metric z that would produce the same two-tailed tail probability.

    The composite lives in chi-square space, which has no natural picture. The distribution
    curve on the card is a normal, so the marker needs one number in normal space: solve
    `2 * (1 - Phi(z)) = percentile / 100` for z. Purely for placing the marker — the reported
    percentile always comes from the chi-square above.

    Computed here rather than in the client so the statistics live in one file.
    """
    if percentile is None:
        return None
    tail = max(min(percentile / 100, 1.0), 1e-9)
    return round(NormalDist().inv_cdf(1 - tail / 2), 3)


def cohort_is_comparable(reference_scores):
    """Whether a percentile means anything for this user.

    The reference is 240 Thai adults aged 18-35. `score_observations()` already flags a scan
    taken outside that cohort (reference_scoring.py:183-184) and never rescales the score for
    it, so a percentile against it would be a number without a population.
    """
    if not isinstance(reference_scores, dict):
        return False
    return (
        reference_scores.get("cohort_match") == "within_reference_age_range"
        and reference_scores.get("population_match") == "within_reference_population"
    )


# Which category scores a partial-depth plan may read now lives in `reference_scoring.PILLARS`:
# the first pillar this scan scored, and nothing else. The count it replaces was two, chosen as
# "enough to show the analysis is real"; one pillar is the same argument made in the vocabulary
# the screen actually uses, and it is the vocabulary that matters — the dashboard groups these
# five categories into four cards, so withholding by category count could open half of a card.


def redact(card):
    """The partial-depth version of a full card.

    Withholding happens here, server-side, and the withheld numbers are simply absent from the
    payload. A client that receives every figure and paints a blur over three of them has not
    withheld anything — the numbers are in the response body, and anyone who opens the network
    tab has them.

    Category *keys* stay, and only their scores go. Seeing that a "nose" score exists and is
    unreadable is the honest shape of a teaser; hiding the row entirely would misrepresent how
    much the analysis actually covers.

    Which categories stay is `reference_scoring.visible_categories` — the first pillar the scan
    scored. It used to be the two highest-scoring categories, and that was wrong twice over: it
    told a free reader which of their categories scored best, which is an ordering fact this tier
    does not include, and it was a second rule alongside the dashboard's own, so the two together
    opened three categories of five with nobody having decided that.

    `similarity_percentile` gets a separate `_locked` flag rather than reusing the existing None.
    That None already means something specific and different — "this face is outside the
    published cohort, so we will not claim a percentile for it" (see `cohort_is_comparable`) —
    and collapsing "we won't say" into "pay to see" would make the paid product look like it
    unlocks a number that, for those users, does not exist.
    """
    visible, hidden = split_categories(card.get("categories") or [])
    return {
        **card,
        "categories": [
            *visible,
            *({"key": item.get("key"), "score": None,
               "metric_count": item.get("metric_count"), "locked": True} for item in hidden),
        ],
        "similarity_percentile": None,
        "marker_z": None,
        "similarity_percentile_locked": True,
        "locked_categories": [item.get("key") for item in hidden],
        "redacted": True,
    }


def split_categories(categories):
    """`(visible, hidden)` for a partial-depth plan, by `reference_scoring.visible_categories`.

    Both redactions below go through this, so the line between what a free account may read and
    what it may not is drawn exactly once. The scan endpoint and the score card disagreeing about
    it is not a cosmetic inconsistency — whichever of them is more generous becomes the paywall,
    and the other one is decoration.
    """
    scored = {item.get("key") for item in categories if item.get("score") is not None}
    allowed = set(reference_scoring.visible_categories(scored))
    return (
        [item for item in categories if item.get("key") in allowed],
        [item for item in categories if item.get("key") not in allowed],
    )


def redact_reference_scores(scores):
    """The partial-depth version of `analysis_data.reference_scores`, for the scan endpoint.

    This is the block the dashboard builds its four pillar cards from, and until now it was served
    whole to everybody: a free account received `overall_score`, all five category scores and all
    twelve measurements, and the cards were "locked" by nothing but the absence of a reason to
    unlock them. Anyone who opened the network tab had the numbers a plan is sold for.

    The overall score stays — it is what the free tier is *for*, and the distribution chart beside
    it plots the same figure. Everything the pillar cards and the ratio rows read is withheld
    outside the one visible pillar. A hidden row keeps `key`, `category` and `unit` so the screen
    can still name what it is not showing; it loses `observed`, `reference`,
    `normalized_deviation` and `score`, which is every number a reader could learn something from.

    `strengthsFor` and `improvementsFor` on the client filter on a numeric `score`, so dropping it
    is also what keeps the two cards under the chart from listing measurements out of a locked
    pillar. That falls out rather than being arranged, which is the right way round: one rule
    withholds, and the screens that read the payload follow it without being told.
    """
    if not isinstance(scores, dict):
        return scores
    visible, hidden = split_categories(scores.get("categories") or [])
    allowed = {item.get("key") for item in visible}
    return {
        **scores,
        "categories": [
            *visible,
            *({"key": item.get("key"), "score": None,
               "metric_count": item.get("metric_count"), "locked": True} for item in hidden),
        ],
        "metrics": [
            item if item.get("category") in allowed else {
                "key": item.get("key"), "category": item.get("category"),
                "unit": item.get("unit"), "locked": True,
            }
            for item in (scores.get("metrics") or [])
        ],
        "locked_categories": [item.get("key") for item in hidden],
        "redacted": True,
    }


def readable_scores(user, analysis_data):
    """`analysis_data` carrying only the scores this user's plan may read.

    The one call every server-side reader of the numbers goes through, so that "what a free
    account can learn" has a single answer rather than one per surface. Before it there were four
    surfaces and three answers: the score card and the assessment withheld, the scan endpoint
    served everything, and the chat — both the canned topic answers and the block of text sent to
    the model — was built from the raw twelve. A reader looking at four blurred cards could type
    "what is my chin score" and be told.

    Returns `analysis_data` unchanged for a full-depth plan, and for a payload with no scores in
    it, so callers can hand their data through unconditionally.
    """
    from . import entitlement
    from .models import Plan

    if entitlement.current_plan(user).analysis_depth != Plan.AnalysisDepth.PARTIAL:
        return analysis_data
    scores = (analysis_data or {}).get("reference_scores")
    if not scores:
        return analysis_data
    return {**analysis_data, "reference_scores": redact_reference_scores(scores)}


def score_card(analysis_data, redacted=False):
    """Everything the score card renders, or None when the scan cannot support one.

    `redacted=True` returns the partial-depth card for a plan whose `analysis_depth` is `partial`.
    """
    if not isinstance(analysis_data, dict):
        return None
    scores = analysis_data.get("reference_scores")
    if not isinstance(scores, dict) or scores.get("status") != SCORED_STATUS:
        return None

    percentile = similarity_percentile(scores)
    comparable = cohort_is_comparable(scores)
    reference = scores.get("reference") or {}
    card = {
        "overall_score": scores.get("overall_score"),
        "categories": scores.get("categories") or [],
        # Withheld rather than zeroed when the user is outside the cohort: an absent number is
        # honest, a number computed against the wrong population is not.
        "similarity_percentile": percentile if comparable else None,
        "marker_z": equivalent_z(percentile) if comparable else None,
        "cohort_comparable": comparable,
        "cohort_match": scores.get("cohort_match"),
        "population_match": scores.get("population_match"),
        "metric_count": len(scores.get("metrics") or []),
        "sample_size": reference.get("sample_size"),
        "age_range": reference.get("age_range"),
        "reference_version": reference.get("version"),
        "assumes_independent_metrics": True,
        "redacted": False,
    }
    return redact(card) if redacted else card
