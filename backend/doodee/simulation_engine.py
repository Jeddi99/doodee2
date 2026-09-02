from . import procedure_catalog
from .analysis_engine import PROFILE_VIEWS
from .procedure_catalog import ProcedureSpec
from .reference_scoring import (
    MAX_REFERENCE_SHIFT, MIN_MEANINGFUL_DELTA, reference_target,
)

#: A reference selection arrives as `reference:<region>` so that consent, locking, quota and the
#: worker path need no branch of their own for it.
REFERENCE_PRESET_PREFIX = "reference:"

#: The most any selection may stack in one image, matching what the API accepts.
MAX_SELECTIONS = 6

#: Where a catalog procedure renders when the client names no level. The middle of the five.
DEFAULT_INTENSITY_LEVEL = 3

#: The three angles the fused engine renders and a client can switch between.
CANONICAL_VIEWS = ("front", "left_profile", "right_profile")


def resolve_preset(scan, region, preset_id):
    """Pick between the retired geometric presets and a target computed from this face.

    A `reference:<region>` id keeps the whole request shape identical to a preset request, so
    consent, locking, quota and the worker path need no branch of their own. Returns
    `(preset, target)`, where target is None for a preset.

    The twenty-four geometric ids are kept as input aliases, the same way `procedure_catalog`
    keeps its retired slugs. Nothing offers them any more — the panel serves the clinical
    catalogue — but simulations saved before that change carry them, and a stored row the worker
    can no longer re-render is a row that quietly stops existing. They resolve through
    `geometry_controls`, which maps them to the same sliders the catalogue compiles to, so they
    render on the one engine that is left rather than on a renderer of their own.
    """
    if isinstance(preset_id, str) and preset_id.startswith(REFERENCE_PRESET_PREFIX):
        target_region = preset_id[len(REFERENCE_PRESET_PREFIX):]
        if region is not None and target_region != region:
            raise ValueError("preset_region_mismatch")
        return reference_preset(scan, target_region)

    from .geometry_controls import get_preset

    if not isinstance(region, str) or not isinstance(preset_id, str):
        raise ValueError("invalid_preset")
    preset = get_preset(preset_id)
    if not preset or preset["region"] != region:
        raise ValueError("preset_region_mismatch")
    if not preset["available"]:
        raise ValueError("information_only_preset")
    return preset, None


def reference_preset(scan, region):
    """Build a one-off preset aimed at the published mean for this face.

    Shaped like a catalog preset so `simulate` and `_movement` need no special case, but the
    delta comes from the scan's own measurements instead of a fixed illustrative step.
    """
    if not isinstance(region, str):
        raise ValueError("invalid_preset")
    target = reference_target((scan.analysis_data or {}).get("reference_scores"), region)
    return {
        "id": f"reference:{region}",
        "region": region,
        "warpable": True,
        "source_view": target["source_view"],
        "delta": target["delta"],
        "movement": target["movement"],
        "exact": True,
        "max_shift": MAX_REFERENCE_SHIFT,
        "measurement": target,
        "related_procedures": [],
        "status": "educational_simulation",
    }, target


def has_profile_images(scan):
    """Profile presets depend on the stored photos, never on the scan mode name.

    `standard` and `full` both capture both profiles, so gating on the mode would block
    presets the engine can actually render.
    """
    return any(scan.image_objects.get(view) for view in PROFILE_VIEWS)


def is_procedure_selection(selection):
    """Which catalog this selection names.

    Presence of `procedure_id`, not absence of `preset_id`: a client that sends both is sending
    two different things and gets `invalid_selection` from the shape check below rather than a
    silent pick between them.
    """
    return isinstance(selection, dict) and "procedure_id" in selection


def _validate_procedure_selections(scan, selections):
    """Clinical-catalog selections, which only the fused renderer can express.

    The legacy renderer warps one photograph by a per-region delta. A catalog procedure is a
    pipeline of warps and surface work whose steps are defined per view, so there is no honest
    legacy fallback for it -- falling back would hand the user a picture missing most of what
    they asked for, which is the same failure `validate_selections` refuses a partial stack to
    avoid. A scan without all three photographs is therefore refused here.

    Returns `(specs, targets)` shaped like the legacy return so callers keep one unpacking;
    targets are all None because a reference target belongs to the legacy catalog only.
    """
    if not canonical_available(scan):
        raise ValueError("canonical_required")
    for selection in selections:
        level = selection.get("intensity_level", 3)
        if isinstance(level, bool) or not isinstance(level, int) or level not in range(1, 6):
            raise ValueError("invalid_intensity_level")
    specs = procedure_catalog.validate_procedure_selections(selections)
    # `validate_procedure_selections` dedups by source ref. Downstream the specs are zipped
    # against the selections that produced them, so a collapsed pair would pair every later
    # selection with the wrong spec -- refuse instead of rendering that.
    if len(specs) != len(selections):
        raise ValueError("duplicate_procedure")
    return list(specs), [None] * len(specs)


