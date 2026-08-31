import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MAX_CLIPPED_FRACTION,
  MAX_COLOUR_CAST,
  MAX_SHADOW_RATIO,
  colourCast,
  lightingCode,
  measureLighting,
  shadowRatio,
  type SkinLightingSample,
} from "../src/lib/skinCapture.ts";

const even: SkinLightingSample = {
  leftCheek: 150, rightCheek: 148, meanRgb: [128, 126, 124], clippedFraction: 0,
};

test("an evenly lit face has nothing to say", () => {
  assert.equal(lightingCode(even), null);
});

test("the reference photograph in this repository would have been caught before the shutter", () => {
  // Its cheeks measure L* 80 and 51, a ratio of 1.58 — which the server refuses with
  // `skin_uneven_lighting` after the upload. That is the whole reason this module exists.
  assert.equal(lightingCode({ ...even, leftCheek: 80 * 2.55, rightCheek: 51 * 2.55 }), "uneven_lighting");
});

test("a face just inside the window is left alone", () => {
  // Must not be stricter than the server: a client that refuses what Python would accept has
  // reintroduced the same failure, only earlier.
  const ratio = MAX_SHADOW_RATIO - 0.05;
  assert.equal(lightingCode({ ...even, leftCheek: 100 * ratio, rightCheek: 100 }), null);
});

test("a dark frame is not reported as uneven", () => {
  // Two nearly-black patches have a meaningless ratio. Underexposure is `too_dark`'s job, and
  // two messages about one problem is one message too many.
  assert.equal(shadowRatio(4, 12), 1);
  assert.equal(lightingCode({ ...even, leftCheek: 4, rightCheek: 12 }), null);
});

test("a strong colour cast is named as one", () => {
  assert.equal(lightingCode({ ...even, meanRgb: [200, 120, 90] }), "colour_cast");
});

test("colour cast is measured against the frame's own mean, not a fixed white", () => {
  // A neutral frame is castless at any exposure — otherwise every dim room would read as tinted.
  assert.equal(colourCast([40, 40, 40]), 0);
  assert.equal(colourCast([220, 220, 220]), 0);
});

test("blown highlights outrank everything else", () => {
  // A channel at 255 is information that no longer exists; the others still leave a biased but
  // measurable photograph. So the user is told about the unrecoverable one first.
  const wrecked: SkinLightingSample = {
    leftCheek: 240, rightCheek: 90, meanRgb: [200, 120, 90], clippedFraction: 0.4,
  };
  assert.equal(lightingCode(wrecked), "blown_highlights");
});

test("measureLighting reports the numbers alongside the verdict", () => {
  const reading = measureLighting({ ...even, leftCheek: 200, rightCheek: 100 });
  assert.equal(reading.code, "uneven_lighting");
  assert.equal(reading.shadowRatio, 2);
  assert.equal(reading.clippedFraction, 0);
});

test("the thresholds still match the ones the server enforces", () => {
  /**
   * The check that keeps two implementations of one rule from drifting. Nothing builds the
   * TypeScript constants from the Python ones — this reads skin_engine.py and compares. When it
   * fails, the fix is to decide which value is right, change both, and bump ENGINE_VERSION.
   */
  const engine = readFileSync(
    fileURLToPath(new URL("../../../backend/doodee/skin_engine.py", import.meta.url)),
    "utf8",
  );
  const constant = (name: string) => {
    const match = engine.match(new RegExp(`^${name} = ([0-9.]+)`, "m"));
    assert.ok(match, `${name} is gone from skin_engine.py`);
    return Number(match[1]);
  };
  assert.equal(constant("MAX_SHADOW_RATIO"), MAX_SHADOW_RATIO);
  assert.equal(constant("MAX_COLOUR_CAST"), MAX_COLOUR_CAST);
  assert.equal(constant("MAX_CLIPPED_FRACTION"), MAX_CLIPPED_FRACTION);
});
