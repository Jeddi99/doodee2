import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Guards on the assessment screen, which was unreachable until today and so has had the least
 * real use of anything in the product.
 *
 * Read off the source rather than rendered, the same arrangement `DashboardPage.test.js` uses and
 * for the same reason: there is no DOM renderer in this suite, and each failure guarded here is a
 * literal or a missing call that a source read catches exactly.
 */
const read = (name) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
const source = read('./AssessmentView.jsx');
const distribution = read('../../../../backend/doodee/score_distribution.py');

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

test('no branch reads a distribution field the server does not send', () => {
  /**
   * `synthetic_sample_size` was the count of seeded, invented scores mixed into the curve, and
   * this screen warned about them. The backend deleted the field and the entire seeding
   * mechanism, which left the warning unreachable — a reassurance the screen was structurally
   * incapable of giving, sitting under a chart about real people.
   */
  assert.ok(!code.includes('synthetic_sample_size'), 'the synthetic-sample warning is back in AssessmentView');
  assert.ok(!distribution.includes('"synthetic_sample_size"'),
    'score_distribution.py sends synthetic_sample_size again — the UI branch has to come back with it');
});

test('the chart says how many people are in it', () => {
  // A curve with no sample size beside it looks the same drawn from seven scores as from seven
  // hundred. Both counts come off the payload: `drawn_sample_size` for the shape, `sample_size`
  // for the rank.
  assert.match(source, /drawn_sample_size: drawn/, 'the chart no longer reads how many scores it drew');
  assert.match(source, /\$\{drawn\}/, 'the caption stopped printing the drawn count');
  assert.match(source, /data\.distribution\.sample_size/, 'the reliability warning lost its sample size');
  assert.match(source, /!data\.distribution\.reliable/, 'the below-threshold warning is gone');
});

test('the reference cohort is named from the scan, never from a literal', () => {
  /**
   * "Against the published means of 240 Thai adults aged 18–35" was written into the heading. The
   * payload carries `reference.sample_size`, `.population` and `.age_range`, and a scan can be
   * scored against a different reference — at which point the hardcoded sentence describes
   * somebody else's study over this person's numbers.
   */
  assert.ok(!/\b240\b/.test(code), 'a hardcoded cohort size is back in AssessmentView');
  assert.match(source, /cohortText\(data\.reference, isTh\)/, 'the cohort line is not read from the payload');
  assert.match(source, /reference \|\| \{\}/, 'the cohort helper no longer tolerates a scan without one');
  // And a scan with no recorded cohort has to say so rather than borrow the current one.
  assert.match(source, /ไม่ได้บันทึกไว้ว่าใช้กลุ่มอ้างอิงใด/, 'the unknown-cohort sentence is gone');
});

test('a failure names what happened instead of printing the server’s code', () => {
  // `/scans/<id>/assessment/` answers a deleted or foreign scan with the bare code
  // `scan_not_found`, which used to be the entire body of the error state.
  assert.ok(!source.includes('{assessment.error.message}'), 'a raw API message is back on screen');
  assert.match(source, /scanErrorText\(assessment\.error, isTh\)/, 'the error is no longer described');
});

test('locked findings and their count come from the payload', () => {
  assert.match(source, /data\.locked_findings\.length/, 'the locked count is not read from the response');
  assert.ok(!/locked_findings\s*=\s*\[/.test(source), 'locked findings are being invented client-side');
});
