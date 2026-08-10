from math import acos, degrees, sqrt


SOURCE_URL = "https://he02.tci-thaijo.org/index.php/rcotJ/issue/download/16884/4098"
REFERENCE_VERSION = "thai-photo-2019-v1"

# Published mean and SD from 120 Thai women and 120 Thai men, age 18-35.
# Linear values are converted to ratios at runtime; millimetres never leave this module.
REFERENCE = {
    "feminine": {
        "n_gn": (110.76, None),
        "midface_height": (48.29, 3.61), "lower_face_height": (62.47, 5.27),
        "intercanthal": (33.49, 3.23), "eye_fissure": (27.15, 1.71),
        "alar_width": (38.52, 2.46), "upper_lip_length": (21.30, 2.27),
        "upper_vermillion": (7.17, 1.26), "lower_vermillion": (9.47, 1.26),
        "chin_height": (41.01, 4.69), "nasofrontal_angle": (134.09, 6.58),
        "nasolabial_angle": (96.08, 9.68), "facial_convexity_angle": (10.43, 4.72),
    },
    "masculine": {
        "n_gn": (120.62, None),
        "midface_height": (51.78, 4.69), "lower_face_height": (68.84, 6.95),
        "intercanthal": (35.65, 2.91), "eye_fissure": (28.63, 3.91),
        "alar_width": (41.45, 4.47), "upper_lip_length": (22.84, 3.28),
        "upper_vermillion": (7.94, 1.82), "lower_vermillion": (10.62, 1.55),
        "chin_height": (45.72, 6.20), "nasofrontal_angle": (128.57, 7.19),
        "nasolabial_angle": (91.65, 13.06), "facial_convexity_angle": (10.33, 5.45),
    },
}

CATEGORIES = {
    "midface_height": "proportions", "lower_face_height": "proportions",
    "intercanthal": "eyes", "eye_fissure": "eyes",
    "alar_width": "nose", "nasofrontal_angle": "nose", "nasolabial_angle": "nose",
    "upper_lip_length": "lips", "upper_vermillion": "lips", "lower_vermillion": "lips",
    "chin_height": "chin", "facial_convexity_angle": "chin",
}
ANGLE_KEYS = {"nasofrontal_angle", "nasolabial_angle", "facial_convexity_angle"}
UNSUPPORTED_CATEGORIES = ("brows", "cheeks", "jaw", "smile", "neck", "skin")

# The published cohort is Thai only. Other populations are recorded and flagged so future
# cohorts can be added, but they never rescale a score with an invented multiplier.
REFERENCE_POPULATION = "TH"
REFERENCE_POPULATIONS = ("TH", "LA", "KH", "MM", "VN", "MY", "SG", "ID", "PH", "CN", "JP", "KR", "OTHER")

# Regions whose target can be computed from the published Thai means instead of a fixed
# preset delta. Only measurements this study actually reports are listed: `keys` name entries
# in analysis_engine's `observations`, which already use the same nasion-gnathion denominator
# as REFERENCE, so observed and reference are directly comparable without re-deriving anything.
#
# Deliberately absent, because no usable soft-tissue reference was found: cheeks (zy-zy),
# jaw (go-go), mouth width (ch-ch), eye aperture, nose tip projection and chin projection.
# Published figures for those either measure bone on radiographs or disagree between studies
# by more than a factor of two. Farkas, Katic & Forrest 2005 (J Craniofac Surg 16:615-646)
# includes a Thai sample and reports zy-zy, go-go and ch-ch; adding those means and SDs to
# REFERENCE and an entry here is all that is needed to switch those regions on.
REFERENCE_TARGETS = {
    "nose": {"keys": ("alar_width",), "movement": "width"},
    # The study splits the vermillion into two bands; the warp moves total lip height, so the
    # target is the sum. Ratios share a denominator, so they add.
    "lips": {"keys": ("upper_vermillion", "lower_vermillion"), "movement": "lip_height"},
    "chin": {"keys": ("chin_height",), "movement": "chin_height"},
}

# Below this the warp is invisible, so it is not worth an image or a quota unit.
MIN_MEANINGFUL_DELTA = 0.01
# Ceiling on how far the warp may push a control point, as a share of face width or height.
# Presets stay at 3%; reference targets may go to 10%, which covers roughly two SD on alar
# width. Past that the Gaussian remap visibly bends the background around the region.
MAX_REFERENCE_SHIFT = 0.10


def _pooled(key):
    (mean_a, sd_a), (mean_b, sd_b) = REFERENCE["feminine"][key], REFERENCE["masculine"][key]
    mean = (mean_a + mean_b) / 2
    if sd_a is None:
        return mean, None
    variance = (((120 - 1) * sd_a ** 2) + ((120 - 1) * sd_b ** 2) + 120 * (mean_a - mean) ** 2 + 120 * (mean_b - mean) ** 2) / 239
    return mean, sqrt(variance)


