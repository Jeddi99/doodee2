import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  METRIC_SIMULATION_REGION,
  METRIC_VIEW,
  catalogAvailability,
  deviationStatus,
  improvementsFor,
  overallScore,
  pillarOfCategory,
  pillarsFor,
  ratioRows,
  referenceCohortFor,
  strengthsFor,
  toTenScale,
  viewScoresFor,
} from './dashboardData.ts';

const scan = {
  analysis_data: {
    reference_scores: {
      overall_score: 74,
      categories: [
        { key: 'proportions', score: 80, metric_count: 2 },
        { key: 'eyes', score: 70, metric_count: 2 },
        { key: 'nose', score: 60, metric_count: 3 },
        { key: 'lips', score: 50, metric_count: 3 },
        { key: 'chin', score: 90, metric_count: 2 },
      ],
      metrics: [
        { key: 'midface_height', category: 'proportions', observed: 0.431, reference: 0.44, normalized_deviation: -0.3, score: 88, unit: 'ratio' },
        { key: 'lower_face_height', category: 'proportions', observed: 0.58, reference: 0.56, normalized_deviation: 0.7, score: 72, unit: 'ratio' },
        { key: 'nasofrontal_angle', category: 'nose', observed: 141.2, reference: 134, normalized_deviation: 2.4, score: 31, unit: 'degree' },
        { key: 'chin_height', category: 'chin', observed: 0.31, reference: 0.3, normalized_deviation: 0.1, score: 95, unit: 'ratio' },
      ],
    },
  },
};

const emptyScan = { analysis_data: {} };

test('backend hundred-point scores render on the ten-point scale the cards use', () => {
  assert.equal(toTenScale(74), 7.4);
  assert.equal(toTenScale(95), 9.5);
  assert.equal(toTenScale(0), 0);
  assert.equal(toTenScale(null), null);
  assert.equal(toTenScale(undefined), null);
  assert.equal(overallScore(scan), 7.4);
  assert.equal(overallScore(emptyScan), null);
});

test('status describes distance from the reference, not a verdict on the face', () => {
  assert.equal(deviationStatus(0.2), 'Close to reference');
  assert.equal(deviationStatus(-0.9), 'Within one SD');
  assert.equal(deviationStatus(1.6), 'Within two SD');
  assert.equal(deviationStatus(-3), 'Beyond two SD');
});

test('every pillar on the screen is scored, because every one has categories behind it', () => {
  /**
   * The fourth card used to be `dimorphism` with no categories at all: an em dash forever, a
   * disabled button, and no plan that unlocked it. It could not be filled with a masculinity
   * figure either — `reference_scoring.REFERENCE` holds a male and a female mean for all twelve
   * observations, and once they are divided by n-gn the way a photograph forces, seven of the
   * twelve separate by under 0.2 of a pooled SD. The dimorphism there is overall face size, and
   * a photograph has no scale to read it with.
   *
   * So the four cards are now four groups of real measurements. This is the assertion that keeps
   * a blank one from coming back: a pillar with nothing behind it is a card that can never say
   * anything, and it does not belong on the first screen of a product being sold.
   */
  const pillars = pillarsFor(scan);
  const byId = Object.fromEntries(pillars.map((pillar) => [pillar.id, pillar]));

  assert.equal(pillars.length, 4);
  assert.deepEqual(pillars.map((pillar) => pillar.locked), [false, false, false, false]);
  assert.equal(pillars.filter((pillar) => pillar.lockReason === 'unmeasurable').length, 0,
    'a pillar no reference can measure is back on the screen');

  assert.equal(byId.harmony.score, '8.0');
  assert.equal(byId.angularity.score, '9.0');
  // The eyes stand on their own now: their category scores 70.
  assert.equal(byId.eyes.score, '7.0');
  assert.equal(byId.eyes.metricCount, 2);
  // And the card that was blank carries nose and lips: (60 + 50) / 2 = 55.
  assert.equal(byId.features.score, '5.5');
  assert.equal(byId.features.metricCount, 6);
});

test('the twelve scored observations are all still spoken for, none twice', () => {
  // Splitting a pillar is where a category quietly goes missing from the screen, or gets counted
  // in two cards at once and inflates the measurement totals under them.
  const counts = pillarsFor(scan).reduce((total, pillar) => total + pillar.metricCount, 0);
  assert.equal(counts, 12, 'the pillars no longer add up to the twelve scored measurements');
});

