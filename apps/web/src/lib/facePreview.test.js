import assert from 'node:assert/strict';
import test from 'node:test';

import { previewTransform } from './facePreview.js';

// A 4:3 camera inside the 4:5 capture stage: cover scales to fill the height and hides the
// outer 20% of the frame on each side.
const video = [640, 480];
const element = [400, 500];
const box = (left, right, top, bottom) => ({ left, right, top, bottom });

test('no tracked face leaves the preview mirrored only', () => {
  assert.equal(previewTransform(null, ...video, ...element), 'scaleX(-1)');
  assert.equal(previewTransform(box(.4, .6, .5, .5), ...video, ...element), 'scaleX(-1)');
});

test('a centred face is magnified without being shifted', () => {
  const transform = previewTransform(box(.4, .6, .35, .65), ...video, ...element);
  assert.match(transform, /^scaleX\(-1\) scale\(/);
  assert.match(transform, /translate\(0\.00%, 0\.00%\)/);
});

test('an off-centre face is pulled back to the middle', () => {
  const transform = previewTransform(box(.1, .3, .35, .65), ...video, ...element);
  const [, x, y] = transform.match(/translate\((-?[\d.]+)%, (-?[\d.]+)%\)/);
  // Face centre sits left of the middle, so the content shifts right to centre it.
  assert.ok(Number(x) > 0, `expected a positive x shift, got ${x}`);
  assert.equal(Number(y), 0);
});

test('zoom never magnifies past the clamp and never shrinks', () => {
  const tiny = previewTransform(box(.45, .55, .48, .52), ...video, ...element);
  assert.match(tiny, /scale\(2\.500\)/);
  const filling = previewTransform(box(.1, .9, 0, 1), ...video, ...element);
  assert.match(filling, /scale\(1\)|^scaleX\(-1\)/);
});

test('a taller-than-frame face does not divide by zero', () => {
  assert.equal(previewTransform(box(.4, .6, .6, .4), ...video, ...element), 'scaleX(-1)');
});
