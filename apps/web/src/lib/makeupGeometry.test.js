import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHEEK_LANDMARKS, cheekEllipses, coverFit, faceSpan, imageToCanvas, irisCircles, lipRings, ringsFromConnections,
} from './makeupGeometry.js';

const ring = (indices) => indices.map((start, i) => ({ start, end: indices[(i + 1) % indices.length] }));

// A synthetic face: normalised landmarks placed where the real ones sit, mirrored about x = 0.5.
function face() {
  const points = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }));
  const put = (index, x, y) => { points[index] = { x, y }; };
  put(234, .30, .50); put(454, .70, .50);            // face width anchors
  // Cheeks, outermost first per CHEEK_LANDMARKS order.
  put(116, .34, .52); put(50, .36, .50); put(187, .38, .55); put(205, .42, .54);
  put(345, .66, .52); put(280, .64, .50); put(411, .62, .55); put(425, .58, .54);
  return points;
}

test('cover fit maps the image centre to the canvas centre whichever way it crops', () => {
  for (const [image, canvas] of [
    [{ width: 900, height: 1200 }, { width: 1600, height: 900 }],   // tall photo, wide canvas
    [{ width: 1600, height: 900 }, { width: 600, height: 900 }],    // wide photo, tall canvas
    [{ width: 1000, height: 1000 }, { width: 1000, height: 1000 }], // no crop at all
  ]) {
    const fit = coverFit(image, canvas);
    const centre = imageToCanvas({ x: .5, y: .5 }, fit);
    assert.ok(Math.abs(centre.x - canvas.width / 2) < 1e-6, `x for ${canvas.width}x${canvas.height}`);
    assert.ok(Math.abs(centre.y - canvas.height / 2) < 1e-6, `y for ${canvas.width}x${canvas.height}`);
  }
});

test('the crop rectangle stays inside the source image', () => {
  const fit = coverFit({ width: 900, height: 1200 }, { width: 1600, height: 900 });
  assert.ok(fit.sx >= 0 && fit.sy >= 0);
  assert.ok(fit.sx + fit.sw <= 900 + 1e-9);
  assert.ok(fit.sy + fit.sh <= 1200 + 1e-9);
});

test('a cheek landmark stays on the cheek when the canvas shape changes', () => {
  // This is the bug that started this work: the blush sat at a fixed 46% of the stage, so a
  // reshaped stage slid the face upward until 46% was the jaw. Under a shared fit the landmark
  // must keep pointing at the same feature no matter how the canvas is shaped.
  const points = face();
  const image = { width: 900, height: 1200 };
  const tall = coverFit(image, { width: 600, height: 900 });
  const wide = coverFit(image, { width: 1600, height: 900 });
  for (const [fit, canvas] of [[tall, { width: 600, height: 900 }], [wide, { width: 1600, height: 900 }]]) {
    const cheek = imageToCanvas(points[116], fit);
    const chin = imageToCanvas({ x: .5, y: .90 }, fit);
    const eye = imageToCanvas({ x: .5, y: .38 }, fit);
    assert.ok(cheek.y < chin.y, `cheek must stay above the chin on ${canvas.width}x${canvas.height}`);
    assert.ok(cheek.y > eye.y, `cheek must stay below the eye on ${canvas.width}x${canvas.height}`);
  }
});

test('coverFit refuses dimensions it cannot crop', () => {
  assert.throws(() => coverFit({ width: 0, height: 10 }, { width: 10, height: 10 }), /positive dimensions/);
  assert.throws(() => coverFit({ width: 10, height: 10 }, { width: 10, height: 0 }), /positive dimensions/);
});

