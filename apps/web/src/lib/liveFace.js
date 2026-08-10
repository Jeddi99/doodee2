import { FaceLandmarker } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';

import { poseFromMatrix } from './facePose';

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

/**
 * Region edge lists, re-exported so callers do not have to import `FaceLandmarker` themselves.
 *
 * Importing the class pulls in the whole vision bundle eagerly, which defeats the point of loading
 * this module lazily. These are unordered `{start, end}` edges — see `makeupGeometry.ringsFromConnections`.
 */
export const LANDMARK_SETS = {
  lips: FaceLandmarker.FACE_LANDMARKS_LIPS,
  leftIris: FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
  rightIris: FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
};

let stillTaskPromise;

function createStillTask(delegate) {
  return FaceLandmarker.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    {
      baseOptions: { modelAssetPath, delegate },
      // A separate instance rather than reusing the live one: a task is fixed to one running mode,
      // and flipping the shared singleton to IMAGE would break the live capture screen.
      runningMode: 'IMAGE',
      numFaces: 1,
      minFaceDetectionConfidence: .5,
      minFacePresenceConfidence: .5,
    },
  );
}

let stillDelegate = 'GPU';

/** Landmarker for a single photograph. Shares the model and wasm binary with the live one. */
export function getStillFaceLandmarker() {
  stillTaskPromise ||= createStillTask(stillDelegate).catch(() => createStillTask('CPU'));
  return stillTaskPromise;
}

export async function closeStillFaceLandmarker() {
  const current = stillTaskPromise;
  stillTaskPromise = undefined;
  const task = await current?.catch(() => null);
  task?.close();
}

/**
 * The 478 landmarks of the one face in `image`, or null when there is no usable face.
 *
 * Null rather than an empty array so callers cannot accidentally treat "no face" as a face with no
 * features and draw makeup at coordinate zero.
 */
export function detectStill(task, image) {
  const landmarks = task.detect(image)?.faceLandmarks?.[0];
  return landmarks?.length ? landmarks : null;
}

/**
 * Detect on a still image, dropping to the CPU delegate if the GPU one cannot actually run.
 *
 * Creating a GPU task succeeds on machines where WebGL is present but unusable — a blocked or
 * software-only GPU, a VM, WebGL switched off — and the failure only surfaces on the first GL call
 * inside `detect`. A `.catch` around task creation therefore never reaches the CPU delegate; the
 * fallback has to happen after a failed detection, which is what this does.
 */
export async function detectStillAnyDelegate(image) {
  try {
    return detectStill(await getStillFaceLandmarker(), image);
  } catch (error) {
    if (stillDelegate === 'CPU') throw error;
    stillDelegate = 'CPU';
    await closeStillFaceLandmarker();
    return detectStill(await getStillFaceLandmarker(), image);
  }
}

function lightStats(video, canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let total = 0;
  let clipped = 0;
  let dark = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const luma = .2126 * pixels[index] + .7152 * pixels[index + 1] + .0722 * pixels[index + 2];
    total += luma;
    // Counted separately: a dark background used to inflate clippedRatio and be reported as glare.
    if (luma > 243) clipped += 1;
    else if (luma < 12) dark += 1;
  }
  const count = pixels.length / 4;
  return { brightness: total / count, clippedRatio: clipped / count, darkRatio: dark / count };
}

export function observeVideo(task, video, detectCanvas, lightCanvas, previous, timestamp) {
  const startedAt = performance.now();
  detectCanvas.getContext('2d').drawImage(video, 0, 0, detectCanvas.width, detectCanvas.height);
  const result = task.detectForVideo(detectCanvas, timestamp);
  const inferenceMs = performance.now() - startedAt;
  const { brightness, clippedRatio, darkRatio } = lightStats(video, lightCanvas);
  if (!result.faceLandmarks.length) return { faceCount: 0, confidence: 0, brightness, clippedRatio, darkRatio, inferenceMs };
  const points = result.faceLandmarks[0];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  // The pose that gates capture is the raw one, because that is the frame the file will hold
  // and the server re-measures. Smoothing is kept only to judge whether the head is holding
  // still; gating on the smoothed value let borderline poses pass here and fail validation.
  const { yaw, pitch, roll } = poseFromMatrix(result.facialTransformationMatrixes[0]);
  const previousSmooth = previous?.smooth;
  const smooth = {
    yaw: previousSmooth ? previousSmooth.yaw * .75 + yaw * .25 : yaw,
    pitch: previousSmooth ? previousSmooth.pitch * .75 + pitch * .25 : pitch,
    roll: previousSmooth ? previousSmooth.roll * .75 + roll * .25 : roll,
  };
  const blendshapes = Object.fromEntries((result.faceBlendshapes[0]?.categories || []).map((item) => [item.categoryName, item.score]));
  const smile = ((blendshapes.mouthSmileLeft || 0) + (blendshapes.mouthSmileRight || 0)) / 2;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  // Sampled every ~333ms, so a hand-held phone drifts a few degrees between frames by nature.
  const stable = !previousSmooth || (
    Math.hypot(centerX - previous.centerX, centerY - previous.centerY) < .03
    && Math.abs(smooth.yaw - previousSmooth.yaw) < 6
    && Math.abs(smooth.pitch - previousSmooth.pitch) < 6
  );
  return {
    faceCount: result.faceLandmarks.length,
    confidence: 1,
    brightness,
    clippedRatio,
    darkRatio,
    faceBox: { left, right, top, bottom },
    faceHeightRatio: bottom - top,
    centerOffsetX: centerX - .5,
    centerOffsetY: centerY - .5,
    yaw,
    pitch,
    roll,
    smooth,
    smile,
    stable,
    inferenceMs,
    centerX,
    centerY,
  };
}
