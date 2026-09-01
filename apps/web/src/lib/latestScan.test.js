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

test('a demo scan is never the scan a screen presents as yours', () => {
  // Sample rows carry real-shaped analysis over invented input. Left in, the newest one would
  // sit at the top of the list and every screen would report its numbers as the person's own.
  const demo = { id: 'demo', scan_mode: 'standard', is_demo: true };
  assert.equal(latestCraniofacialScan([demo, face]).id, 'face');
  assert.equal(latestScanOfAnyMode([demo, skin]).id, 'skin');
});

test('an account holding only a demo scan reads as not yet scanned', () => {
  // This is what sends someone back to the landing page instead of showing them a sample
  // dressed up as a result.
  assert.equal(latestCraniofacialScan([{ id: 'demo', is_demo: true }]), null);
  assert.equal(latestScanOfAnyMode([{ id: 'demo', is_demo: true }]), null);
});

test('is_demo absent or false is a real scan', () => {
  // The field postdates the earliest rows, so a missing one must not read as demo.
  assert.equal(latestCraniofacialScan([{ id: 'a' }]).id, 'a');
  assert.equal(latestCraniofacialScan([{ id: 'b', is_demo: false }]).id, 'b');
});
