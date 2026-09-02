import os
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient
import cv2
import numpy as np

from .geometry_controls import CONTROLS
from .procedure_catalog import (
    BY_SOURCE_REF, CATEGORIES, CATEGORY_NUMBERS, INTENSITY_SCALES, PROCEDURES, REFINE_PLANS,
    TECHNIQUE_BY_REF, canonical_technique, compile_warp_sliders, draws_surface,
    facial_categories, public_catalog, refine_plan, surface_steps,
    validate_procedure_selections,
)
from .surface_effects import (
    _LOWER_LASH, _UPPER_LASH, OpType, PRIMITIVE_TYPES, Step, _lab_float, _luma_result,
    apply_surface_pipeline, flatten_op, inpaint_op, region_mask, steps_mask,
)


def _landmarks():
    angle = np.linspace(0, 2 * np.pi, 478, endpoint=False)
    points = np.zeros((478, 3), np.float32)
    points[:, 0] = 80 + np.cos(angle) * 42
    points[:, 1] = 85 + np.sin(angle) * 55
    return points


def _eye_landmarks(size=512):
    """`_landmarks` scaled up, with the two eye rings replaced by actual eye-shaped rings.

    The ring geometry has to be real for these tests: the fault they guard against is a mask built
    from the lash line landing on the eye it traces, and a ring smeared around an ellipse cannot
    show that either way.
    """
    angle = np.linspace(0, 2 * np.pi, 478, endpoint=False)
    points = np.zeros((478, 3), np.float32)
    points[:, 0] = size * .5 + np.cos(angle) * size * .30
    points[:, 1] = size * .5 + np.sin(angle) * size * .38
    half_width, half_height = size * .09, size * .030
    steps = None
    for (upper, lower), centre in zip(zip(_UPPER_LASH, _LOWER_LASH),
                                      ((size * .35, size * .43), (size * .65, size * .43))):
        steps = np.linspace(0, np.pi, len(upper))
        for index, landmark in enumerate(upper):     # inner corner over the top to outer corner
            points[landmark] = (centre[0] - half_width * np.cos(steps[index]),
                                centre[1] - half_height * np.sin(steps[index]), 0)
        for index, landmark in enumerate(lower):     # ...and back underneath
            points[landmark] = (centre[0] - half_width * np.cos(steps[index]),
                                centre[1] + half_height * np.sin(steps[index]), 0)
    assert steps is not None
    return points


