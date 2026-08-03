import { FaceLandmarker } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';

const modelAssetPath = new URL('../../../../backend/doodee/assets/face_landmarker.task', import.meta.url).href;
let taskPromise;

function createTask(delegate) {
  return FaceLandmarker.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    {
      baseOptions: { modelAssetPath, delegate },
      runningMode: 'VIDEO',
      numFaces: 2,
      minFaceDetectionConfidence: .6,
      minFacePresenceConfidence: .6,
      minTrackingConfidence: .6,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    },
  );
}

export function getLiveFaceLandmarker() {
  taskPromise ||= createTask('GPU').catch(() => createTask('CPU'));
  return taskPromise;
}

export async function closeLiveFaceLandmarker() {
  const current = taskPromise;
  taskPromise = undefined;
  const task = await current?.catch(() => null);
  task?.close();
}

const degrees = (radians) => radians * 180 / Math.PI;
const clamp = (value) => Math.max(-1, Math.min(1, value));

function lightStats(video, canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let total = 0;
  let clipped = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const luma = .2126 * pixels[index] + .7152 * pixels[index + 1] + .0722 * pixels[index + 2];
    total += luma;
    if (luma < 12 || luma > 243) clipped += 1;
  }
  const count = pixels.length / 4;
  return { brightness: total / count, clippedRatio: clipped / count };
}

export function observeVideo(task, video, detectCanvas, lightCanvas, previous, timestamp) {
  const startedAt = performance.now();
  detectCanvas.getContext('2d').drawImage(video, 0, 0, detectCanvas.width, detectCanvas.height);
  const result = task.detectForVideo(detectCanvas, timestamp);
  const inferenceMs = performance.now() - startedAt;
  const { brightness, clippedRatio } = lightStats(video, lightCanvas);
  if (!result.faceLandmarks.length) return { faceCount: 0, confidence: 0, brightness, clippedRatio, inferenceMs };
  const points = result.faceLandmarks[0];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const matrix = result.facialTransformationMatrixes[0]?.data || [];
  const yaw = matrix.length >= 11 ? degrees(Math.asin(clamp(-matrix[8]))) : 0;
  const pitch = matrix.length >= 11 ? degrees(Math.atan2(matrix[9], matrix[10])) : 0;
  const roll = matrix.length >= 5 ? degrees(Math.atan2(matrix[4], matrix[0])) : 0;
  const blendshapes = Object.fromEntries((result.faceBlendshapes[0]?.categories || []).map((item) => [item.categoryName, item.score]));
  const smile = ((blendshapes.mouthSmileLeft || 0) + (blendshapes.mouthSmileRight || 0)) / 2;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const stable = !previous || (
    Math.hypot(centerX - previous.centerX, centerY - previous.centerY) < .015
    && Math.abs(yaw - previous.yaw) < 3
    && Math.abs(pitch - previous.pitch) < 3
  );
  return {
    faceCount: result.faceLandmarks.length,
    confidence: 1,
    brightness,
    clippedRatio,
    faceHeightRatio: bottom - top,
    centerOffsetX: centerX - .5,
    centerOffsetY: centerY - .5,
    yaw,
    pitch,
    roll,
    smile,
    stable,
    inferenceMs,
    centerX,
    centerY,
  };
}
