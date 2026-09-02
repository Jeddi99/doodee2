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

/**
 * The same file with its comments removed.
 *
 * Every assertion of the form "this literal must not come back" has to run against this rather
 * than against `source`. Each fix in this file leaves a comment saying what the fake was and why
 * it went, quoting it — that is the record of the bug, and it is the most useful half of the
 * change to a reader six months from now. A test that searches the whole file cannot tell the
 * quotation from a relapse, so it either fails on its own documentation or forces the
 * documentation to speak in euphemisms about what was actually on screen. Both are worse than a
 * scanner.
 *
 * Hand-written rather than regex-based because a regex cannot tell `//` in a comment from `//` in
 * a URL or a string, and getting that wrong silently deletes code the assertions then pass on.
 */
const stripComments = (text) => {
  let out = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '/' && next === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 2;
      out += ' ';
      continue;
    }
    if (char === '/' && next === '/') {
      const end = text.indexOf('\n', index);
      index = end === -1 ? text.length : end;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      // Copied through whole, so a `//` or `/*` inside a string cannot open a comment.
      let cursor = index + 1;
      while (cursor < text.length && text[cursor] !== char) cursor += text[cursor] === '\\' ? 2 : 1;
      out += text.slice(index, cursor + 1);
      index = cursor + 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
};
const code = stripComments(source);

test('the Front/Side strip prints no scores of its own', () => {
  // Any bare one-decimal string literal in this file is a score nobody measured. The real ones
  // arrive as `viewScoresFor(scan)` entries and are formatted from the payload.
  const literals = [...source.matchAll(/"\d+\.\d"/g)].map((match) => match[0]);
  assert.deepEqual(literals, [], 'a score literal is back in DashboardPage.tsx');
  assert.match(source, /viewScoresFor/, 'the strip no longer reads its numbers from the scan');
});

/**
 * The face card's JSX, from the card's own className expression to the angle buttons below it.
 *
 * Anchored on the expression rather than on the first mention of the class name anywhere in the
 * file: prose that explains what the overlay used to be has to be free to name it, and a comment
 * that shifts this window silently points the assertions below at a different component. That
 * happened — the window slid up onto the distribution curve's own grid path and the test failed
 * on a drawing that was never over a face.
 */
const faceCard = (() => {
  const start = source.indexOf('className={`analysis-face-card');
  assert.notEqual(start, -1, 'the analysis face card is gone or was renamed');
  const end = source.indexOf('analysis-face-controls', start);
  assert.notEqual(end, -1, 'the angle controls that close the face card are gone');
  return source.slice(start, end);
})();

