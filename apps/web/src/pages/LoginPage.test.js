import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (name) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
const source = read('./LoginPage.tsx');
const copy = read('../localization.ts');
const routing = read('../lib/authRouting.js');

/**
 * Source with its comments taken out.
 *
 * Every guard below looks for a literal that must not reach a reader. The comments explaining why
 * quote those very literals — the removal note beside a deleted line names the thing it deleted —
 * so a naive search finds the explanation and reports the fake as back. Comments are not shipped;
 * they are exactly what should be exempt.
 */
const withoutComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const code = withoutComments(source);

test('the referral field does not report success it has not got', () => {
  /**
   * Pressing Apply only checks the code is eight characters long: there is no account to attach
   * it to until Google has answered, so nothing can be redeemed at that moment. The message said
   * "Referral code applied." anyway, and a mistyped code then failed silently into `console.warn`
   * on the way to onboarding — the user believed their friend had been credited.
   */
  assert.ok(!/referralSaved: "Referral code applied\./.test(copy), 'the premature "applied" claim is back');
  assert.match(copy, /referralSaved: "Code saved\./, 'the saved-not-applied wording is gone');
  assert.match(source, /setReferralFailed/, 'a failed redemption is silent again');
  assert.match(source, /referralRejected/, 'the rejection notice is gone from the screen');
  // The failure must not be swallowed on the way past: the navigate has to be skipped for it.
  const afterSignIn = source.slice(source.indexOf('const afterSignIn'), source.indexOf('const completedRedirect'));
  assert.match(afterSignIn, /setReferralFailed\([\s\S]*?return;/, 'the redeem failure no longer stops the redirect');
});

test('the code the field accepts is the code the server is asked for', () => {
  assert.match(source, /canSubmitCode\(referral\)/, 'the client-side length check is gone');
  assert.match(source, /redeemCode\(code\)/, 'the code is no longer redeemed against the account');
  assert.match(source, /normalizeCode\(referral\)/, 'the code is no longer normalised the way the server stores it');
});

test('the consent sentence links at documents that exist', () => {
  /**
   * These were `href="#terms"` and `href="#privacy"` — anchors on no page in the app. The notice
   * named two documents and pointed at nothing.
   */
  assert.match(source, /<Link to="\/terms"/, 'the Terms link is gone or is not a route');
  assert.match(source, /<Link to="\/privacy"/, 'the Privacy link is gone or is not a route');
  assert.ok(!code.includes('href="#terms"'), 'the dead anchor is back');
  // And both have to render for a signed-out visitor, which is the only reason they are public.
  assert.match(routing, /PUBLIC_ROUTES = new Set\(\[[^\]]*'terms'[^\]]*'privacy'/,
    'the legal routes are no longer public, so the login link would bounce to landing');
  for (const key of ['legalLead', 'terms:', 'legalMid', 'privacy:']) {
    assert.ok(copy.includes(key), `the consent sentence lost ${key}`);
  }
});
