/**
 * A photograph decoded and the face detector loaded, together.
 *
 * Four screens measure a still the same way — the metrics panel, the geometry editor, the score
 * card and the simulation viewer — and each of them wrote the same six lines. Written once here so
 * the two decisions inside it are made once too:
 *
 * The bundle is a dynamic import, because pulling the vision code in eagerly would cost every
 * visitor the model download whether they reach one of these screens or not.
 *
 * And it starts alongside the decode rather than after it. Neither waits on the other, so making
 * the picture land first put a 138 kB chunk — and on a cold visit the face model behind it —
 * entirely after the download it had no reason to queue behind.
 *
 * Rejects if the photo cannot be decoded, which is the caller's cue that there is nothing to
 * measure. Callers check their own cancellation flag on the way out, since only they know whether
 * the screen still wants the answer.
 */
export function loadStillAndVision(imageUrl) {
  const image = new Image();
  // Without this a cross-origin photo taints the canvas it is drawn to, and the detector — which
  // reads pixels back — gets nothing.
  image.crossOrigin = 'anonymous';
  image.src = imageUrl;
  return Promise.all([image.decode(), import('./liveFace')])
    .then(([, liveFace]) => ({ image, liveFace }));
}
