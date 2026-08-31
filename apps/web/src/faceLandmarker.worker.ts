import { FaceLandmarker } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "./mediapipe/vision_wasm_module_internal.js?url";
import wasmBinaryPath from "./mediapipe/vision_wasm_module_internal.wasm?url";
import { poseFromMatrix, type FaceObservation, type FrameQuality } from "./scanQuality";
import { type SkinLightingSample } from "./lib/skinCapture";

type WorkerInput =
  | { type: "init" }
  // `lighting` is asked for only by the skin capture screen. Sampling the cheeks costs a
  // second readback per frame, and the three-angle flow measures shape, which does not care
  // which side of the face the window is on — so it stays off by default rather than being
  // computed and thrown away.
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number; lighting?: boolean }
  // A photograph the user picked, measured with the same gate as a live frame. Carries its own id
  // because several slots can be in flight and the answers must not be mixed up.
  | { type: "still"; bitmap: ImageBitmap; requestId: number }
  | { type: "releaseStill" };

let landmarker: FaceLandmarker | null = null;
let stillLandmarker: FaceLandmarker | null = null;
// Remembered across stills: once the GPU delegate has proved unusable, every later slot should go
// straight to CPU rather than repeat the failed detection each time.
let stillDelegate: "GPU" | "CPU" = "GPU";
let qualityCanvas: OffscreenCanvas | null = null;
let lightingCanvas: OffscreenCanvas | null = null;
let lastFrameQuality: FrameQuality = { brightness: 128, sharpness: 12, clippedRatio: 0, darkRatio: 0 };
let frameNumber = 0;

const MODEL_PATH = "/mediapipe/face_landmarker.task";

/**
 * Shared by both landmarkers so they cannot drift apart.
 *
 * `numFaces: 2` is what lets "more than one face" be reported rather than silently measuring
 * whichever face won; the blendshapes carry the smile, and the transformation matrices are the
 * only source of yaw/pitch/roll. A still instance missing any of those could not run the same gate
 * as the live one, which is the entire point of having it.
 */
const LANDMARKER_OPTIONS = {
  runningMode: "VIDEO" as const,
  numFaces: 2,
  minFaceDetectionConfidence: 0.6,
  minFacePresenceConfidence: 0.6,
  minTrackingConfidence: 0.6,
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true,
};

async function createWithFallback(runningMode: "VIDEO" | "IMAGE", delegate: "GPU" | "CPU" = "GPU") {
  const vision = { wasmLoaderPath, wasmBinaryPath };
  const options = {
    ...LANDMARKER_OPTIONS,
    runningMode,
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
  };
  try {
    return await FaceLandmarker.createFromOptions(vision, options);
  } catch {
    return FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
    });
  }
}

/**
 * The still landmarker, built on first use.
 *
 * A second instance rather than reusing the live one, because VIDEO running mode is stateful by
 * design: it keeps the tracked face's region of interest between calls and, once tracking
 * confidence holds, skips the detector and reuses it. Feeding an unrelated photograph through that
 * contaminates it in both directions — the photograph is measured with a prior taken from whoever
 * is in front of the camera, and the next camera frame inherits a prior from the photograph. A
 * dropped frame of jitter is tolerable in a preview; a rejection reason shown to a user, computed
 * partly from someone else's framing, is not.
 *
 * It shares the model file and the wasm binary with the live instance, so the second create is a
 * cache hit rather than another 3.7 MB download.
 */
async function ensureStill() {
  stillLandmarker ??= await createWithFallback("IMAGE", stillDelegate);
  return stillLandmarker;
}

function releaseStill() {
  stillLandmarker?.close();
  stillLandmarker = null;
}

/**
 * Brightness, sharpness and clipping for one image.
 *
 * `persist` exists because the live path reads `lastFrameQuality` on the frames where it skips
 * this work. A still measured while the camera is running would otherwise overwrite that, and the
 * camera's next quality reading would silently be the photograph's.
 */
