import assert from 'node:assert/strict';
import test from 'node:test';

import { latestCraniofacialScan, latestScanOfAnyMode, SKIN_SCAN_MODE } from './latestScan.js';

const face = { id: 'face', scan_mode: 'standard' };
const skin = { id: 'skin', scan_mode: SKIN_SCAN_MODE };
const full = { id: 'full', scan_mode: 'full' };

test('a skin scan does not become the scan behind the analysis pages', () => {
  // The regression this module exists for: newest first, skin on top, face underneath.
  assert.equal(latestCraniofacialScan([skin, face]).id, 'face');
});

test('the newest craniofacial scan wins over an older one', () => {
  assert.equal(latestCraniofacialScan([skin, full, face]).id, 'full');
});

test('a scan with no mode counts as craniofacial', () => {
  // `scan_mode` arrived after the first scans did. Reading a missing field as "skin" would
  // hide the only scan an early user has.
  assert.equal(latestCraniofacialScan([{ id: 'old' }]).id, 'old');
});

test('nothing usable reads as null rather than undefined', () => {
  assert.equal(latestCraniofacialScan([]), null);
  assert.equal(latestCraniofacialScan([skin]), null);
  assert.equal(latestCraniofacialScan(undefined), null);
  assert.equal(latestScanOfAnyMode(undefined), null);
});

test('the skin panel takes the newest scan whatever it was captured for', () => {
  // Any mode with a front view produces a skin_analysis, and the skin scan is the one framed
  // and lit for it — so freshest wins here, unlike everywhere else.
  assert.equal(latestScanOfAnyMode([skin, face]).id, 'skin');
  assert.equal(latestScanOfAnyMode([face, skin]).id, 'face');
});
