import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CATEGORY_LABELS, FACE_METRICS, MERGED_INTO, METRIC_CATEGORIES, REFERENCE_DENOMINATOR,
  REFERENCE_METRIC_LABELS, REFERENCE_METRIC_SPANS, SKIN_KEYS, STOMION, displayedMetrics,
} from '../data/faceMetrics.js';
import { coverFit } from './makeupGeometry.js';
import { allSegments, metricSegments, referenceSegments } from './metricLines.js';

const byKey = (key) => FACE_METRICS.find((metric) => metric.key === key);

// Landmarks placed at known normalised positions so expected pixels can be worked out by hand.
function face() {
  const points = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }));
  const put = (index, x, y) => { points[index] = { x, y }; };
  put(234, .30, .50); put(454, .70, .50);   // face width
  put(10, .50, .10); put(152, .50, .90);    // face height
  put(168, .50, .35); put(2, .50, .62);     // nasion, subnasale
  put(98, .45, .60); put(327, .55, .60);    // alar bases
  put(13, .50, .70); put(14, .50, .74);     // inner lips
  put(0, .50, .67); put(17, .50, .78);      // lip borders
  return points;
}

const square = coverFit({ width: 1000, height: 1000 }, { width: 1000, height: 1000 });

test('a measured span becomes the line between its two landmarks', () => {
  const segments = metricSegments(byKey('alar_width_ratio'), face(), square);
  const measured = segments.filter((segment) => segment.role === 'measured');
  assert.equal(measured.length, 1);
  assert.deepEqual(measured[0].points, [{ x: 450, y: 600 }, { x: 550, y: 600 }]);
});

test('the denominator is returned as a separate role so it can be drawn dashed', () => {
  const segments = metricSegments(byKey('alar_width_ratio'), face(), square);
  const denominator = segments.filter((segment) => segment.role === 'denominator');
  assert.equal(denominator.length, 1, 'alar width is divided by face width');
  assert.deepEqual(denominator[0].points, [{ x: 300, y: 500 }, { x: 700, y: 500 }]);
});

test('metrics that are not a distance give no line instead of throwing', () => {
  // Symmetry metrics are a difference of two distances; profile metrics are on a photo this page
  // does not show. Both still get a table row, so returning [] has to be safe.
  for (const key of ['eye_width_asymmetry', 'brow_gap_asymmetry', 'mandible_asymmetry',
    'left_profile_nose_projection_ratio', 'right_profile_facial_convexity_ratio']) {
    assert.deepEqual(metricSegments(byKey(key), face(), square), [], key);
  }
  assert.deepEqual(metricSegments(undefined, face(), square), []);
  assert.deepEqual(metricSegments(byKey('alar_width_ratio'), null, square), []);
});

test('chin height in the reference family measures from the stomion midpoint', () => {
  // Not landmark 13 and not 14: the stomion is halfway between them, so a line drawn from either
  // one alone would start in the wrong place.
  const segments = referenceSegments(REFERENCE_METRIC_SPANS.chin_height, REFERENCE_DENOMINATOR, face(), square);
  const [start, end] = segments[0].points;
  assert.deepEqual(start, { x: 500, y: 720 }, 'midpoint of y=.70 and y=.74');
  assert.deepEqual(end, { x: 500, y: 900 });
  assert.equal(segments[1].role, 'denominator');
  assert.deepEqual(segments[1].points, [{ x: 500, y: 350 }, { x: 500, y: 900 }], 'n-gn, not face height');
});

test('a metric averaging two distances draws both of them', () => {
  const segments = referenceSegments(REFERENCE_METRIC_SPANS.eye_fissure, REFERENCE_DENOMINATOR, face(), square);
  assert.equal(segments.filter((segment) => segment.role === 'measured').length, 2);
});