def validate_selections(scan, selections, has_profile_images):
    """Resolve a whole stack up front, or refuse the whole stack.

    Rendering the parts that happen to resolve would hand back an image that is quietly missing
    a region the user asked for, which is worse than an error: they would believe it. So every
    selection is checked before anything is downloaded, warped or charged against quota.
    Returns `(presets, targets)` in the order given.
    """
    if not isinstance(selections, list) or not selections:
        raise ValueError("empty_selections")
    if len(selections) > MAX_SELECTIONS:
        raise ValueError("too_many_selections")
    procedure = [is_procedure_selection(item) for item in selections]
    if any(procedure):
        # The two catalogs are stacked layers, not alternatives: one names a geometric outcome
        # and the other the clinical work behind it. A stack mixing them would be asking for the
        # same movement twice with no way to tell that is what it is doing.
        if not all(procedure):
            raise ValueError("mixed_catalogs")
        return _validate_procedure_selections(scan, selections)
    presets, targets, seen = [], [], set()
    for selection in selections:
        if not isinstance(selection, dict) or set(selection) != {"region", "preset_id"}:
            raise ValueError("invalid_selection")
        region = selection["region"]
        if not isinstance(region, str):
            raise ValueError("invalid_preset")
        if region in seen:
            raise ValueError("duplicate_region")
        seen.add(region)
        try:
            preset, target = resolve_preset(scan, region, selection["preset_id"])
        except ValueError as exc:
            # Which region failed, or a six-region stack reports a failure with no way to tell
            # the user which card to fix.
            raise ValueError(f"{exc}:{region}") from exc
        if target is not None and len(selections) > 1:
            # A reference target claims the face reaches a published mean, which stops being
            # true the moment another region moves a point it shares.
            raise ValueError("reference_cannot_stack")
        # Front and side are different source photos, so one render cannot hold both.
        if presets and preset["source_view"] != presets[0]["source_view"]:
            raise ValueError("mixed_source_view")
        if preset["source_view"] == "profile" and not has_profile_images:
            raise ValueError(f"profile_photos_required:{region}")
        presets.append(preset)
        targets.append(target)
    return presets, targets


def simulation_columns(selections, presets, view=None):
    """The `region`, `preset_id` and `parameters` one stack writes onto its Simulation row.

    One function because those three columns are one decision and there are two call sites --
    save and preview -- that would otherwise each have to know both catalogs. `region` and
    `preset_id` mirror the first selection: they predate stacking, and the serializer, the admin
    and every row saved before `selections` existed still read them.
    """
    if any(isinstance(preset, ProcedureSpec) for preset in presets):
        levels = [int(s.get("intensity_level", DEFAULT_INTENSITY_LEVEL)) for s in selections]
        return {
            # The first part of the face the pipeline touches. The catalog's own region names,
            # which are finer than the six the legacy catalog used -- `nose_alar`, not `nose`.
            "region": presets[0].pipeline[0].region,
            "preset_id": presets[0].source_ref,
            "parameters": {
                "procedures": [
                    {"procedure_id": spec.source_ref, "intensity_level": level,
                     "name_th": spec.name_th}
                    for spec, level in zip(presets, levels)
                ],
                # What the renderer is actually handed. There is deliberately no `delta` here:
                # a catalog procedure is a pipeline, not one number, and writing a stand-in
                # would put a value in the permanent record that nothing computed.
                "sliders": procedure_catalog.compile_warp_sliders(presets, levels),
                # Which of the three renders to hand back as *the* image. The fused model
                # produces all three either way; without this the answer was always the front,
                # so a chin projection -- the whole point of which is the side view -- could be
                # asked for and then shown from the one angle that cannot show it.
                **({"view": view} if view else {}),
            },
        }
    # A reference target carries the delta it was solved toward; a retired geometric preset
    # carries the slider it compiles to. Recording whichever exists rather than a single shape
    # both can be forced into: a `delta` invented for a preset that never had one is a number in
    # the permanent record that nothing computed.
    return {
        "region": selections[0]["region"],
        "preset_id": selections[0]["preset_id"],
        "parameters": {
            **({"delta": presets[0]["delta"],
                "deltas": [{"region": preset["region"], "preset_id": preset["id"],
                            "delta": preset["delta"]} for preset in presets]}
               if "delta" in presets[0] else
               {"presets": [{"region": preset["region"], "preset_id": preset["id"],
                             "slider": preset["slider"], "direction": preset["direction"]}
                            for preset in presets]}),
        },
    }


