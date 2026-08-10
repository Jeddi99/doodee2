import assert from 'node:assert/strict';
import test from 'node:test';

import { authRedirect } from './authRouting.js';

test('authenticated users never return to landing', () => {
  assert.equal(authRedirect(true, true, 'landing'), 'home');
  assert.equal(authRedirect(true, true, 'home'), null);
  assert.equal(authRedirect(true, true, 'analysis'), null);
  assert.equal(authRedirect(true, true, 'onboarding'), null);
});

test('signed-out users cannot open private routes', () => {
  assert.equal(authRedirect(true, false, 'simulation'), 'landing');
  assert.equal(authRedirect(true, false, 'onboarding'), null);
  assert.equal(authRedirect(false, false, 'simulation'), null);
});
