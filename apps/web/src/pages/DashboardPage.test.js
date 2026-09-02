import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Guards against numbers and drawings that do not come from the customer's face.
 *
 * Read off the source rather than rendered, for the same reason `faceMetrics.test.js` parses
 * `analysis_engine.py`: there is no DOM renderer in this suite, and the failure being guarded
 * against is a literal appearing in the file, which a source read catches exactly. The behaviour
 * these figures now come from is tested properly in `lib/dashboardData.test.js`.
 *
 * Every one of these was shipped once. The analysis screen printed "7.4" and "5.9" beside two
 * photographs, drew a fixed line drawing over the face where measured proportions belong, and
 * plotted a decorative bell under a heading about where this person's score sits.
 */
const source = readFileSync(fileURLToPath(new URL('./DashboardPage.tsx', import.meta.url)), 'utf8');

test('the Front/Side strip prints no scores of its own', () => {
  // Any bare one-decimal string literal in this file is a score nobody measured. The real ones
  // arrive as `viewScoresFor(scan)` entries and are formatted from the payload.
  const literals = [...source.matchAll(/"\d+\.\d"/g)].map((match) => match[0]);
  assert.deepEqual(literals, [], 'a score literal is back in DashboardPage.tsx');
  assert.match(source, /viewScoresFor/, 'the strip no longer reads its numbers from the scan');
});

test('nothing is drawn on the photograph that was not measured on it', () => {
  /**
   * An SVG path of fixed coordinates over the scan photo is a landmark overlay that never touched
   * the face. Landmarks are not served to the client at all — `GET /scans/<id>/mesh/<view>/`
   * re-detects them server-side and answers with a PNG — so there is nothing here to draw one
   * from, and the honest overlay is no overlay.
   */
  const overlay = source.slice(source.indexOf('analysis-face-card'));
  assert.ok(!/\bd="M[\d ]/.test(overlay.slice(0, overlay.indexOf('analysis-face-controls'))),
    'a hardcoded path is back over the scan photograph');
});

test('the distribution curve is plotted from the payload, not from a fixed path', () => {
  // The bell was a `d="M42 174C…"` cubic, identical for every viewer. The shape now comes from
  // `distribution.curve`, which the server draws from the scores it actually holds.
  assert.ok(!source.includes('C158 174 195 167'), 'the decorative bell path is back');
  assert.match(source, /curvePath\(distribution\?\.curve/, 'the curve is not read from the payload');
});

test('the ratio modal offers no tab it cannot fill', () => {
  /**
   * The "Celebrities" tab is not deleted but repurposed: there is no celebrity facial-measurement
   * data in either repository, and the only truthful way to get some would be to run photographs
   * of named public figures through the pipeline ourselves. It now compares against the published
   * Thai cohort, which is real, already computed, and answers the same question. The label had to
   * change with it — a tab called Celebrities showing reference data is its own small lie.
   *
   * "Edit" stays out until the landmark-correction screen exists.
   */
  // Scoped to the copy table, which is what actually reaches the screen — the comment above it
  // has to be free to explain what the tab used to be.
  const copy = source.slice(source.indexOf('const RATIO_MODAL_COPY'), source.indexOf('} as const;'));
  assert.ok(!/celebrit/i.test(copy), 'a celebrity label is back in the rendered copy');
  assert.ok(!source.includes("editTitle"), 'the Edit placeholder is back');
  assert.deepEqual(
    [...source.matchAll(/^const RATIO_TABS = (.+);$/gm)].map((match) => match[1]),
    ['["overview", "reference", "simulate"] as const'],
    'the tab set changed without this test being read',
  );
});

test('the Simulate tab is only offered where a simulation target exists', () => {
  /**
   * Eight of the twelve scored measurements feed no region the simulator has a published target
   * for, and a tab that opens a studio which cannot aim at the thing you clicked is the same
   * empty promise in a working-looking wrapper. The tab is filtered out rather than disabled, and
   * the region it hands over comes from the table mirrored off `REFERENCE_TARGETS`.
   */
  assert.match(source, /METRIC_SIMULATION_REGION\[metric\.id\]/, 'the region is not read per metric');
  assert.match(source, /item !== "simulate" \|\| region/, 'the tab is no longer gated on a region');
});

test('the reference tab names the cohort rather than implying one', () => {
  // "Compared against the reference" is not a comparison anyone can weigh without the population,
  // the age band and the sample size, all three of which are on the scan payload already.
  for (const needed of ['cohortBody', 'cohortUnknown', 'outsideAgeRange', 'outsidePopulation']) {
    assert.ok(source.includes(needed), `the reference tab dropped ${needed}`);
  }
});
