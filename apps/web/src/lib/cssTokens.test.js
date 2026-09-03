import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The profile and invite screens shipped with `gap: var(--space-5)` — and there is no `--space-5`
 * in the scale (it runs 1,2,3,4,6,8,12,16,24,32). A `var()` that resolves to nothing is invalid at
 * computed-value time, so the property silently falls back to its initial value: `gap` became
 * `normal`, and three grids rendered with their cards touching. `margin: 0 auto var(--space-5)`
 * lost its centring the same way.
 *
 * Nothing warns about this. It does not fail the build, it does not log, and it is invisible in
 * review because the line looks exactly like the four correct lines above it. This test is the
 * warning.
 */

const read = (name) =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url).href), 'utf8');

const css = read('../styles.css') + read('../brand-kit/tokens.css');

/** Custom properties that are legitimately set from JS at runtime via element.style.setProperty,
 *  so they are never declared in a stylesheet and must not be reported. */
const SET_AT_RUNTIME = new Set([
  '--glass-x', '--glass-y',
  '--age-drag-x',
  '--anatomy-size', '--anatomy-x', '--anatomy-y',
  '--capture-pan-x', '--capture-pan-y', '--capture-zoom',
  '--focus-scale', '--focus-x', '--focus-y',
  '--progress',
  '--reveal-order',
  // One per skin signal row, carrying the backend's confidence for that reading.
  '--skin-confidence',
]);

test('every var(--x) in the stylesheet resolves to a property that is actually defined', () => {
  const defined = new Set(
    [...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]),
  );

  const missing = new Map();
  for (const match of css.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
    const [, name, next] = match;
    // `var(--x, fallback)` is safe even when --x is undefined: the fallback applies.
    if (next === ',') continue;
    if (defined.has(name) || SET_AT_RUNTIME.has(name)) continue;
    missing.set(name, (missing.get(name) ?? 0) + 1);
  }

  assert.deepEqual(
    [...missing.entries()],
    [],
    `these custom properties are used but never defined, so every declaration using them is ` +
      `silently dropped. Either define them in :root, add a var() fallback, or add them to ` +
      `SET_AT_RUNTIME if JS sets them.`,
  );
});

test('the spacing scale has no gaps a reader would guess at', () => {
  // --space-5 was invented by hand because the steps around it exist. Asserting the scale keeps
  // the next person from reaching for a step that was never there.
  const steps = [...css.matchAll(/--space-(\d+)\s*:/g)].map((m) => Number(m[1]));
  assert.deepEqual(
    [...new Set(steps)].sort((a, b) => a - b),
    [1, 2, 3, 4, 6, 8, 12, 16, 24, 32],
    'the spacing scale changed — update this list deliberately, and check nothing used the old steps',
  );
});

test('a line meant to sit under the pillar score does not sit on top of it', () => {
  /**
   * `.pillar-basis` shipped with `margin-top: -18px`, copied from `.pillar-unlock` next to it —
   * which is correct there, because it follows a locked card's tall number shell. This line
   * follows an ordinary `<strong>`, and `.pillar-card` is a plain block, so the negative margin
   * did the only thing it could: printed "จาก 2 ค่าวัด" straight through the 9.9 and its "/10".
   *
   * Its own comment said "under the number rather than beside it", which is what makes this worth
   * a test rather than a re-read: the intent was recorded correctly and the rule contradicted it,
   * and nothing in the suite compares the two.
   */
  const rule = css.match(/\.pillar-card > span\.pillar-basis \{([^}]*)\}/);
  assert.ok(rule, '.pillar-basis is gone from styles.css');
  const margin = rule[1].match(/margin-top:\s*(-?[\d.]+)px/);
  assert.ok(margin, '.pillar-basis no longer sets margin-top; decide where it sits');
  assert.ok(Number(margin[1]) >= 0,
    `.pillar-basis has margin-top: ${margin[1]}px, which lifts it into the score above it`);
});

test('a withheld measurement keeps its name and loses only its numbers', () => {
  /**
   * The owner asked for the numbers to be blurred, not the row. `.ratio-row.is-locked strong` is
   * the metric's own name, and blurring it left a smear where "ความสูงของคาง" should be — the
   * reader could not tell what was being withheld, so the padlock read as something broken rather
   * than as something for sale. The server sends the key and the name of a withheld row for
   * exactly this; see `percentile.redact_reference_scores`.
   */
  // Comments stripped first: a selector capture that runs back to the previous `}` swallows any
  // comment above the rule, and none of these selectors would compare equal to anything.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blurred = [...bare.matchAll(/([^{}]*)\{[^}]*filter:\s*blur\([^)]*\)[^}]*\}/g)]
    .flatMap(([, selectors]) => selectors.split(','))
    .map((selector) => selector.trim());
  assert.ok(blurred.some((selector) => selector === '.ratio-row.is-locked .ratio-score'),
    'the withheld score is no longer blurred');
  assert.ok(!blurred.includes('.ratio-row.is-locked strong'),
    'the name of a withheld measurement is being blurred along with its numbers');
});