class ProcedureCatalogTests(SimpleTestCase):
    def test_data_txt_contract_is_closed(self):
        self.assertEqual(len(PROCEDURES), 92)
        self.assertEqual(len(BY_SOURCE_REF), 92)
        self.assertEqual(len(CATEGORIES), 13)
        self.assertEqual(set(TECHNIQUE_BY_REF), set(BY_SOURCE_REF))
        self.assertEqual(sum(item["available"] for item in public_catalog()), 70)
        # Category 13 (dental) is retired: no category, no rows, and 13 is never reissued.
        self.assertNotIn("dental", CATEGORIES)
        self.assertNotIn(13, set(CATEGORY_NUMBERS.values()))
        self.assertFalse([ref for ref in BY_SOURCE_REF if ref.startswith("13.")])

    def test_public_contract_uses_numeric_ids_and_exact_raw_techniques(self):
        catalog = public_catalog()
        self.assertEqual(catalog[0]["id"], "1.1")
        self.assertEqual(catalog[-1]["id"], "14.13")
        self.assertNotIn("pipeline", catalog[0])
        self.assertEqual(canonical_technique("test / dd2"), "Hybrid")
        # The full 92 remain reachable for the data.txt audit, raw technique labels intact.
        every = public_catalog(include_unavailable=True)
        self.assertEqual(len(every), 92)
        self.assertEqual(every[-1]["id"], "14.14")
        self.assertEqual(every[-1]["technique_raw"], "-")
        self.assertFalse(every[-1]["available"])

    def test_the_public_catalog_drops_every_row_the_renderer_would_refuse(self):
        served = public_catalog()
        self.assertEqual(len(served), 70)
        self.assertTrue(all(item["available"] for item in served))
        # `breast` is the one category with nothing left, so it must not be offered at all.
        self.assertNotIn("breast", facial_categories())
        self.assertEqual(len(facial_categories()), 12)
        self.assertFalse(any(item["category_id"] == CATEGORY_NUMBERS["breast"] for item in served))

    def test_filtering_the_catalog_changes_nothing_a_simulation_depends_on(self):
        """source_ref, pipeline and intensity mode are the simulation's contract, not the list."""
        for ref in ("1.1", "5.2", "6.1", "7.1", "12.2", "14.13"):
            procedure = BY_SOURCE_REF[ref]
            self.assertEqual(procedure.source_ref, ref)
            self.assertTrue(procedure.pipeline)
            self.assertIn(procedure.intensity_mode, ("variable", "discrete"))
        self.assertEqual(len(PROCEDURES), 92)
        self.assertEqual({item["id"] for item in public_catalog()},
                         {p.source_ref for p in PROCEDURES if p.supported})

    def test_selection_accepts_numeric_id_and_retired_slug_alias(self):
        numeric = validate_procedure_selections([{"procedure_id": "1.6", "intensity_level": 3}])
        alias = validate_procedure_selections([{"procedure_id": "facelift"}])
        self.assertEqual(numeric, alias)
        self.assertLessEqual(set(compile_warp_sliders(numeric)), set(CONTROLS))
        self.assertTrue(surface_steps(numeric, "left_profile"))

    def test_out_of_scope_rows_fail_loudly(self):
        with self.assertRaisesRegex(ValueError, "procedure_out_of_scope:1.7"):
            validate_procedure_selections([{"procedure_id": "1.7"}])

    def test_catalog_classifies_variable_discrete_and_unavailable_rows(self):
        catalog = {item["id"]: item for item in public_catalog()}
        for ref in ("1.1", "3.1", "4.4", "5.2", "7.1"):
            self.assertEqual(catalog[ref]["intensity_mode"], "variable")
            self.assertEqual([level["scale"] for level in catalog[ref]["intensity_levels"]],
                             list(INTENSITY_SCALES.values()))
        for ref in ("2.7", "5.4", "6.1", "6.7", "14.8"):
            self.assertEqual(catalog[ref]["intensity_mode"], "discrete")
            self.assertNotIn("intensity_levels", catalog[ref])
        self.assertNotIn("8.1", catalog)
        every = {item["id"]: item for item in public_catalog(include_unavailable=True)}
        self.assertEqual(every["8.1"]["intensity_mode"], "unavailable")

    def test_a_row_that_cannot_be_seen_on_any_face_is_not_offered(self):
        """Two rows asked for a tone shift below the threshold any eye can resolve.

        `tone_op` scales its delta by the step strength, so 14.1 asked for .18 x 4 = 0.72 units of
        L and 12.3 for .24 x 4 = 0.96, against a 3-step visibility floor. Rendered on two different
        scans, 14.1 cleared zero pixels on both. They were on sale, they spent a preview, and they
        returned the photograph -- which on screen is indistinguishable from a broken renderer.

        Hidden rather than strengthened: nothing behind an IV vitamin drip or a herbal tonic says
        by how much it lightens a face, so there is no honest number to raise them to.
        """
        catalog = {item["id"]: item for item in public_catalog()}
        every = {item["id"]: item for item in public_catalog(include_unavailable=True)}
        for ref in ("12.3", "14.1"):
            self.assertNotIn(ref, catalog, f"{ref} is back on sale")
            self.assertFalse(every[ref]["available"])
            self.assertFalse(BY_SOURCE_REF[ref].pipeline, f"{ref} still renders")
            self.assertEqual(every[ref]["unavailable_reason"],
                             "ไม่มีผลที่เห็นได้ในภาพถ่ายใบหน้า จึงไม่จำลองให้")
        # And a row retired for the other reason still says the other reason.
        self.assertEqual(every["1.7"]["unavailable_reason"], "หัตถการนอกขอบเขตใบหน้า")

    def test_render_kind_says_what_the_pipeline_does_and_agrees_with_the_source_label(self):
        """The chip on a procedure card, and the reason it stopped printing `test`.

        `technique` holds data.txt's own build-stage names -- `dd2`, `test`, `Hybrid` -- and those
        were being rendered verbatim, so a customer choosing laser skin tightening saw a chip
        reading "test". `render_kind` answers the same question from the pipeline instead. The
        second half of this test is what makes that a rename and not a new claim: across every
        renderable row the two agree exactly.
        """
        expected = {"dd2": "shape", "test": "surface", "Hybrid": "shape_surface"}
        for item in public_catalog():
            spec = BY_SOURCE_REF[item["id"]]
            warps = any(step.type == OpType.WARP_OP for step in spec.pipeline)
            draws = any(step.type != OpType.WARP_OP for step in spec.pipeline)
            self.assertEqual(
                item["render_kind"],
                "shape_surface" if warps and draws else "shape" if warps else "surface",
                item["id"])
            self.assertEqual(item["render_kind"], expected[item["technique"]], item["id"])
        # A row with no pipeline makes no claim about what it would draw.
        every = {item["id"]: item for item in public_catalog(include_unavailable=True)}
        self.assertIsNone(every["1.7"]["render_kind"])

    def test_quantity_notes_are_attached_to_relevant_variable_levels(self):
        catalog = {item["id"]: item for item in public_catalog()}
        self.assertEqual(catalog["3.1"]["intensity_levels"][2]["quantity_note_th"], "ประมาณ 50u")
        self.assertEqual(catalog["4.4"]["quantity_note_th"], "ประมาณ 1.5 - 2.0 cc")
        self.assertEqual(catalog["5.2"]["intensity_levels"][4]["quantity_note_th"], "ประมาณ 4.0+ mm")

    def test_variable_geometry_uses_the_five_level_scale_curve(self):
        # The base is read off the catalog rather than repeated here: it is a tuning number, and
        # asserting it a second time only means every tuning change lands as a test failure that
        # says nothing. What must hold is that the five levels are that base times the curve.
        procedure = BY_SOURCE_REF["5.2"]
        base = next(step.params["value"] for step in procedure.pipeline
                    if step.params.get("control") == "noseBridgeHeight")
        values = [compile_warp_sliders((procedure,), (level,))["noseBridgeHeight"]
                  for level in range(1, 6)]
        self.assertEqual(values, [base * scale for scale in INTENSITY_SCALES.values()])
        self.assertEqual(values, sorted(values))

    def test_variable_surface_strength_scales_but_discrete_surface_is_fixed(self):
        variable = BY_SOURCE_REF["4.1"]
        base = variable.pipeline[0].params["strength"]
        for level, scale in INTENSITY_SCALES.items():
            self.assertAlmostEqual(
                surface_steps((variable,), "front", (level,))[0].params["strength"], base * scale)

        discrete = BY_SOURCE_REF["6.1"]
        level_one = surface_steps((discrete,), "front", (1,))[0].params
        level_five = surface_steps((discrete,), "front", (5,))[0].params
        self.assertEqual(level_one, level_five)


