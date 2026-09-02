import assert from 'node:assert/strict';
import test from 'node:test';

import { authRedirect } from './authRouting.js';

test('authenticated users with a scan never return to landing', () => {
  assert.equal(authRedirect(true, true, 'landing', true), 'home');
  assert.equal(authRedirect(true, true, 'home'), null);
  assert.equal(authRedirect(true, true, 'analysis'), null);
  assert.equal(authRedirect(true, true, 'onboarding'), null);
});

test('signed-out users cannot open private routes', () => {
  assert.equal(authRedirect(true, false, 'simulation'), 'landing');
  assert.equal(authRedirect(true, false, 'onboarding'), null);
  assert.equal(authRedirect(false, false, 'simulation'), null);
});

test('the login route is reachable signed out and does not trap signed-in users', () => {
  assert.equal(authRedirect(true, false, 'login'), null);
  // Only `landing` bounces an authenticated user to home; /login is left alone
  // so the referral redeem it fires after sign-in is not cut short.
  assert.equal(authRedirect(true, true, 'login'), null);
});

test('terms and privacy render signed out and do not move a signed-in user', () => {
  // LoginPage's consent line links to both. If either bounced a signed-out visitor to landing,
  // the notice would name documents nobody could read before agreeing to them.
  assert.equal(authRedirect(true, false, 'terms'), null);
  assert.equal(authRedirect(true, false, 'privacy'), null);
  assert.equal(authRedirect(true, true, 'terms'), null);
  assert.equal(authRedirect(true, true, 'privacy'), null);
});

test('a signed-in user with no scan is left on landing, not bounced into the dashboard', () => {
  // The dashboard sends them back here when they have nothing to show. If this still answered
  // 'home' the two redirects would loop against each other.
  assert.equal(authRedirect(true, true, 'landing', false), null);
  assert.equal(authRedirect(true, true, 'landing', true), 'home');
});

test('landing does not bounce while the scan list is still unknown', () => {
  // Guessing either way here is wrong: 'home' risks the loop above, and staying forever would
  // strand a user who does have a scan. Null means "ask again when the answer arrives".
  assert.equal(authRedirect(true, true, 'landing', null), null);
  assert.equal(authRedirect(true, true, 'landing'), null);
});
