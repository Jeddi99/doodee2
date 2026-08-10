// Where makeup goes on a face, in canvas pixels.
//
// The old version positioned every colour at a fixed percentage of the stage box while the photo
// underneath was centre-cropped by `object-fit: cover`. The face therefore slid around under
// stationary overlays, which is why blush landed on the jaw. The fix is not a correction factor:
// this module computes one crop rectangle, the caller passes it to both `drawImage` and to
// `imageToCanvas`, so the picture and the landmarks cannot disagree by construction.
//
// No imports, so every claim below is testable with `node --test`.

/**
 * The source rectangle of `imageSize` that fills `canvasSize` when centre-cropped.
 *
 * Feed the result straight to `drawImage(img, sx, sy, sw, sh, 0, 0, canvasW, canvasH)`.
 */
export function coverFit(imageSize, canvasSize) {
  const { width: iw, height: ih } = imageSize;
  const { width: cw, height: ch } = canvasSize;
  if (!(iw > 0 && ih > 0 && cw > 0 && ch > 0)) throw new Error('coverFit needs positive dimensions');
  const scale = Math.max(cw / iw, ch / ih);
  const sw = cw / scale;
  const sh = ch / scale;
  return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh, scale, imageWidth: iw, imageHeight: ih };
}

/** A normalised landmark (0..1 of the image) as canvas pixels under `fit`. */
export function imageToCanvas(point, fit) {
  return {
    x: (point.x * fit.imageWidth - fit.sx) * fit.scale,
    y: (point.y * fit.imageHeight - fit.sy) * fit.scale,
  };
}

/**
 * Ordered closed rings from MediaPipe's connection lists.
 *
 * `FaceLandmarker.FACE_LANDMARKS_LIPS` and friends are unordered `{start, end}` edges, not a path,
 * so handing them to `fill()` in the given order draws a scribble. Each region is one or more
 * cycles — the lips are two, an outer and an inner — so this returns every cycle it finds,
 * largest first.
 */
export function ringsFromConnections(connections) {
  const neighbours = new Map();
  const link = (a, b) => {
    if (!neighbours.has(a)) neighbours.set(a, []);
    const list = neighbours.get(a);
    if (!list.includes(b)) list.push(b);
  };
  for (const { start, end } of connections) {
    link(start, end);
    link(end, start);
  }
  const rings = [];
  const visited = new Set();
  for (const first of neighbours.keys()) {
    if (visited.has(first)) continue;
    const ring = [];
    let current = first;
    let previous = null;
    // Every vertex of a closed ring has exactly two neighbours, so "the one we did not arrive
    // from" is the only way forward. A vertex with any other degree means the caller handed us
    // something that is not a set of rings, and guessing a path through it would draw nonsense.
    while (current !== undefined && !visited.has(current)) {
      const adjacent = neighbours.get(current) || [];
      if (adjacent.length !== 2) throw new Error(`landmark ${current} has ${adjacent.length} neighbours, not a ring`);
      visited.add(current);
      ring.push(current);
      const next = adjacent.find((candidate) => candidate !== previous);
      previous = current;
      current = next === first ? undefined : next;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings.sort((a, b) => b.length - a.length);
}

const toPoints = (ring, landmarks, fit) => ring.map((index) => imageToCanvas(landmarks[index], fit));

/**
 * Lip shape as `{ outer, inner }` paths.
 *
 * Both are returned so the caller can fill with the even-odd rule: the mouth opening stays
 * unpainted, which both keeps an open mouth from being filled in and leaves the lip line visible
 * on a closed one.
 */
export function lipRings(landmarks, fit, lipConnections) {
  const rings = ringsFromConnections(lipConnections);
  if (!rings.length) throw new Error('no lip ring found');
  return { outer: toPoints(rings[0], landmarks, fit), inner: rings[1] ? toPoints(rings[1], landmarks, fit) : null };
}

// Cheekbone landmarks, ported from the set the server already warps against
// (`backend/doodee/simulation_engine.py` REGION_LANDMARKS["cheeks"]). Outermost point first so the
// pair also gives the cheekbone axis.
export const CHEEK_LANDMARKS = { left: [116, 50, 187, 205], right: [345, 280, 411, 425] };

/**
 * Blush placement as an ellipse per cheek, angled along the cheekbone.
 *
 * An ellipse rather than the landmark hull because blush is a soft sweep, not a quadrilateral, and
 * because a rotated ellipse follows the cheekbone the way it is actually applied.
 */
export function cheekEllipses(landmarks, fit) {
  const build = (indices) => {
    const points = toPoints(indices, landmarks, fit);
    const [outer, , , inner] = points;
    const cx = points.reduce((total, point) => total + point.x, 0) / points.length;
    const cy = points.reduce((total, point) => total + point.y, 0) / points.length;
    const axisX = inner.x - outer.x;
    const axisY = inner.y - outer.y;
    const length = Math.hypot(axisX, axisY);
    return {
      cx,
      cy,
      // Wider than the landmark span along the cheekbone, and flatter across it: the span marks
      // the bone, while the colour fades out past it.
      rx: length * .62,
      ry: length * .34,
      rotation: Math.atan2(axisY, axisX),
    };
  };
  return { left: build(CHEEK_LANDMARKS.left), right: build(CHEEK_LANDMARKS.right) };
}

/**
 * Iris as a circle per eye, sized from the iris landmarks themselves.
 *
 * The radius is measured rather than assumed so the colour still fits when the face is closer to
 * or further from the camera, and so it never spills onto the sclera.
 */
export function irisCircles(landmarks, fit, leftConnections, rightConnections) {
  const build = (connections) => {
    const ring = ringsFromConnections(connections)[0];
    if (!ring) throw new Error('no iris ring found');
    const points = toPoints(ring, landmarks, fit);
    const cx = points.reduce((total, point) => total + point.x, 0) / points.length;
    const cy = points.reduce((total, point) => total + point.y, 0) / points.length;
    const radius = points.reduce((total, point) => total + Math.hypot(point.x - cx, point.y - cy), 0) / points.length;
    return { cx, cy, radius };
  };
  return { left: build(leftConnections), right: build(rightConnections) };
}

/**
 * How far the face spans on the canvas, for sizing blur radii.
 *
 * Feathering has to scale with the face: the old code blurred by a flat 5px, which is a soft edge
 * on a thumbnail and a hard one on a full-size photo.
 */
export function faceSpan(landmarks, fit, leftIndex = 234, rightIndex = 454) {
  const left = imageToCanvas(landmarks[leftIndex], fit);
  const right = imageToCanvas(landmarks[rightIndex], fit);
  return Math.hypot(right.x - left.x, right.y - left.y);
}