class SurfacePipelineTests(SimpleTestCase):
    def test_region_mask_and_surface_edit_are_bounded(self):
        image = np.full((170, 160, 3), 128, np.uint8)
        points = _landmarks()
        mask = region_mask(image.shape, points, "dimples")
        steps = (Step(OpType.SHADE_OP, "dimples", {"groove_depth": .15, "ridge_lift": .08}),)
        result = apply_surface_pipeline(image, points, steps)
        delta = np.max(np.abs(result.astype(np.int16) - image.astype(np.int16)), axis=2)
        changed = delta > 0
        self.assertTrue(changed.any())
        self.assertFalse(changed[mask <= 0].any())
        supported = mask > 0
        self.assertGreaterEqual(int(delta[supported].max()), 3)
        self.assertGreaterEqual(float(np.mean(delta[supported] >= 3)), .02)

    def test_flattening_a_fold_leaves_the_pores_in_the_skin(self):
        """The band this suppresses contains the pore, not only the fold it is aimed at.

        `fine_share` puts the lower edge of the stopband at around a pixel and a half on a
        preview-sized photograph, which is pore scale, so removing the band whole removed the skin
        with it and a cheek came back as an even sheet -- read as blur, though nothing here blurs.
        `micro_keep` is what splits the band, and this is the assertion that it does.
        """
        rng = np.random.default_rng(11)
        size = 320
        columns = np.arange(size, dtype=np.float32)
        mask = np.zeros((size, size), np.uint8)
        cv2.rectangle(mask, (40, 40), (280, 280), 255, -1)
        inside = mask > 0
        scale = float(np.sqrt(np.count_nonzero(mask) + 1))
        fine, mid, coarse = scale * .012, scale * np.sqrt(.012 * .055), scale * .055

        fold = 26 * np.exp(-((columns[None, :] - 150) ** 2) / (2 * (coarse * .8) ** 2))
        pores = cv2.GaussianBlur(rng.standard_normal((size, size)).astype(np.float32), (0, 0), fine * .8)
        pores *= 7.0 / float(np.std(pores))
        skin = np.clip(150 - fold + pores, 0, 255).astype(np.uint8)
        image = cv2.cvtColor(skin, cv2.COLOR_GRAY2BGR)

        def disturbance(picture):
            """How far this result moved the original, measured in each band separately."""
            delta = (cv2.cvtColor(picture, cv2.COLOR_BGR2GRAY).astype(np.float32)
                     - cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32))
            blurs = [cv2.GaussianBlur(delta, (0, 0), sigma) for sigma in (fine, mid, coarse)]
            return (float(np.std((blurs[0] - blurs[1])[inside])),
                    float(np.std((blurs[1] - blurs[2])[inside])))

        # Measured as a disturbance rather than as leftover energy: the two bands are Gaussian
        # differences, not orthogonal projections, so a fold suppressed in one of them shows up in
        # the other's cross terms and the raw energies do not isolate what changed.
        pore_kept, fold_kept = disturbance(flatten_op(image, mask, {"strength": .35, "micro_keep": .35}))
        pore_gone, fold_gone = disturbance(flatten_op(image, mask, {"strength": .35, "micro_keep": 0.0}))

        # The pore band is left markedly more alone...
        self.assertLess(pore_kept, pore_gone * .8)
        # ...and more alone than the fold band is, which is the whole claim: `micro_keep` spares
        # texture specifically, rather than just turning the operation down. Stated as a comparison
        # between the two ratios because the bands are Gaussian differences and not orthogonal, so
        # a single absolute threshold on either one is a number about this fixture, not about the
        # behaviour.
        self.assertLess(pore_kept / pore_gone, fold_kept / fold_gone)
        # And the fold is still genuinely worked on.
        self.assertGreater(fold_kept, fold_gone * .8)
        self.assertGreater(fold_kept, 0.4)

    def test_removal_paints_compact_spots_and_leaves_the_face_alone(self):
        """A blemish is a small round island. A crease is the face and must survive.

        The detector's reference blur used to be derived from the whole frame rather than from the
        region, which made it narrower than the thing it was looking for: `score` peaked in a ring
        around a blemish and read zero through its middle, so what got selected was an annulus plus
        whatever grain cleared a fixed 3.0 threshold. On a real cheek that was a quarter of the
        region, in hundreds of islands -- the smudged patches this pins shut.
        """
        rng = np.random.default_rng(3)
        size = 400
        grain = cv2.GaussianBlur(rng.standard_normal((size, size)).astype(np.float32), (0, 0), 1.1)
        skin = np.clip(158 + grain * 6.0, 0, 255).astype(np.uint8)
        image = cv2.cvtColor(skin, cv2.COLOR_GRAY2BGR)
        spots = ((120, 140), (250, 190), (170, 280))
        for spot in spots:
            cv2.circle(image, spot, 3, (66, 62, 70), -1)
        # A crease: as dark as the spots and far longer than it is wide.
        cv2.ellipse(image, (200, 340), (90, 4), 12, 0, 360, (70, 66, 74), -1)
        image = cv2.GaussianBlur(image, (0, 0), 1.0)
        region = np.zeros((size, size), np.uint8)
        cv2.rectangle(region, (30, 30), (370, 370), 255, -1)

        result = inpaint_op(image, region, {"strength": 1.0})
        moved = np.max(np.abs(result.astype(np.int16) - image.astype(np.int16)), axis=2) > 2

        for spot in spots:
            window = moved[spot[1] - 4:spot[1] + 5, spot[0] - 4:spot[0] + 5]
            self.assertTrue(window.any(), f"blemish at {spot} was not touched")
        crease = np.zeros((size, size), np.uint8)
        cv2.ellipse(crease, (200, 340), (90, 4), 12, 0, 360, 255, -1)
        self.assertLess(float(np.mean(moved[crease > 0])), .15, "the crease was painted over")
        # And nothing like a quarter of the region: this is spot removal, not resurfacing.
        self.assertLess(float(np.mean(moved[region > 0])), .04)

    def test_relief_and_smoothing_leave_chroma_alone(self):
        """A groove is a shading change: the skin keeps the colour the camera recorded.

        The byte-LAB round trip this replaced re-quantised a and b on every operation, which
        moved chroma across the whole frame -- not only where the edit landed -- and stacked
        into a visible tint once a procedure ran several surface steps over one cheek. What is
        left is the 8-bit output grid, which no implementation can avoid.
        """
        # A saturated, uneven ground: on flat grey a and b sit at the neutral point and any
        # drift in them would round back to the same byte, hiding exactly what this pins down.
        rows = np.linspace(0, 1, 170, dtype=np.float32)[:, None]
        image = np.dstack([
            np.clip(60 + 150 * rows + 0 * np.arange(160, dtype=np.float32), 0, 255),
            np.clip(90 + 60 * rows + np.linspace(0, 40, 160, dtype=np.float32), 0, 255),
            np.clip(190 - 40 * rows + np.linspace(0, 30, 160, dtype=np.float32), 0, 255),
        ]).astype(np.uint8)
        points = _landmarks()

        def chroma(bgr):
            lab = cv2.cvtColor(bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)
            return lab[:, :, 1], lab[:, :, 2]

        before = chroma(image)
        for step in (Step(OpType.SHADE_OP, "dimples", {"groove_depth": .24, "ridge_lift": .12}),
                     Step(OpType.FLATTEN_OP, "dimples", {"strength": .75})):
            after = chroma(apply_surface_pipeline(image, points, (step,)))
            for channel, (was, now) in enumerate(zip(before, after)):
                drift = np.abs(now - was)
                # Inside the edit, chroma may only move by what the output byte grid forces.
                self.assertLess(float(drift.max()), 1.5, f"{step.type} channel {channel}")
                self.assertLess(float(drift.mean()), .25, f"{step.type} channel {channel}")

    def test_a_luminance_step_of_zero_is_a_near_lossless_round_trip(self):
        """The decode/encode pair around an L-only edit must not be a colour filter of its own.

        One code value is the float32 LAB conversion's own rounding and is the floor here; the
        byte-LAB path this replaced moved chroma several times that, in a direction that did not
        cancel, which is what made a stack of surface steps read as a tint.
        """
        image = np.dstack([
            np.tile(np.linspace(20, 240, 160, dtype=np.float32), (170, 1)),
            np.tile(np.linspace(200, 30, 160, dtype=np.float32), (170, 1)),
            np.tile(np.linspace(70, 180, 170, dtype=np.float32)[:, None], (1, 160)),
        ]).astype(np.uint8)
        unchanged = _luma_result(_lab_float(image), np.zeros(image.shape[:2], np.float32))
        drift = np.abs(unchanged.astype(np.int16) - image.astype(np.int16))
        self.assertLessEqual(int(drift.max()), 1)
        self.assertLess(float(drift.mean()), .5)