test('a scan with no scores locks every pillar as unscored, not as unmeasurable', () => {
  /** Otherwise a scan still processing would tell the user their face cannot be measured. */
  const byId = Object.fromEntries(pillarsFor(emptyScan).map((pillar) => [pillar.id, pillar]));

  assert.equal(byId.harmony.lockReason, 'not_scored');
  assert.equal(byId.features.lockReason, 'not_scored');
  assert.equal(byId.eyes.lockReason, 'not_scored', 'nothing is unmeasurable any more');
});

test('every pillar locks when the scan carries no reference scores at all', () => {
  assert.deepEqual(
    pillarsFor(emptyScan).map((pillar) => pillar.locked),
    [true, true, true, true],
  );
  assert.deepEqual(ratioRows(emptyScan), []);
  assert.deepEqual(strengthsFor(emptyScan), []);
});

test('degrees keep their unit and ratios are not dressed up as millimetres', () => {
  const rows = ratioRows(scan);
  const angle = rows.find((row) => row.id === 'nasofrontal_angle');
  const ratio = rows.find((row) => row.id === 'midface_height');

  assert.equal(angle.value, '141.2°');
  assert.equal(angle.ideal, '134°');
  assert.equal(ratio.value, '0.431');
  assert.equal(ratio.ideal, '0.440');
  assert.equal(ratio.name, 'Midface height');
  assert.equal(angle.status, 'Beyond two SD');
});

test('strengths are the highest scores and improvements the largest deviations', () => {
  assert.deepEqual(strengthsFor(scan, 2).map((item) => item.name), ['Chin height', 'Midface height']);

  const improvements = improvementsFor(scan, 2);
  assert.deepEqual(improvements.map((item) => item.name), ['Nasofrontal angle', 'Lower face height']);
  // Signed, so the card reads the same way qijek's hardcoded "−0.42" did.
  assert.equal(improvements[0].score, '+2.4');
  assert.equal(improvements[1].score, '+0.7');
});

test('both rankings come back whole, so the card can say how many it is holding', () => {
  /**
   * The default was three, and the card that renders them printed "3 of 18" beside a "Show 15
   * more" button that never added a row. Neither figure existed: both rankings are over the same
   * scored measurements, four of them on this scan. The whole list comes back so the counter and
   * the button are readings rather than decoration.
   */
  assert.equal(strengthsFor(scan).length, 4);
  assert.equal(improvementsFor(scan).length, 4);
  assert.deepEqual(strengthsFor(emptyScan), []);
  assert.deepEqual(improvementsFor(emptyScan), []);
});

test('each insight carries the band it falls in and the unit of the figure it prints', () => {
  /**
   * Two fixes in one row. The card had no severity for a strength, so its fallback printed
   * "Ideal" on every one — a verdict `deviationStatus` never returns and the scorer never makes.
   * And the two cards print different quantities into the same slot: a closeness score out of ten
   * against a signed distance in standard deviations. A bare "+2.4" beside a bare "9.5" reads as
   * two numbers on one scale, so the unit travels with the figure.
   */
  const [strength] = strengthsFor(scan, 1);
  assert.equal(strength.name, 'Chin height');
  assert.equal(strength.score, '9.5');
  assert.equal(strength.scoreUnit, '/10');
  // chin_height sits 0.1 SD off the published mean, which is the closest band there is.
  assert.equal(strength.level, 'Close to reference');

  const [improvement] = improvementsFor(scan, 1);
  assert.equal(improvement.scoreUnit, 'SD');
  assert.equal(improvement.level, 'Beyond two SD');

  for (const item of [...strengthsFor(scan), ...improvementsFor(scan)]) {
    assert.notEqual(item.level, 'Ideal', `${item.name} is being called ideal`);
    assert.ok(item.level, `${item.name} has no band`);
  }
});

/**
 * The Front/Side strip on the analysis screen.
 *
 * It used to render the string literals "7.4" and "5.9" — the same two numbers beside every
 * customer's own photograph — so these assert the two figures move with the payload and that an
 * unscored view reads as absent rather than as a low score.
 */
