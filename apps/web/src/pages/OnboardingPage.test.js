import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Guards on onboarding: the two framing screens quote research, and the consent screen makes
 * promises the backend has to keep. Both are places where a number is easy to assert and hard for
 * a reader to check.
 */
const read = (name) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
const source = read('./OnboardingPage.tsx');
const styles = read('../styles.css');
const views = read('../../../../backend/doodee/views.py');

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
const css = withoutComments(styles);

test('no screen reports how other visitors answered, because nobody counts', () => {
  /**
   * Step 2 showed "82% chose Person B in this example" over a bar filled to a hardcoded 82%, and
   * "18% chose Person A" on the other branch. The choice is not sent anywhere — there is no
   * counter, no endpoint and no table — so both figures described a survey that does not exist.
   * The 82 came from the cited hiring study, where it is a callback premium and not a share of
   * people, which is what made it look sourced.
   */
  for (const gone of ['q2Caption', 'q2ChartLabel', 'q2TitleA', 'q2TitleB', 'q2LeadA', 'q2LeadB', 'q2BodyA']) {
    assert.ok(!code.includes(`${gone}:`), `${gone} is back — step 2 is claiming a share of choosers again`);
  }
  assert.ok(!code.includes('candidate-majority'), 'the fixed-width candidate bar is back');
  assert.ok(!css.includes('.survey-result-chart__candidate-majority'),
    'the 82%-wide bar rule is back in styles.css');
});

test('the statistics that remain are attributed to a source the reader can open', () => {
  // Step 1's 87/13 is a published YouGov split and is allowed to draw a proportional bar; what it
  // may not do is lose the citation under it.
  assert.match(source, /yougov\.com/, 'the YouGov citation is gone from the 87% claim');
  assert.match(source, /survey-result-chart__yes/, 'the step 1 chart no longer draws the published split');
  assert.match(source, /tandfonline\.com|Galarza/, 'the hiring study citation is gone');
  const percentages = [...new Set([...code.matchAll(/<strong>(\d+)%<\/strong>/g)].map((match) => match[1]))];
  assert.deepEqual(percentages.sort(), ['13', '87'], 'a percentage appeared that is not the cited YouGov split');
});

test('the consent screen asks for exactly what the server records', () => {
  /**
   * Two checkboxes, two `ConsentEvent` rows. If the backend stops recording one of them — or the
   * screen grows a third promise with nothing behind it — this is where that shows up.
   */
  assert.match(source, /consentAnalyseTitle/, 'the analysis consent is gone from the screen');
  assert.match(source, /consentStoreTitle/, 'the storage consent is gone from the screen');
  assert.match(views, /consent\.record\(user, ConsentEvent\.Purpose\.ANALYSIS, consent_version\)/,
    'the server no longer records the analysis consent this screen asks for');
  assert.match(views, /consent\.record\(user, ConsentEvent\.Purpose\.STORAGE, consent_version\)/,
    'the server no longer records the storage consent this screen asks for');
  // Both buttons gate the only way forward, so neither is decoration.
  assert.match(source, /disabled=\{!analysisConsent \|\| !storageConsent\}/,
    'the consent buttons no longer gate the scan');
});

test('the retention promise matches the retention the server writes', () => {
  // "Store them for 30 days" / "เก็บรูปไว้ 30 วัน" is a number, and `_scan_fields` is where it is
  // actually decided.
  assert.match(source, /เก็บรูปไว้ 30 วัน/, 'the Thai storage promise changed');
  assert.match(source, /Store them for 30 days/, 'the English storage promise changed');
  assert.match(views, /30 \* 24/, 'the server no longer keeps adult scans for 30 days');
});

test('the consent version travels with the answers', () => {
  // A consent row is worth having only if it names the wording that was on screen.
  assert.match(source, /export const ANALYSIS_CONSENT_VERSION = "\d{4}\.\d+"/, 'the consent version is gone or malformed');
  assert.match(source, /consentVersion: ANALYSIS_CONSENT_VERSION/, 'the saved answers no longer carry the version');
});
