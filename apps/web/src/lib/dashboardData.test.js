import assert from 'node:assert/strict';
import test from 'node:test';

import {
  catalogAvailability,
  deviationStatus,
  improvementsFor,
  overallScore,
  pillarsFor,
  ratioRows,
  strengthsFor,
  toTenScale,
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

test('a pillar with no scored category stays locked instead of showing a number', () => {
  const pillars = pillarsFor(scan);
  const byId = Object.fromEntries(pillars.map((pillar) => [pillar.id, pillar]));

  assert.equal(byId.harmony.locked, false);
  assert.equal(byId.harmony.score, '8.0');
  assert.equal(byId.angularity.score, '9.0');
  // features averages eyes, nose and lips: (70 + 60 + 50) / 3 = 60
  assert.equal(byId.features.score, '6.0');
  assert.equal(byId.features.metricCount, 8);

  assert.equal(byId.dimorphism.locked, true);
  assert.equal(byId.dimorphism.score, '—');
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

test('catalog entries the backend cannot compute are reported unavailable, not filled in', () => {
  const { isAvailable, availableCount } = catalogAvailability(scan);
  assert.equal(availableCount, 4);
  assert.equal(isAvailable('midface_height'), true);
  assert.equal(isAvailable('facial-thirds'), false);
  assert.equal(catalogAvailability(emptyScan).availableCount, 0);
});