test('nothing is drawn on the photograph that was not measured on it', () => {
  /**
   * An SVG path of fixed coordinates over the scan photo is a landmark overlay that never touched
   * the face. The one that shipped was five rules and two dots in a 600x760 box, identical for
   * every customer and, on a photograph of any other shape, not even on the face.
   */
  assert.ok(!/\bd="M[\d ]/.test(faceCard), 'a hardcoded path is back over the scan photograph');
  assert.ok(!/\b(cx|cy|x1|y1|x2|y2)="\d/.test(faceCard),
    'a fixed coordinate is back over the scan photograph');
});

test('the overlay is drawn from the points the server measured at', () => {
  /**
   * The other half of the test above, and the reason the card is no longer empty: every line is
   * `analysis_data.metric_geometry`, the endpoints the server divided, normalised against the
   * stored photograph (`analysis_engine._metric_geometry`). Drawn through `lib/metricLines` so
   * the pairing stays server-side — a client that looks the landmarks up in a table of its own
   * can draw a line that contradicts the number printed beside it, and nothing on screen tells
   * the reader which of the two is wrong.
   */
  assert.match(source, /viewGeometry\(analysisData, viewKey\)/,
    'the overlay no longer reads the scan\'s own geometry');
  assert.match(source, /from "\.\.\/lib\/metricLines\.js"/,
    'the overlay stopped going through the shared span builder');
  // Nothing to draw must draw nothing. A missing geometry block is the normal state for every
  // scan analysed before the field existed and for every scan past its 30-day image purge.
  assert.match(source, /if \(!drawing\) return null;/,
    'the overlay no longer bails out when the scan carries no geometry');
  // The photograph and the lines have to be the same view. A profile angle drawn on a front
  // photograph is a measurement shown somewhere it was not taken.
  assert.match(faceCard, /viewKey=\{geometryView\}/, 'the overlay is not pinned to the view on screen');
});

test('a photograph labelled as a side view is the side photograph', () => {
  /**
   * `ScanPhotoContext` used to carry one `front_url` and hand it to every caller, so the Side
   * button, the "ด้านข้าง" figure and the whole side face card were the front photograph — with a
   * stylesheet rule panning and scaling it 1.16x to pass it off as a profile. `view_urls` carries
   * a signed link per captured view, so each angle now resolves to its own photograph and a scan
   * with no profile says so rather than showing the front face under a different name.
   */
  assert.ok(!/url: scanImage/.test(code), 'every photograph is back to reading one front URL');
  assert.match(source, /view_urls/, 'the per-view links are no longer read off the scan');
  for (const [label] of [...source.matchAll(/alt="Side view"[^/]*/g)]) {
    assert.match(label, /angle="side"/, 'a side photograph is being asked for by no angle at all');
  }
  // The crop is pinned at the element so the stylesheet's offset crop, and the side card's pan
  // and zoom, cannot slide the face out from under a line measured on it.
  assert.match(faceCard, /objectPosition: "50% 50%"/, 'the overlaid photograph lost its centred crop');
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

test('the insight cards count the rows they were given', () => {
  /**
   * The counter read "3 of 18" and the button "Show 15 more", above a list of exactly three rows
   * that expanding never grew. There is no eighteen and no fifteen in this system: both cards
   * rank the same twelve scored measurements at most. Every figure is `items.length` now, and
   * pressing the button shows the rest.
   */
  assert.ok(!/\d+ of 18|Show 15 more|All shown/.test(code), 'a written-in insight count is back');
  assert.match(source, /const hidden = items\.length - visible\.length;/,
    'the insight card no longer counts what it is holding');
  assert.match(source, /strengthsFor\(scan, undefined, locale\)/,
    'the strengths card is being handed a slice it cannot count past');
  assert.match(source, /improvementsFor\(scan, undefined, locale\)/,
    'the improvements card is being handed a slice it cannot count past');
});

test('no insight row is labelled with a verdict the scorer does not make', () => {
  /**
   * A strength carries no severity of its own, so the fallback printed "Ideal" on every one of
   * them. `deviationStatus` has four bands and none of them is that word — the closest it says is
   * that a measurement sits near a published mean. Both rankings carry the real band now, so
   * there is nothing left to fall back to.
   */
  assert.ok(!/"level" in item \? item\.level : "Ideal"/.test(code), 'the "Ideal" fallback is back');
  assert.ok(!/"Ideal"/.test(code), 'an ideal verdict is back in the rendered copy');
  assert.match(source, /<span className="insight-status">\{item\.level\}<\/span>/,
    'the status chip no longer prints the measurement\'s own band');
  // The two cards print different quantities into the same slot — a score out of ten and a
  // signed distance in SD — so the unit has to travel with the figure.
  assert.match(source, /\{item\.scoreUnit\}/, 'the insight figure lost the unit that says what it is');
});

test('a pillar is locked because the scan did not score it, never because of its name', () => {
  /**
   * The gate was `pillar !== "harmony"` — a constant, and one the rest of the product contradicted
   * on screen: the overview prints real Angularity and Features scores off
   * `reference_scores.categories`, and clicking through to the same pillar here covered every row
   * with a padlock and offered to sell it back. `pillarsFor` decides this per scan and is the only
   * thing that can.
   */
  assert.ok(!/pillar !== "harmony"/.test(code), 'the hardcoded pillar lock is back');
  assert.match(source, /const pillarLocked = activePillar\?\.locked \?\? true;/,
    'the pillar lock is not read from the pillar');
  // A pillar no published reference measures must not be sold as unlockable, and must not appear
  // as somewhere the reader could go and start work.
  assert.match(source, /lockReason !== "unmeasurable"/,
    'an unmeasurable pillar is offered as a destination again');
});

test('the paid gate is the plan the server reports, not a row index', () => {
  /**
   * `index > 2` padlocked the fourth row onwards for everybody — including a subscriber who had
   * already paid for it, under a button offering to sell what they were holding. `analysis_depth`
   * is the entitlement that governs how much of an analysis a plan may read, and `GET /session/`
   * publishes it precisely so the rule is not re-decided in the client.
   */
  assert.ok(!/index > 2/.test(code), 'the row-index paywall is back');
  assert.match(source, /session\.data\?\.score_card_redacted === true/,
    'the gate no longer asks the server which plan this is');
  assert.match(source, /analysisRedacted && index >= FREE_RATIO_ROWS/,
    'the gate is no longer applied only to plans that are actually redacted');
  // A locked row used to draw its score bar at full length, so the fill gave away the number the
  // padlock beside it claimed to be withholding.
  assert.match(source, /\{!locked && \(\s*<>/, 'a locked row is drawing its score bar again');
});

test('no claim is made about a count of ratios the product cannot back', () => {
  /**
   * "Unlock 70+ ratios" named a number that exists nowhere: the catalogue holds `CATALOG_SIZE`
   * entries, `analysis_engine` measures 51 of them, and only the 12 with a published mean can be
   * scored. `CATALOG_SIZE` itself is fine — `faceMetrics.test.js` pins it to `metric_catalog.py`
   * — but a second, different figure written in beside it is not.
   */
  assert.ok(!/70\+|\b70 ratios/.test(code), 'the 70+ ratio claim is back');
  assert.ok(!/สัดส่วน 12 ค่า/.test(code), 'a fixed measurement count is back in the page title');
  // The strip over the photographs counts what this scan produced, not what the catalogue holds.
  assert.match(source, /rows\.length\} ค่าที่ให้คะแนนได้ในสแกนนี้|rows\.length\} scored on this scan/,
    'the analysis strip is back to advertising the catalogue size over one scan');
});

test('the score bar puts the reference where the reference is', () => {
  /**
   * `reference_scoring.metric_score` is `100 - 20|z|`, so the right-hand end of a 0-10 score bar
   * is the published mean itself. The caption reading "Reference" was pinned to the midpoint by
   * the stylesheet, which put the reference where a score of 5.0 sits and made every reading of
   * the bar wrong by half its width. The marker was also clamped into 8-92%, giving a figure with
   * neither a floor nor a ceiling both.
   */
  assert.ok(!/Math\.min\(92, Math\.max\(8, metric\.score \* 10\)\)/.test(code),
    'the score marker is clamped into a range again');
  assert.match(source, /left: `\$\{metric\.score \* 10\}%`/, 'the marker is not at the score');
  assert.match(source, /farFromReference/, 'the far end of the score bar lost its label');
  assert.match(source, /left: "100%", transform: "translateX\(-100%\)"/,
    'the reference caption drifted off the reference end of the bar');
});

test('the pillar progress marks track the pillars', () => {
  /**
   * Four letters with the first always filled: H done, A, D and F pending, on every account,
   * whatever the scan measured — a progress meter that was a picture rather than a reading. It is
   * built from the same `pillars` the sentence beside it counts now, so the two cannot disagree.
   */
  assert.ok(!/<span className="is-done">H<\/span>/.test(code), 'the fixed progress letters are back');
  assert.match(source, /className=\{item\.locked \? undefined : "is-done"\}/,
    'the progress marks are no longer read from the pillars');
});
