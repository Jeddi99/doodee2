"""The analysis engine, run on actual photographs.

Every other test in this project stops short of the face model. `tests.py` patches `_decode`,
`_landmarks` and `analyze_images` wherever they would be reached, and `image_file()` returns a
120x120 grey square with one white diagonal — enough to satisfy `_decode`'s lighting and blur
checks and DRF's image field, and nothing that could ever survive `_landmarks`. That is the right
call for the six hundred tests that are about HTTP, storage, entitlement and money; none of them
is about whether a face can be measured.

The result, though, is that nothing anywhere has ever confirmed the engine works on a photograph.
The pose windows in `pose_targets.json`, the sign convention shared with the browser, the
`face_count` rule, the lighting and blur floors — all of it is exercised only against fabricated
landmark arrays that were written to match the code they are checking.

This file closes that. It reads the images in `backend/datamock/` and runs them through
`analysis_engine` with **nothing mocked at all**.

Two consequences to be aware of:

* **It is slow.** Real MediaPipe against real pixels, several times over. Kept in its own module
  so `manage.py test doodee.tests` stays the fast suite it is.
* **It skips rather than fails when the images are absent.** They are gitignored — the recipe is
  committed, the megabytes are not — so a clean checkout legitimately has none of them, and that
  is not a broken test. The skip message says how to produce them.
"""

import unittest
from pathlib import Path

from django.test import SimpleTestCase

from . import analysis_engine, skin_engine

FIXTURES = Path(__file__).resolve().parents[1] / "datamock"

REGENERATE = (
    f"no fixtures in {FIXTURES}. Build them with:\n"
    "  docker compose exec -T api python /app/backend/datamock/make_fixtures.py "
    "< apps/web/public/assets/scan/capture-angles-reference.png"
)

# The three the scan page asks for, mapped to the slot each one fills.
#
# `upload-` rather than `pass-`, and the distinction matters more than it looks. `pass-*.jpg` is
# the file a user picks; `upload-*.jpg` is the face-cropped JPEG the browser actually PUTs after
# `faceCropRect` has run. The server only ever sees the second, and testing it against the first
# would be testing a request that is never made.
#
# It is not a hypothetical difference. At their picked size of 1024px the two profiles are refused
# here with `face_count` — the detector does not find them — while the ~670px crops taken from
# those very files are accepted. Detection is not monotonic in resolution, so neither size tells
# you anything about the other.
POSED = {
    "front": "upload-front.jpg",
    "left_profile": "upload-left-profile.jpg",
    "right_profile": "upload-right-profile.jpg",
}
# The picked files, for the one test that is about the difference.
PICKED = {
    "front": "pass-front.jpg",
    "left_profile": "pass-left-profile.jpg",
    "right_profile": "pass-right-profile.jpg",
}


def available():
    return all((FIXTURES / name).exists() for name in POSED.values())


def read(name):
    return (FIXTURES / name).read_bytes()


@unittest.skipUnless(available(), REGENERATE)
class RealPhotographTest(SimpleTestCase):
    """`_decode` and `_landmarks`, unmocked, on photographs."""

    def test_a_good_photograph_decodes(self):
        for slot, name in POSED.items():
            with self.subTest(slot=slot):
                self.assertIsNotNone(analysis_engine._decode(read(name)))

    def test_exactly_one_face_is_found(self):
        """The first time this project has run the face model over real pixels."""
        for slot, name in POSED.items():
            with self.subTest(slot=slot):
                points, pose = analysis_engine._landmarks(analysis_engine._decode(read(name)))
                self.assertEqual(len(points), 478)
                self.assertEqual(set(pose), {"yaw", "pitch", "roll"})

    def test_each_photograph_holds_the_pose_its_slot_requires(self):
        """The check that ties the browser's pose windows to the server's.

        `scanQuality.captureSteps` and `pose_targets.json` carry the same numbers, and both
        clients convert their detector output into the same sign convention before comparing.
        Nothing verified that end to end until now — a sign flip on either side would have left
        every test passing and every real profile scan failing.
        """
        for slot, name in POSED.items():
            with self.subTest(slot=slot):
                _, pose = analysis_engine._landmarks(analysis_engine._decode(read(name)))
                self.assertIsNone(
                    analysis_engine._pose_error(slot, pose),
                    f"{name} does not satisfy {slot}: {pose}",
                )

    def test_a_photograph_does_not_satisfy_a_slot_it_is_not_for(self):
        """A pose window that accepted everything would pass the test above and mean nothing."""
        _, front = analysis_engine._landmarks(analysis_engine._decode(read(POSED["front"])))
        self.assertIsNotNone(analysis_engine._pose_error("left_profile", front))
        self.assertIsNotNone(analysis_engine._pose_error("right_profile", front))

    def test_the_uploaded_crop_is_what_the_server_can_read(self):
        """Pins the fact that the browser's crop is not an optimisation but a requirement.

        The picked profile files are refused outright at their full size. If `captureFrame` ever
        stopped cropping — or started submitting the original — profile scans would fail for
        everybody while every other test in the project carried on passing.
        """
        for slot in ("left_profile", "right_profile"):
            with self.subTest(slot=slot):
                analysis_engine._landmarks(analysis_engine._decode(read(POSED[slot])))
                with self.assertRaises(ValueError) as caught:
                    analysis_engine._landmarks(analysis_engine._decode(read(PICKED[slot])))
                self.assertEqual(str(caught.exception), "face_count")

    def test_the_two_profiles_are_not_interchangeable(self):
        """They are mirror images, so a sign error would make each satisfy the other's window."""
        _, left = analysis_engine._landmarks(analysis_engine._decode(read(POSED["left_profile"])))
        _, right = analysis_engine._landmarks(analysis_engine._decode(read(POSED["right_profile"])))
        self.assertLess(left["yaw"], 0, "left_profile must be a negative yaw")
        self.assertGreater(right["yaw"], 0, "right_profile must be a positive yaw")
        self.assertIsNotNone(analysis_engine._pose_error("right_profile", left))
        self.assertIsNotNone(analysis_engine._pose_error("left_profile", right))


