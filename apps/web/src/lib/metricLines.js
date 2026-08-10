// Turning "this metric measured landmark 98 to landmark 327" into a line on the canvas.
//
// The mapping from landmark to pixel is `imageToCanvas` from `makeupGeometry`, the same function the
// try-on uses. That matters: it is derived from the crop rectangle the caller also passes to
// `drawImage`, so a line cannot drift off the feature it names when the canvas is reshaped — which
// is exactly the failure that used to put the try-on's blush on the jaw.
// Explicit extensions: this module is exercised by `node --test`, which does not resolve
// extensionless specifiers the way Vite does.
import { STOMION } from '../data/faceMetrics.js';
import { imageToCanvas } from './makeupGeometry.js';

/** The stomion is the midpoint of the inner lip landmarks, so it has to be computed. */
const resolvePoint = (index, landmarks) => {
  if (index !== STOMION) return landmarks[index];
  const upper = landmarks[13];
  const lower = landmarks[14];
  return { x: (upper.x + lower.x) / 2, y: (upper.y + lower.y) / 2 };
};

const toSegment = (pair, landmarks, fit, role) => ({
  role,
  points: pair.map((index) => imageToCanvas(resolvePoint(index, landmarks), fit)),
});

// A span is either one pair, or a list of pairs when the metric averages several distances.
const asPairs = (span) => (Array.isArray(span[0]) ? span : [span]);

/**
 * Segments for one metric.
 *
 * Returns `[]` — never throws — for metrics that are not a distance: the three symmetry metrics are
 * differences between two distances, and the side-profile ones are measured on a photo this page
 * does not show. Those rows still appear in the table, just without a line.
 */
export function metricSegments(metric, landmarks, fit) {
  if (!metric?.span || !landmarks) return [];
  const segments = asPairs(metric.span).map((pair) => toSegment(pair, landmarks, fit, 'measured'));
  if (metric.denominator) {
    for (const pair of asPairs(metric.denominator)) segments.push(toSegment(pair, landmarks, fit, 'denominator'));
  }
  return segments;
}

/**
 * Every drawable measured span across a set of metrics, deduplicated.
 *
 * Denominators are left out here: face width and face height are the denominator of most metrics, so
 * including them would draw the same two lines twenty times over. They appear when a single row is
 * selected, which is where knowing "divided by what" actually helps.
 */
export function allSegments(metrics, landmarks, fit) {
  const seen = new Set();
  const segments = [];
  for (const metric of metrics) {
    if (!metric?.span) continue;
    for (const pair of asPairs(metric.span)) {
      const signature = String(pair);
      if (seen.has(signature)) continue;
      seen.add(signature);
      segments.push(toSegment(pair, landmarks, fit, 'measured'));
    }
  }
  return segments;
}

/** Segments for a `reference_scores` metric, whose denominator is n–gn rather than face width. */
export function referenceSegments(span, denominator, landmarks, fit) {
  if (!span || !landmarks) return [];
  const segments = asPairs(span).map((pair) => toSegment(pair, landmarks, fit, 'measured'));
  if (denominator) segments.push(toSegment(denominator, landmarks, fit, 'denominator'));
  return segments;
}
