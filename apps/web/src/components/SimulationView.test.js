import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Guards the one property of this screen that costs money to get wrong.
 *
 * Selecting a procedure used to render it. `add A → add B → remove B → re-add B` was four paid
 * renders for two distinct images, because the render fired on every change to the stack and
 * nothing cached a result. The flow now batches: ticking, unticking and re-levelling only change
 * what is selected, and one explicit press turns the selection into a picture.
 *
 * That property lives in which function calls which — the sort of thing a well-meaning edit
 * restores in a line ("just refresh it here") without anybody noticing until the bill arrives. So
 * it is asserted on the source, the way `DashboardPage.test.js` asserts its own literals: there is
 * no DOM renderer in this suite, and what is being guarded is a call appearing in a function, which
 * a source read catches exactly. The behaviour underneath is tested properly in
 * `lib/renderPlan.test.js` and `lib/doseNotes.test.js`.
 */
const source = readFileSync(fileURLToPath(new URL('./SimulationView.jsx', import.meta.url)), 'utf8');

/** The source between two named declarations, so a claim can be made about one region of the file. */
const between = (from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start > -1 && end > start, `expected to find ${from} before ${to}`);
  return source.slice(start, end);
};

test('changing what is selected fires no request', () => {
  // `changeStack`, `chooseProcedure` and `changeIntensity` are the three ways a selection moves.
  // Between them and the Create button there must be no path to the API.
  const selecting = between('const changeStack = ', 'const createImage = ');
  assert.ok(!selecting.includes('renderNow('), 'selecting a procedure must not start a render');
  assert.ok(!selecting.includes('requestPreview('), 'nor reach the request queue directly');
  assert.ok(!selecting.includes('previewSimulation('), 'nor call the endpoint itself');
});

test('ticking consent does not render anything on its own either', () => {
  const consent = between('const acceptConsent = ', '\n\n  //');
  assert.ok(!consent.includes('requestPreview('), 'giving consent enables the button, it does not press it');
  assert.ok(!consent.includes('renderNow('));
});

test('only three presses spend a render, and each is a press that asked for a picture', () => {
  /**
   * Create, "try the strongest setting", and the camera-angle tabs. The last two are not
   * exceptions to the batching rule but the same rule read carefully: both are a single press
   * whose whole meaning is "show me this", with no intermediate state to accumulate.
   */
  const callers = [...source.matchAll(/^ {2}const (\w+) = [\s\S]*?(?=^ {2}const |\n\n {2}\/\*\*|\n\n {2}\/\/)/gm)]
    .filter(([body]) => body.includes('renderNow(') || body.includes('requestPreview('))
    .map(([, name]) => name);
  assert.deepEqual(
    callers.sort(),
    ['changeAngle', 'chooseReferenceTarget', 'createImage', 'raiseIntensity', 'renderNow'].sort(),
    'a new function is asking for a render; if that is deliberate, say why here',
  );
});

test('the pending state is on the screen four different ways', () => {
  /**
   * The state that batching creates: a face on display that belongs to a previous selection. It is
   * the whole safety of the design, so it does not rest on one signal. Colour alone fails a
   * colourblind reader, a filter alone fails anyone who never saw the unfiltered version, and a
   * sentence alone fails whoever is looking at the face rather than reading.
   */
  assert.match(source, /showingOtherStack \? ' is-stale' : ''/, 'the image is not marked');
  assert.match(source, /simulation-stale-badge/, 'the badge over the image is gone');
  assert.match(source, /className="simulation-pending" role="status"/, 'the sentence under it is gone, or no longer announced');
  assert.match(source, /simulation-row-pending/, 'the chosen rows no longer say which are in the picture');
  // And it names what is missing rather than counting it.
  assert.match(source, /listNames\(changes\.added\)/);
});

test('saving is refused while the picture belongs to another selection', () => {
  // A save renders the *current* stack on the server and swaps the picture for it, so pressing it
  // over a stale preview spends a save and silently replaces the image being looked at.
  const save = between('className="simulation-save"', 'onClick={() => saveMutation.mutate()}');
  assert.match(save, /showingOtherStack/, 'save must be off while the image is not the selection');
});

test('a render is filed under the stack it was asked for, not the stack that is selected when it lands', () => {
  const settle = between('const runPreview = ', 'const requestPreview = ');
  assert.match(settle, /fingerprint: pick\.fingerprint/);
  assert.ok(!/fingerprint: fingerprint|fingerprint,\n/.test(settle),
    'filing a late answer under the current selection is how a picture gets the wrong label');
});

test('nothing is keyed by camera angle alone any more', () => {
  /**
   * The bug this replaced: `previews` was a map of angle → image, so re-rendering the front left
   * the previous stack's left profile in place, and the angle tab — finding a picture already
   * there — never refetched it. Two tabs showed two selections and neither said so.
   */
  assert.ok(!/\bpreviews\b/.test(source), 'the angle-keyed preview map is back');
  assert.match(source, /shownRender\(renders, fingerprint, activeView\)/);
});

test('the six-procedure ceiling is gone from the screen as well as from the model', () => {
  assert.ok(!source.includes('MAX_PROCEDURES'), 'the inherited cap is back');
  assert.match(source, /เลือกทั้งหมดในหมวดนี้/, 'select-all is missing');
  assert.match(source, /Select all in this category/);
});

test('the dose notes are rendered, and their absence is handled where it is read', () => {
  // A stack that silently drops half of what was asked for is the dishonesty this screen exists
  // not to commit — and `dose_notes` may be absent, because the payload predates the field.
  assert.match(source, /<DoseNotes notes=\{notes\}/);
  assert.match(source, /describeDoseNotes\(preview, isTh\)/);
  const component = source.slice(source.indexOf('function DoseNotes('));
  assert.match(component, /if \(notes\.length === 0\) return null;/, 'an empty box is worse than no box');
});

test('the screen no longer promises that picking a procedure renders it', () => {
  // Three sentences said so out loud, and they were true until this change.
  assert.ok(!source.includes('No generate button needed.'), 'the placeholder still promises no button');
  assert.ok(!source.includes('renders it immediately'), 'the consent note still promises an instant render');
  assert.ok(!source.includes('เห็นผลทันที'), 'the Thai placeholder still promises an instant render');
});