@unittest.skipUnless(available(), REGENERATE)
class RejectedPhotographTest(SimpleTestCase):
    """The server's own refusals, on images built to earn each one."""

    def test_a_photograph_with_no_face_is_refused(self):
        image = analysis_engine._decode(read("fail-no-face.jpg"))
        with self.assertRaises(ValueError) as caught:
            analysis_engine._landmarks(image)
        self.assertEqual(str(caught.exception), "face_count")

    def test_two_faces_are_refused_by_the_same_rule(self):
        """`face_count` covers both none and several — worth pinning, since they read alike."""
        image = analysis_engine._decode(read("fail-two-faces.jpg"))
        with self.assertRaises(ValueError) as caught:
            analysis_engine._landmarks(image)
        self.assertEqual(str(caught.exception), "face_count")

    def test_a_dark_photograph_is_refused_before_the_face_model_runs(self):
        with self.assertRaises(ValueError) as caught:
            analysis_engine._decode(read("fail-dark.jpg"))
        self.assertEqual(str(caught.exception), "poor_lighting")

    def test_a_file_that_is_not_an_image_is_refused(self):
        with self.assertRaises(ValueError) as caught:
            analysis_engine._decode(read("fail-corrupt.jpg"))
        self.assertEqual(str(caught.exception), "invalid_image")

    def test_the_browser_can_accept_what_the_server_then_refuses(self):
        """The one place the two gates provably disagree, held still by a test.

        The browser's blur check reads a sharpness figure from a 128x72 downsample and cannot be
        made to fire on a real face: heavy enough blur destroys detection before the number falls
        under its floor. The server measures Laplacian variance at full resolution and catches it.

        So this file passes the upload screen and fails in the worker, which is not a bug in
        either gate — it is why `Scan.error_code` exists and why a failed scan has to explain
        itself. If someone later tightens the client's floor, this test starts failing and the
        conversation happens on purpose rather than by surprise.
        """
        with self.assertRaises(ValueError) as caught:
            analysis_engine._decode(read("edge-blurry-server-rejects.jpg"))
        self.assertEqual(str(caught.exception), "blurry_image")


@unittest.skipUnless(available(), REGENERATE)
class FullAnalysisTest(SimpleTestCase):
    """`analyze_images` end to end, with nothing patched."""

    def test_three_photographs_produce_a_complete_analysis(self):
        data = analysis_engine.analyze_images(
            {slot: read(name) for slot, name in POSED.items()},
            age_band="adult",
            scan_mode="standard",
        )
        self.assertTrue(data["metrics"], "no metrics came back")
        self.assertLessEqual(len(data["metrics"]), 30, "the catalogue cap must still hold")
        for metric in data["metrics"]:
            self.assertIsNotNone(metric["value"], f"{metric['key']} has no value")

    def test_the_skin_engine_reads_a_real_face(self):
        """`skin_engine` has only ever seen a painted rectangle with a fabricated landmark mesh."""
        data = analysis_engine.analyze_images(
            {slot: read(name) for slot, name in POSED.items()},
            age_band="adult",
            scan_mode="standard",
        )
        skin = data["skin_analysis"]
        self.assertTrue(skin["regions"], "no regions were sampled from a real face")
        self.assertIn("signals", skin)

    def test_a_wrongly_posed_photograph_fails_the_named_view(self):
        """The error carries the view, which is what lets the client say which photo to redo."""
        images = {slot: read(name) for slot, name in POSED.items()}
        images["left_profile"] = read(POSED["front"])
        with self.assertRaises(ValueError) as caught:
            analysis_engine.analyze_images(images, age_band="adult", scan_mode="standard")
        self.assertIn("left_profile", str(caught.exception))


