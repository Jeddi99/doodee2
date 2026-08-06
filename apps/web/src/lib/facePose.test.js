import assert from 'node:assert/strict';
import test from 'node:test';

import { poseFromMatrix } from './facePose.js';

const data = [
  .999598742, .0188124683, .0211795289, 0,
  -.0193326753, .999509752, .0246308949, 0,
  -.02070578, -.0250305254, .99947238, 0,
  -.028, -5.968, -39.293, 1,
];

// The expected yaw is the negative of asin(-M[2][0]) because poseFromMatrix emits
// pose_targets.json coordinates. backend/doodee/tests.py asserts the same +1.214 from the
// same matrix, which is what keeps on-device readiness and server validation on one axis.
test('reads MediaPipe column-major pose in pose-target coordinates and removes uniform scale', () => {
  const matrix = { rows: 4, columns: 4, data };
  const scaled = { ...matrix, data: data.map((value, index) => index % 4 < 3 && index < 12 ? value * 4 : value) };
  for (const pose of [poseFromMatrix(matrix), poseFromMatrix(scaled)]) {
    assert.ok(Math.abs(pose.yaw - 1.214) < .01);
    assert.ok(Math.abs(pose.pitch - 1.412) < .01);
    assert.ok(Math.abs(pose.roll - 1.078) < .01);
  }
});