class EyelidGeometryTests(SimpleTestCase):
    """The lid bands must sit on eyelid skin, not on the eye.

    The convex hull these replaced was built from the lash-line landmarks, and the hull of the lash
    line is the palpebral aperture itself: 68% of `upper_eyelids` and 48% of `under_eyes` landed on
    the globe, so every groove and ridge was painted across the iris and sclera. This is the check
    that would have caught it.
    """

    def test_lid_bands_stay_off_the_eyeball(self):
        points = _eye_landmarks()
        shape = (512, 512, 3)
        # The aperture: the full MediaPipe eye rings, which is what a viewer calls "the eye".
        aperture = np.zeros(shape[:2], np.uint8)
        for ring in ((33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246),
                     (263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466)):
            cv2.fillConvexPoly(aperture, cv2.convexHull(
                np.rint(points[list(ring), :2]).astype(np.int32)), 255)
        eye = aperture > 0
        for region in ("upper_eyelids", "under_eyes"):
            mask = region_mask(shape, points, region) > 0
            self.assertTrue(mask.any(), region)
            share = float((mask & eye).sum()) / float(mask.sum())
            self.assertLess(share, .10, f"{region} is {share:.0%} on the eyeball")

    def test_a_lid_band_is_one_connected_strip_per_eye(self):
        points = _eye_landmarks()
        mask = region_mask((512, 512, 3), points, "upper_eyelids")
        count, _ = cv2.connectedComponents((mask > 0).astype(np.uint8))
        self.assertEqual(count - 1, 2, "expected exactly one band per eye")