test('the overview draws each distinct span once and leaves denominators out', () => {
  // Face width and face height are the denominator of most rows; drawing them per row would stack
  // the same two lines twenty times.
  const segments = allSegments(FACE_METRICS, face(), square);
  assert.ok(segments.every((segment) => segment.role === 'measured'));
  const withSpan = FACE_METRICS.filter((metric) => metric.span);
  const distinctSpans = new Set(withSpan.map((metric) => String(metric.span)));
  assert.equal(segments.length, distinctSpans.size, 'one line per distinct landmark pair');
  // midface_height_ratio and nose_length_ratio are the same pair, so they collapse to one line.
  assert.equal(segments.length, withSpan.length - 1);
});

test('lines stay on the same feature when the canvas is reshaped', () => {
  // The regression that put the try-on's blush on the jaw: geometry pinned to the box rather than to
  // the crop. Here a landmark must keep its position relative to other landmarks in any canvas shape.
  const points = face();
  const image = { width: 900, height: 1200 };
  for (const canvas of [{ width: 600, height: 900 }, { width: 1600, height: 900 }, { width: 400, height: 400 }]) {
    const fit = coverFit(image, canvas);
    const alar = metricSegments(byKey('alar_width_ratio'), points, fit)[0].points;
    const chin = metricSegments(byKey('chin_height_ratio'), points, fit)[0].points;
    const brow = metricSegments(byKey('upper_face_height_ratio'), points, fit)[0].points;
    const alarY = (alar[0].y + alar[1].y) / 2;
    assert.ok(alarY > brow[1].y, `alar below the nasion on ${canvas.width}x${canvas.height}`);
    assert.ok(alarY < chin[1].y, `alar above the menton on ${canvas.width}x${canvas.height}`);
    assert.ok(alar[0].x < alar[1].x, 'left alar stays left of the right one');
  }
});

test('the catalogue is internally consistent', () => {
  const keys = FACE_METRICS.map((metric) => metric.key);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate keys');
  for (const metric of FACE_METRICS) {
    assert.ok(metric.name_th && metric.name_en, `${metric.key} needs both names`);
    assert.ok(metric.about_th && metric.about_en, `${metric.key} needs both descriptions`);
    assert.ok(METRIC_CATEGORIES.includes(metric.category), `${metric.key} has an unknown category`);
    // A span without a denominator would render a ratio with nothing to divide by.
    assert.equal(Boolean(metric.span), Boolean(metric.denominator), `${metric.key} span/denominator must agree`);
  }
  for (const category of METRIC_CATEGORIES) assert.ok(CATEGORY_LABELS[category], `${category} needs a label`);
  for (const key of Object.keys(REFERENCE_METRIC_SPANS)) assert.ok(REFERENCE_METRIC_LABELS[key], `${key} needs a label`);
  assert.equal(SKIN_KEYS.length, 3);
  assert.deepEqual(MERGED_INTO, { nose_length_ratio: 'midface_height_ratio' });
  assert.equal(STOMION, 'stomion');
});

test('the merged duplicate is hidden, and only measured metrics are listed', () => {
  // midface_height_ratio and nose_length_ratio hold the identical number; showing both reads as a bug.
  const rows = displayedMetrics([
    { key: 'midface_height_ratio', value: .27 },
    { key: 'nose_length_ratio', value: .27 },
    { key: 'alar_width_ratio', value: .25 },
    { key: 'visible_redness', value: .1 },
  ]);
  assert.deepEqual(rows.map((row) => row.key), ['midface_height_ratio', 'alar_width_ratio']);
  assert.equal(rows[0].measured.value, .27);
});

test('a fast scan without side photos simply lists fewer rows', () => {
  const front = FACE_METRICS
    .filter((metric) => metric.category !== 'side_profile' && !MERGED_INTO[metric.key])
    .map((metric) => ({ key: metric.key, value: 1 }));
  const rows = displayedMetrics(front);
  assert.equal(rows.length, front.length);
  assert.ok(rows.every((row) => row.category !== 'side_profile'));
});