def reference_for(profile):
    if profile == "neutral":
        return {key: _pooled(key) for key in REFERENCE["feminine"]}
    if profile not in REFERENCE:
        raise ValueError("invalid_reference_profile")
    return REFERENCE[profile]


def metric_score(observed, mean, sd):
    z = 0 if not sd else (observed - mean) / sd
    return round(max(0, 100 - 20 * abs(z))), round(z, 3)


def reference_target(reference_scores, region):
    """Work out how far a region sits from the published mean, from an existing scan result.

    Reads the metrics the scan already stored rather than re-running landmark detection, so
    the numbers here always match the ones shown on the analysis screen.
    """
    target = REFERENCE_TARGETS.get(region)
    if not target:
        raise ValueError("region_without_reference_data")
    if not reference_scores or reference_scores.get("status") != "experimental_reference_similarity":
        raise ValueError("scan_has_no_reference_scores")
    metrics = {item["key"]: item for item in reference_scores.get("metrics", ())}
    missing = [key for key in target["keys"] if key not in metrics]
    if missing:
        raise ValueError("scan_is_missing_reference_metrics")

    observed = sum(metrics[key]["observed"] for key in target["keys"])
    expected = sum(metrics[key]["reference"] for key in target["keys"])
    if observed <= 0:
        raise ValueError("invalid_face_dimensions")
    delta = (expected - observed) / observed
    return {
        "region": region,
        "keys": list(target["keys"]),
        "movement": target["movement"],
        "source_view": "front",
        "observed_ratio": round(observed, 5),
        "reference_ratio": round(expected, 5),
        "delta": round(delta, 5),
        "change_percent": round(delta * 100, 2),
        # No z for the sum: the study does not publish the covariance between the two
        # vermillion bands, so each key reports its own deviation instead.
        "per_key_deviation": [
            {"key": key, "observed": metrics[key]["observed"], "reference": metrics[key]["reference"],
             "normalized_deviation": metrics[key]["normalized_deviation"]}
            for key in target["keys"]
        ],
        "already_near_reference": abs(delta) < MIN_MEANINGFUL_DELTA,
        "unit": "ratio",
        "status": "educational_simulation",
    }


def angle(points, a, b, c):
    first, vertex, last = points[a, :2], points[b, :2], points[c, :2]
    left, right = first - vertex, last - vertex
    denominator = float(sqrt(float(left @ left) * float(right @ right)))
    if denominator <= 0:
        raise ValueError("invalid_face_dimensions")
    return degrees(acos(max(-1, min(1, float(left @ right) / denominator))))


def score_observations(observations, profile="neutral", reference_age_band="18_35", age_band="adult", reference_population=REFERENCE_POPULATION):
    if age_band == "minor":
        return {
            "status": "minor_not_scored", "overall_score": None, "categories": [], "metrics": [],
            "unsupported_categories": list(UNSUPPORTED_CATEGORIES),
        }

    reference = reference_for(profile)
    denominator_mean = reference["n_gn"][0]
    results = []
    for key, observed in observations.items():
        if key not in CATEGORIES:
            continue
        mean, sd = reference[key]
        if key in ANGLE_KEYS:
            reference_value, reference_sd, unit = mean, sd, "degree"
        else:
            reference_value, reference_sd, unit = mean / denominator_mean, sd / denominator_mean, "ratio"
        score, z = metric_score(observed, reference_value, reference_sd)
        results.append({
            "key": key, "category": CATEGORIES[key], "observed": round(float(observed), 5),
            "reference": round(reference_value, 5), "normalized_deviation": z, "score": score,
            "unit": unit, "status": "experimental_reference_similarity",
        })

    categories = []
    for category in ("proportions", "eyes", "nose", "lips", "chin"):
        items = [item for item in results if item["category"] == category]
        if items:
            categories.append({"key": category, "score": round(sum(item["score"] for item in items) / len(items)), "metric_count": len(items)})
    overall = round(sum(item["score"] for item in categories) / len(categories)) if categories else None
    return {
        "status": "experimental_reference_similarity", "overall_score": overall,
        "categories": categories, "metrics": results,
        "coverage": {"scored_metrics": len(results), "available_reference_metrics": len(CATEGORIES), "scored_categories": len(categories)},
        "unsupported_categories": list(UNSUPPORTED_CATEGORIES),
        "reference": {"profile": profile, "population": "Thai adults", "age_range": "18-35", "sample_size": 240, "source": SOURCE_URL, "version": REFERENCE_VERSION},
        "cohort_match": "within_reference_age_range" if reference_age_band == "18_35" else "outside_reference_age_range",
        "population_match": "within_reference_population" if reference_population == REFERENCE_POPULATION else "outside_reference_population",
        "reported_population": reference_population,
        "golden_ratio_included": False,
    }