class EnvFileTests(SimpleTestCase):
    """The loader that makes backend/.env take effect on the host.

    Without it Django read every setting from an environment nothing had populated, so a correctly
    filled-in file produced `available() is False` -- which reads as a dead provider rather than as
    a file that was never opened.
    """

    def _write(self, text):
        import tempfile
        from pathlib import Path
        directory = tempfile.mkdtemp()
        path = Path(directory) / ".env"
        path.write_text(text, encoding="utf-8")
        return path

    def test_a_bare_api_line_is_routed_by_its_prefix_not_its_name(self):
        """`api = ...` is the shape the render prototype's own .env uses.

        Routed by value, because the name says nothing about which transport it opens and a key
        sent to the wrong host comes back as a 401 that looks exactly like a revoked key.
        """
        from .envfile import load_env

        for value, expected in (("vck_gatewaykey", "AI_GATEWAY_API_KEY"),
                                ("bfl-style-key", "BFL_API_KEY")):
            with self.subTest(value=value):
                path = self._write(f"api = {value}\n")
                with patch.dict(os.environ, {}, clear=True):
                    load_env(path)
                    self.assertEqual(os.environ.get(expected), value)

    def test_a_real_environment_variable_always_beats_the_file(self):
        """Compose exports these before the process starts; the file must never overwrite it."""
        from .envfile import load_env

        path = self._write("AI_GATEWAY_API_KEY=vck_fromfile\nGATEWAY_MODEL=bfl/flux-pro-1.0-fill\n")
        with patch.dict(os.environ, {"AI_GATEWAY_API_KEY": "vck_fromshell"}, clear=True):
            load_env(path)
            self.assertEqual(os.environ["AI_GATEWAY_API_KEY"], "vck_fromshell")
            self.assertEqual(os.environ["GATEWAY_MODEL"], "bfl/flux-pro-1.0-fill")

    def test_comments_blanks_quotes_and_a_windows_bom_are_all_survivable(self):
        from .envfile import load_env
        from pathlib import Path
        import tempfile

        path = Path(tempfile.mkdtemp()) / ".env"
        path.write_text('# a comment\n\nFLUX_BACKEND="gateway"\nEMPTY=\nnot a pair\n',
                        encoding="utf-8-sig")   # utf-8-sig writes the BOM a Windows editor leaves
        with patch.dict(os.environ, {}, clear=True):
            load_env(path)
            self.assertEqual(os.environ.get("FLUX_BACKEND"), "gateway")
            self.assertNotIn("EMPTY", os.environ)
            self.assertNotIn("# a comment", os.environ)

    def test_a_missing_file_is_not_an_error(self):
        """A checkout with no .env at all must still import and run on its defaults."""
        from .envfile import load_env
        with patch.dict(os.environ, {}, clear=True):
            load_env("/nonexistent/.env")


