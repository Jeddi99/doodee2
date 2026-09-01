// What to say about a render that is correct and still barely visible.
//
// A procedure can be applied exactly as the catalog describes it and change almost nothing:
// flattening a nasolabial fold on a face whose fold is already shallow is close to a no-op. Of
// the 72 renderable procedures, 19 come back under half a percent of the frame at the strongest
// setting (see `docs/PROCEDURE-VISIBILITY.md`).
//
// From the user's side that is indistinguishable from a broken render, and there are only two
// ways to close the gap: raise the catalog's strengths until every row looks like it did
// something — which is claiming a bigger result than the sources support — or say what happened.
// This file is the second one.
//
// Its own module, with no imports, so it can be tested with `node --test`.

/**
 * Below this fraction of the frame, a render reads as "nothing happened".
 *
 * Kept in step with `FAINT_FRACTION` in `backend/doodee/canonical_pipeline.py`, which is the
 * side that measures. `simulationVisibility.test.js` reads that file and fails when the two
 * drift; the fix is to decide which value is right and change both.
 */
export const FAINT_PERCENT = 0.5;

/**
 * @param visibility  `{ view_name: percent_of_frame_changed }` from the API, possibly empty
 * @param view        which view is on screen
 * @returns `{ level, percent, elsewhere }` where level is one of:
 *   `unmeasured` — nothing to say. Rows rendered before this was recorded, and the
 *                  single-image engine, which does not measure it. Absent is not zero.
 *   `clear`      — visible; the picture speaks for itself.
 *   `elsewhere`  — this angle shows next to nothing but another one does, and `elsewhere`
 *                  names it. Worth its own case: the fix is one click, not a shrug.
 *   `faint`      — the whole render is under the threshold, in every angle.
 */
export function describeVisibility(visibility, view) {
  const entries = Object.entries(visibility || {}).filter(([, value]) => typeof value === 'number');
  const here = entries.find(([name]) => name === view)?.[1];
  if (here === undefined) return { level: 'unmeasured', percent: null, elsewhere: null };
  if (here >= FAINT_PERCENT) return { level: 'clear', percent: here, elsewhere: null };
  // Whichever other angle shows the most, so the suggestion points at the best one rather than
  // the first one that happens to clear the bar.
  const best = entries
    .filter(([name, value]) => name !== view && value >= FAINT_PERCENT)
    .sort((a, b) => b[1] - a[1])[0];
  if (best) return { level: 'elsewhere', percent: here, elsewhere: best[0] };
  return { level: 'faint', percent: here, elsewhere: null };
}
