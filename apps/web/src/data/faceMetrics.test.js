import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FACE_METRICS, METRIC_CATEGORIES, MERGED_INTO,
  REFERENCE_DENOMINATOR, REFERENCE_METRIC_ANGLES, REFERENCE_METRIC_SPANS,
} from './faceMetrics.js';
import { CATALOG_SIZE } from '../lib/dashboardData.ts';

const enginePath = () => fileURLToPath(new URL('../../../../backend/doodee/analysis_engine.py', import.meta.url));
const engineSource = () => readFileSync(enginePath(), 'utf8');

/**
 * The keys `analysis_engine.py` declares it can emit, read out of the file itself.
 *
 * Parsed rather than copied. A copy is a third list that nothing verifies, and the last one went
 * stale in both directions at once — missing a metric that was being produced, and claiming three
 * `visible_*` keys were produced long after the skin work moved into `skin_engine.py`.
 *
 * The check lives on this side because `apps/web` is not mounted into the api container, so the
 * Django suite cannot read this file. Same direction, and same reason, as the capture thresholds
 * in `tests/skinCapture.test.ts`.
 */
function declaredMetricKeys() {
  const engine = engineSource();
  // Balanced-paren scan rather than a regex: two of these tuples are multi-line and one is not,
  // and a pattern loose enough for both was a pattern that matched the wrong closing bracket.
  const tuple = (name) => {
    const head = engine.indexOf(`${name} = (`);
    assert.ok(head !== -1, `${name} is gone from analysis_engine.py`);
    const open = head + name.length + 4;   // past " = ("
    let depth = 0;
    for (let i = open; i < engine.length; i += 1) {
      if (engine[i] === '(') depth += 1;
      else if (engine[i] === ')') {
        if (depth === 0) return engine.slice(open, i);
        depth -= 1;
      }
    }
    throw new Error(`${name} tuple is never closed`);
  };
  const front = [...tuple('FRONT_METRICS').matchAll(/\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const extra = [...tuple('EXTRA_FRONT_METRIC_KEYS').matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const profile = [...tuple('PROFILE_METRIC_KEYS').matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const views = [...tuple('PROFILE_VIEWS').matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  assert.ok(front.length && extra.length && profile.length && views.length, 'a table parsed empty');
  return new Set([
    'face_width_to_height',
    ...front,
    ...extra,
    ...views.flatMap((view) => profile.map((key) => `${view}_${key}`)),
  ]);
}

test('every metric the server produces has a label here', () => {
  // Without this the user is shown a raw key like `some_new_ratio` where a name should be.
  const labelled = new Set(FACE_METRICS.map((metric) => metric.key));
  const declared = declaredMetricKeys();
  const missing = [...declared].filter((key) => !labelled.has(key)).sort();
  assert.deepEqual(missing, [], 'produced server-side with no label here');
});

test('nothing is labelled here that the server never produces', () => {
  // The opposite failure, and the quieter one: a row that renders as blank forever because the
  // payload has no such key, or a name kept alive after the metric behind it was removed.
  const labelled = new Set(FACE_METRICS.map((metric) => metric.key));
  const declared = declaredMetricKeys();
  const orphans = [...labelled].filter((key) => !declared.has(key)).sort();
  assert.deepEqual(orphans, [], 'labelled here but never produced');
});

test('each metric is named once and sits in a known category', () => {
  const keys = FACE_METRICS.map((metric) => metric.key);
  assert.equal(new Set(keys).size, keys.length, 'a key is listed twice');
  for (const metric of FACE_METRICS) {
    assert.ok(METRIC_CATEGORIES.includes(metric.category), `${metric.key}: ${metric.category}`);
    assert.ok(metric.name_th && metric.name_en, `${metric.key} is missing a name`);
    assert.ok(metric.about_th && metric.about_en, `${metric.key} is missing an explanation`);
  }
});

test('an angle is marked as one, because it is not drawn or read like a ratio', () => {
  for (const metric of FACE_METRICS) {
    const isAngle = metric.key.endsWith('_deg');
    assert.equal(metric.unit === 'degree', isAngle, `${metric.key} unit does not match its key`);
  }
});

test('a merged metric points at one that exists', () => {
  const keys = new Set(FACE_METRICS.map((metric) => metric.key));
  for (const [from, into] of Object.entries(MERGED_INTO)) {
    assert.ok(keys.has(from), `${from} is merged away but is not in the catalog`);
    assert.ok(keys.has(into), `${from} merges into ${into}, which does not exist`);
  }
});

test('the headline catalogue count matches the catalogue the server serves', () => {
  /**
   * Three places on the dashboard advertise how many characteristics this product reads. They
   * used to count a 102-entry list written into the client, of which twelve could actually be
   * filled in — a claim the server never agreed to. `CATALOG_SIZE` replaced it, so it is pinned
   * to `metric_catalog.py` here the same way the metric keys are pinned to `analysis_engine.py`.
   */
  const catalog = readFileSync(
    fileURLToPath(new URL('../../../../backend/doodee/metric_catalog.py', import.meta.url)),
    'utf8',
  );
  const rows = [...catalog.matchAll(/^\s*_item\(\s*\d+,/gm)].length;
  assert.ok(rows > 0, 'no _item rows found in metric_catalog.py');
  assert.equal(rows, CATALOG_SIZE, `metric_catalog.py has ${rows} rows, the client claims ${CATALOG_SIZE}`);
});

/**
 * The landmark tables in `analysis_engine.py`, read out of the file the same way the metric keys
 * above are.
 *
 * The spans matter more now than they did when they were only documentation. The server sends the
 * coordinates it measured at (`analysis_data.metric_geometry`) and the overlay draws those, so a
 * line on a customer's photograph is only as trustworthy as the table it came from. Nothing in a
 * coordinate says which anatomical points it was meant to be — that claim lives here, in the
 * indices, and it is worth failing a build over. A metric that quietly gains a line measuring the
 * wrong pair is the exact failure the decorative overlay was removed for.
 */
function pythonTable(name) {
  const engine = engineSource();
  const head = engine.indexOf(`${name} = {`);
  assert.ok(head !== -1, `${name} is gone from analysis_engine.py`);
  const open = engine.indexOf('{', head);
  let depth = 0;
  let close = -1;
  for (let i = open; i < engine.length; i += 1) {
    if (engine[i] === '{') depth += 1;
    else if (engine[i] === '}') {
      depth -= 1;
      if (depth === 0) { close = i; break; }
    }
  }
  assert.ok(close !== -1, `${name} is never closed`);
  const constants = {
    FACE_WIDTH_SPAN: pythonTuple('FACE_WIDTH_SPAN'),
    FACE_HEIGHT_SPAN: pythonTuple('FACE_HEIGHT_SPAN'),
    REFERENCE_HEIGHT_SPAN: pythonTuple('REFERENCE_HEIGHT_SPAN'),
  };
  let body = engine.slice(open, close + 1).replace(/#[^\n]*/g, '');
  for (const [constant, value] of Object.entries(constants)) {
    body = body.replaceAll(constant, JSON.stringify(value));
  }
  // `STOMION` is a computed midpoint rather than an index, and both sides spell it the same way.
  body = body.replaceAll('STOMION', '"stomion"');
  const json = body
    .replaceAll('(', '[').replaceAll(')', ']')
    .replace(/,(\s*[\]}])/g, '$1');
  return JSON.parse(json);
}

/** A module-level `NAME = (a, b)` tuple of integers. */
function pythonTuple(name) {
  const match = engineSource().match(new RegExp(`^${name} = \\(([^)]*)\\)`, 'm'));
  assert.ok(match, `${name} is gone from analysis_engine.py`);
  return match[1].split(',').map((part) => Number(part.trim())).filter((n) => !Number.isNaN(n));
}

/** `FRONT_METRICS` as `{key: {span, denominator}}`, the shape this file stores them in. */
function frontMetricSpans() {
  const engine = engineSource();
  const table = engine.slice(engine.indexOf('FRONT_METRICS = ('));
  const rows = [...table.matchAll(/\(\s*"([a-z0-9_]+)",\s*"[a-z_]+",\s*(\d+),\s*(\d+),\s*"(width|height)"\s*\)/g)];
  assert.ok(rows.length >= 17, 'FRONT_METRICS parsed too few rows');
  const width = pythonTuple('FACE_WIDTH_SPAN');
  const height = pythonTuple('FACE_HEIGHT_SPAN');
  return Object.fromEntries(rows.map(([, key, a, b, denominator]) => [
    key, { span: [Number(a), Number(b)], denominator: denominator === 'width' ? width : height },
  ]));
}

const byKey = () => new Map(FACE_METRICS.map((metric) => [metric.key, metric]));

test('a front metric measures here between the same two landmarks the server measured', () => {
  const catalog = byKey();
  for (const [key, expected] of Object.entries(frontMetricSpans())) {
    const metric = catalog.get(key);
    assert.ok(metric, `${key} has no entry here`);
    assert.deepEqual(metric.span, expected.span, `${key} span`);
    assert.deepEqual(metric.denominator, expected.denominator, `${key} denominator`);
  }
  // The one front metric not in that table: the server builds it in `_front_metric_geometry`.
  assert.deepEqual(catalog.get('face_width_to_height').span, pythonTuple('FACE_WIDTH_SPAN'));
  assert.deepEqual(catalog.get('face_width_to_height').denominator, pythonTuple('FACE_HEIGHT_SPAN'));
});

test('the metrics measured against another feature agree with the server, or claim no line', () => {
  const catalog = byKey();
  for (const [key, geometry] of Object.entries(pythonTable('EXTRA_FRONT_METRIC_GEOMETRY'))) {
    const metric = catalog.get(key);
    assert.ok(metric, `${key} has no entry here`);
    const single = !geometry.angle && !geometry.offset && geometry.span.length === 1;
    if (!single) {
      // An angle, or a value built from two or three distances. One `span` cannot describe it, so
      // this file must say so rather than name one of the several spans and imply it is the whole
      // measurement. The overlay still draws all of them, from the server's own coordinates.
      assert.equal(metric.span, null, `${key} is not one distance, so it cannot claim one span`);
      continue;
    }
    assert.deepEqual(metric.span, geometry.span[0], `${key} span`);
    assert.deepEqual(metric.denominator, geometry.over ?? null, `${key} denominator`);
  }
});

test('the reference family divides by n–gn, between the landmarks the server used', () => {
  assert.deepEqual(REFERENCE_DENOMINATOR, pythonTuple('REFERENCE_HEIGHT_SPAN'));
  const front = pythonTable('FRONT_REFERENCE_GEOMETRY');
  for (const [key, geometry] of Object.entries(front)) {
    assert.deepEqual(geometry.over, REFERENCE_DENOMINATOR, `${key} is scored against something else`);
    const expected = geometry.span.length === 1 ? geometry.span[0] : geometry.span;
    assert.deepEqual(REFERENCE_METRIC_SPANS[key], expected, `${key} span`);
  }
  const profile = pythonTable('PROFILE_REFERENCE_GEOMETRY');
  for (const [key, geometry] of Object.entries(profile)) {
    assert.deepEqual(REFERENCE_METRIC_ANGLES[key], geometry.angle, `${key} arms`);
    // An angle has no length, so it must not also be listed as a distance somewhere.
    assert.equal(REFERENCE_METRIC_SPANS[key], null, `${key} is an angle and cannot have a span`);
  }
  const declared = new Set([...Object.keys(front), ...Object.keys(profile)]);
  assert.deepEqual([...Object.keys(REFERENCE_METRIC_SPANS)].filter((key) => !declared.has(key)), []);
  assert.deepEqual([...Object.keys(REFERENCE_METRIC_ANGLES)].filter((key) => !declared.has(key)), []);
  assert.deepEqual([...declared].filter((key) => !(key in REFERENCE_METRIC_SPANS)), []);
});
