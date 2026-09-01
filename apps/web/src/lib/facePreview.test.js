import assert from 'node:assert/strict';
import test from 'node:test';

import { faceCropRect, previewTransform } from './facePreview.js';

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

test('the rear camera is never flipped', () => {
  // No usable box, so nothing but the mirror decision is left to report.
  assert.equal(previewTransform(null, ...video, ...element, false), 'none');
  assert.equal(previewTransform(box(.4, .6, .5, .5), ...video, ...element, false), 'none');

  // A flip in front of the zoom would send the pose arrows the wrong way, so it has to be gone
  // from the composed transform too, not just from the standing-still case.
  const tracked = previewTransform(box(.1, .3, .35, .65), ...video, ...element, false);
  assert.doesNotMatch(tracked, /scaleX/);
  assert.match(tracked, /^scale\(/);

  // Same geometry, both cameras: only the mirror differs.
  const mirroredTracked = previewTransform(box(.1, .3, .35, .65), ...video, ...element, true);
  assert.equal(mirroredTracked, `scaleX(-1) ${tracked}`);
});

// A 1920x1440 capture, the resolution the camera is asked for.
const FRAME = [1920, 1440];
const faceAt = (heightRatio, centreX = .5, centreY = .5) => ({
  left: centreX - heightRatio * .38,
  right: centreX + heightRatio * .38,
  top: centreY - heightRatio / 2,
  bottom: centreY + heightRatio / 2,
});

test('a face shot from a distance is cropped to the face, not the room', () => {
  // The whole point of letting people stand back: the head is a sixth of the frame, and what
  // gets uploaded still has to be a portrait rather than a photo of someone in a room.
  const crop = faceCropRect(faceAt(.16), ...FRAME);
  const faceHeightPx = .16 * 1440;
  // The kept rectangle is a small window on the frame, sized around the face.
  assert.ok(crop.height < 1440 * .3, `kept ${crop.height}px of 1440`);
  assert.ok(crop.width < 1920 * .3, `kept ${crop.width}px of 1920`);
  // And the face fills most of that window's height, which is what makes it a portrait.
  assert.ok(faceHeightPx / crop.height > .5, `face fills ${(faceHeightPx / crop.height).toFixed(2)} of the crop`);
  // Enough pixels of face survive for the server to re-measure.
  assert.ok(faceHeightPx > 200, `${faceHeightPx}px of face`);
});

test('a face against the edge is still cropped whole, never off the frame', () => {
  // Where the off-centre rule used to reject: far to one side, entirely present. The crop has to
  // stay inside the frame, so it slides rather than reading pixels that do not exist.
  for (const centreX of [.12, .88]) {
    const crop = faceCropRect(faceAt(.2, centreX), ...FRAME);
    assert.ok(crop.x >= 0 && crop.x + crop.width <= 1920, `x ${crop.x} w ${crop.width}`);
    assert.ok(crop.y >= 0 && crop.y + crop.height <= 1440, `y ${crop.y} h ${crop.height}`);
  }
});

test('a face filling the frame is never magnified past the pixels that exist', () => {
  const crop = faceCropRect(faceAt(.95), ...FRAME);
  assert.ok(crop.width <= 1920 && crop.height <= 1440);
});

test('no tracked face keeps the whole frame rather than guessing at one', () => {
  assert.deepEqual(faceCropRect(null, ...FRAME), { x: 0, y: 0, width: 1920, height: 1440 });
  // A degenerate box would divide by zero on the way to a crop height.
  assert.deepEqual(faceCropRect({ left: .4, right: .6, top: .5, bottom: .5 }, ...FRAME), { x: 0, y: 0, width: 1920, height: 1440 });
});