@unittest.skipUnless(available(), REGENERATE)
class SkinOnRealPhotographTest(SimpleTestCase):
    """`skin_engine`, unmocked, on a photograph of a face.

    `SkinEngineTest` in `tests.py` builds its input by painting eight flat rectangles onto a
    600x600 canvas and handing the engine a landmark mesh written to bound them. That is a
    reasonable way to check the arithmetic — a patch whose colour you chose has a lightness you
    can predict — and it is why the exposure-invariance claim has a test at all.

    What it cannot check is whether the claim holds on skin. Flat patches respond to a change of
    exposure the way the algebra says they should; a photograph does not, because real skin
    reaches the top of a channel's range long before the frame looks overexposed, and a channel
    that has hit 255 has thrown away the very difference the a* signals are subtracting. So this
    class runs the same engine over `datamock/`, where the pixels came from a camera.
    """

    def _measure(self, name, gain=1.0):
        import numpy as np

        image = analysis_engine._decode(read(name))
        if gain != 1.0:
            image = np.clip(image.astype(np.float32) * gain, 0, 255).astype(np.uint8)
        # Re-detected rather than reused, because the masks are drawn in pixel space and a
        # landmark set borrowed from a differently-exposed frame would move the patches.
        points, _ = analysis_engine._landmarks(image)
        return skin_engine.analyze_skin(image, points)

    def test_every_region_is_found_on_a_real_face(self):
        """The eight patches are landmark hulls, and a hull can come out empty on a real head."""
        result = self._measure(POSED["front"])
        self.assertEqual(set(result["regions"]), set(skin_engine.REGIONS))
        for name, stats in result["regions"].items():
            with self.subTest(region=name):
                self.assertGreater(stats["lightness"], 0, f"{name} is black")

    def test_every_signal_comes_back_with_a_value(self):
        """A None here is a patch the engine could not use, not a zero reading."""
        signals = self._measure(POSED["front"])["signals"]
        self.assertEqual(set(signals), set(skin_engine.SIGNAL_CONFIDENCE))
        for key, value in signals.items():
            with self.subTest(signal=key):
                self.assertIsNotNone(value, f"{key} was not measurable on a real face")

    def test_the_sclera_gives_a_usable_white_reference(self):
        """`_white_balance` skips itself on any patch it distrusts, and says so in `capture`.

        If a real eye were routinely rejected the engine would run uncorrected on every scan
        while its docstring described a correction, so this pins that the path is live.
        """
        self.assertTrue(self._measure(POSED["front"])["capture"]["white_balanced"])

    def test_the_same_face_at_two_sizes_reads_the_same(self):
        """`pass-front.jpg` and `upload-front.jpg` are one photograph before and after the crop.

        They differ in resolution and in mean brightness by more than twenty levels, which is
        exactly the pair of changes the signals are supposed to ignore. The lightness signals do:
        both land within a few percent. Stated as a bound rather than an equality because the
        landmark mesh is re-detected on each and the patches move a pixel or two.
        """
        picked = self._measure(PICKED["front"])["signals"]
        uploaded = self._measure(POSED["front"])["signals"]
        for key in ("undereye_shadow", "tone_spread", "texture"):
            with self.subTest(signal=key):
                self.assertAlmostEqual(
                    picked[key], uploaded[key], delta=abs(uploaded[key]) * 0.1,
                    msg=f"{key} moved between the picked file and the crop taken from it",
                )

    def test_a_side_lit_photograph_is_reported_as_such(self):
        """The reference sheet is lit from one side, and the engine is right to refuse it.

        One cheek measures L* 80 and the other 51 — a ratio of 1.58, past `MAX_SHADOW_RATIO`.
        The advisory is the honest answer and the endpoint's `readable: false` follows from it.
        Worth a test because it is the first time the guard has fired on a real photograph
        rather than on a frame darkened on one side by the test that checks it.
        """
        result = self._measure(POSED["front"])
        self.assertFalse(result["readable"])
        self.assertTrue(
            any(advisory.startswith("skin_uneven_lighting") for advisory in result["advisories"]),
            result["advisories"],
        )

    def test_lightness_signals_hold_across_an_exposure_change(self):
        """The claim the module exists for, on skin rather than on paint.

        These two survive because L* and its mean both scale as the cube root of luminance and
        the ratio cancels. The redness signals do not — see below.
        """
        dim = self._measure(POSED["front"], gain=0.6)["signals"]
        bright = self._measure(POSED["front"], gain=1.1)["signals"]
        for key in ("undereye_shadow", "tone_spread"):
            with self.subTest(signal=key):
                self.assertAlmostEqual(dim[key], bright[key], delta=abs(bright[key]) * 0.15)

    def test_redness_holds_across_an_exposure_change(self):
        """The regression test for the defect that `_clipped_fraction` was written to close.

        This ran as an expected failure until the clipping guard was fixed. Brightening the
        photograph by a quarter moved `cheek_redness` from -2.17 to -5.83 — the same face, one
        exposure step apart — while `readable` stayed true and `advisories` stayed empty, so
        `comparable()` answered True for the pair and a trend line would have drawn the exposure
        change as the user's skin.

        Both halves of the old guard were wrong: it measured clipping on the *greyscale* of the
        *white-balanced* image, so a red channel 88% pinned at 255 counted as nothing, and the
        sclera correction then scaled those dead pixels back under the threshold before they
        were tested at all.

        Note what "passes" means here. The engine is not expected to hold a *number* steady
        through an exposure that destroyed a channel — that information is gone and no
        arithmetic recovers it. It is expected to notice and refuse, which is why the guard
        clause below is the assertion that actually fires today: `readable` comes back false
        with `skin_clipped_highlights`. Both outcomes are correct answers and the test accepts
        either, because a future change that recovered real invariance out to 1.25x should not
        fail for succeeding more thoroughly than required.
        """
        base = self._measure(POSED["front"], gain=1.0)
        brighter = self._measure(POSED["front"], gain=1.25)
        if not brighter["readable"]:
            self.assertTrue(
                any(a.startswith("skin_clipped_highlights") for a in brighter["advisories"]),
                f"refused, but not for the clipping that caused it: {brighter['advisories']}",
            )
            return
        self.assertAlmostEqual(
            base["signals"]["cheek_redness"],
            brighter["signals"]["cheek_redness"],
            delta=abs(base["signals"]["cheek_redness"]) * 0.5,
        )