function analyzeFrame(bitmap: ImageBitmap, persist = true) {
  if (typeof OffscreenCanvas === "undefined") return lastFrameQuality;
  qualityCanvas ??= new OffscreenCanvas(128, 72);
  const context = qualityCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) return lastFrameQuality;
  context.drawImage(bitmap, 0, 0, qualityCanvas.width, qualityCanvas.height);
  const { data } = context.getImageData(0, 0, qualityCanvas.width, qualityCanvas.height);
  let luminanceTotal = 0;
  let edgeTotal = 0;
  let edgeSamples = 0;
  let clipped = 0;
  let dark = 0;
  let previousRow = new Float32Array(qualityCanvas.width);
  for (let y = 0; y < qualityCanvas.height; y += 1) {
    let previous = 0;
    for (let x = 0; x < qualityCanvas.width; x += 1) {
      const offset = (y * qualityCanvas.width + x) * 4;
      const luminance = data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
      const inFaceRegion = x >= 16 && x < qualityCanvas.width - 16 && y >= 5 && y < qualityCanvas.height - 5;
      if (inFaceRegion) luminanceTotal += luminance;
      if (luminance > 243) clipped += 1;
      else if (luminance < 12) dark += 1;
      if (inFaceRegion && x > 16) {
        edgeTotal += Math.abs(luminance - previous);
        edgeSamples += 1;
      }
      if (inFaceRegion && y > 5) {
        edgeTotal += Math.abs(luminance - previousRow[x]);
        edgeSamples += 1;
      }
      previous = luminance;
      previousRow[x] = luminance;
    }
  }
  const quality: FrameQuality = {
    brightness: luminanceTotal / ((qualityCanvas.width - 32) * (qualityCanvas.height - 10)),
    sharpness: edgeTotal / Math.max(edgeSamples, 1),
    clippedRatio: clipped / (qualityCanvas.width * qualityCanvas.height),
    darkRatio: dark / (qualityCanvas.width * qualityCanvas.height),
  };
  if (persist) lastFrameQuality = quality;
  return quality;
}

/**
 * Landmark indices bounding each patch, mirrored from `skin_engine.REGIONS`.
 *
 * Only the four the pre-shutter check needs: two cheeks for the shadow ratio, and forehead and
 * nose so the clipping estimate covers the parts of a face a light actually blows out. The other
 * four regions in Python matter to the measurement, not to whether the light is usable.
 */
const LIGHTING_REGIONS = {
  leftCheek: [117, 118, 101, 36, 205, 187, 123],
  rightCheek: [346, 347, 330, 266, 425, 411, 352],
  forehead: [67, 109, 10, 338, 297, 336, 9, 107],
  nose: [168, 193, 122, 196, 3, 51, 5, 281, 248, 419, 351, 417],
} as const;

const LIGHTING_SIZE = 192;

/**
 * Mean luma and channel means for the patches the lighting check reads.
 *
 * Deliberately a disc around each region's centroid rather than a filled hull. A hull traced
 * through those landmarks would be the more faithful shape, but it also reaches the nasolabial
 * fold and the jaw edge, where a shadow that is anatomy rather than lighting would drag the mean
 * down and report an evenly-lit face as side-lit. The centre of a cheek is flat skin by
 * construction, which is the same reason `skin_engine` chose those indices in the first place.
 *
 * The grey-world mean is taken over the whole frame, matching `_capture_conditions`, which reads
 * it off the image as delivered rather than off the face.
 */
function sampleLighting(bitmap: ImageBitmap, landmarks: { x: number; y: number }[] | null): SkinLightingSample | null {
  if (!landmarks || typeof OffscreenCanvas === "undefined") return null;
  lightingCanvas ??= new OffscreenCanvas(LIGHTING_SIZE, LIGHTING_SIZE);
  const context = lightingCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, LIGHTING_SIZE, LIGHTING_SIZE);
  const { data } = context.getImageData(0, 0, LIGHTING_SIZE, LIGHTING_SIZE);

  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    redTotal += data[offset];
    greenTotal += data[offset + 1];
    blueTotal += data[offset + 2];
  }
  const pixels = data.length / 4;

  // Scaled from face width so the patch covers the same part of a cheek whether the face fills
  // the frame or sits in the middle of it.
  const faceWidth = Math.abs((landmarks[454]?.x ?? 0.7) - (landmarks[234]?.x ?? 0.3));
  const radius = Math.max(2, Math.round(faceWidth * LIGHTING_SIZE * 0.06));

  let clipped = 0;
  let sampled = 0;
  const patch = (indices: readonly number[]) => {
    let sumX = 0;
    let sumY = 0;
    for (const index of indices) {
      sumX += landmarks[index]?.x ?? 0.5;
      sumY += landmarks[index]?.y ?? 0.5;
    }
    const centreX = Math.round((sumX / indices.length) * LIGHTING_SIZE);
    const centreY = Math.round((sumY / indices.length) * LIGHTING_SIZE);
    let luma = 0;
    let count = 0;
    for (let y = centreY - radius; y <= centreY + radius; y += 1) {
      if (y < 0 || y >= LIGHTING_SIZE) continue;
      for (let x = centreX - radius; x <= centreX + radius; x += 1) {
        if (x < 0 || x >= LIGHTING_SIZE) continue;
        const offset = (y * LIGHTING_SIZE + x) * 4;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        luma += red * 0.2126 + green * 0.7152 + blue * 0.0722;
        // Per channel, matching the server's `_clipped_fraction`: a red channel pinned at 255
        // destroys the redness signals while the pixel still looks mid-grey.
        if (red >= 253 || green >= 253 || blue >= 253) clipped += 1;
        sampled += 1;
        count += 1;
      }
    }
    return count ? luma / count : 0;
  };

  const leftCheek = patch(LIGHTING_REGIONS.leftCheek);
  const rightCheek = patch(LIGHTING_REGIONS.rightCheek);
  patch(LIGHTING_REGIONS.forehead);
  patch(LIGHTING_REGIONS.nose);

  return {
    leftCheek,
    rightCheek,
    meanRgb: [redTotal / pixels, greenTotal / pixels, blueTotal / pixels],
    clippedFraction: sampled ? clipped / sampled : 0,
  };
}

