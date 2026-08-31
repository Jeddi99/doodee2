/**
 * Turning the skin-trend response into something a chart can draw without lying.
 *
 * The server has already done the hard part: it walked the user's scans oldest-first and started
 * a new run every time `skin_engine.comparison_break` said two readings could not be compared,
 * attaching the reason. What is left is geometry — and one rule that the geometry has to respect.
 *
 * **A run boundary is a gap, never a dashed line.** A dashed segment still joins two points to
 * the eye, and a reader still measures a slope across it. The whole reason the backend refuses to
 * compare those two scans is that the slope is not the user's skin, it is the light in two
 * different rooms. So each run is its own path, both endpoints keep their dots, and the space
 * between them stays empty with the reason available on the marker that sits there.
 *
 * Positions are on a time axis rather than evenly spaced. Two scans a day apart and two scans six
 * months apart are different facts, and equal spacing would present them as the same one.
 *
 * Pure: no DOM, no React, no SVG. The panel decides how to paint what comes back.
 */

/** Fewer than this in a single run and there is nothing to join, so no line is drawn. */
export const MIN_POINTS_FOR_A_LINE = 2;

/**
 * One signal's history, ready to plot.
 *
 * Returns `{ runs, min, max, count }` where each run carries points in `{ x, y, value, … }` with
 * x and y already normalised to 0..1 — x by capture time across the whole history, y by the
 * observed range of this signal. `count` is how many points actually carry a value, which is what
 * decides whether the chart is worth drawing at all.
 *
 * Unreadable scans are dropped here rather than plotted at zero. They are still shown in the
 * table view, where "could not be read" is a row and not a data point; on a line, a zero would be
 * indistinguishable from a measurement of zero.
 */
export function trendSeries(series, signalKey) {
  const runs = (series || []).map((run) => ({
    breakReason: run.break_reason || null,
    points: (run.points || [])
      .filter((point) => point.readable && typeof point.signals?.[signalKey] === "number")
      .map((point) => ({
        scanId: point.scan_id,
        capturedAt: point.captured_at,
        at: Date.parse(point.captured_at),
        value: point.signals[signalKey],
      })),
  }));

  const values = runs.flatMap((run) => run.points.map((point) => point.value));
  const times = runs.flatMap((run) => run.points.map((point) => point.at));
  if (!values.length) return { runs: [], min: 0, max: 0, count: 0 };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const firstAt = Math.min(...times);
  const lastAt = Math.max(...times);
  // A flat history is drawn down the middle rather than pinned to an edge: a signal that has not
  // moved should read as "not moved", not as "at the bottom of its range".
  const span = max - min || 1;
  const timeSpan = lastAt - firstAt || 1;

  return {
    runs: runs
      .map((run) => ({
        ...run,
        points: run.points.map((point) => ({
          ...point,
          x: lastAt === firstAt ? 0.5 : (point.at - firstAt) / timeSpan,
          y: max === min ? 0.5 : (point.value - min) / span,
        })),
      }))
      .filter((run) => run.points.length),
    min,
    max,
    count: values.length,
  };
}

/** Whether this signal has enough comparable history to be worth a chart at all. */
export function drawable(series, signalKey) {
  return trendSeries(series, signalKey).count >= MIN_POINTS_FOR_A_LINE;
}

/**
 * An SVG path for one run, in a box `width` x `height` with `pad` breathing room.
 *
 * Straight segments only. A smoothed curve between two dated readings invents a rate of change
 * between them — it says the skin moved gradually when all that is known is where it started and
 * where it ended.
 */
export function runPath(points, width, height, pad = 6) {
  if (points.length < MIN_POINTS_FOR_A_LINE) return "";
  return points
    .map((point, index) => {
      const [x, y] = position(point, width, height, pad);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Where one point sits in the box. y is flipped, because SVG counts downwards. */
export function position(point, width, height, pad = 6) {
  return [
    pad + point.x * (width - pad * 2),
    height - pad - point.y * (height - pad * 2),
  ];
}

/**
 * Every reading in order, including the ones with no value, for the table view.
 *
 * The table is where an unreadable scan gets to say what went wrong, and where a screen reader —
 * or anyone who would rather read numbers — gets the same history the chart draws.
 */
export function trendRows(series) {
  return (series || []).flatMap((run, runIndex) =>
    (run.points || []).map((point, pointIndex) => ({
      ...point,
      // The first point of a run that is not the first run is where the line stopped.
      breakReason: runIndex > 0 && pointIndex === 0 ? run.break_reason || null : null,
    })),
  );
}
