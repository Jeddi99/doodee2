// Drawing the chosen makeup onto a photograph.
//
// Its own module rather than living inside the component so the drawing path can be loaded and
// exercised on its own, without React. The geometry it relies on is in `makeupGeometry.js`; the
// only thing here is how colour is laid down.
import { LAYER_WEIGHT } from '../data/makeup';
import { cheekEllipses, coverFit, faceSpan, irisCircles, lipRings } from './makeupGeometry';

const tracePath = (context, points) => {
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
  context.closePath();
};

/**
 * Paint the photo and the chosen makeup into `context` at `size`.
 *
 * Both the visible canvas and the full-resolution export call this, so what gets downloaded is what
 * was on screen. The single `fit` is what keeps colour attached to the face: it positions the photo
 * and converts the landmarks, so the two cannot drift apart the way the old percentage overlays did.
 */
export function paintLook(context, size, image, landmarks, look, intensity, sets) {
  const fit = coverFit({ width: image.naturalWidth, height: image.naturalHeight }, size);
  context.clearRect(0, 0, size.width, size.height);
  context.drawImage(image, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, size.width, size.height);
  if (!landmarks) return fit;

  const strength = intensity / 100;
  // Every blur is a fraction of how wide the face is on this canvas. The old code blurred by a flat
  // 5px, which feathers a thumbnail and leaves a hard edge on a full-size photo.
  const span = faceSpan(landmarks, fit);

  if (look.blush.hex) {
    const { left, right } = cheekEllipses(landmarks, fit);
    context.save();
    context.globalCompositeOperation = 'multiply';
    context.globalAlpha = strength * LAYER_WEIGHT.blush;
    context.filter = `blur(${(span * .055).toFixed(2)}px)`;
    context.fillStyle = look.blush.hex;
    for (const ellipse of [left, right]) {
      context.beginPath();
      context.ellipse(ellipse.cx, ellipse.cy, ellipse.rx, ellipse.ry, ellipse.rotation, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  if (look.lip.hex) {
    const { outer, inner } = lipRings(landmarks, fit, sets.lips);
    context.save();
    context.globalCompositeOperation = 'multiply';
    context.globalAlpha = strength * LAYER_WEIGHT.lip;
    context.filter = `blur(${Math.max(.6, span * .006).toFixed(2)}px)`;
    context.fillStyle = look.lip.hex;
    context.beginPath();
    tracePath(context, outer);
    // Even-odd leaves the mouth opening unpainted, so an open mouth is not filled in and a closed
    // one keeps its lip line.
    if (inner) tracePath(context, inner);
    context.fill('evenodd');
    context.restore();

    if (look.lip.finish === 'gloss') {
      const xs = outer.map((point) => point.x);
      const ys = outer.map((point) => point.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const width = Math.max(...xs) - Math.min(...xs);
      // Sheen low on the lips, where light actually catches.
      const cy = Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * .66;
      const radius = Math.max(2, width * .3);
      const sheen = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
      sheen.addColorStop(0, 'rgba(255,255,255,.85)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      context.save();
      context.globalCompositeOperation = 'screen';
      context.globalAlpha = strength * .35;
      context.beginPath();
      tracePath(context, outer);
      context.clip();
      context.fillStyle = sheen;
      context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      context.restore();
    }
  }

  if (look.iris.hex) {
    const { left, right } = irisCircles(landmarks, fit, sets.leftIris, sets.rightIris);
    context.save();
    // `color` keeps the original luminance, so the pupil and the catchlight survive instead of
    // being flooded over with a flat disc.
    context.globalCompositeOperation = 'color';
    context.globalAlpha = strength * LAYER_WEIGHT.iris;
    context.fillStyle = look.iris.hex;
    for (const circle of [left, right]) {
      context.beginPath();
      // Slightly inside the measured iris so colour never spills onto the white of the eye.
      context.arc(circle.cx, circle.cy, circle.radius * .92, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
  return fit;
}