/**
 * The landmarks and the derived observation from one detection result.
 *
 * Shared by the live and still paths deliberately. The mapping from blendshape categories to a
 * smile, and from a transformation matrix to yaw/pitch/roll, exists once today; the point of
 * pulling it out here is that it still exists once after the still path was added.
 */
function describeResult(result: ReturnType<FaceLandmarker["detect"]> | undefined) {
  const landmarks = result?.faceLandmarks[0] ?? null;
  const matrix = result?.facialTransformationMatrixes?.[0];
  const pose = poseFromMatrix(matrix);
  const categories = result?.faceBlendshapes?.[0]?.categories ?? [];
  const blendshapes = Object.fromEntries(categories.map((item) => [item.categoryName, item.score]));
  const observation: FaceObservation = {
    ...pose,
    faceCount: result?.faceLandmarks.length ?? 0,
    smile: ((blendshapes.mouthSmileLeft ?? 0) + (blendshapes.mouthSmileRight ?? 0)) / 2,
  };
  return { landmarks, observation };
}

/**
 * Detect on a still, dropping to the CPU delegate if the GPU one cannot actually run.
 *
 * Creating a GPU task succeeds on machines where WebGL is present but unusable — a blocked or
 * software-only GPU, a VM, WebGL switched off — and the failure surfaces only on the first GL call
 * inside `detect`. A catch around task creation therefore never reaches CPU; the fallback has to
 * happen after a failed detection. `lib/liveFace.js` learned this the same way.
 */
async function detectStill(bitmap: ImageBitmap) {
  try {
    return (await ensureStill()).detect(bitmap);
  } catch (error) {
    if (stillDelegate === "CPU") throw error;
    stillDelegate = "CPU";
    releaseStill();
    return (await ensureStill()).detect(bitmap);
  }
}

self.onmessage = async ({ data }: MessageEvent<WorkerInput>) => {
  if (data.type === "init") {
    try {
      landmarker = await createWithFallback("VIDEO");
      self.postMessage({ type: "ready" });
    } catch {
      self.postMessage({ type: "error", message: "Face tracking could not start." });
    }
    return;
  }

  if (data.type === "releaseStill") {
    releaseStill();
    return;
  }

  if (data.type === "still") {
    try {
      // Unconditional, and never persisted: this is the only quality reading the still path gets,
      // and it must not become the camera's.
      const frameQuality = analyzeFrame(data.bitmap, false);
      const result = await detectStill(data.bitmap);
      const { landmarks, observation } = describeResult(result);
      data.bitmap.close();
      self.postMessage({ type: "stillResult", requestId: data.requestId, landmarks, frameQuality, observation });
    } catch {
      data.bitmap.close();
      self.postMessage({ type: "stillResult", requestId: data.requestId, landmarks: null });
    }
    return;
  }

  try {
    frameNumber += 1;
    const frameQuality = frameNumber % 2 === 1 ? analyzeFrame(data.bitmap) : lastFrameQuality;
    const result = landmarker?.detectForVideo(data.bitmap, data.timestamp);
    const { landmarks, observation } = describeResult(result);
    // Before the close: sampling needs both the landmarks and the pixels they point into.
    const lighting = data.lighting ? sampleLighting(data.bitmap, landmarks) : null;
    data.bitmap.close();
    self.postMessage({ type: "result", landmarks, timestamp: data.timestamp, frameQuality, observation, lighting });
  } catch {
    data.bitmap.close();
    self.postMessage({ type: "result", landmarks: null, timestamp: data.timestamp });
  }
};
