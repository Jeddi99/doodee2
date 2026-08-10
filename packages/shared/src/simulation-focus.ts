/** Where the viewer should zoom so a change a few pixels wide is actually visible.
 *
 * The backend answers "what part of the image changed" as fractions of the image. Turning that
 * into a zoom is a display decision, and both apps have to make it the same way, so it lives
 * here as numbers rather than as a CSS string React Native could not use.
 */

export type FocusBox = { x0: number; y0: number; x1: number; y1: number };

/** `scale` multiplies the image; `originX`/`originY` are percentages of the viewer box. */
export type FocusTransform = { scale: number; originX: number; originY: number };

export const NO_ZOOM: FocusTransform = { scale: 1, originX: 50, originY: 50 };

// How much of the viewer the changed region should take up once zoomed. Filling it entirely
// would show a chin with nothing around it, which reads as a stranger's chin rather than yours.
const REGION_FILL = .6;

// Beyond this the preview's own pixels start showing, so zooming further makes the image worse
// at the exact moment it is meant to be getting clearer.
export const MAX_FOCUS_SCALE = 2.5;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Both images are drawn `cover`, so part of the image is cropped before anything is zoomed.
 * Returns the fraction of the image that survives that crop, per axis. */
function visibleFraction(imageAspect: number, viewerAspect: number) {
  if (!(imageAspect > 0) || !(viewerAspect > 0)) return { x: 1, y: 1 };
  return imageAspect > viewerAspect
    ? { x: viewerAspect / imageAspect, y: 1 }
    : { x: 1, y: imageAspect / viewerAspect };
}

export function focusTransform(
  box: FocusBox | null | undefined,
  imageAspect: number,
  viewerAspect: number,
  maxScale: number = MAX_FOCUS_SCALE,
): FocusTransform {
  if (!box) return NO_ZOOM;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  if (!(width > 0) || !(height > 0)) return NO_ZOOM;

  const visible = visibleFraction(imageAspect, viewerAspect);
  // The box measured against the viewer rather than against the whole image: a region that a
  // cover crop already enlarged needs less zoom of its own.
  const inViewer = { x: width / visible.x, y: height / visible.y };
  const scale = clamp(Math.min(REGION_FILL / inViewer.x, REGION_FILL / inViewer.y), 1, maxScale);

  // Scaling about the region only makes it bigger where it already sat, which for a chin means
  // a viewer full of forehead. The origin is solved for instead: scaling about `origin` sends
  // the viewer point `c` to `origin + (c - origin) * scale`, so this is the origin that lands
  // the region in the middle. Clamping it back into the viewer is what stops the zoom panning
  // past the edge of the image, since scaling about an interior point can never uncover one.
  const centre = (low: number, high: number, seen: number) => ((low + high) / 2 - (1 - seen) / 2) / seen;
  const origin = (position: number) => clamp((.5 - position * scale) / (1 - scale), 0, 1);
  const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;
  if (scale === 1) return NO_ZOOM;
  return {
    scale: round(scale, 3),
    originX: round(origin(centre(box.x0, box.x1, visible.x)) * 100, 1),
    originY: round(origin(centre(box.y0, box.y1, visible.y)) * 100, 1),
  };
}
