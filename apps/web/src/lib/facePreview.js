// Zooms the camera preview onto the tracked face so what the user sees matches the cropped
// image that gets saved. The preview element uses object-fit: cover, so the visible part of the
// frame is narrower than the frame itself and face coordinates have to be mapped through that
// crop before they mean anything on screen.
const MAX_ZOOM = 2.5;
const FACE_FILL = .6;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function previewTransform(faceBox, videoWidth, videoHeight, clientWidth, clientHeight) {
  const mirror = 'scaleX(-1)';
  if (!faceBox || !videoWidth || !videoHeight || !clientWidth || !clientHeight) return mirror;
  const faceHeight = faceBox.bottom - faceBox.top;
  if (faceHeight <= 0) return mirror;

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
  if (zoom === 1 && !translateX && !translateY) return mirror;
  // Applied right to left: centre the face first, then magnify, then mirror.
  return `${mirror} scale(${zoom.toFixed(3)}) translate(${translateX.toFixed(2)}%, ${translateY.toFixed(2)}%)`;
}
