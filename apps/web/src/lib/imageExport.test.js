import assert from 'node:assert/strict';
import test from 'node:test';

import { EXPORT_MAX_SIDE, exportFailureText, exportSize, simulationFileName } from './imageExport.js';

test('an image smaller than the cap is exported at its own resolution', () => {
  // The whole point of exporting through a canvas rather than screenshotting the viewer: the
  // file is the render, not the 320-pixel box it was being looked at in.
  assert.deepEqual(exportSize(1024, 1365), { width: 1024, height: 1365 });
});

test('a large image is reduced to the cap and keeps its shape', () => {
  const { width, height } = exportSize(6000, 4000);
  assert.equal(width, EXPORT_MAX_SIDE);
  assert.equal(height, 1333);
  assert.equal(Math.round((width / height) * 100), Math.round((6000 / 4000) * 100));
});

test('a small image is never blown up to the cap', () => {
  // Scaling up would hand back a blurred enlargement and call it a bigger file.
  assert.deepEqual(exportSize(400, 300), { width: 400, height: 300 });
});

test('an image with no dimensions yields no canvas rather than a NaN one', () => {
  for (const bad of [[0, 0], [undefined, undefined], [null, 500]]) {
    assert.deepEqual(exportSize(...bad), { width: 0, height: 0 }, String(bad));
  }
});

test('each angle downloads under its own dated name', () => {
  const day = new Date(2026, 8, 2);
  assert.equal(simulationFileName('front', day), 'doodee-simulation-front-2026-09-02.png');
  assert.equal(simulationFileName('left_profile', day), 'doodee-simulation-left-profile-2026-09-02.png');
  // Reference mode names the region instead, so the two modes cannot overwrite each other.
  assert.equal(simulationFileName('nose', day), 'doodee-simulation-nose-2026-09-02.png');
});

test('a label that could break a filename is reduced to one that cannot', () => {
  const day = new Date(2026, 0, 9);
  assert.equal(simulationFileName('../secret/front', day), 'doodee-simulation-secret-front-2026-01-09.png');
  assert.equal(simulationFileName('', day), 'doodee-simulation-2026-01-09.png');
  assert.equal(simulationFileName(null, day), 'doodee-simulation-2026-01-09.png');
});

test('the three download failures are told apart, in both languages', () => {
  // A tainted canvas is a storage setting somebody can fix; a dead link is not. Collapsing them
  // into one "download failed" sends whoever reads it to the wrong place.
  const reasons = ['blocked', 'source', 'encode'];
  for (const isTh of [true, false]) {
    const texts = reasons.map((reason) => exportFailureText(reason, isTh));
    assert.equal(new Set(texts).size, reasons.length, 'each cause must read differently');
    for (const text of texts) assert.ok(text.length > 0);
  }
  assert.match(exportFailureText('blocked', true), /CORS/);
  assert.match(exportFailureText('blocked', false), /cross-origin/);
  // Two of the three leave a usable picture on screen, and saying so is the difference between a
  // limit and a broken feature.
  assert.match(exportFailureText('source', true), /ภาพบนหน้าจอยังดูได้/);
  assert.match(exportFailureText('source', false), /still works/);
});

test('an unrecognised reason still produces a sentence rather than nothing', () => {
  // A caller that grows a fourth cause must not silently render an empty error line.
  assert.equal(exportFailureText('something-new', false), exportFailureText('encode', false));
  assert.ok(exportFailureText(undefined, true).length > 0);
});