def _budgeted():
    """The AI-budget reservation stubbed out, for the tests that are about masks, not money.

    `_refine_views` will not put a call on the wire without a ledger row holding budget for it —
    an unreserved paid call is the failure that rule exists to prevent, and it is proved in
    `tests.SimulationPolishBudgetTest`, which has a database to hold a row in. These are
    `SimpleTestCase`s about mask geometry and call grouping, so the ledger is stubbed here and
    the geometry is what gets asserted.
    """
    from contextlib import ExitStack

    stack = ExitStack()
    stack.enter_context(patch("doodee.flux_refine.reserve_budget", return_value="ledger"))
    stack.enter_context(patch("doodee.flux_refine.settle_budget"))
    return stack


class RefinePlanTests(SimpleTestCase):
    def test_every_plan_names_a_known_kind_and_a_catalogued_prompt(self):
        from .flux_refine import PROMPTS
        for ref, (kind, prompt_key) in REFINE_PLANS.items():
            self.assertIn(ref, BY_SOURCE_REF, ref)
            self.assertIn(kind, ("erase", "fill", "polish"), ref)
            self.assertIn(prompt_key, PROMPTS, ref)

    def test_a_plan_only_exists_where_stage_one_drew_something(self):
        """Stage 2 refines what stage 1 drew. A row with no surface step has no mask to hand over,
        and a geometry-only row has nothing for a generative pass to invent."""
        for ref in REFINE_PLANS:
            procedure = BY_SOURCE_REF[ref]
            self.assertTrue(procedure.supported, ref)
            self.assertTrue(surface_steps((procedure,), "front", (3,)), ref)

    def test_geometry_rows_are_never_sent_to_a_paid_endpoint(self):
        for ref in ("5.1", "5.3", "7.1", "7.2", "7.3", "7.4", "3.1", "6.3", "6.5"):
            self.assertIsNone(refine_plan(BY_SOURCE_REF[ref]), ref)

    def test_a_dead_provider_returns_the_deterministic_render_untouched(self):
        """The local render is always complete, so stage 2 can only ever add.

        A key that expires, a rate limit that outlasts its retries, a model that reframes the crop:
        none of them may turn a preview that already looked right into a failed simulation.
        """
        from unittest.mock import patch
        from .canonical_pipeline import _refine_views

        image = np.full((512, 512, 3), 120, np.uint8)
        points = _eye_landmarks()
        specs = [BY_SOURCE_REF["6.1"]]

        with patch("doodee.flux_refine.available", return_value=False):
            untouched = _refine_views(image, points, specs, [3], "front", 1.,
                                      user=object(), budget_key="pipeline-test")
        self.assertTrue(np.array_equal(untouched, image), "no key must mean no change")

        with _budgeted(), patch("doodee.flux_refine.available", return_value=True), \
                patch("doodee.flux_refine.refine", side_effect=RuntimeError("provider is down")):
            survived = _refine_views(image, points, specs, [3], "front", 1.,
                                     user=object(), budget_key="pipeline-test")
        self.assertTrue(np.array_equal(survived, image), "a raising provider must not propagate")

    def test_a_working_provider_is_handed_the_drawn_region_and_nothing_else(self):
        from unittest.mock import patch
        from .canonical_pipeline import _refine_views

        image = np.full((512, 512, 3), 120, np.uint8)
        points = _eye_landmarks()
        seen = {}

        def record(img, mask, kind, prompt_key, *args, **kwargs):
            seen.update(mask=mask, kind=kind, prompt_key=prompt_key)
            return np.full_like(img, 200)

        with _budgeted(), patch("doodee.flux_refine.available", return_value=True), \
                patch("doodee.flux_refine.refine", side_effect=record):
            out = _refine_views(image, points, [BY_SOURCE_REF["6.1"]], [3], "front", 1.,
                                user=object(), budget_key="pipeline-test")
        self.assertFalse(np.array_equal(out, image))
        self.assertEqual((seen["kind"], seen["prompt_key"]), REFINE_PLANS["6.1"])
        # Read off the procedure rather than named here: what must hold is that the paid edit is
        # confined to whatever stage 1 drew, whichever region that turns out to be.
        allowed = np.zeros(image.shape[:2], bool)
        for step in surface_steps((BY_SOURCE_REF["6.1"],), "front", (3,)):
            allowed |= region_mask(image.shape, points, step.region) > 0
        self.assertTrue(allowed.any())
        self.assertFalse(((seen["mask"] > 0) & ~allowed).any())

    def test_the_refine_mask_cannot_reach_past_what_stage_one_touched(self):
        points = _eye_landmarks()
        shape = (512, 512, 3)
        for ref in REFINE_PLANS:
            steps = surface_steps((BY_SOURCE_REF[ref],), "front", (3,))
            handed = steps_mask(shape, points, steps) > 0
            allowed = np.zeros(shape[:2], bool)
            for step in steps:
                allowed |= region_mask(shape, points, step.region) > 0
            self.assertFalse((handed & ~allowed).any(), ref)

    def test_every_drawn_row_is_refined_and_every_warped_one_is_not(self):
        """Eligibility is "did stage 1 paint here", not a hand-maintained list.

        The twelve named plans used to *be* the list, which left 37 rows rendering a flat painted
        patch next to real skin with no way to tell from the catalog that they had been skipped.
        """
        drawn = [p for p in PROCEDURES if p.supported and draws_surface(p)]
        warped = [p for p in PROCEDURES if p.supported and not draws_surface(p)]
        self.assertTrue(drawn and warped, "both kinds must exist or this proves nothing")
        for procedure in drawn:
            self.assertIsNotNone(refine_plan(procedure), procedure.source_ref)
        for procedure in warped:
            self.assertIsNone(refine_plan(procedure), procedure.source_ref)
        # An unsupported row has an empty pipeline, so it can never reach a paid endpoint.
        for procedure in PROCEDURES:
            if not procedure.supported:
                self.assertIsNone(refine_plan(procedure), procedure.source_ref)

    def test_the_default_plan_is_a_polish_with_a_prompt_that_only_preserves(self):
        from .flux_refine import PROMPTS
        plain = BY_SOURCE_REF["2.9"]        # ผลัดเซลล์ผิวหน้า -- a tone pass, no named override
        self.assertNotIn(plain.source_ref, REFINE_PLANS)
        self.assertEqual(refine_plan(plain), ("polish", "surface_polish"))
        for procedure in PROCEDURES:
            plan = refine_plan(procedure)
            if plan is not None:
                self.assertIn(plan[0], ("erase", "fill", "polish"), procedure.source_ref)
                self.assertIn(plan[1], PROMPTS, procedure.source_ref)

    def test_a_stack_costs_one_polish_call_over_the_union_of_what_it_drew(self):
        """Grouped, not per-procedure: six rows must not mean six paid calls and six seams."""
        from unittest.mock import patch
        from .canonical_pipeline import _refine_views

        image = np.full((512, 512, 3), 120, np.uint8)
        points = _eye_landmarks()
        specs = [BY_SOURCE_REF["2.9"], BY_SOURCE_REF["2.6"], BY_SOURCE_REF["4.1"]]
        calls = []

        def record(img, mask, kind, prompt_key, *args, **kwargs):
            calls.append((kind, prompt_key, mask.copy()))
            return img

        with _budgeted(), patch("doodee.flux_refine.available", return_value=True), \
                patch("doodee.flux_refine.refine", side_effect=record):
            _refine_views(image, points, specs, [3, 3, 3], "front", 1.,
                          user=object(), budget_key="pipeline-test")

        self.assertEqual(len(calls), 1, "three drawn rows must collapse to one polish call")
        kind, prompt_key, mask = calls[0]
        self.assertEqual(kind, "polish")
        # Three rows with different subjects have no single feature to name, so the union takes the
        # preserving default rather than one row's wording applied to the other two.
        self.assertEqual(prompt_key, "surface_polish")
        union = np.zeros(image.shape[:2], bool)
        for spec in specs:
            union |= steps_mask(image.shape, points, surface_steps((spec,), "front", (3,))) > 0
        self.assertTrue(np.array_equal(mask > 0, union))

    def test_a_single_feature_keeps_its_own_prompt_and_fill_runs_before_polish(self):
        from unittest.mock import patch
        from .canonical_pipeline import _refine_views

        image = np.full((512, 512, 3), 120, np.uint8)
        points = _eye_landmarks()
        calls = []

        def record(img, mask, kind, prompt_key, *args, **kwargs):
            calls.append((kind, prompt_key, mask.copy()))
            return img

        # One row, one subject: the eyelid wording beats the generic one.
        with _budgeted(), patch("doodee.flux_refine.available", return_value=True), \
                patch("doodee.flux_refine.refine", side_effect=record):
            _refine_views(image, points, [BY_SOURCE_REF["6.1"]], [3], "front", 1.,
                          user=object(), budget_key="pipeline-test")
        self.assertEqual([(kind, key) for kind, key, _ in calls], [("polish", "eyelid_fold")])

        # 10.2 builds a hairline the deterministic pass drew nothing to keep, so it fills first --
        # and the polish that follows has to cover what the fill wrote, or the built hairline is
        # the one region in the frame that never got matched to the photograph.
        calls.clear()
        with _budgeted(), patch("doodee.flux_refine.available", return_value=True), \
                patch("doodee.flux_refine.refine", side_effect=record):
            _refine_views(image, points, [BY_SOURCE_REF["10.2"]], [3], "front", 1.,
                          user=object(), budget_key="pipeline-test")
        self.assertEqual([(kind, key) for kind, key, _ in calls],
                         [("fill", "hairline"), ("polish", "hairline")])
        filled, polished = (mask > 0 for *_, mask in calls)
        self.assertTrue(filled.any())
        self.assertFalse((filled & ~polished).any(), "polish must cover everything fill wrote")


class ProcedureCatalogApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user("catalog-reader"))

    def test_default_endpoint_serves_the_facial_catalog(self):
        response = self.client.get("/api/v1/procedures/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 70)
        self.assertEqual(response.data[0]["id"], "1.1")
        self.assertEqual(response.data[-1]["id"], "14.13")

    def test_numeric_detail_and_category_filter(self):
        self.assertEqual(self.client.get("/api/v1/procedures/6.1/").data["name_th"], "ทำตาสองชั้น")
        category = self.client.get("/api/v1/procedures/?category=6")
        self.assertEqual(len(category.data), 8)
        self.assertTrue(all(item["category_id"] == 6 for item in category.data))

    def test_endpoint_names_the_views_a_procedure_shows_a_change_on(self):
        """A depth-axis procedure has to say so, or the client offers it on a view it cannot move.

        Chin projection and bridge height displace the face along its own forward axis. A profile
        camera sees that across the frame; a front camera looks straight down it and renders a
        picture indistinguishable from the original, which reads as a broken simulation rather
        than as the wrong angle to be looking from.
        """
        for ref in ("4.5", "5.1", "5.2", "5.6"):
            self.assertEqual(self.client.get(f"/api/v1/procedures/{ref}/").data["views"],
                             ["left_profile", "right_profile"], ref)
        # The mirror case, and the reason this is a list rather than a profile_only flag.
        self.assertEqual(self.client.get("/api/v1/procedures/6.1/").data["views"], ["front"])
        # Everything else moves on all three, and must not be narrowed by accident.
        every = {item["id"]: item["views"] for item in public_catalog()}
        self.assertEqual(sum(1 for views in every.values() if len(views) == 3), 60)
        self.assertTrue(all(views for views in every.values()))

    def test_endpoint_names_the_regions_a_procedure_touches(self):
        """Two procedures in one category can sit on opposite halves of the face.

        Lip filler and cheek filler are both category 4, so a viewer aimed by category points one
        of them at the wrong feature. The pipeline already knows exactly where each one lands.
        """
        detail = lambda ref: self.client.get(f"/api/v1/procedures/{ref}/").data["regions"]
        self.assertEqual(detail("4.4"), ["lips"])
        self.assertEqual(detail("4.1"), ["nasolabial"])
        self.assertEqual(detail("6.1"), ["eyelid_crease"])
        # Order is the pipeline's, and a region touched twice is named once.
        self.assertEqual(detail("5.2"), ["nose_bridge"])
        self.assertTrue(all(item["regions"] for item in public_catalog()))

    def test_endpoint_exposes_intensity_metadata(self):
        filler = self.client.get("/api/v1/procedures/4.4/").data
        eyelid = self.client.get("/api/v1/procedures/6.1/").data
        body = self.client.get("/api/v1/procedures/8.1/").data
        self.assertEqual(filler["intensity_mode"], "variable")
        self.assertEqual(len(filler["intensity_levels"]), 5)
        self.assertEqual(eyelid["intensity_mode"], "discrete")
        self.assertEqual(body["intensity_mode"], "unavailable")