test('rings are recovered from unordered edges', () => {
  // MediaPipe hands over edges in no useful order; filling them as given draws a scribble.
  const shuffled = [
    { start: 3, end: 0 }, { start: 1, end: 2 }, { start: 0, end: 1 }, { start: 2, end: 3 },
  ];
  const [only] = ringsFromConnections(shuffled);
  assert.equal(only.length, 4);
  // Walking the result must traverse real edges the whole way round.
  const edges = new Set(shuffled.flatMap(({ start, end }) => [`${start}-${end}`, `${end}-${start}`]));
  for (let i = 0; i < only.length; i += 1) {
    assert.ok(edges.has(`${only[i]}-${only[(i + 1) % only.length]}`), `step ${i} is not an edge`);
  }
});

test('two rings come back largest first, which is how the lips arrive', () => {
  const rings = ringsFromConnections([...ring([10, 11, 12, 13, 14, 15]), ...ring([20, 21, 22, 23])]);
  assert.deepEqual(rings.map((r) => r.length), [6, 4]);
});

test('edges that do not form rings are refused rather than drawn as nonsense', () => {
  assert.throws(() => ringsFromConnections([{ start: 0, end: 1 }, { start: 1, end: 2 }]), /not a ring/);
});

test('lip rings become canvas points, outer and inner', () => {
  const points = face();
  for (const [index, spot] of [[61, [.44, .62]], [62, [.50, .60]], [63, [.56, .62]], [64, [.50, .65]],
    [71, [.47, .62]], [72, [.50, .615]], [73, [.53, .62]]]) {
    points[index] = { x: spot[0], y: spot[1] };
  }
  const fit = coverFit({ width: 1000, height: 1000 }, { width: 1000, height: 1000 });
  const { outer, inner } = lipRings(points, fit, [...ring([61, 62, 63, 64]), ...ring([71, 72, 73])]);
  assert.equal(outer.length, 4);
  assert.equal(inner.length, 3);
  assert.deepEqual(outer[0], { x: 440, y: 620 });
});

test('a symmetric face gets symmetric cheek ellipses', () => {
  const fit = coverFit({ width: 1000, height: 1000 }, { width: 1000, height: 1000 });
  const { left, right } = cheekEllipses(face(), fit);
  assert.ok(Math.abs((500 - left.cx) - (right.cx - 500)) < 1e-6, 'mirrored about the centre line');
  assert.ok(Math.abs(left.cy - right.cy) < 1e-6);
  assert.ok(Math.abs(left.rx - right.rx) < 1e-6 && left.rx > 0);
  assert.ok(left.ry < left.rx, 'blush follows the cheekbone, so it is wider than it is tall');
});

test('cheek ellipses use the landmarks the server already warps against', () => {
  assert.deepEqual(CHEEK_LANDMARKS, { left: [116, 50, 187, 205], right: [345, 280, 411, 425] });
});

test('iris radius is measured from the landmarks, not assumed', () => {
  const points = face();
  const place = (indices, cx, cy, r) => indices.forEach((index, i) => {
    const angle = (i / indices.length) * Math.PI * 2;
    points[index] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });
  place([468, 469, 470, 471], .42, .40, .02);
  place([473, 474, 475, 476], .58, .40, .04);   // deliberately twice the size
  const fit = coverFit({ width: 1000, height: 1000 }, { width: 1000, height: 1000 });
  const { left, right } = irisCircles(points, fit, ring([468, 469, 470, 471]), ring([473, 474, 475, 476]));
  assert.ok(Math.abs(left.cx - 420) < 1e-6 && Math.abs(left.cy - 400) < 1e-6);
  assert.ok(Math.abs(left.radius - 20) < 1e-6, `left radius ${left.radius}`);
  assert.ok(Math.abs(right.radius - 2 * left.radius) < 1e-6, 'a bigger iris gets a bigger circle');
});

test('face span scales with the canvas so feathering can scale with it', () => {
  const image = { width: 1000, height: 1000 };
  const small = faceSpan(face(), coverFit(image, { width: 500, height: 500 }));
  const large = faceSpan(face(), coverFit(image, { width: 1000, height: 1000 }));
  assert.ok(Math.abs(small - 200) < 1e-6, `got ${small}`);
  assert.ok(Math.abs(large - 2 * small) < 1e-6, 'a blur derived from this doubles with the canvas');
});
