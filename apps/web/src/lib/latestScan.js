/**
 * Which scan a screen means when it says "your latest scan".
 *
 * Six screens used to answer that question with `scans.data[0]` — the newest scan of any kind.
 * That was correct while every scan measured the same thing. It stopped being correct the moment
 * a skin scan could exist: `analyze_images` returns an empty metric catalogue and no
 * `reference_scores` for `scan_mode: "skin"`, so a two-minute skin check-in taken after a full
 * face scan would quietly become the scan behind the analysis page, the development plan, the
 * score card, the simulation studio, the try-on view and the chat's context — every one of them
 * showing nothing, or nearly nothing, while the real scan sat one row further down the list.
 *
 * Nothing would have thrown. That is why this lives in one module with a name rather than as a
 * `.find()` repeated six times: the next screen that needs the newest scan should have to pick
 * which kind it means, and should find the question already asked.
 */

/** Matches `Scan.ScanMode.SKIN` in backend/doodee/models.py. */
export const SKIN_SCAN_MODE = 'skin';

/**
 * The newest scan that carries craniofacial measurements.
 *
 * Everything that reads `metrics`, `reference_scores`, or a development plan wants this one.
 * Scans with no `scan_mode` at all count as craniofacial: the field arrived after the first
 * scans did, and treating an older row as skin would hide it.
 */
export function latestCraniofacialScan(scans) {
  if (!Array.isArray(scans)) return null;
  return scans.find((scan) => scan && scan.scan_mode !== SKIN_SCAN_MODE) || null;
}

/**
 * The newest scan of any kind.
 *
 * The right rule for the skin panel, and only for it: every mode that captures a front view
 * produces a `skin_analysis`, so a skin scan and an ordinary face scan are equally valid input
 * there — and the skin scan, being the one framed and lit for the purpose, is usually better.
 */
export function latestScanOfAnyMode(scans) {
  if (!Array.isArray(scans)) return null;
  return scans[0] || null;
}
