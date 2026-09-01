// Zooms the camera preview onto the tracked face so what the user sees matches the cropped
// image that gets saved. The preview element uses object-fit: cover, so the visible part of the
// frame is narrower than the frame itself and face coordinates have to be mapped through that
// crop before they mean anything on screen.
const MAX_ZOOM = 2.5;
const FACE_FILL = .6;

// How high in the output the face centre sits — slightly above the middle, the way a portrait is
// normally framed.
const FACE_CENTRE_Y = .45;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * The rectangle of the camera frame to keep: the face, framed as a portrait.
 *
 * This is what lets someone hold the phone at a distance and still get a usable photo, which is
 * the only way to keep a turned head inside the frame when the screen cannot be seen. Whatever
 * else the camera caught — shoulders, the room — is outside this rectangle and never uploaded.
 *
 * Backend metrics are ratios normalised by face size, so cropping changes no measurement. What it
 * must not do is magnify: upscaling would blur the image past the sharpness check, so the
 * rectangle is never allowed to grow beyond the source frame.
 */
export function faceCropRect(faceBox, videoWidth, videoHeight) {
  if (!faceBox) return { x: 0, y: 0, width: videoWidth, height: videoHeight };
  const faceHeight = (faceBox.bottom - faceBox.top) * videoHeight;
  if (faceHeight <= 0) return { x: 0, y: 0, width: videoWidth, height: videoHeight };
  const aspect = videoWidth / videoHeight;
  // Never exceed the source frame: that would mean upscaling.
  let height = Math.min(videoHeight, faceHeight / FACE_FILL);
  let width = Math.min(videoWidth, height * aspect);
  height = width / aspect;
  const centreX = (faceBox.left + faceBox.right) / 2 * videoWidth;
  const centreY = (faceBox.top + faceBox.bottom) / 2 * videoHeight;
  const x = Math.max(0, Math.min(videoWidth - width, centreX - width / 2));
  const y = Math.max(0, Math.min(videoHeight - height, centreY - height * FACE_CENTRE_Y));
  return { x, y, width, height };
}

// `mirrored` follows the camera in use: a selfie feed is flipped so moving left moves the preview
// left, but the rear camera already shows the scene the right way round and flipping it would
// invert the pose arrows against what the person is doing.
export function previewTransform(faceBox, videoWidth, videoHeight, clientWidth, clientHeight, mirrored = true) {
  const mirror = mirrored ? 'scaleX(-1)' : '';
  const still = mirror || 'none';
  if (!faceBox || !videoWidth || !videoHeight || !clientWidth || !clientHeight) return still;
  const faceHeight = faceBox.bottom - faceBox.top;
  if (faceHeight <= 0) return still;

  // object-fit: cover scales by the larger ratio and centre-crops the overflow.
  const cover = Math.max(clientWidth / videoWidth, clientHeight / videoHeight);
  const visibleX = clientWidth / (videoWidth * cover);
  const visibleY = clientHeight / (videoHeight * cover);
  const centreX = (faceBox.left + faceBox.right) / 2;
  const centreY = (faceBox.top + faceBox.bottom) / 2;
  // Where the face centre sits inside the element, 0..1.
  const elementX = .5 + (centreX - .5) / visibleX;
  const elementY = .5 + (centreY - .5) / visibleY;

  // The face already covers faceHeight/visibleY of the element's height.
  const zoom = clamp(FACE_FILL / (faceHeight / visibleY), 1, MAX_ZOOM);
  const translateX = (.5 - elementX) * 100;
  const translateY = (.5 - elementY) * 100;
  if (zoom === 1 && !translateX && !translateY) return still;
  // Applied right to left: centre the face first, then magnify, then mirror.
  return `${mirror} scale(${zoom.toFixed(3)}) translate(${translateX.toFixed(2)}%, ${translateY.toFixed(2)}%)`.trim();
}
