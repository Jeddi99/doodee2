import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardGate } from './dashboardGate.ts';

test('a completed scan renders even with no photograph left', () => {
  // The regression. purge_scan_images empties image_objects 30 days after a scan and keeps the
  // measurements; the old gate read that as "still loading" and showed a blank page forever.
  assert.equal(dashboardGate({ status: 'completed', front_url: null, images_expired: true }), 'ready');
});

test('a completed scan with a photograph renders', () => {
  assert.equal(dashboardGate({ status: 'completed', front_url: 'https://signed/x.jpg' }), 'ready');
});

test('a scan still being analysed waits', () => {
  assert.equal(dashboardGate({ status: 'queued' }), 'waiting');
  assert.equal(dashboardGate({ status: 'processing' }), 'waiting');
});

test('no scan at all waits rather than claiming failure', () => {
  assert.equal(dashboardGate(null), 'waiting');
  assert.equal(dashboardGate(undefined), 'waiting');
  assert.equal(dashboardGate({}), 'waiting');
});

test('a failed scan says so instead of spinning', () => {
  assert.equal(dashboardGate({ status: 'failed', error_message: 'no face found' }), 'failed');
});

test('a scan queued for deletion is not treated as ready', () => {
  // Its images and analysis are on their way out; rendering it would flash content that is
  // about to disappear.
  assert.equal(dashboardGate({ status: 'deletion_pending' }), 'waiting');
});
