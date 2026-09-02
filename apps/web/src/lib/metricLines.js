// Turning the points the server measured from into lines on a canvas.
//
// Ported from doodoodeedee's `lib/metricLines.js`, and one thing about it changed. That version
// took `landmarks` — a 478-point mesh the browser had just re-detected — and looked up the pair
// for each metric in a table of its own. This one takes `analysis_data.metric_geometry`, where
// the server has already said which two points it divided, because a line re-derived in the
// browser can contradict the very number printed beside it and there is no way for a reader to
// tell which of the two is wrong. Every coordinate here was measured by the same code that
// produced the value.
//
// The mapping from a normalised point to a pixel is `imageToCanvas` from `makeupGeometry`, the
// same function the try-on uses: it is derived from the crop rectangle the caller also passes to
// `drawImage`, so a line cannot drift off the feature it names when the canvas is reshaped — the
// failure that used to put the try-on's blush on the jaw.
//
// Explicit extension on the import: this module is exercised by `node --test`, which does not
// resolve extensionless specifiers the way Vite does.
import { imageToCanvas } from './makeupGeometry.js';

/** The payload shape this module reads. Bumped server-side in `analysis_engine.GEOMETRY_VERSION`. */
export const GEOMETRY_VERSION = 1;

/**
 * One view's geometry out of a scan, or `null` when there is none to draw.
 *
 * Four different absences answer `null` here and they all mean the same thing to a caller — draw
 * the photograph without lines:
 *
 *   - a scan analysed before this field existed, which is every scan already in the database;
 *   - a scan whose photographs passed their 30 days, where `purge_scan_images` deleted the points
 *     along with the images and left `metric_geometry: null` behind;
 *   - a skin scan, which measures no proportions at all;
 *   - a view that was captured for context and never measured — the obliques, the smile, the
 *     basal — which the server omits rather than sending empty.
 *
 * A future payload version is also refused rather than half-read: a shape this module does not
 * know is likelier to draw a wrong line than no line.
 */
export function viewGeometry(analysisData, view) {
  const geometry = analysisData?.metric_geometry;
  if (!geometry || geometry.version !== GEOMETRY_VERSION) return null;
  return geometry.views?.[view] || null;
}

/** The entry for one key, from whichever of the two metric families holds it. */
function entryFor(view, key) {
  if (!view || !key) return null;
  return view.metrics?.[key] || view.reference?.[key] || null;
}

const toSegment = (points, fit, role) => ({
  role,
  points: points.map(([x, y]) => imageToCanvas({ x, y }, fit)),
});

/**
 * Every role of one entry, in draw order.
 *
 * `baseline` before `measured` on purpose: an E-line ratio is the distance from a lip to Ricketts'
 * line, and the line has to be under the offset rather than over it for the picture to read as
 * "this far off that".
 */
const ROLES = ['denominator', 'baseline', 'measured'];

function segmentsOf(entry, fit) {
  if (!entry || !fit) return [];
  const segments = [];
  for (const role of ROLES) {
    for (const points of entry[role] || []) segments.push(toSegment(points, fit, role));
  }
  return segments;
}

// Two metrics can name the same span from opposite ends — right eye width runs inner-to-outer,
// right canthal tilt runs outer-to-inner, and both draw one line between the same two points. The
// signature is order-free so those collapse instead of stacking two identical strokes.
const spanSignature = (points) =>
  points.map((point) => `${point[0]},${point[1]}`).sort().join('|');

/**
 * Segments for one metric of the measured catalogue (`analysis_data.metrics`).
 *
 * Returns `[]` — never throws — for a key this view does not measure. That is the normal case
 * rather than an error: the panel lists front and side metrics together, so whichever photograph
 * is on screen is asked about keys belonging to the other one.
 */
export function metricSegments(view, key, fit) {
  return segmentsOf(view?.metrics?.[key], fit);
}

/**
 * Segments for a `reference_scores` metric, whose denominator is n–gn rather than face width.
 *
 * A separate function from the one above, as upstream, because the two families answer different
 * questions and a caller almost always wants one or the other. Nothing stops a key from being
 * looked up in the wrong family; it simply comes back empty.
 */
export function referenceSegments(view, key, fit) {
  return segmentsOf(view?.reference?.[key], fit);
}

/**
 * The two arms of an angle, drawn from its vertex.
 *
 * Returned as segments so the same drawing code handles them. An angle has no length to compare,
 * so there is no denominator arm: what the picture has to show is where the vertex sits and which
 * two points the arms run to. The server puts the vertex first in both arms, so a caller wanting
 * to mark the corner can read `points[0]` of either.
 *
 * Empty for anything that is not an angle, which is how a caller can ask without checking first.
 */
export function angleSegments(view, key, fit) {
  const entry = entryFor(view, key);
  if (entry?.kind !== 'angle') return [];
  return segmentsOf(entry, fit);
}

/**
 * Every drawable measured span across a set of keys, deduplicated.
 *
 * Denominators and baselines are left out here: face width and face height are the denominator of
 * most metrics, so including them would draw the same two lines twenty times over. They appear
 * when a single row is selected, which is where knowing "divided by what" actually helps.
 *
 * Deduplication is on the coordinates rather than on the landmark indices upstream used, because
 * indices are no longer on the wire. Same effect: two keys measured across the same two points
 * produce one stroke. Midface height and nose length are the same span by definition, and drawing
 * it twice makes it look heavier than the spans beside it for no reason a reader could name.
 */
export function allSegments(view, keys, fit) {
  if (!view || !fit) return [];
  const seen = new Set();
  const segments = [];
  for (const key of keys || []) {
    const entry = entryFor(view, key);
    for (const points of entry?.measured || []) {
      const signature = spanSignature(points);
      if (seen.has(signature)) continue;
      seen.add(signature);
      segments.push(toSegment(points, fit, 'measured'));
    }
  }
  return segments;
}

/** Whether a key has anything to draw on this view, for a caller deciding what to offer. */
export function isDrawable(view, key) {
  return Boolean(entryFor(view, key)?.measured?.length);
}
