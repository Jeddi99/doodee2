import { FaceLandmarker } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "./mediapipe/vision_wasm_module_internal.js?url";
import wasmBinaryPath from "./mediapipe/vision_wasm_module_internal.wasm?url";
import { poseFromMatrix, type FaceObservation, type FrameQuality } from "./scanQuality";

type WorkerInput =
  | { type: "init" }
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number };

let landmarker: FaceLandmarker | null = null;
let qualityCanvas: OffscreenCanvas | null = null;
let lastFrameQuality: FrameQuality = { brightness: 128, sharpness: 12, clippedRatio: 0, darkRatio: 0 };
let frameNumber = 0;

function analyzeFrame(bitmap: ImageBitmap) {
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
  lastFrameQuality = {
    brightness: luminanceTotal / ((qualityCanvas.width - 32) * (qualityCanvas.height - 10)),
    sharpness: edgeTotal / Math.max(edgeSamples, 1),
    clippedRatio: clipped / (qualityCanvas.width * qualityCanvas.height),
    darkRatio: dark / (qualityCanvas.width * qualityCanvas.height),
  };
  return lastFrameQuality;
}

async function createLandmarker() {
  const vision = { wasmLoaderPath, wasmBinaryPath };
  const options = {
    baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "GPU" as const },
    runningMode: "VIDEO" as const,
    numFaces: 2,
    minFaceDetectionConfidence: 0.6,
    minFacePresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  };
  try {
    return await FaceLandmarker.createFromOptions(vision, options);
  } catch {
    return FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "CPU" },
    });
  }
}

self.onmessage = async ({ data }: MessageEvent<WorkerInput>) => {
  if (data.type === "init") {
    try {
      landmarker = await createLandmarker();
      self.postMessage({ type: "ready" });
    } catch {
      self.postMessage({ type: "error", message: "Face tracking could not start." });
    }
    return;
  }

  try {
    frameNumber += 1;
    const frameQuality = frameNumber % 2 === 1 ? analyzeFrame(data.bitmap) : lastFrameQuality;
    const result = landmarker?.detectForVideo(data.bitmap, data.timestamp);
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
    data.bitmap.close();
    self.postMessage({ type: "result", landmarks, timestamp: data.timestamp, frameQuality, observation });
  } catch {
    data.bitmap.close();
    self.postMessage({ type: "result", landmarks: null, timestamp: data.timestamp });
  }
};
