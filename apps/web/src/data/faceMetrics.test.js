import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { FACE_METRICS, METRIC_CATEGORIES, MERGED_INTO } from './faceMetrics.js';
import { CATALOG_SIZE } from '../lib/dashboardData.ts';

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
  const engine = readFileSync(
    fileURLToPath(new URL('../../../../backend/doodee/analysis_engine.py', import.meta.url)),
    'utf8',
  );
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