test('the front and side figures are averages of this scan\'s own measurements', () => {
  const [front, side] = viewScoresFor(scan);

  // front: midface 88, lower face 72, chin 95 -> 85. side: the one angle, 31.
  assert.equal(front.key, 'front');
  assert.equal(front.score, '8.5');
  assert.equal(front.metricCount, 3);
  assert.equal(side.key, 'side');
  assert.equal(side.score, '3.1');
  assert.equal(side.metricCount, 1);

  // And the same shape read against a different face gives different numbers, which is the whole
  // point: a constant passes every test that only looks at one scan.
  const other = {
    analysis_data: {
      reference_scores: {
        metrics: [
          { key: 'midface_height', score: 60 },
          { key: 'chin_height', score: 70 },
          { key: 'nasolabial_angle', score: 90 },
        ],
      },
    },
  };
  assert.deepEqual(viewScoresFor(other).map((item) => item.score), ['6.5', '9.0']);
});

test('a stored per-view summary is used ahead of re-deriving one', () => {
  /** The server writes it at scoring time; re-deriving over it would be a second opinion. */
  const summarised = {
    analysis_data: {
      reference_scores: {
        ...scan.analysis_data.reference_scores,
        views: [{ key: 'front', score: 83, metric_count: 9 }, { key: 'side', score: 49, metric_count: 3 }],
      },
    },
  };
  assert.deepEqual(viewScoresFor(summarised).map((item) => item.score), ['8.3', '4.9']);
});

test('the view written on a metric is preferred to the key table', () => {
  /**
   * Both are fallbacks for a scan with no summary, and they can disagree only if the server has
   * moved a measurement from one photograph to the other — in which case the scan's own record of
   * where it was read off is the true one.
   */
  const relabelled = {
    analysis_data: {
      reference_scores: {
        metrics: [{ key: 'midface_height', view: 'side', score: 40 }],
      },
    },
  };
  const [front, side] = viewScoresFor(relabelled);
  assert.equal(front.scored, false);
  assert.equal(side.score, '4.0');
});

test('a view with nothing scored reads as absent, never as zero', () => {
  /** A front-only scan has no profile angles at all, and 0.0 would look like a bad side score. */
  const frontOnly = {
    analysis_data: { reference_scores: { metrics: [{ key: 'eye_fissure', score: 77 }] } },
  };
  const [front, side] = viewScoresFor(frontOnly);
  assert.equal(front.score, '7.7');
  assert.equal(front.scored, true);
  assert.equal(side.score, '—');
  assert.equal(side.scored, false);
  assert.equal(side.metricCount, 0);

  // Both views still come back, so the strip keeps its two buttons.
  assert.deepEqual(viewScoresFor(emptyScan).map((item) => item.key), ['front', 'side']);
  assert.deepEqual(viewScoresFor(emptyScan).map((item) => item.scored), [false, false]);
  assert.deepEqual(viewScoresFor(null).map((item) => item.score), ['—', '—']);
});

test('METRIC_VIEW still names the same photographs the server does', () => {
  /**
   * Read out of `reference_scoring.py` rather than copied, for the reason `faceMetrics.test.js`
   * gives about the same file: a copy nothing verifies goes stale, and this one going stale means
   * a measurement is scored server-side and then counted toward neither view score here. Most
   * scans in the database predate per-view scoring and carry no `views` summary and no `view` on
   * their metrics, so this table is the only thing giving them a front and a side figure at all.
   */
  const source = readFileSync(
    fileURLToPath(new URL('../../../../backend/doodee/reference_scoring.py', import.meta.url)),
    'utf8',
  );
  const head = source.indexOf('VIEW_OF = {');
  assert.ok(head !== -1, 'VIEW_OF is gone from reference_scoring.py');
  const body = source.slice(head, source.indexOf('}', head));
  const declared = Object.fromEntries(
    [...body.matchAll(/"([a-z0-9_]+)":\s*"(front|side)"/g)].map((match) => [match[1], match[2]]),
  );
  assert.ok(Object.keys(declared).length, 'VIEW_OF parsed empty');
  assert.deepEqual(METRIC_VIEW, declared);
});

/** The cohort the reference tab in the ratio modal names. */
const cohortScan = {
  analysis_data: {
    reference_scores: {
      ...scan.analysis_data.reference_scores,
      reference: {
        profile: 'neutral', population: 'Thai adults', age_range: '18-35',
        sample_size: 240, source: 'https://example.test/study', version: 'thai-photo-2019-v1',
      },
      cohort_match: 'within_reference_age_range',
      population_match: 'within_reference_population',
      reported_population: 'TH',
    },
  },
};

