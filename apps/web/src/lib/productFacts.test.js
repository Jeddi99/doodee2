import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CATALOG_FROM_SKIN_SCAN, CATALOG_MEASURED, CATALOG_TOTAL, CURRENCY,
  DISTRIBUTION_RELIABLE_AT, MEASURED_METRICS, PLAN_LIMITS, PLAN_PRICE_BAHT,
  PROCEDURES_RENDERABLE, PROCEDURES_TOTAL, REFERENCE_OBSERVATIONS, REFERENCE_SAMPLE,
} from './productFacts.ts';
import { FACE_METRICS } from '../data/faceMetrics.js';
import { siteCopy } from '../localization.ts';

/**
 * Every number the public marketing page says out loud, checked against the file that decides it.
 *
 * Same technique and same reason as `faceMetrics.test.js`: a figure copied into a string is a
 * second source of truth that nothing verifies, and the landing page is where that failure costs
 * the most. The copy this replaced claimed "2,000+ users" against a database that counts none,
 * "85+ facial measurements" against 51, "80+ facial measurements" nine lines later, and
 * "฿299/month" against a plan table whose cheapest paid row is ฿499 and whose ฿299 row is
 * `self_serve=False` and cannot be bought from a web page at all. No test in this repository could
 * have caught any of it, because none of those numbers were connected to anything.
 *
 * `apps/web` is not mounted into the api container, so the Django suite cannot read this file and
 * the check has to live on this side — same direction as the capture thresholds in
 * `tests/skinCapture.test.ts`.
 */

const backend = (name) =>
  readFileSync(fileURLToPath(new URL(`../../../../backend/doodee/${name}`, import.meta.url)), 'utf8');

test('the headline measurement count is the number of metrics the engine emits', () => {
  // FACE_METRICS is itself pinned to `analysis_engine.py` in both directions by
  // `faceMetrics.test.js`, so this transitively pins the page to the engine.
  assert.equal(MEASURED_METRICS, FACE_METRICS.length);
});

test('the catalogue figures match metric_catalog.py', () => {
  const source = backend('metric_catalog.py');
  const head = source.indexOf('CATALOG = (');
  assert.ok(head !== -1, 'CATALOG is gone from metric_catalog.py');
  // Up to the second assignment, which only decorates the rows the first one builds.
  const rows = source.slice(head, source.indexOf('CATALOG = tuple(')).split('_item(').slice(1);
  assert.equal(rows.length, CATALOG_TOTAL);

  // `status` is derived: measured when any of the three families is non-empty. Inside CATALOG the
  // only two forms are `metrics=("…` and `metrics=_profile(…`; the bare `=()` defaults appear once
  // each, in the `_item` signature, which sits above `head`.
  const filled = (row, field) => new RegExp(`\\b${field}=(\\("|_)`).test(row);
  const measured = rows.filter(
    (row) => filled(row, 'metrics') || filled(row, 'reference') || filled(row, 'skin_signals'),
  );
  assert.equal(measured.length, CATALOG_MEASURED);
  assert.equal(rows.filter((row) => filled(row, 'skin_signals')).length, CATALOG_FROM_SKIN_SCAN);
});