def related_union(presets):
    """The clinical names behind a stack. Catalog specs already are those names."""
    if any(isinstance(preset, ProcedureSpec) for preset in presets):
        return list(dict.fromkeys(preset.name_th for preset in presets))
    return list(dict.fromkeys(name for preset in presets
                              for name in preset.get("related_procedures", ())))


def canonical_available(scan):
    """Whether the fused pipeline can run on this scan at all.

    It needs the front photograph and nothing more. That used to read "all three views", which
    is what kept the single-image renderer alive: a `fast` scan captures obliques rather than
    profiles and so could never reach this engine. `fuse_views` works from rotations and
    landmark correspondences and has always handled one view or two — fewer angles means a
    weaker depth estimate, not a broken one.
    """
    return bool((scan.image_objects or {}).get("front"))


def is_reference_selection(selection):
    return str(selection.get("preset_id", "")).startswith(REFERENCE_PRESET_PREFIX)


def engine_for_selections(scan, selections):
    """"canonical" or "legacy" — which renderer this request must use."""
    # Not a preference. The legacy renderer has no way to express a catalog procedure, and
    # `validate_selections` has already refused the stack if this scan cannot run the fused one.
    if any(is_procedure_selection(s) for s in selections):
        return "canonical"
    # Reference targets used to be legacy-only: the fused engine runs sliders on a 3-D model and
    # projects back, so it had no loop that could aim at a measured value. `solve_reference_sliders`
    # is that loop, done on the landmarks alone before anything is rendered.
    return "canonical" if canonical_available(scan) else "legacy"


def _canonical_presets(selections):
    """Look each selection up in whichever catalog it names.

    Returns None if any selection has no counterpart, so the caller falls back whole rather
    than rendering a stack that quietly dropped one row — the same reasoning
    `validate_selections` gives for refusing a partial stack.
    """
    if any(is_procedure_selection(s) for s in selections):
        specs = [procedure_catalog.resolve_procedure(s.get("procedure_id")) for s in selections]
        return None if any(spec is None for spec in specs) else specs

    from .geometry_controls import get_preset

    presets = [get_preset(s.get("preset_id")) for s in selections]
    return None if any(p is None for p in presets) else presets


def _simulate_reference(scan, selection, download_fn, output_format, max_side, view,
                        refine=False, budget_key=None):
    """Render one region moved toward its published mean, through the fused engine.

    `validate_selections` refuses a reference stacked with anything else, so there is exactly one
    selection and one region. The measurement it reports is the same dict the legacy path
    returned, so the reference card on the client is unchanged — with `capped` now meaning
    something the solver actually measured rather than a shift ceiling: this face may sit further
    from the mean than the strongest setting can reach, and `reached_ratio` says how far it got.
    """
    from .canonical_pipeline import simulate_scan_views

    region = selection["preset_id"][len(REFERENCE_PRESET_PREFIX):]
    _preset, target = reference_preset(scan, region)
    result = simulate_scan_views(
        scan, {}, download_fn, reference_target=target,
        output_format=output_format, max_side=max_side,
        refine=refine, budget_key=budget_key,
    )
    legacy_view = view if view in result["views"] else result["legacy_view"]
    primary = result["views"][legacy_view]
    reached = result["reached_ratio"]
    measurement = {
        **target,
        "target_ratio": round(reached, 5),
        "capped": abs(reached - target["reference_ratio"]) > MIN_MEANINGFUL_DELTA * target["reference_ratio"],
    }
    extra = {
        "model_version": result["model_version"],
        "legacy_view": legacy_view,
        "related_procedures": result["related_procedures"],
        "views": {
            name: {"yaw": item["yaw"], "max_shift_px": item["max_shift_px"],
                   "held_back": item["held_back"], "source_object": item["source_object"],
                   "changed": item["changed"], "visible_percent": item["visible_percent"]}
            for name, item in result["views"].items()
        },
        "encoded_views": {name: item["encoded"] for name, item in result["views"].items()},
        "before_encoded": primary["before_encoded"],
        "dose_notes": result.get("dose_notes", []),
    }
    return primary["encoded"], [measurement], primary["focus_boxes"], extra


