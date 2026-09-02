import assert from 'node:assert/strict';
import test from 'node:test';

import { coverFit } from './makeupGeometry.js';
import {
  GEOMETRY_VERSION, allSegments, angleSegments, isDrawable, metricSegments, referenceSegments,
  viewGeometry,
} from './metricLines.js';

/**
 * The overlay the analysis screen draws over the customer's own photograph.
 *
 * This module had no test because until now nothing imported it. `DashboardPage` does — it draws
 * the measured spans across the scan photo, in the place a fixed decorative path used to sit —
 * and the failure being guarded against here is subtle in exactly the way the old fake was
 * obvious: a line that lands slightly off the feature it names still looks like a measurement.
 *
 * The fixtures below are not invented. They are the geometry `analysis_engine` emitted for a real
 * completed scan in the development database (6d80d7a3, three captured views, 972x734 front), read
 * straight out of `metric_geometry`. Numbers made up for a test would pass a mapping that is wrong
 * in the same direction as the fixture.
 */
const FRONT = {
  image_size: [972, 734],
  metrics: {},
  reference: {
    midface_height: {
      kind: 'distance',
      measured: [[[0.49784, 0.32756], [0.49954, 0.51049]]],
      denominator: [[[0.49784, 0.32756], [0.50527, 0.75204]]],
    },
    // Both eyes, because the metric is the average of the two fissures and a picture of one of
    // them is a picture of a different number.
    eye_fissure: {
      kind: 'distance',
      measured: [[[0.38025, 0.3427], [0.45228, 0.34955]], [[0.54514, 0.34553], [0.61808, 0.33105]]],
      denominator: [[[0.49784, 0.32756], [0.50527, 0.75204]]],
    },
    chin_height: {
      kind: 'distance',
      measured: [[[0.49964, 0.59647], [0.50527, 0.75204]]],
      denominator: [[[0.49784, 0.32756], [0.50527, 0.75204]]],
    },
  },
};

const SIDE = {
  image_size: [1040, 785],
  metrics: { left_profile_chin_projection_ratio: { kind: 'distance', measured: [[[0.6, 0.5], [0.62, 0.52]]] } },
  reference: {
    nasofrontal_angle: {
      kind: 'angle',
      measured: [[[0.63866, 0.32761], [0.64742, 0.1708]], [[0.63866, 0.32761], [0.67696, 0.48592]]],
    },
  },
};

const geometryFor = (views) => ({ metric_geometry: { version: GEOMETRY_VERSION, views } });

/** The identity fit the analysis overlay uses: the SVG viewBox is the photograph's own pixel grid. */
const identityFit = (view) => {
  const [width, height] = view.image_size;
  return coverFit({ width, height }, { width, height });
};

test('a view is only read when the payload version is one this module understands', () => {
  const data = geometryFor({ front: FRONT });
  assert.equal(viewGeometry(data, 'front'), FRONT);

  // The four absences that all mean "draw no lines": no field at all (every scan analysed before
  // it existed), an explicit null (`purge_scan_images` after 30 days, and every skin scan), a view
  // that was captured but never measured, and a payload shape this build does not know.
  assert.equal(viewGeometry({}, 'front'), null);
  assert.equal(viewGeometry({ metric_geometry: null }, 'front'), null);
  assert.equal(viewGeometry(data, 'right_oblique'), null);
  assert.equal(viewGeometry({ metric_geometry: { version: GEOMETRY_VERSION + 1, views: { front: FRONT } } }, 'front'), null);
});

test('a normalised point lands on the pixel the server measured it at', () => {
  /**
   * The whole claim the overlay makes. Under the identity fit the SVG draws in — its viewBox is
   * the stored photograph — a coordinate of 0.49784 across a 972-pixel-wide image is pixel 483.9,
   * and nothing between the server and the screen may move it.
   */
  const segment = referenceSegments(FRONT, 'midface_height', identityFit(FRONT))
    .find((item) => item.role === 'measured');
  assert.deepEqual(segment.points.map((point) => [
    Math.round(point.x * 100) / 100, Math.round(point.y * 100) / 100,
  ]), [[483.90, 240.43], [485.55, 374.70]]);

  // Every point of every span sits inside the photograph. A line drawn off the image is the
  // failure mode of a client that rebuilt the geometry itself.
  for (const key of Object.keys(FRONT.reference)) {
    for (const drawn of referenceSegments(FRONT, key, identityFit(FRONT))) {
      for (const point of drawn.points) {
        assert.ok(point.x >= 0 && point.x <= 972, `${key} runs off the image horizontally`);
        assert.ok(point.y >= 0 && point.y <= 734, `${key} runs off the image vertically`);
      }
    }
  }
});

test('the denominator is drawn under the span it divides, never instead of it', () => {
  const segments = referenceSegments(FRONT, 'chin_height', identityFit(FRONT));
  // Draw order matters: "this far, out of that" only reads if the denominator is under the span.
  assert.deepEqual(segments.map((segment) => segment.role), ['denominator', 'measured']);
});

test('a metric averaged over both sides draws both of them', () => {
  const measured = referenceSegments(FRONT, 'eye_fissure', identityFit(FRONT))
    .filter((segment) => segment.role === 'measured');
  assert.equal(measured.length, 2, 'the eye fissure average is being drawn as one eye');
});

test('an angle draws its two arms from the vertex, and a distance is not mistaken for one', () => {
  const arms = angleSegments(SIDE, 'nasofrontal_angle', identityFit(SIDE));
  assert.equal(arms.length, 2);
  // The server writes the vertex first in both arms, so a caller can mark the corner.
  assert.deepEqual(arms[0].points[0], arms[1].points[0]);
  assert.deepEqual(angleSegments(FRONT, 'midface_height', identityFit(FRONT)), []);
});

test('asking a view about a key it does not measure comes back empty, not wrong', () => {
  /**
   * The normal case rather than an error: the panel lists front and side measurements together,
   * so whichever photograph is on screen is asked about keys belonging to the other one. Coming
   * back empty is what lets the overlay draw the right subset without checking first.
   */
  assert.deepEqual(referenceSegments(FRONT, 'nasofrontal_angle', identityFit(FRONT)), []);
  assert.deepEqual(referenceSegments(SIDE, 'chin_height', identityFit(SIDE)), []);
  assert.deepEqual(metricSegments(FRONT, 'left_profile_chin_projection_ratio', identityFit(FRONT)), []);
  assert.deepEqual(referenceSegments(null, 'chin_height', identityFit(FRONT)), []);
  assert.equal(isDrawable(FRONT, 'chin_height'), true);
  assert.equal(isDrawable(FRONT, 'nasofrontal_angle'), false);
});

test('the ambient set draws each span once and leaves the denominators out', () => {
  /**
   * Face height is the denominator of nearly every front metric, so including denominators here
   * would draw the same rule twenty times over and make it look heavier than the spans it divides.
   * Deduplication is on the coordinates, so two keys measured across the same two points — midface
   * height and nose length are the same span by definition — produce one stroke.
   */
  const keys = Object.keys(FRONT.reference);
  const segments = allSegments(FRONT, keys, identityFit(FRONT));
  assert.ok(segments.every((segment) => segment.role === 'measured'), 'a denominator got into the ambient set');
  // One for midface, one for chin, two for the eyes.
  assert.equal(segments.length, 4);

  const twice = allSegments(FRONT, [...keys, ...keys], identityFit(FRONT));
  assert.equal(twice.length, segments.length, 'the same span is being stroked twice');
  assert.deepEqual(allSegments(null, keys, identityFit(FRONT)), []);
});