@unittest.skipUnless(available(), REGENERATE)
class SkinScanModeTest(SimpleTestCase):
    """`scan_mode="skin"`: one close front photograph, measured for skin and nothing else."""

    def test_a_skin_scan_needs_only_a_front_photograph(self):
        data = analysis_engine.analyze_images(
            {"front": read(POSED["front"])}, age_band="adult", scan_mode="skin",
        )
        self.assertTrue(data["skin_analysis"]["regions"])

    def test_it_reports_no_craniofacial_measurements_at_all(self):
        """An empty catalogue rather than a short one, and the difference matters.

        Every ratio in `FRONT_METRICS` is scale-free, so a closer photograph would still produce
        numbers — plausible ones, scored against the reference population and drawn on the
        analysis screen. They would move because the user stood nearer, and nothing downstream
        could tell that apart from the user's face changing. So the mode returns none.
        """
        data = analysis_engine.analyze_images(
            {"front": read(POSED["front"])}, age_band="adult", scan_mode="skin",
        )
        self.assertEqual(data["metrics"], [])
        self.assertEqual(data["metric_count"], 0)
        self.assertIsNone(data["reference_scores"])
        self.assertEqual(data["analysis_tier"], "skin")

    def test_an_off_target_head_angle_does_not_throw_the_photograph_away(self):
        """The rule this mode exists to relax.

        Under every other mode a front pose outside `pose_targets.json` raises, `process_scan`
        catches it, and the whole scan is marked FAILED. That is right when the scan is being
        measured for shape. It is wrong here: `skin_engine` reads colour off patches of the
        face, and a head turned a few degrees changes none of it — refusing would throw away a
        perfectly lit photograph for a reason that has nothing to do with what was asked.

        Fed a full profile, which is as far outside the front window as an image can be. It
        comes back as an advisory rather than an exception.
        """
        data = analysis_engine.analyze_images(
            {"front": read(POSED["left_profile"])}, age_band="adult", scan_mode="skin",
        )
        self.assertTrue(
            any(advisory.startswith("pose_front") for advisory in data["pose_advisories"]),
            data["pose_advisories"],
        )

    def test_the_same_photograph_still_fails_a_craniofacial_scan(self):
        """The other half — relaxing the gate for skin must not relax it everywhere."""
        with self.assertRaises(ValueError) as caught:
            analysis_engine.analyze_images(
                {slot: read(POSED["left_profile"]) for slot in POSED},
                age_band="adult", scan_mode="standard",
            )
        self.assertTrue(str(caught.exception).startswith("pose_front"), caught.exception)

    def test_a_photograph_the_server_cannot_read_still_fails(self):
        """Lighting and blur are not relaxed — those are the checks skin actually depends on."""
        with self.assertRaises(ValueError) as caught:
            analysis_engine.analyze_images(
                {"front": read("fail-dark.jpg")}, age_band="adult", scan_mode="skin",
            )
        self.assertTrue(str(caught.exception).startswith("poor_lighting"), caught.exception)
