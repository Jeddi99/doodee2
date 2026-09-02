/** What to say about a render that is correct and still barely visible.
 *
 * A procedure can be applied exactly as the catalog describes it and change almost nothing:
 * flattening a nasolabial fold on a face whose fold is already shallow is close to a no-op. Of
 * the 70 renderable procedures, 12 clear neither threshold below even at the strongest setting —
 * `docs/PROCEDURE-VISIBILITY.md` has the measurements, per row.
 *
 * From the user's side that is indistinguishable from a broken render, and there are only two
 * ways to close the gap: raise the catalog's strengths until every row looks like it did
 * something, which claims a bigger result than the sources support, or say what happened. This
 * is the second one, and it lives here because both apps have to say it the same way.
 */

/**
 * `{ view_name: { percent, peak } }`, as the API sends it — or a bare percentage on rows rendered
 * before the peak was recorded, which is why the values are `unknown` and normalised below.
 */
export type Visibility = Record<string, unknown>;

export type VisibilityLevel = 'unmeasured' | 'clear' | 'local' | 'elsewhere' | 'faint';

export type VisibilityVerdict = {
  level: VisibilityLevel;
  percent: number | null;
  /** The view worth switching to, set only when `level` is `elsewhere`. */
  elsewhere: string | null;
};

/** One view's measurements, from either shape. `null` when the view made no claim. */
function reading(value: unknown): { percent: number; peak: number | null } | null {
  if (typeof value === 'number') return { percent: value, peak: null };
  if (!value || typeof value !== 'object') return null;
  const record = value as { percent?: unknown; peak?: unknown };
  if (typeof record.percent !== 'number') return null;
  return { percent: record.percent, peak: typeof record.peak === 'number' ? record.peak : null };
}

/**
 * Below this fraction of the frame, a render reads as "nothing happened".
 *
 * Kept in step with `FAINT_FRACTION` in `backend/doodee/canonical_pipeline.py`, which is the
 * side that measures. `simulation-visibility.test.ts` reads that file and fails when the two
 * drift; the fix is to decide which value is right and change both.
 */
export const FAINT_PERCENT = 0.5;

/**
 * The channel delta at which a change is legible where it happened, however little of the frame
 * it covers. Kept in step with `STRONG_DELTA` in `backend/doodee/canonical_pipeline.py`, which is
 * the side that measures, the same way `FAINT_PERCENT` is.
 *
 * Area alone answers the wrong question for anything local. A hairline transplant moves 0.39% of
 * the frame with a peak of 137 and was reported as "you can barely see this"; mole removal (78)
 * and cosmetic tattooing (64) were in the same bucket. This is what takes them out of it.
 */
export const STRONG_DELTA = 25;

/**
 * `unmeasured` — nothing to say. Rows rendered before this was recorded, and the single-image
 *                engine, which does not measure it. Absent is not zero.
 * `clear`      — visible across enough of the frame; the picture speaks for itself.
 * `local`      — a small part of the picture changed a lot: a hairline drawn in, a mole taken
 *                out. Real and easy to miss, so it is pointed at rather than apologised for.
 *                It used to be reported as `faint`, which told the user the opposite of the truth.
 * `elsewhere`  — this angle shows next to nothing but another one does, and `elsewhere` names
 *                it. Its own case because the fix is one tap, not a shrug.
 * `faint`      — under both thresholds in every angle. There is no better view to offer.
 */
export function describeVisibility(visibility: Visibility | null | undefined, view: string): VisibilityVerdict {
  const entries = Object.entries(visibility || {})
    .map(([name, value]) => [name, reading(value)] as const)
    .filter((entry): entry is [string, { percent: number; peak: number | null }] => entry[1] !== null);
  const here = entries.find(([name]) => name === view)?.[1];
  if (here === undefined) return { level: 'unmeasured', percent: null, elsewhere: null };
  if (here.percent >= FAINT_PERCENT) return { level: 'clear', percent: here.percent, elsewhere: null };
  if (here.peak !== null && here.peak >= STRONG_DELTA) {
    return { level: 'local', percent: here.percent, elsewhere: null };
  }
  // Whichever other angle shows the most, so the suggestion points at the best one rather than
  // the first one that happens to clear the bar. An angle that only clears it on peak counts:
  // "switch to the left, the change is there" is true whichever threshold it cleared.
  const best = entries
    .filter(([name, value]) => name !== view
      && (value.percent >= FAINT_PERCENT || (value.peak !== null && value.peak >= STRONG_DELTA)))
    .sort((a, b) => b[1].percent - a[1].percent)[0];
  if (best) return { level: 'elsewhere', percent: here.percent, elsewhere: best[0] };
  return { level: 'faint', percent: here.percent, elsewhere: null };
}
