import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Guards the one property of this screen that costs money to get wrong.
 *
 * `add A → add B → remove B → re-add B` was four renders for two distinct images, because a render
 * fired on every change to the stack and nothing cached a result. It was briefly fixed by batching
 * — ticking changed the selection and one press turned it into a picture — and the owner asked for
 * the immediate feedback back. So the cost is now held down by the cache instead: every request
 * goes through `renderNow`, which returns early when this exact stack has already been rendered at
 * this exact angle, and the re-add above costs nothing.
 *
 * That makes `renderNow` the single choke point, and this file exists to keep it single. A
 * well-meaning edit that calls `requestPreview` or `previewSimulation` directly ("just refresh it
 * here") reopens the whole bill, silently, and nothing else in the suite would notice. It is
 * asserted on the source the way `DashboardPage.test.js` asserts its own literals: there is no DOM
 * renderer here, and what is guarded is a call appearing in a function, which a source read catches
 * exactly. The behaviour underneath is tested properly in `lib/renderPlan.test.js`.
 */
const source = readFileSync(fileURLToPath(new URL('./SimulationView.jsx', import.meta.url)), 'utf8');

/** The source between two named declarations, so a claim can be made about one region of the file. */
const between = (from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start > -1 && end > start, `expected to find ${from} before ${to}`);
  return source.slice(start, end);
};

test('selecting reaches the API only through the cache check', () => {
  // `changeStack`, `chooseProcedure`, `changeIntensity` and `raiseIntensity` are the four ways a
  // selection moves. They may render — that is what the owner asked for — but only via `renderNow`,
  // which consults the cache first. A direct call to the queue or the endpoint would skip it.
  const selecting = between('const changeStack = ', 'const renderCurrent = ');
  assert.ok(selecting.includes('renderNow('), 'selecting must show the result, not sit there');
  assert.ok(!selecting.includes('requestPreview('), 'but must not reach the request queue directly');
  assert.ok(!selecting.includes('previewSimulation('), 'nor call the endpoint itself');
});

test('renderNow refuses to spend a render the cache already holds', () => {
  // The line that makes immediate rendering affordable. Without it every toggle is a quota unit
  // again, and the free tier is given three a month.
  const body = between('const renderNow = ', '\n\n  /**');
  assert.match(body, /if \(renderFor\(renders, stackFingerprint\(next\), view\)\) return;/);
  // The consent gate is a parameter defaulting to the state, so `acceptConsent` can render in the
  // same tick it grants consent without the guard reading the value it is about to replace.
  assert.match(body, /const renderNow = \(next, view, allowed = consented\)/);
  assert.match(body, /if \(!allowed \|\| procedureCount\(next\) === 0\) return;/);
});

test('ticking consent renders whatever was already chosen', () => {
  /**
   * This test used to assert the opposite, and it was right to when there was a Create button for
   * consent to enable. Once that button went, "consent only unlocks it" left the most ordinary
   * path through this screen — choose a procedure, then tick the box the note says you can tick
   * afterwards — showing the untouched photograph with no control anywhere that would change it.
   *
   * `true` rather than the state variable: `setConsented` has not landed when this runs.
   */
  const consent = between('const acceptConsent = ', '\n\n  //');
  assert.match(consent, /renderNow\(stack, activeView, true\)/, 'consenting must catch the stack up');
  assert.ok(!consent.includes('requestPreview('), 'and must still go through the cache check');
});

test('every path to a render goes through renderNow', () => {
  /**
   * Not a limit on how many places may render — the owner wants selecting to render — but on how
   * many may do it without asking the cache first. `renderNow` is the only function permitted to
   * touch `requestPreview`; everything else must go through it.
   */
  const callers = [...source.matchAll(/^ {2}const (\w+) = [\s\S]*?(?=^ {2}const |\n\n {2}\/\*\*|\n\n {2}\/\/)/gm)]
    .filter(([body]) => body.includes('renderNow(') || body.includes('requestPreview('))
    .map(([, name]) => name);
  assert.deepEqual(
    callers.sort(),
    ['acceptConsent', 'changeAngle', 'changeStack', 'chooseReferenceTarget', 'renderCurrent', 'renderNow'].sort(),
    'a new function is asking for a render; make sure it goes through renderNow, then say why here',
  );
});

test('the pending state is on the screen four different ways', () => {
  /**
   * A face on display that belongs to a previous selection. Rarer now that selecting renders — it
   * lasts while a render is in flight, or after one fails — but it is still the state where
   * believing the picture is wrong, so it does not rest on one signal. Colour alone fails a
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

test('an angle with no picture asks for one, whatever the other angles hold', () => {
  /**
   * `changeAngle` used to return early unless the stack had already been rendered at some other
   * angle. That was the "only after you press Create" rule under another name, and once the press
   * was gone it only had one effect left: switching angle while the first render was in flight
   * left that angle permanently empty, because nothing re-runs when the render lands.
   */
  const angle = between('const changeAngle = ', 'const acceptConsent = ');
  assert.ok(!angle.includes('stackRendered('), 'the Create-era guard is back, and it strands an angle');
  assert.match(angle, /renderNow\(stack, view\)/, 'choosing an angle is the request to see it');
});

test('a picture of the current stack does not mark its own rows as missing from it', () => {
  /**
   * `rowStandings(showingOtherStack ? shown.entry : null, stack)` handed an empty map whenever the
   * picture *was* the selection, and an empty map marks every row `added` — so each chosen row
   * carried "ยังไม่อยู่ในภาพ" beside the image it was in. The badge is the screen's way of saying a
   * render is owed; printing it permanently is how a working render reads as a broken one.
   */
  assert.match(source, /const standings = rowStandings\(shown\.entry, stack\);/);
  assert.ok(!source.includes('rowStandings(showingOtherStack ? shown.entry : null'),
    'the inverted default is back');
});

test('no copy names a Create button, because there is not one', () => {
  /**
   * The inverse of the test that used to stand here. Selecting renders again, so the promises that
   * test forbade are now true — and what is forbidden instead is the leftover instruction to press
   * a control this screen no longer draws. Two of the three sentences below were still on screen,
   * one of them in the empty frame a user lands in, telling them to press the thing that would
   * have fixed it.
   */
  assert.ok(!source.includes('กดปุ่มสร้างภาพ'), 'the Thai copy still sends the user to a removed button');
  assert.ok(!source.includes('press create'), 'the English copy still does');
  assert.ok(!source.includes('the create button is off'), 'the consent note still names it');
});
