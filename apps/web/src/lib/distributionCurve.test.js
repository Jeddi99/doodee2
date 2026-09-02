import assert from 'node:assert/strict';
import test from 'node:test';

import { curvePath, scoreX } from './distributionCurve.ts';

const box = { left: 42, right: 718, baseline: 174, peak: 38 };

test('the curve is the server\'s density estimate, mapped and nothing else', () => {
  const path = curvePath(
    [{ score: 0, density: 0 }, { score: 50, density: 0.02 }, { score: 100, density: 0.01 }],
    box,
  );
  // Zero density sits on the baseline, the tallest point reaches the top of the box, and half of
  // the peak lands exactly halfway between the two. No smoothing, no fitted shape.
  assert.equal(path, 'M42,174 L380,38 L718,106');
});

test('a sample of one draws a spike rather than a bell', () => {
  /**
   * The point of plotting what the server sent: `density_curve` over a single score is one narrow
   * hill, and it has to look like one. The decorative path this replaced was a broad symmetric
   * bell whatever the sample was, which is a picture of a population that may not exist.
   */
  const curve = [
    { score: 0, density: 0.0001 },
    { score: 50, density: 0.0002 },
    { score: 80, density: 0.09 },
    { score: 100, density: 0.0003 },
  ];
  const heights = curvePath(curve, box)
    .split(' ')
    .map((point) => Number(point.split(',')[1]));
  assert.equal(Math.min(...heights), 38, 'the one score reaches the top');
  assert.ok(heights.filter((y) => y > 170).length === 3, 'everywhere else stays on the floor');
});

test('no curve draws nothing, which is not the same as a flat line', () => {
  // A flat line along the baseline reads as "everybody scored zero"; the truth in this case is
  // "there is nobody to compare against yet".
  assert.equal(curvePath([], box), null);
  assert.equal(curvePath(undefined, box), null);
  assert.equal(curvePath([{ score: 10, density: 0 }], box), null);
});

test('the score axis is clamped to the drawn span', () => {
  assert.equal(scoreX(0, box), 42);
  assert.equal(scoreX(100, box), 718);
  assert.equal(scoreX(50, box), 380);
  // A score outside 0-100 cannot exist, but a marker escaping the chart would be drawn over the
  // card next to it rather than dropped.
  assert.equal(scoreX(140, box), 718);
  assert.equal(scoreX(-5, box), 42);
});