def simulate_canonical(scan, selections, download_fn, output_format=".png", max_side=1280,
                       view=None, refine=False, budget_key=None):
    """Render one simulation through the fused three-view model.

    Returns `(output, measurements, focus, extra)` where the first three match what
    `simulate()` returns, so callers keep their existing unpacking, and `extra`
    carries what only this engine produces — the other rendered views, the model
    version, and `dose_notes` — for `Simulation.view_objects` and `Simulation.parameters`.

    `refine` is the switch that decides whether this render pays a third party for skin texture,
    and it defaults to off. This function had no such parameter at all, so the worker could not
    have passed one and `simulate_scan_views` used its own default of True on every call — a
    preview and a save were charged alike. The kind of simulation is the worker's to know
    (`Simulation.kind`), not this function's to guess, so it is threaded rather than inferred.

    `budget_key` names this render for the AI ledger. It must identify the work — the simulation
    row — so that a Celery retry finds its own reservation and declines to buy the same pictures
    twice. Without it the refine pass sends nothing at all.
    """
    from .canonical_pipeline import simulate_scan_views
    from .geometry_controls import INTENSITY_SETTINGS, sliders_for_selections

    if any(is_reference_selection(selection) for selection in selections):
        return _simulate_reference(scan, selections[0], download_fn, output_format, max_side, view,
                                   refine=refine, budget_key=budget_key)

    presets = _canonical_presets(selections)
    if presets is None:
        raise ValueError("invalid_preset")

    if all(isinstance(preset, ProcedureSpec) for preset in presets):
        levels = [int(s.get("intensity_level", DEFAULT_INTENSITY_LEVEL)) for s in selections]
        if any(level not in INTENSITY_SETTINGS for level in levels):
            raise ValueError("invalid_intensity_level")
        # Keyed by source ref rather than by whatever the client sent: the resolver accepts the
        # retired slug as an input alias, and the pipeline looks the level up by ref.
        levelled = [
            {"procedure_id": spec.source_ref, "intensity_level": level}
            for spec, level in zip(presets, levels)
        ]
        sliders = procedure_catalog.compile_warp_sliders(presets, levels)
    else:
        # This app's UI has no intensity control, so every selection renders at the
        # catalog's own default rather than at whatever `sliders_for_selections`
        # would read off a missing key. Kept as a named default so that adding the
        # control later is a UI change and not a change of meaning here.
        levelled = [
            {**s, "intensity_level": s.get("intensity_level", preset["default_intensity_level"])}
            for s, preset in zip(selections, presets)
        ]
        for s in levelled:
            if s["intensity_level"] not in INTENSITY_SETTINGS:
                raise ValueError("invalid_intensity_level")
        sliders = sliders_for_selections(levelled, presets)

    result = simulate_scan_views(
        scan,
        sliders,
        download_fn,
        selections=levelled,
        presets=presets,
        output_format=output_format,
        max_side=max_side,
        refine=refine,
        budget_key=budget_key,
    )
    # The pipeline picks a view from the presets' own source view, which for catalog specs is
    # always the front. An explicit request wins over that; an unrenderable one is ignored
    # rather than raised, because every view was rendered and any of them is a true answer.
    legacy_view = view if view in result["views"] else result["legacy_view"]
    primary = result["views"][legacy_view]
    extra = {
        "model_version": result["model_version"],
        "legacy_view": legacy_view,
        "related_procedures": result["related_procedures"],
        "views": {
            name: {"yaw": view["yaw"], "max_shift_px": view["max_shift_px"],
                   "held_back": view["held_back"], "source_object": view["source_object"],
                   # Read by the worker, which does not store a view nothing moved in, and
                   # records the rest so the screen can say how much this actually did. Both
                   # measurements travel: `visible_percent` is how much of the frame moved and
                   # `peak_delta` how far the furthest pixel went, and the verdict needs both.
                   # `.get` for the same reason `dose_notes` below uses it: a stand-in renderer
                   # driven from a fixture is a legitimate caller and does not measure a peak. An
                   # absent peak reaches the client as "no claim", never as zero.
                   "changed": view["changed"], "visible_percent": view["visible_percent"],
                   "peak_delta": view.get("peak_delta")}
            for name, view in result["views"].items()
        },
        "encoded_views": {name: view["encoded"] for name, view in result["views"].items()},
        "before_encoded": primary["before_encoded"],
        # What the stack asked for and did not get, for the dose card. `.get` rather than `[]`
        # because a mocked renderer is a legitimate caller of this function and an absent key
        # means "this render made no claim", which is the same thing as no notes.
        "dose_notes": result.get("dose_notes", []),
    }
    return primary["encoded"], result["measurements"], primary["focus_boxes"], extra
