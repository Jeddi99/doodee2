import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { describeScanFailure } from './scanFailure.js';

const read = (name) =>
  readFileSync(fileURLToPath(new URL(`../../../../backend/doodee/${name}`, import.meta.url)), 'utf8');

test('a pose failure names the photograph, the size of the miss, and what to do', () => {
  // The code that produced the screen this module was written for.
  const tilted = describeScanFailure('pose_left_profile:roll:+2', true);
  assert.equal(tilted.view, 'left_profile');
  assert.match(tilted.text, /ซ้าย 90°/);
  assert.match(tilted.text, /2°/);
  assert.match(tilted.text, /ตั้งศีรษะให้ตรง/);
  assert.doesNotMatch(tilted.text, /pose_|roll/);
});

test('the correction points the way the head has to move, not the way it was', () => {
  // `_pose_error` sends the correction to apply, so a negative yaw delta asks for more left, and
  // positive pitch asks for chin down — the sign convention `capture-quality.ts` also follows.
  // Reversing either sends the user further out of the window they just missed.
  assert.match(describeScanFailure('pose_front:yaw:-9', false).text, /further to your left/);
  assert.match(describeScanFailure('pose_front:yaw:+9', false).text, /further to your right/);
  assert.match(describeScanFailure('pose_front:pitch:-7', false).text, /raise your chin/);
  assert.match(describeScanFailure('pose_front:pitch:+7', false).text, /lower your chin/);
});

test('every reason the analyser can raise reaches the screen as a sentence', () => {
  /**
   * Read out of `analysis_engine.py` rather than copied. An unmapped code falls through to the
   * generic "try again in even light" — advice that is wrong for most of them and says nothing
   * about which photograph to replace.
   *
   * Two shapes, because the analyser raises in two places. `_decode` and `_landmarks` are
   * wrapped by `analyze_images`, which re-raises them as `code:view`; everything after that runs
   * past the point where it still knows which photograph it holds, so those arrive bare. A code
   * has to be understood in whichever shape it can actually appear, and mapping both is cheap.
   */
  const engine = read('analysis_engine.py');
  const codes = [...new Set([...engine.matchAll(/raise ValueError\("([a-z_]+)"\)/g)].map((m) => m[1]))];
  assert.ok(codes.length >= 5, `only found ${codes.length} codes — did the parse break?`);
  for (const code of codes) {
    const attached = describeScanFailure(`${code}:front`, false);
    const bare = describeScanFailure(code, false);
    assert.ok(
      attached.code === code || bare.code === code,
      `${code} is not mapped in scanFailure.js, in either shape`,
    );
    for (const result of [attached, bare]) {
      if (result.code === null) continue;   // unmapped in this shape, which the assert above allows
      assert.doesNotMatch(result.text, /_/, `${code} leaks a raw code onto the screen`);
    }
  }
});

test('every view the server can ask for has a name in both languages', () => {
  // A view with no entry falls through to the generic sentence, which is the failure this
  // module exists to remove. `full` mode captures all seven.
  const views = [...read('pose_targets.json').matchAll(/"([a-z_]+)": \{/g)].map((m) => m[1]);
  assert.equal(views.length, 7);
  for (const view of views) {
    for (const isTh of [true, false]) {
      const result = describeScanFailure(`pose_${view}:yaw:+3`, isTh);
      assert.equal(result.view, view, `${view} has no label`);
    }
  }
});

test('a failure with no photograph to blame does not blame one', () => {
  for (const code of ['missing_views', 'analysis_failed']) {
    const result = describeScanFailure(code, true);
    assert.equal(result.view, null);
    assert.equal(result.code, code);
    assert.doesNotMatch(result.text, /_/);
  }
});

test('an unknown code still reads as a sentence, and still carries the code', () => {
  // The alternative is a blank paragraph or a raw token, and the screen is the only place the
  // reason survives: the client deletes the failed scan as soon as it shows this.
  for (const isTh of [true, false]) {
    const result = describeScanFailure('some_code_from_the_future:front', isTh);
    assert.equal(result.code, null);
    assert.equal(result.view, null);
    assert.match(result.text, /some_code_from_the_future:front/);
  }
  assert.ok(describeScanFailure('', true).text);
  assert.ok(describeScanFailure(null, false).text);
});
