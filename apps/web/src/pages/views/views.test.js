import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Guards for the dashboard panels, one per class of fake that was found in them.
 *
 * Read off the source rather than rendered, for the reason `DashboardPage.test.js` gives: there is
 * no DOM renderer in this suite, and what is being guarded against is a literal or a missing read
 * appearing in a file, which a source read catches exactly. Where a figure has to agree with the
 * server, the server file is parsed too — the same trick `faceMetrics.test.js` uses on
 * `analysis_engine.py`, and the only way a cross-repository constant can be pinned at all.
 *
 * Every assertion below describes something that was actually on screen. None of these are
 * hypothetical.
 */

const read = (name) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
const backend = (name) =>
  readFileSync(fileURLToPath(new URL(`../../../../../backend/doodee/${name}`, import.meta.url)), 'utf8');

const PANELS = [
  'ChatPanel.tsx', 'DevelopmentPlanPanel.tsx', 'HistoryPanel.tsx', 'PricingPanel.tsx',
  'ProfilePanel.tsx', 'ReferralPanel.tsx', 'ScoreCardPanel.tsx', 'SettingsPanel.tsx',
  'SkinPanel.tsx', 'SkinTrend.tsx', 'WithdrawCard.tsx',
];

/** A panel's source with its comments stripped, i.e. only what can reach a screen. */
function copyOf(name) {
  return read(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// ---------------------------------------------------------------- charts

test('no panel plots a shape that did not come from the payload', () => {
  /**
   * ScoreCardPanel drew a bell out of two fixed cubics and placed the reader's marker on an
   * assumed normal of sigma 61.4 *screen pixels*. It was the same `d="M42 174C158 174 195 167…"`
   * literal `DashboardPage.test.js` already bans by name, one directory over, and it could not be
   * repaired by pointing at real data: `percentile.score_card` returns no distribution at all.
   *
   * Any future curve on any of these panels has to come through `curvePath`, which reads
   * `distribution.curve` off the server.
   */
  for (const panel of PANELS) {
    const source = copyOf(panel);
    assert.ok(!source.includes('C158 174 195 167'), `the decorative bell path is back in ${panel}`);
    const paths = [...source.matchAll(/\bd="M[\d.\- ]/g)];
    assert.deepEqual(paths.map((match) => match[0]), [],
      `a hardcoded SVG path is back in ${panel} — a shape nobody measured`);
  }
});

test('SkinTrend still draws its runs from the server, and still breaks them as gaps', () => {
  // The one chart in this directory that survives, and the reason it does: every coordinate comes
  // from `lib/skinTrend.js`, which reads the runs `skin_engine.comparison_break` decided. A dashed
  // line across a break would re-join two scans the backend refused to compare.
  const source = read('SkinTrend.tsx');
  assert.match(source, /runPath\(run\.points/, 'the trend line is no longer built from the payload');
  assert.ok(!/stroke-?[Dd]asharray/.test(source), 'a dashed line now bridges a comparison break');
});

// ---------------------------------------------------------------- money

test('no panel prints a money figure of its own', () => {
  /**
   * Every amount on these screens is satang from the server, formatted by `baht()`:
   * `reward_satang` and `withdrawal_min_satang` from `SiteSetting`, `price_satang` from `Plan`.
   * A ฿ followed by a digit in rendered copy is a price nobody can change without a deploy.
   */
  for (const panel of PANELS) {
    const matches = [...copyOf(panel).matchAll(/฿\s?\d/g)].map((match) => match[0]);
    assert.deepEqual(matches, [], `a hardcoded baht amount is back in ${panel}`);
  }
});

test('the withdrawal card treats a missing minimum as unknown, never as zero', () => {
  /**
   * `Number(state.minimum_satang || 0)` printed "ถอนขั้นต่ำ ฿0" as a fact when the field was
   * absent, and `canWithdraw`'s `balance < minimum` cannot fire against zero — so the button also
   * went live on any balance, for a request the server answers `below_minimum`. The real floor is
   * ฿300.
   */
  const source = read('WithdrawCard.tsx');
  // Comments stripped: the note above the fix has to stay free to quote the expression it replaced.
  assert.ok(!copyOf('WithdrawCard.tsx').includes('state.minimum_satang || 0'),
    'a missing withdrawal minimum reads as ฿0 again');
  assert.match(source, /typeof state\.minimum_satang === "number"/,
    'the minimum is no longer checked for presence before it is stated');
  assert.match(source, /minimum_unknown/, 'there is no longer a reason shown for an unknown minimum');
});

test('the invite screen states the monthly reward cap the server actually enforces', () => {
  /**
   * `billing.vest_referral_reward` sends everything past `SiteSetting.max_qualified_per_month`
   * to HELD for a person to review rather than paying it. The card promised the reward
   * "ต่อเพื่อนหนึ่งคน" with no ceiling, so the eleventh friend in a month subscribed and no credit
   * arrived. The cap must be read, never written here — it is an admin field.
   */
  const source = read('ReferralPanel.tsx');
  assert.match(source, /stats\.max_qualified_per_month/, 'the cap is no longer read from the payload');
  assert.match(copyOf('ReferralPanel.tsx'), /rewardCap/, 'the cap is no longer stated on the card');
  assert.match(backend('views.py'), /"max_qualified_per_month": config\.max_qualified_per_month/,
    'the referral payload no longer sends the cap the card reads');
});

test('the invite screen shows nothing rather than zeroes when it has no data', () => {
  // `referral.data ?? {}` drew an empty code, "฿0 per friend" as the offer, and "฿0" as the
  // balance out of a failed request. The balance in particular is somebody's money.
  const source = read('ReferralPanel.tsx');
  assert.ok(!source.includes('referral.data ?? {}'), 'the invite screen renders out of {} again');
  assert.match(source, /if \(referral\.error \|\| !referral\.data\)/,
    'there is no longer a branch for the invite query having failed');
});

// ---------------------------------------------------------------- quotas and plans

test('the pricing page states allowances only because the server now sends them', () => {
  /**
   * `copy.note` has always told the reader "โควตาของแต่ละแผนแสดงอยู่บนการ์ด" / "Each plan's
   * allowances are on its card", and no allowance had ever been on a card — `PlanSerializer` did
   * not send them. Both halves have to stay true together, so both are asserted here.
   */
  const source = read('PricingPanel.tsx');
  const serializer = backend('serializers.py');
  for (const field of [
    'simulation_previews_per_month', 'simulation_saves_per_month', 'chat_turns_per_month',
  ]) {
    assert.ok(source.includes(field), `the pricing card stopped reading ${field}`);
    assert.ok(serializer.includes(field), `PlanSerializer stopped sending ${field}`);
  }
  assert.match(source, /quotaLines\(plan, lang\)/, 'the allowance rows are no longer rendered');
});

test('the pricing page offers no allowance the plan cannot reach', () => {
  // `SimulationViewSet.create` checks `_simulation_locked` — quota(PREVIEWS) === 0 — before it
  // looks at the save allowance, so the free row's `simulation_saves_per_month: 3` can never be
  // spent. Printing it would be this fix inventing its own lie on the way past.
  assert.match(read('PricingPanel.tsx'), /simulationLocked/,
    'the saves row is offered again on a tier with no previews');
  assert.match(backend('views.py'), /return entitlement\.quota\(user, PREVIEWS, plan\) == 0/,
    '_simulation_locked changed shape; re-read what gates a save');
});

test('a plan that is not sold self-serve is not presented as purchasable', () => {
  // A clinic partnership is an agreement. Selling the `clinic_partner` group off a form would
  // hand partner access to anyone who filled it in.
  const source = read('PricingPanel.tsx');
  assert.match(source, /!plan\.self_serve \?/, 'the self-serve gate on the order button is gone');
  assert.match(source, /pricing-contact/, 'the contact route for a non-self-serve plan is gone');
});

test('no panel states a per-plan allowance it does not receive', () => {
  /**
   * Migration 0021 moved every allowance onto `Plan` so a quota change would be an admin edit
   * rather than a deploy. A number copied into client copy defeats exactly that, and goes stale
   * with nothing on screen to notice:
   *
   * - Settings said a code gives "unlimited previews for seven days" and that saving stays
   *   "capped at three per month on every plan". Plus is 10, Pro and clinic are unlimited, the
   *   grant itself (`PROMO_GRANTS_PLAN`, `pro`) is unlimited, and the seven is `PromoCode.days`'
   *   model default rather than a property of codes.
   * - Chat said "the free plan includes 5 turns a month". `/session/` sends `chat_remaining`,
   *   never the ceiling.
   */
  const settings = copyOf('SettingsPanel.tsx');
  assert.ok(!/สามครั้งต่อเดือน|three per month/.test(settings),
    'the false "three saves a month on every plan" claim is back in Settings');
  assert.ok(!/เจ็ดวัน|seven days/.test(settings), 'the fixed seven-day promo length is back in Settings');

  const chat = copyOf('ChatPanel.tsx');
  assert.ok(!/5 turns|5 ครั้งต่อเดือน/.test(chat), 'a hardcoded free-plan chat ceiling is back');
});

// ---------------------------------------------------------------- what leaves the machine

test('the chat privacy line counts the measurements it is actually sending', () => {
  /**
   * This is the one sentence in the product that tells a user what leaves the machine when they
   * press send, and it said "12" flat. Twelve is the size of the catalogue, not of a scan:
   * `chat.scan_context` walks `reference_scores.metrics`, and sends `NO_SCAN_CONTEXT` — no
   * measurements at all — when there is no completed scan.
   */
  const source = read('ChatPanel.tsx');
  assert.ok(!/12 measurements|ค่าที่วัดได้ 12 ค่า/.test(copyOf('ChatPanel.tsx')),
    'the chat privacy line claims twelve measurements again');
  assert.match(source, /copy\.privacy\(session\.data\?\.chat_provider \?\? "", metricCount\)/,
    'the privacy line is no longer told how many measurements are being sent');
  assert.match(backend('chat.py'), /for metric in scores\.get\("metrics"\) or \[\]/,
    'scan_context no longer walks the scan metrics; re-read what the privacy line should count');
});

test('a failed chat turn blames the right party, and blames nobody falsely', () => {
  /**
   * The Gemini project behind this deployment answers
   * `PERMISSION_DENIED: "Your project has been denied access. Please contact support."` on every
   * turn. `errorReason` quoted that verbatim under the reader's own failed message, where "your
   * project" reads as the reader's account being blocked — a false statement about them, since
   * the project being refused is ours. And `errorMessage` reads `detail`, which for this failure
   * is the machine code `chat_upstream_error`, so the largest text on the bubble was a code.
   *
   * The turn itself is refunded server-side; the copy now says so rather than leaving the reader
   * to wonder whether they were charged for a failure.
   */
  const source = read('ChatPanel.tsx');
  assert.match(source, /copy\.failures\[errorMessage\(send\.error \|\| ask\.error\)\]/,
    'the raw failure code reaches the screen again as the headline');
  assert.match(source, /copy\.providerSaid/, 'the upstream reason is quoted again without attribution');
  assert.match(backend('views.py'), /_refund_chat_turn\(request\.user\)/,
    'an upstream chat failure no longer refunds the turn the copy says is not charged');
});

test('the skin panel does not offer to send a photograph this deployment cannot send', () => {
  /**
   * `session.skin_vision_enabled` is `skin_vision.configured()` — SKIN_VISION_ENABLED plus a key,
   * and the switch is off. The card still ran the whole pitch ("this sends your front photo to
   * Google (Gemini)… Turn on, and send the photo") above a button that was merely `disabled`.
   * SettingsPanel hides its copy of this control for exactly this reason and says so in a
   * comment; the two screens carrying one consent must not disagree about whether it exists.
   */
  const source = read('SkinPanel.tsx');
  assert.match(source, /const visionOffered =/, 'the vision card is no longer gated on availability');
  assert.match(source, /\{visionOffered && \(/, 'the vision card renders again where it cannot run');
  assert.match(read('SettingsPanel.tsx'), /session\.data\?\.skin_vision_enabled \? \(/,
    'Settings stopped hiding its skin-vision card, so the two screens can now disagree');
});

test('the skin panel never promises a description the queue already declined', () => {
  /**
   * `queue_skin_vision` returns false whenever the photograph has been purged, the reading was
   * unreadable, the scan is a demo, or the feature is off — and the panel said "One will be
   * generated on your next scan" in every one of those cases. The server's own answer is on the
   * payload as `vision_pending`.
   */
  const source = read('SkinPanel.tsx');
  assert.match(source, /data\?\.vision_pending/, 'the queue answer is no longer read');
  assert.ok(!copyOf('SkinPanel.tsx').includes('generated on your next scan'),
    'the blanket "one will be generated" promise is back');
  assert.match(backend('tasks.py'), /def queue_skin_vision\(scan\)/,
    'queue_skin_vision moved; re-read what vision_pending means');
});

// ---------------------------------------------------------------- absence

test('no panel draws a heading over a list it has nothing to fill', () => {
  /**
   * Two of these shipped:
   *
   * `GET /scans/<id>/skin/` answers 409 for a completed scan with no `skin_analysis` — three of
   * the nine completed scans here — and the panel drew "สัญญาณที่วัดได้" over an empty grid
   * followed by the not-compared-to-anyone disclaimer: six readings that appear to have failed to
   * load, rather than a scan never measured for skin.
   *
   * The development plan reads `CATEGORY_ACTIONS.get(category, [])`, so an unmapped category
   * arrives with `actions: []` and put "ลองทำ" over nothing.
   */
  assert.match(read('SkinPanel.tsx'), /\{!data \? \(/,
    'the skin panel renders its signals section again with no analysis behind it');
  assert.match(read('DevelopmentPlanPanel.tsx'), /item\.actions\?\.length > 0 && \(/,
    'the "try this" heading can be drawn over an empty action list again');
});

test('the development plan renders cleanly with procedures gated off', () => {
  /**
   * `MEASUREMENT_PROCEDURES_REVIEWED_BY_CLINICIAN` is False, so `procedures_for_measurement`
   * answers with nothing and every `related_procedures` is empty. The section has to disappear
   * rather than leave a bare heading — and the gate has to stay on the server, because a
   * client-side hide still ships the mapping in the JSON.
   */
  assert.match(read('DevelopmentPlanPanel.tsx'), /item\.related_procedures\?\.length > 0 && \(/,
    'the related-procedures heading can be drawn over an empty list');
  assert.match(backend('procedure_catalog.py'),
    /if not MEASUREMENT_PROCEDURES_REVIEWED_BY_CLINICIAN:\n {8}return \(\)/,
    'the clinician gate no longer empties the procedure mapping on the server');
});

test('the history list states a measurement count only when there is one', () => {
  // `|| 0` turned every unscored scan — including the four awaiting deletion — into the sentence
  // "0 ค่าที่วัดได้": a measured result of nothing rather than nothing measured. The raw
  // `scan.status` was also going to the screen, so a row read "deletion_pending" in both languages.
  const source = read('HistoryPanel.tsx');
  assert.ok(!source.includes('metrics?.length || 0'), 'an unscored scan claims 0 measurements again');
  assert.match(source, /metricCount > 0 \?/, 'the measurement count is stated unconditionally again');
  assert.match(source, /c\.statuses\[scan\.status\]/, 'a raw status code reaches the screen again');
});

// ---------------------------------------------------------------- retention

test('every retention window on screen matches the one the server sets', () => {
  /**
   * Three panels state the 30-day window and one states the 24-hour one. `_scan_fields` is where
   * both are decided, and this parses it rather than trusting the copy — a privacy statement that
   * has drifted from the code is the worst kind of stale number on this product.
   */
  const source = backend('views.py');
  const match = source.match(
    /"expires_at": timezone\.now\(\) \+ timedelta\(hours=(\d+) if age_band == Scan\.AgeBand\.MINOR else (\d+) \* 24\)/,
  );
  assert.ok(match, 'the scan retention windows moved out of _scan_fields; re-read the copy that quotes them');
  const [, minorHours, adultDays] = match;
  assert.equal(minorHours, '24', 'the minor window changed and Settings still says 24 hours');
  assert.equal(adultDays, '30', 'the adult window changed and three panels still say 30 days');

  for (const panel of ['HistoryPanel.tsx', 'SettingsPanel.tsx', 'ScoreCardPanel.tsx']) {
    assert.match(copyOf(panel), new RegExp(`${adultDays} (วัน|days)`),
      `${panel} no longer states the ${adultDays}-day image retention window`);
  }
});

test('the screens that mention the purge say the measurements outlive the photograph', () => {
  // `purge_scan_images` empties `image_objects` and saves the scan: the numbers stay. Saying only
  // that images are deleted reads as the analysis going with them.
  assert.match(backend('tasks.py'), /scan\.image_objects = \{\}/,
    'purge_scan_images changed; re-read what the retention copy promises');
  for (const panel of ['HistoryPanel.tsx', 'SettingsPanel.tsx']) {
    assert.match(copyOf(panel), /ค่าที่วัดได้และคะแนน|measurements and scores/,
      `${panel} no longer says the measurements survive the image purge`);
  }
});

// ---------------------------------------------------------------- gates

test('a withheld figure and an unavailable one never read the same', () => {
  /**
   * `percentile.redact` sets `similarity_percentile_locked` rather than reusing the existing None,
   * because that None already means "you are outside the published cohort, so no honest number
   * exists". Collapsing the two would sell a paid upgrade to a user who cannot receive the thing
   * being sold.
   */
  const source = read('ScoreCardPanel.tsx');
  assert.match(source, /data\.similarity_percentile_locked \?/, 'the locked and absent cases merged');
  assert.match(source, /score-card__withheld/, 'the outside-the-cohort state lost its own message');
  assert.match(backend('percentile.py'), /"similarity_percentile_locked": True/,
    'the server stopped distinguishing locked from absent');
});

test('a percentile that rounded to zero is not printed as zero', () => {
  /**
   * `similarity_percentile` is `round(survival * 100, 1)`, so a face far into the tail returns
   * exactly 0.0 — and "0%" beside "ของกลุ่มอ้างอิงอยู่ห่างจากค่าเฉลี่ยมากกว่าคุณ" asserts that
   * nobody in the 240-person cohort is further from the mean than this reader, which is not what
   * was computed. The account this was found on renders it.
   */
  assert.match(read('ScoreCardPanel.tsx'), /percentile === 0 \? "<0\.1%"/,
    'a rounded-down percentile is printed as a flat 0% again');
  assert.match(backend('percentile.py'), /return round\(survival \* 100, 1\)/,
    'the percentile rounding changed; re-read what a zero on the card means');
});

test('the percentile carries its independence caveat beside the number', () => {
  /**
   * `percentile.similarity_percentile` assumes the twelve measurements are independent, says so,
   * and says the assumption "pushes the percentile toward the extremes" — then asks the UI to
   * state it. Stated only in the footer it is 400px from the figure it qualifies, which is the
   * arrangement DevelopmentPlanPanel already rejects for its procedure disclaimer.
   */
  const source = read('ScoreCardPanel.tsx');
  assert.match(source, /data\.assumes_independent_metrics \?/,
    'the approximation caveat no longer rides on the flag the server sets');
  assert.match(backend('percentile.py'), /"assumes_independent_metrics": True/,
    'the server stopped flagging the independence assumption the card reads');
});

test('the score card names its cohort only when the scan carries one', () => {
  // `reference` is absent on a scan scored before that block existed, and the template rendered
  // "เทียบกับคนไทย  คน อายุ  ปี" — a comparison against a population with no size and no age band.
  assert.match(read('ScoreCardPanel.tsx'), /data\.sample_size && data\.age_range/,
    'the cohort sentence is printed again without checking there is a cohort');
});

test('the payout form is not offered where an account cannot be stored', () => {
  /**
   * `payout.save_account` fails closed without PAYOUT_ENCRYPTION_KEY — correctly — but the only
   * place that said so was the 503 the user got *after* choosing a method, naming their account
   * and typing a bank number.
   */
  assert.match(read('WithdrawCard.tsx'), /account\.data\?\.payout_configured !== false/,
    'the withdrawal form no longer checks whether an account can be stored');
  assert.match(backend('views.py'), /"payout_configured": payout\.configured\(\)/,
    'the payout-account payload no longer says whether encryption is configured');
  assert.match(backend('payout.py'), /def configured\(\):/, 'payout.configured() is gone');
});