test('the reference cohort is read off the scan, never assumed', () => {
  const cohort = referenceCohortFor(cohortScan);
  assert.equal(cohort.known, true);
  assert.equal(cohort.sampleSize, 240);
  assert.equal(cohort.population, 'Thai adults');
  assert.equal(cohort.ageRange, '18-35');
  assert.equal(cohort.version, 'thai-photo-2019-v1');
  assert.equal(cohort.outsideAgeRange, false);
  assert.equal(cohort.outsidePopulation, false);

  /**
   * A scan with no reference block is not a scan compared against the current cohort — it is a
   * scan whose cohort nobody recorded, and the modal has to say that rather than name a
   * population this face may never have been scored against.
   */
  const unknown = referenceCohortFor(scan);
  assert.equal(unknown.known, false);
  assert.equal(unknown.population, null);
  assert.equal(unknown.sampleSize, null);
  assert.equal(referenceCohortFor(null).known, false);
});

test('a reader outside the cohort is told, and only when the server says so', () => {
  const outside = {
    analysis_data: {
      reference_scores: {
        ...cohortScan.analysis_data.reference_scores,
        cohort_match: 'outside_reference_age_range',
        population_match: 'outside_reference_population',
        reported_population: 'JP',
      },
    },
  };
  const cohort = referenceCohortFor(outside);
  assert.equal(cohort.outsideAgeRange, true);
  assert.equal(cohort.outsidePopulation, true);
  assert.equal(cohort.reportedPopulation, 'JP');

  // Matched against the server's exact words, not by negating the "within" ones: an unrecognised
  // value must not turn into a warning about a mismatch nobody established.
  const unrecognised = {
    analysis_data: {
      reference_scores: { ...cohortScan.analysis_data.reference_scores, cohort_match: 'something_new' },
    },
  };
  assert.equal(referenceCohortFor(unrecognised).outsideAgeRange, false);
});

test('METRIC_SIMULATION_REGION still matches the targets the simulator can aim at', () => {
  /**
   * Parsed out of `reference_scoring.py` for the same reason as `METRIC_VIEW`. A stale copy here
   * means the ratio modal offers a Simulate tab that opens a studio which cannot aim at the
   * measurement that was clicked — or, worse, hides the tab on a measurement that has just gained
   * a target.
   */
  const source = readFileSync(
    fileURLToPath(new URL('../../../../backend/doodee/reference_scoring.py', import.meta.url)),
    'utf8',
  );
  const head = source.indexOf('REFERENCE_TARGETS = {');
  assert.ok(head !== -1, 'REFERENCE_TARGETS is gone from reference_scoring.py');
  const body = source.slice(head, source.indexOf('\n}', head));
  const declared = {};
  for (const [, region, keys] of body.matchAll(/"([a-z_]+)":\s*\{"keys":\s*\(([^)]*)\)/g)) {
    for (const [, key] of keys.matchAll(/"([a-z0-9_]+)"/g)) declared[key] = region;
  }
  assert.ok(Object.keys(declared).length, 'REFERENCE_TARGETS parsed empty');
  assert.deepEqual(METRIC_SIMULATION_REGION, declared);
});

test('catalog entries the backend cannot compute are reported unavailable, not filled in', () => {
  const { isAvailable, availableCount } = catalogAvailability(scan);
  assert.equal(availableCount, 4);
  assert.equal(isAvailable('midface_height'), true);
  assert.equal(isAvailable('facial-thirds'), false);
  assert.equal(catalogAvailability(emptyScan).availableCount, 0);
});

test('a pillar says what it measured, and never calls one category the whole face', () => {
  /**
   * A reader saw ความสมดุล 9.9 beside an overall of 7.8 and asked which number was invented.
   * Neither was. The pillar is `proportions` alone — two measurements of facial height — and the
   * overall averages all twelve, including a weak one. What misled was the note: "สัดส่วนโดยรวม
   * สมดุล", overall proportions, over a score that is nothing of the kind.
   *
   * The pillar-to-category map is the fact this guards against: `harmony` is one category, so no
   * copy attached to it may claim the face as a whole.
   */
  const source = readFileSync(fileURLToPath(new URL('./dashboardData.ts', import.meta.url)), 'utf8');
  const labels = source.slice(source.indexOf('const PILLAR_LABELS'), source.indexOf('\n};', source.indexOf('const PILLAR_LABELS')));
  for (const word of ['โดยรวม', 'overall', 'Overall']) {
    assert.ok(!labels.includes(word), `a pillar note says "${word}" over a score covering one part of the face`);
  }
});

