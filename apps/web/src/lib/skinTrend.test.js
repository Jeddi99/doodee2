import assert from 'node:assert/strict';
import test from 'node:test';

import { drawable, position, runPath, trendRows, trendSeries } from './skinTrend.js';

const point = (day, value, extra = {}) => ({
  scan_id: `scan-${day}`,
  captured_at: `2026-01-${String(day).padStart(2, '0')}T09:00:00Z`,
  readable: true,
  signals: { cheek_redness: value },
  advisories: [],
  ...extra,
});

const oneRun = [{ break_reason: null, points: [point(1, -2), point(11, -3)] }];
const twoRuns = [
  { break_reason: null, points: [point(1, -2)] },
  { break_reason: 'brightness', points: [point(11, -6)] },
];

test('a single run becomes a single path', () => {
  const { runs, count } = trendSeries(oneRun, 'cheek_redness');
  assert.equal(runs.length, 1);
  assert.equal(count, 2);
  assert.notEqual(runPath(runs[0].points, 200, 60), '');
});

test('a break becomes two paths, never one dashed one', () => {
  // The rule the whole endpoint exists to serve. A dashed segment still joins the two points to
  // the eye, and the slope across it would be the light in two rooms rather than the user's skin.
  const { runs } = trendSeries(twoRuns, 'cheek_redness');
  assert.equal(runs.length, 2);
  assert.equal(runs[1].breakReason, 'brightness');
});

test('a run with one point draws no line, but the point still exists', () => {
  const { runs } = trendSeries(twoRuns, 'cheek_redness');
  assert.equal(runPath(runs[0].points, 200, 60), '');
  assert.equal(runs[0].points.length, 1);
});

test('x is time, not position in the list', () => {
  // Two scans a day apart and two six months apart are different facts; equal spacing would
  // draw them as the same one.
  const uneven = [{ break_reason: null, points: [point(1, -2), point(2, -2), point(21, -2)] }];
  const { runs } = trendSeries(uneven, 'cheek_redness');
  const [first, second, third] = runs[0].points;
  assert.equal(first.x, 0);
  assert.equal(third.x, 1);
  assert.ok(second.x < 0.1, `the second scan is one day in, not a third of the way: ${second.x}`);
});

test('an unmoved signal is drawn down the middle, not pinned to an edge', () => {
  const flat = [{ break_reason: null, points: [point(1, 5), point(11, 5)] }];
  const { runs } = trendSeries(flat, 'cheek_redness');
  assert.deepEqual(runs[0].points.map((item) => item.y), [0.5, 0.5]);
});

test('an unreadable scan is left out of the line rather than plotted as zero', () => {
  const withGap = [{
    break_reason: null,
    points: [point(1, -2), { ...point(5, 0), readable: false, signals: {} }, point(11, -3)],
  }];
  const { runs, count } = trendSeries(withGap, 'cheek_redness');
  assert.equal(count, 2);
  assert.deepEqual(runs[0].points.map((item) => item.value), [-2, -3]);
});

test('a signal the plan withheld simply has no chart', () => {
  // A redacted response omits the key entirely; that must read as "nothing to draw", not as a
  // chart of undefineds.
  assert.equal(drawable(oneRun, 'texture'), false);
  assert.equal(drawable([], 'cheek_redness'), false);
  assert.equal(drawable(undefined, 'cheek_redness'), false);
});

test('one comparable reading is not a trend', () => {
  assert.equal(drawable([{ break_reason: null, points: [point(1, -2)] }], 'cheek_redness'), false);
  assert.equal(drawable(oneRun, 'cheek_redness'), true);
});

test('points sit inside the box, with the y axis flipped for SVG', () => {
  const { runs } = trendSeries(oneRun, 'cheek_redness');
  const [x, y] = position(runs[0].points[0], 200, 60, 6);
  assert.equal(x, 6);
  // The first point is the higher value, so it sits nearer the top — a smaller y.
  assert.ok(y <= 54 && y >= 6, `y ${y} escaped the padded box`);
});

test('the table view keeps every reading, including the ones with nothing to plot', () => {
  const rows = trendRows([
    { break_reason: null, points: [point(1, -2)] },
    { break_reason: 'engine_version', points: [{ ...point(11, 0), readable: false, signals: {} }] },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].breakReason, null);
  assert.equal(rows[1].breakReason, 'engine_version');
  assert.equal(rows[1].readable, false);
});
