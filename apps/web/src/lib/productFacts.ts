/**
 * The numbers the public marketing page is allowed to say out loud.
 *
 * Every figure here is a claim a visitor, a customer or a regulator can hold this product to, so
 * none of them is written from memory. Each one is pinned to the file that decides it by
 * `productFacts.test.ts`, which parses the Python the same way `faceMetrics.test.js` parses
 * `analysis_engine.py`. The landing page reads these constants instead of typing a number into a
 * string, because the version of this page that typed them in said "2,000+ users" against a
 * database holding single digits, "85+ facial measurements" against 51, and "฿299/month" against
 * a plan table whose cheapest paid row is ฿499 and whose ฿299 row cannot be bought at all.
 *
 * The rule for anything added here: if the codebase cannot answer it, it does not go on the page.
 * There is no constant for user count, satisfaction, accuracy or clinic partners, because nothing
 * in this repository knows those numbers.
 */

/**
 * Ratios and angles `analysis_engine.py` actually emits, named in `data/faceMetrics.js`.
 *
 * This is the honest answer to "how many things do you measure": 51. Not 85, which is the
 * catalogue below, and not 478, which is MediaPipe's landmark count and measures nothing.
 */
export const MEASURED_METRICS = 51;

/** Rows in `metric_catalog.py` — every characteristic the product has an opinion about. */
export const CATALOG_TOTAL = 85;

/**
 * Catalogue rows something real backs, so `status == "measured"`.
 *
 * The remaining 13 are not a backlog. Each one carries a `note_th`/`note_en` saying why a single
 * 2D photograph cannot answer it, and the product shows them as not measured rather than dropping
 * them so the list looks complete.
 */
export const CATALOG_MEASURED = 72;

/** Rows only a skin scan can fill, counted apart so a face scan never claims them. */
export const CATALOG_FROM_SKIN_SCAN = 5;

/** Procedures in `procedure_catalog.py`, taken from the source document. */
export const PROCEDURES_TOTAL = 92;

/**
 * Procedures with a render pipeline, so a preview can actually be drawn for them.
 *
 * The other 22 are body or systemic treatments with no visible effect on a face photograph. They
 * stay in the catalogue with a reason attached rather than being deleted to flatter the count.
 *
 * It was 72 until an IV vitamin drip and a herbal skin tonic were retired: both asked for a
 * sub-one-unit shift in L, which cleared no pixel on either face they were measured against, so
 * they were selling a render that handed the photograph back. Two fewer rows is the honest count.
 */
export const PROCEDURES_RENDERABLE = 70;

/** Published cohort behind every reference score: `reference_scoring.py`'s REFERENCE table. */
export const REFERENCE_SAMPLE = 240;
export const REFERENCE_AGE_RANGE = "18–35";

/**
 * Observations that have a published mean and SD to be scored against — twelve, not fifty-one.
 *
 * The distinction matters on screen: 51 values are measured off the photograph, and 12 of them
 * can be compared with a population. Everything else is a measurement of you against you.
 */
export const REFERENCE_OBSERVATIONS = 12;

/**
 * Scores needed before a percentile is shown as a fact (`score_distribution.RELIABLE_SAMPLE_SIZE`).
 *
 * On the page so the reader is told the comparison is thin while it is thin, rather than being
 * shown a percentile computed from a handful of people and left to assume a population.
 */
export const DISTRIBUTION_RELIABLE_AT = 30;

/** Baht per month, from the `Plan` rows `test_requirements.REQUIRED_PACKAGES` holds the API to. */
export const PLAN_PRICE_BAHT = { free: 0, plus: 499, pro: 799 } as const;

/**
 * What each tier is allowed per month. `-1` is `Plan.UNLIMITED`.
 *
 * `free.simulations` was 0 when this file was written, which made the old "One preview direction"
 * bullet false. Migration 0041 gave free three, because the three saves it had always advertised
 * were unreachable while the lock keyed on previews being zero — an allowance nobody could spend.
 * Three, not two: one look before each save, so the last one is not committed blind.
 */
export const PLAN_LIMITS = {
  free: { simulations: 3, chatTurns: 5, fullAnalysis: false, developmentPlan: false },
  plus: { simulations: 10, chatTurns: 100, fullAnalysis: true, developmentPlan: true },
  pro: { simulations: -1, chatTurns: -1, fullAnalysis: true, developmentPlan: true },
} as const;

/**
 * The only currency any price in this product is expressed in.
 *
 * `Order.currency` defaults to THB and nothing anywhere sets another one, so the page has no
 * dollar price to show. It used to show `$19.99` to non-Thai visitors, which was not a conversion
 * of anything — no such plan exists.
 */
export const CURRENCY = "THB";

/** ฿, formatted the way `lib/referral.js`'s `baht()` formats it. */
export const baht = (amount: number): string => `฿${amount.toLocaleString("en-US")}`;
