import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UTM_STORAGE_KEY, VISIT_DAY_KEY, deviceKind, localDay, readAttribution, rememberAttribution,
  shouldSendVisit, utmFromQuery, visitPayload,
} from './visit.js';

/** The two storage methods these functions use, and nothing else. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    data,
  };
}

/** A storage object that throws, as Safari's private mode does. */
const brokenStorage = {
  getItem() { throw new Error('storage disabled'); },
  setItem() { throw new Error('storage disabled'); },
};

test('utm tags are read off the query string and folded to lowercase', () => {
  const utm = utmFromQuery('?utm_source=TikTok&utm_medium=Bio&utm_campaign=Aug-Promo');
  assert.deepEqual(utm, { source: 'tiktok', medium: 'bio', campaign: 'aug-promo' });
});

test('a visit with no tags returns null rather than a row of direct', () => {
  // Otherwise a plain visit to the site would overwrite the campaign this tab arrived with.
  assert.equal(utmFromQuery(''), null);
  assert.equal(utmFromQuery('?ref=ABCD2345'), null);
});

test('one tag present is enough, and the missing ones read as direct', () => {
  assert.deepEqual(utmFromQuery('?utm_source=fb'), {
    source: 'fb', medium: 'direct', campaign: 'direct',
  });
});

test('a malformed query string is survived, not thrown on', () => {
  assert.equal(utmFromQuery(null), null);
  assert.equal(utmFromQuery(undefined), null);
});

test('tags are truncated and stripped to match the server', () => {
  const utm = utmFromQuery(`?utm_source=<script>&utm_campaign=${'x'.repeat(100)}`);
  assert.equal(utm.source, 'script');
  assert.equal(utm.campaign.length, 32);
});

test('the first campaign to send someone here is the one that keeps the credit', () => {
  const storage = fakeStorage();
  rememberAttribution({ source: 'tiktok', medium: 'bio', campaign: 'aug' }, storage);
  rememberAttribution({ source: 'facebook', medium: 'cpc', campaign: 'sep' }, storage);
  assert.equal(readAttribution(storage).source, 'tiktok');
});

test('reading attribution does not clear it', () => {
  // It is needed twice — the arrival beacon now, the account link after sign-in — and clearing
  // on first read is exactly how attribution would go missing with nobody noticing.
  const storage = fakeStorage();
  rememberAttribution({ source: 'tiktok', medium: 'bio', campaign: 'aug' }, storage);
  assert.equal(readAttribution(storage).source, 'tiktok');
  assert.equal(readAttribution(storage).source, 'tiktok');
});

test('attribution keeps the landing path it arrived on', () => {
  const storage = fakeStorage();
  rememberAttribution({ source: 'tiktok', landing_path: '/pricing' }, storage);
  assert.equal(readAttribution(storage).landing_path, '/pricing');
});

test('a hand-edited storage value reads as nothing instead of crashing the app', () => {
  assert.equal(readAttribution(fakeStorage({ [UTM_STORAGE_KEY]: 'not json' })), null);
  assert.equal(readAttribution(fakeStorage({ [UTM_STORAGE_KEY]: '"a string"' })), null);
});

test('private browsing costs the attribution, not the page', () => {
  assert.equal(rememberAttribution({ source: 'tiktok' }, brokenStorage), null);
  assert.equal(readAttribution(brokenStorage), null);
});

test('a visit is counted once per browser per day', () => {
  const storage = fakeStorage();
  assert.equal(shouldSendVisit(storage, '2026-08-27'), true);
  assert.equal(shouldSendVisit(storage, '2026-08-27'), false);
  assert.equal(shouldSendVisit(storage, '2026-08-28'), true);
});

test('only a date is ever written to storage, never an identifier', () => {
  // The server stores no visitor id, so if one appeared here it would be the only pseudonymous
  // identifier in the system, and this is the test that should have to change to allow it.
  const storage = fakeStorage();
  shouldSendVisit(storage, '2026-08-27');
  assert.deepEqual(Object.keys(storage.data), [VISIT_DAY_KEY]);
  assert.equal(storage.data[VISIT_DAY_KEY], '2026-08-27');
});

test('a visitor with storage disabled is overcounted rather than lost', () => {
  assert.equal(shouldSendVisit(brokenStorage, '2026-08-27'), true);
  assert.equal(shouldSendVisit(brokenStorage, '2026-08-27'), true);
});

test('localDay formats the local calendar date, zero padded', () => {
  assert.equal(localDay(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(localDay(new Date(2026, 11, 31)), '2026-12-31');
});

test('the device split is by viewport, at 768', () => {
  assert.equal(deviceKind(767), 'mobile');
  assert.equal(deviceKind(768), 'desktop');
  assert.equal(deviceKind(0), 'desktop');
  assert.equal(deviceKind(undefined), 'desktop');
});

test('the payload carries the five fields the endpoint reads, and nothing else', () => {
  const payload = visitPayload({ source: 'tiktok', medium: 'bio', campaign: 'aug' }, '/', 400);
  assert.deepEqual(payload, {
    utm_source: 'tiktok',
    utm_medium: 'bio',
    utm_campaign: 'aug',
    landing_path: '/',
    device: 'mobile',
  });
});

test('an untagged arrival still posts a complete payload', () => {
  const payload = visitPayload(null, '/login', 1200);
  assert.deepEqual(payload, {
    utm_source: 'direct',
    utm_medium: 'direct',
    utm_campaign: 'direct',
    landing_path: '/login',
    device: 'desktop',
  });
});