test('a pillar reports how many measurements it rests on', () => {
  // Two measurements and twelve produce numbers that look equally confident on screen. The count
  // is what separates them, and it is computed here, so it has to survive here.
  const scan = {
    analysis_data: {
      reference_scores: {
        overall_score: 78,
        categories: [
          { key: 'proportions', score: 99, metric_count: 2 },
          { key: 'eyes', score: 70, metric_count: 4 },
        ],
        metrics: [],
      },
    },
  };
  const byId = Object.fromEntries(pillarsFor(scan, 'th').map((item) => [item.id, item]));
  assert.equal(byId.harmony.score, '9.9');
  assert.equal(byId.harmony.metricCount, 2, 'the 9.9 must carry the two measurements it came from');
  assert.equal(byId.eyes.metricCount, 4);
  // And a pillar this scan did not score reports no count rather than a confident zero-of-nothing.
  assert.equal(byId.features.metricCount, 0);
  assert.equal(byId.features.locked, true);
});

test('every scored category belongs to exactly one pillar, and the page reads that table', () => {
  /**
   * The analysis tab filters its rows with `pillarOf(row.category)`, and that used to be a second
   * hand-written copy of the mapping inside `DashboardPage.tsx`. When the fourth pillar was
   * filled the copy was not updated, so opening "จมูกและปาก" listed the two eye measurements
   * under it — the card said one thing and the tab behind it said another.
   *
   * Both halves are asserted: every category the backend scores lands somewhere, and none lands
   * twice. A category with no pillar disappears from the analysis screen entirely; a category in
   * two pillars is counted twice under "จาก N ค่าวัด".
   */
  const scored = ['proportions', 'eyes', 'nose', 'lips', 'chin'];
  for (const category of scored) {
    const owner = pillarOfCategory(category);
    assert.ok(owner, `${category} belongs to no pillar, so its rows reach no tab`);
  }
  const owners = scored.map((category) => pillarOfCategory(category));
  assert.equal(new Set(owners).size, 4, 'the five categories no longer fill exactly four pillars');

  // And the page must not carry its own copy of the mapping again.
  const page = readFileSync(fileURLToPath(new URL('../pages/DashboardPage.tsx', import.meta.url)), 'utf8');
  assert.ok(!/CATEGORY_PILLAR\s*[:=]/.test(page), 'DashboardPage has its own category→pillar table again');
  assert.match(page, /pillarOfCategory/, 'DashboardPage no longer reads the shared mapping');
});

test('the server withholds along the same pillar boundary the cards are drawn on', () => {
  /**
   * `percentile.redact_reference_scores` decides what a free account may read, and it decides it
   * one pillar at a time — `reference_scoring.PILLARS`. This file decides which categories make up
   * a pillar. If the two disagree the paywall lands somewhere the screen does not: half a card
   * readable, or a card the server opened that the client still blurs.
   *
   * Read out of the Python rather than copied, the same way `faceMetrics.test.js` reads the metric
   * tables. The boundary is where the money is, so it is not a place for a second source of truth.
   */
  const backend = readFileSync(
    fileURLToPath(new URL('../../../../backend/doodee/reference_scoring.py', import.meta.url)),
    'utf8',
  );
  const table = backend.match(/^PILLARS = \(([\s\S]*?)^\)/m);
  assert.ok(table, 'PILLARS is gone from reference_scoring.py');
  const server = [...table[1].matchAll(/\(\s*"(\w+)",\s*\(([^)]*)\)/g)].map(([, name, keys]) => [
    name,
    [...keys.matchAll(/"(\w+)"/g)].map((m) => m[1]),
  ]);
  assert.ok(server.length, 'PILLARS parsed empty');

  // Same pillars, same order — the order is what "the first pillar this scan scored" means.
  const client = ['harmony', 'angularity', 'eyes', 'features'];
  assert.deepEqual(server.map(([name]) => name), client, 'the pillar order differs from the cards');
  for (const [name, keys] of server) {
    assert.deepEqual(
      keys, keys.filter((key) => pillarOfCategory(key) === name),
      `${name} groups different categories on the two sides`,
    );
    for (const key of keys) {
      assert.equal(pillarOfCategory(key), name, `${key} is in ${name} on the server only`);
    }
  }
});