test('the procedure figures match procedure_catalog.py', () => {
  const source = backend('procedure_catalog.py');
  // The catalog guards its own size; read the guard rather than recounting it a second way.
  const guard = source.match(/len\(PROCEDURES\) != (\d+)/);
  assert.ok(guard, 'the PROCEDURES size guard is gone');
  assert.equal(Number(guard[1]), PROCEDURES_TOTAL);

  const table = source.slice(source.indexOf('PROCEDURES = ('), source.indexOf('\nBY_ID ='));
  // `X(` builds a procedure with no pipeline, and the module asserts `supported == bool(pipeline)`,
  // so these are exactly the ones no preview can ever be drawn for.
  const unsupported = (table.match(/^ {4}X\(/gm) ?? []).length;
  const supported = (table.match(/^ {4}P\(/gm) ?? []).length;
  assert.equal(supported + unsupported, PROCEDURES_TOTAL);
  assert.equal(supported, PROCEDURES_RENDERABLE);
});

test('the reference cohort matches reference_scoring.py', () => {
  const source = backend('reference_scoring.py');
  const sample = source.match(/"sample_size":\s*(\d+)/);
  assert.ok(sample, 'sample_size is gone from the reference payload');
  assert.equal(Number(sample[1]), REFERENCE_SAMPLE);

  // Scored observations: the ones with a published mean and SD. CATEGORIES and VIEW_OF are
  // asserted to name the same set inside the module itself.
  const categories = source.slice(source.indexOf('CATEGORIES = {'));
  const block = categories.slice(0, categories.indexOf('}'));
  assert.equal((block.match(/"[a-z_]+":/g) ?? []).length, REFERENCE_OBSERVATIONS);
});

test('the reliability floor matches score_distribution.py', () => {
  const floor = backend('score_distribution.py').match(/^RELIABLE_SAMPLE_SIZE = (\d+)/m);
  assert.ok(floor, 'RELIABLE_SAMPLE_SIZE is gone');
  assert.equal(Number(floor[1]), DISTRIBUTION_RELIABLE_AT);
});

/**
 * `REQUIRED_PACKAGES` in `test_requirements.py` is the table the Django suite holds the `Plan` rows
 * to, and it cites requirement.md line by line. Reading it here makes the price on the marketing
 * page and the price in the database one claim, checked from both ends.
 */
function requiredPackages() {
  const source = backend('test_requirements.py');
  const head = source.indexOf('REQUIRED_PACKAGES = {');
  assert.ok(head !== -1, 'REQUIRED_PACKAGES is gone from test_requirements.py');
  const body = source.slice(head, source.indexOf('\n}\n', head));
  const packages = {};
  for (const [, code, fields] of body.matchAll(/"(free|plus|pro)":\s*\{([^}]*)\}/g)) {
    const row = {};
    for (const [, key, value] of fields.matchAll(/"(baht|simulations|chat_turns)":\s*([^,\n]+)/g)) {
      row[key] = value.includes('UNLIMITED') ? -1 : Number(value.trim());
    }
    packages[code] = row;
  }
  assert.deepEqual(Object.keys(packages).sort(), ['free', 'plus', 'pro']);
  return packages;
}

test('every price on the page is a price the plan table charges', () => {
  const packages = requiredPackages();
  for (const code of ['free', 'plus', 'pro']) {
    assert.equal(PLAN_PRICE_BAHT[code], packages[code].baht, code);
  }
});

test('every quota on the page is a quota the plan table grants', () => {
  const packages = requiredPackages();
  for (const code of ['free', 'plus', 'pro']) {
    assert.equal(PLAN_LIMITS[code].simulations, packages[code].simulations, `${code} simulations`);
    if (packages[code].chat_turns !== undefined) {
      assert.equal(PLAN_LIMITS[code].chatTurns, packages[code].chat_turns, `${code} chat`);
    }
  }
  // Free has no chat figure in requirement.md, so it comes from the migration that seeded it.
  const free = backend('migrations/0022_seed_tiers.py').match(
    /FREE_LIMITS = \{[^}]*"chat_turns_per_month":\s*(\d+)/,
  );
  assert.ok(free, 'FREE_LIMITS no longer sets a chat ceiling');
  assert.equal(PLAN_LIMITS.free.chatTurns, Number(free[1]));
});

test('the free tier renders a face but does not read one in full', () => {
  // Both of these have to stay as they are or the copy under the free card has to change with
  // them. `simulations` moved from 0 to 3 in migration 0041 and the card copy moved with it; the
  // partial read is what still separates free from Plus.
  assert.equal(PLAN_LIMITS.free.simulations, 3);
  assert.equal(PLAN_LIMITS.free.fullAnalysis, false);
});

test('there is one currency, so the page can only quote one', () => {
  const model = backend('models.py').match(/currency = models\.CharField\([^)]*default="([A-Z]{3})"/);
  assert.ok(model, 'Order.currency no longer declares a default');
  assert.equal(CURRENCY, model[1]);
});

/** Every landing string in both locales. `login` and `scan` belong to other screens. */
function landingStrings() {
  const found = [];
  const walk = (value) => {
    if (typeof value === 'string') found.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  for (const locale of ['en', 'th']) {
    // Destructured away rather than filtered: `login` belongs to LoginPage and `scan` to ScanPage,
    // and neither renders on the marketing page these assertions are about.
    const { login: _login, scan: _scan, ...landing } = siteCopy[locale];
    walk(landing);
  }
  return found;
}

/**
 * A regression guard on the specific inventions this page has already shipped once.
 *
 * Not a style rule. These exact strings were live on the public marketing page with nothing behind
 * them, and "85+" in particular is one careless edit from coming back — it reads like a modest
 * claim, and it is the number of catalogue rows rather than measurements, inflated by a "+".
 */
test('the landing copy states no count the codebase cannot back', () => {
  const forbidden = [
    /\b80\s*\+/,                 // "80+ facial measurements"
    /\b85\s*\+/,                 // "85+ facial measurements", "Full 85+ factor analysis"
    /\b2[,.]?000\s*\+/,          // "2,000+ users"
    /กว่า\s*8[05]/,              // "วิเคราะห์โครงหน้าเชิงลึกกว่า 85 จุด"
    /มากกว่า\s*8[05]/,           // "มากกว่า 80 จุด" / "มากกว่า 85 จุด"
  ];
  for (const line of landingStrings()) {
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(line), `landing copy makes an unbacked claim: ${line}`);
    }
  }
});

test('the landing copy quotes the real prices and nothing else', () => {
  const joined = landingStrings().join('\n');
  assert.ok(!/฿299/.test(joined), '฿299 is the retired clinic tier and cannot be bought');
  assert.ok(!/\$\d/.test(joined), 'there is no dollar price anywhere in this product');
  // The two prices that are real have to actually appear, or the cards are quoting nothing.
  assert.ok(joined.includes(String(PLAN_PRICE_BAHT.pro)), 'the Pro price is no longer stated');
});

/**
 * No 3D. There is no 3D model, no depth capture and no 3D library in this product: `package.json`
 * has none, and the nearest thing the server builds is `scan_mesh`, a Delaunay triangulation of 2D
 * landmarks shaded by MediaPipe's z estimate and served as a flat PNG. The clinic section used to
 * promise "a 3D face model", "a 3D consultation workflow" and "the 3D experience" in six places.
 */
test('the landing copy promises no 3D', () => {
  for (const line of landingStrings()) {
    assert.ok(!/\b3D\b/i.test(line), `landing copy promises 3D: ${line}`);
  }
});
