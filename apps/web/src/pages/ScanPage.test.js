import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Guards on the capture screen: that every readout on it is produced by the detector, and that
 * every sentence on it describes something the code does.
 *
 * Source-read, like `DashboardPage.test.js` — the failures being guarded are a literal, a missing
 * call, or a claim in the copy table, all of which a read catches exactly.
 */
const read = (name) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
const source = read('./ScanPage.tsx');
const copy = read('../localization.ts');

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
const scanCopy = (locale) => {
  const start = copy.indexOf('scan: {', copy.indexOf(`  ${locale}: {`));
  return copy.slice(start, copy.indexOf('\n    },', start));
};

test('the screen does not claim to pick the best frame while keeping none of them', () => {
  /**
   * `candidateScore` scored every qualifying frame and `bestCandidatesRef` kept the winning
   * *number* — never the pixels — and then `finishCapture` took whatever the camera happened to
   * be showing. "Selecting the sharpest frame" therefore described nothing.
   *
   * `lib/captureCandidates.js` is what would make the claim true: it holds the winning frame in a
   * canvas and verifies it with the still detector. Wire that in and the wording can come back.
   */
  assert.ok(!code.includes('candidateScore'), 'frame scoring is back in ScanPage without a frame being kept');
  assert.ok(!code.includes('bestCandidatesRef'), 'the discarded best-candidate holder is back');
  for (const locale of ['en', 'th']) {
    const section = withoutComments(scanCopy(locale));
    for (const claim of [/best frame/i, /sharpest/i, /clearest frame/i, /ดีที่สุด/, /ชัดที่สุด/]) {
      assert.ok(!claim.test(section), `${locale} capture copy claims frame selection again (${claim})`);
    }
  }
});

test('nothing on the capture panel is a readout that reads nothing', () => {
  /**
   * `.capture-hold` was three dots with an aria-label describing the capture, of which one was
   * painted dark unconditionally by `span:first-child`, one was wired to `quality.valid`, and one
   * was grey forever. The two real readouts stay: the hold meter and the per-angle steps.
   */
  assert.ok(!code.includes('className="capture-hold"'), 'the decorative hold dots are back');
  assert.match(source, /scaleX\(\$\{holdProgress\}\)/, 'the hold meter is no longer driven by the frame count');
  assert.match(source, /Math\.round\(holdProgress \* 100\)/, 'the hold percentage is not computed from progress');
  assert.match(source, /candidateCountsRef\.current\[currentStep\] \/ hold\.candidates/,
    'hold progress is no longer the share of frames actually collected');
});

test('the live figures come from the camera, not from the copy table', () => {
  // `fpsLive` is only shown when the meter has produced a number; `fpsTarget` names a constraint
  // this file really asks for.
  assert.match(source, /cameraFps \? copy\.scan\.fpsLive/, 'the FPS readout stopped being conditional on a measurement');
  assert.match(source, /frameRate: \{ ideal: 60 \}/, 'the 60 FPS target is claimed but no longer requested');
  assert.match(source, /setCameraFps\(Math\.round\(sample\.frames \* 1000 \/ elapsed\)|const fps = Math\.round\(sample\.frames \* 1000 \/ elapsed\)/,
    'the FPS number is no longer measured from real frames');
});

test('an upload failure is a sentence, never the server’s code', () => {
  // `/scans/uploads/` answers a full queue with `{"detail": "heavy_queue_busy"}`, which used to
  // be the whole body of the error panel.
  assert.match(source, /scanErrorText\(error, locale !== "en"\)/, 'upload failures are no longer described');
  assert.ok(!code.includes('errorMessage(error)'), 'a raw API message is back under "Upload failed"');
});

test('the guidance strip states nothing the capture gate would refuse', () => {
  /**
   * "1.5–2 metres away" was printed as instruction while `measurePose` rejects a face under 0.22
   * of the frame height as `too_far` — following the printed advice produced "Move closer".
   */
  for (const locale of ['en', 'th']) {
    const section = withoutComments(scanCopy(locale));
    const technical = section.slice(section.indexOf('technical:'), section.indexOf(']', section.indexOf('technical:')));
    assert.ok(!/\d\s*(m\b|metre|meter|เมตร)/i.test(technical), `${locale} still prints a camera distance the gate refuses`);
  }
});

test('the capture screen does not promise that the photographs stay on the device', () => {
  // The badge sits over the viewport, where tracking really is local — but the next thing this
  // screen does is upload three photographs, and "On-device processing" read as a promise that
  // nothing leaves.
  for (const locale of ['en', 'th']) {
    const section = withoutComments(scanCopy(locale));
    const line = section.slice(section.indexOf('onDevice:'), section.indexOf('\n', section.indexOf('onDevice:')));
    assert.ok(/tracking|ตรวจจับใบหน้า/.test(line), `${locale} onDevice badge no longer names what is local`);
  }
  // And nothing is described as verified by a device that verifies nothing.
  assert.ok(!/verified angles/.test(withoutComments(scanCopy('en'))), 'the "three verified angles" claim is back');
});
