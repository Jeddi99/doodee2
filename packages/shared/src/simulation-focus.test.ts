import assert from 'node:assert/strict';
import test from 'node:test';

import { focusTransform, MAX_FOCUS_SCALE, NO_ZOOM } from './simulation-focus.ts';

// A 4:3 image in a 4:3 viewer: nothing is cropped, so image fractions are viewer fractions.
const square = (box: Parameters<typeof focusTransform>[0]) => focusTransform(box, 4 / 3, 4 / 3);

test('no box means no zoom, so the viewer needs no branch of its own', () => {
  assert.deepEqual(square(null), NO_ZOOM);
  assert.deepEqual(square(undefined), NO_ZOOM);
  // A degenerate box from a face the landmarker placed badly must not divide by zero.
  assert.deepEqual(square({ x0: .5, y0: .5, x1: .5, y1: .5 }), NO_ZOOM);
});

test("zoom stops at the ceiling rather than magnifying the render's own pixels", () => {
  const chin = square({ x0: .45, y0: .82, x1: .55, y1: .9 });
  assert.equal(chin.scale, MAX_FOCUS_SCALE);
  const wide = square({ x0: .1, y0: .1, x1: .9, y1: .9 });
  assert.equal(wide.scale, 1, 'a region covering most of the face is already visible');
});

test('a region a little smaller than the viewer zooms partway, not to the ceiling', () => {
  const { scale } = square({ x0: .3, y0: .3, x1: .7, y1: .7 });
  assert.ok(scale > 1 && scale < MAX_FOCUS_SCALE, `expected a partial zoom, got ${scale}`);
});

// Where a viewer point ends up once the transform is applied.
const project = (point: number, scale: number, origin: number) => origin + (point - origin) * scale;

test('the region is moved to the middle, not just enlarged where it sat', () => {
  const box = { x0: .4, y0: .8, x1: .6, y1: .92 };
  const { scale, originX, originY } = square(box);
  assert.equal(Math.round(project(.5, scale, originX / 100) * 100), 50, 'a centred region stays centred');
  // A chin sits near the bottom of the photo. It cannot reach the exact middle without
  // uncovering the bottom edge, but it has to travel most of the way there.
  const was = (box.y0 + box.y1) / 2;
  const now = project(was, scale, originY / 100);
  assert.ok(now < was - .15, `chin moved from ${was.toFixed(2)} only to ${now.toFixed(2)}`);
  assert.ok(project(1, scale, originY / 100) >= 1, 'and never far enough to uncover the bottom');
});

test('a region at the edge pans no further than the image itself', () => {
  // Scaling about a point outside the viewer would swing an empty edge into view.
  for (const box of [
    { x0: 0, y0: 0, x1: .06, y1: .06 },
    { x0: .94, y0: .94, x1: 1, y1: 1 },
  ]) {
    const { scale, originX, originY } = square(box);
    assert.ok(originX >= 0 && originX <= 100, `originX ${originX}`);
    assert.ok(originY >= 0 && originY <= 100, `originY ${originY}`);
    // Centring a corner region would demand an origin outside the viewer; the clamp gives up
    // on centring instead of showing a strip of nothing.
    assert.ok(project(0, scale, originX / 100) <= 0 && project(1, scale, originX / 100) >= 1, 'x edges stay covered');
    assert.ok(project(0, scale, originY / 100) <= 0 && project(1, scale, originY / 100) >= 1, 'y edges stay covered');
  }
});

test('the cover crop is accounted for, not ignored', () => {
  // A 3:4 portrait in a 4:3 viewer: the top and bottom of the photo are cropped away before
  // any zoom happens, so the same box sits lower in the viewer than in the image and is
  // already larger there.
  const box = { x0: .4, y0: .6, x1: .6, y1: .7 };
  const cropped = focusTransform(box, 3 / 4, 4 / 3);
  const uncropped = focusTransform(box, 4 / 3, 4 / 3);
  assert.notEqual(cropped.originY, uncropped.originY);
  assert.ok(cropped.scale <= uncropped.scale, 'a crop that already enlarged the region needs less zoom');

  // A box the cover crop removed entirely still yields an origin inside the viewer.
  const offscreen = focusTransform({ x0: .4, y0: .01, x1: .6, y1: .05 }, 3 / 4, 4 / 3);
  assert.ok(offscreen.originY >= 0 && offscreen.originY <= 100, `originY ${offscreen.originY}`);
});
