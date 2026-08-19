import assert from 'node:assert/strict';
import test from 'node:test';

import { authErrorKey, formProblem, isEmail, passwordProblem } from './authForm.js';

test('an address is accepted when it could plausibly receive mail', () => {
  assert.equal(isEmail('you@example.com'), true);
  assert.equal(isEmail('  spaced@example.co.th  '), true);
  assert.equal(isEmail('name+tag@sub.example.com'), true);
  assert.equal(isEmail('no-at-sign'), false);
  assert.equal(isEmail('no@dot'), false);
  assert.equal(isEmail('two spaces@example.com'), false);
  assert.equal(isEmail(''), false);
  assert.equal(isEmail(null), false);
});

test('a short password is caught before it costs a round trip', () => {
  assert.equal(passwordProblem('sevench'), 'short');
  assert.equal(passwordProblem('eightchr'), null);
  assert.equal(passwordProblem(''), 'short');
  assert.equal(passwordProblem(null), 'short');
});

test('signing up demands a long password but signing in does not', () => {
  // An existing account may predate the current minimum; refusing to even try would lock
  // those people out of their own account.
  assert.equal(formProblem({ email: 'a@b.co', password: 'old', mode: 'signin' }), null);
  assert.equal(formProblem({ email: 'a@b.co', password: 'old', mode: 'signup' }), 'short');
});

test('a bad address is reported before the password is judged', () => {
  assert.equal(formProblem({ email: 'nope', password: '', mode: 'signup' }), 'email');
});

test('an empty password still blocks sign-in', () => {
  assert.equal(formProblem({ email: 'a@b.co', password: '', mode: 'signin' }), 'short');
});

test('firebase codes become something a person can act on', () => {
  assert.equal(authErrorKey({ code: 'auth/email-already-in-use' }), 'emailInUse');
  assert.equal(authErrorKey({ code: 'auth/weak-password' }), 'weakPassword');
  assert.equal(authErrorKey({ code: 'auth/too-many-requests' }), 'tooMany');
  assert.equal(authErrorKey({ code: 'auth/operation-not-allowed' }), 'methodDisabled');
});

test('wrong password and unknown account give the same answer', () => {
  // Firebase merges these on purpose so the form cannot be used to discover which addresses
  // are registered. Splitting them in our wording would hand that back.
  assert.equal(authErrorKey({ code: 'auth/wrong-password' }), 'badCredentials');
  assert.equal(authErrorKey({ code: 'auth/user-not-found' }), 'badCredentials');
  assert.equal(authErrorKey({ code: 'auth/invalid-credential' }), 'badCredentials');
});

test('an unrecognised failure never shows its raw code to the user', () => {
  assert.equal(authErrorKey({ code: 'auth/internal-error' }), 'generic');
  assert.equal(authErrorKey(new Error('boom')), 'generic');
  assert.equal(authErrorKey(null), 'generic');
  assert.equal(authErrorKey(undefined), 'generic');
});
