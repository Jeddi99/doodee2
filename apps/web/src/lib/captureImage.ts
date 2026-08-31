/**
 * Turning a source of pixels — a live `<video>` frame or a file the user picked — into the one
 * shape the rest of the scan understands: a face-cropped JPEG data URL, longest edge at most
 * 1600.
 *
 * `cropToJpeg` is the body that used to live inside `ScanPage.captureFrame`, with the `<video>`
 * swapped for a parameter. That substitution is the whole reason an uploaded photograph needs no
 * new plumbing anywhere downstream: once it has been through here it is indistinguishable from a
 * captured frame, so `captures`, the thumbnails, `dataUrlToFile` and `uploadScan` all keep
 * working without knowing a file picker exists.
 *
 * Everything here touches canvas or `createImageBitmap`, so none of it runs under `node --test`.
 * The arithmetic worth testing was deliberately left in `scanQuality.ts` (`faceCropRect`,
 * `stillFramingCode`), which stays pure.
 */

import type { FaceBox, QualityCode } from "../scanQuality";
import { faceCropRect } from "../scanQuality";

/** Longest edge of a submitted image. Matches what live capture has always produced. */
export const MAX_SUBMIT_EDGE = 1600;
/**
 * Longest edge handed to the landmarker.
 *
 * The live path stretches every frame into a fixed 512x384, which is harmless for a 4:3 video and
 * would be a bug here: squashing a 3024x4032 portrait into a 4:3 box tilts apparent roll and
 * destroys yaw, so a good photograph would be rejected for its pose. This caps the long edge and
 * leaves the aspect alone.
 */
export const MAX_DETECT_EDGE = 512;

/** Server-side ceiling, restated so a 40 MB file is refused before it is decoded. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Draw `source` cropped around `box` and encode it as a JPEG data URL.
 *
 * The scale factor is capped at 1, so a crop is only ever shrunk — a small face yields a small
 * image rather than an upscaled mushy one.
 */
export function cropToJpeg(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  box: FaceBox | null,
): string {
  const crop = faceCropRect(box, sourceWidth, sourceHeight);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, MAX_SUBMIT_EDGE / Math.max(crop.width, crop.height));
  canvas.width = Math.round(crop.width * scale);
  canvas.height = Math.round(crop.height * scale);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return "";
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.94);
}

/**
 * Decode a picked file into an upright bitmap.
 *
 * `imageOrientation: "from-image"` is what applies the EXIF orientation tag, and it is not
 * optional politeness: a phone holds a portrait photograph as landscape pixels plus a tag, so
 * without it every photo from a phone arrives on its side. The server cannot rescue this — OpenCV
 * `imdecode` ignores orientation tags entirely — so an unrotated upload reaches the engine as a
 * face at roll ~90 and is hard-rejected with `pose_front:roll:-90`.
 *
 * There is no way to feature-detect the option: unknown keys in `ImageBitmapOptions` are dropped
 * silently rather than throwing. Rather than ship a hand-built probe image, `describeRoll` below
 * catches the symptom — a sideways face — and says so plainly, which is worth having anyway for
 * photographs that really were taken sideways.
 */
export async function decodeOriented(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

/** Shrink to `maxEdge` on the longest side, preserving aspect. Returns the input if already small. */
export async function fitBitmap(bitmap: ImageBitmap, maxEdge: number): Promise<ImageBitmap> {
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= maxEdge) return bitmap;
  const scale = maxEdge / longest;
  return createImageBitmap(bitmap, {
    resizeWidth: Math.max(1, Math.round(bitmap.width * scale)),
    resizeHeight: Math.max(1, Math.round(bitmap.height * scale)),
    resizeQuality: "high",
  });
}

/** Decode a data URL back into a bitmap, so the crop can be measured as it will be submitted. */
export async function bitmapFromDataUrl(dataUrl: string): Promise<ImageBitmap> {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

const HEIC_PATTERN = /\.(heic|heif)$/i;

/**
 * Why a file could not be decoded, as something a person can act on.
 *
 * HEIC is the case worth naming: it is the iPhone default, Chrome and Firefox refuse it outright,
 * and the fix is a settings change the user can actually make. Telling them "no face found" about
 * a file the browser never opened sends them looking for the wrong problem.
 *
 * No decoder is shipped for it. `libheif`-wasm is one to three megabytes on a page already
 * carrying a 3.7 MB face model, to serve a case where the honest answer is a two-tap fix at the
 * source. iOS Safari transcodes HEIC to JPEG on its way out of the photo library anyway — this
 * only fires for a file picked through Files.
 */
export function classifyDecodeFailure(file: File): QualityCode {
  if (file.size > MAX_FILE_BYTES) return "file_too_large";
  if (file.type === "image/heic" || file.type === "image/heif" || HEIC_PATTERN.test(file.name)) {
    return "unsupported_heic";
  }
  return "unreadable_image";
}

/**
 * A face lying on its side, distinct from a head tilted a little.
 *
 * `measurePose` already rejects any roll past 10 degrees, but "keep your head level" is useless
 * advice about a file. Past 60 degrees the photograph is rotated rather than the person, whether
 * because an orientation tag went unapplied or because it was genuinely shot sideways, and saying
 * so is the difference between a fix the user can make and a dead end.
 */
export const SIDEWAYS_ROLL_DEGREES = 60;

export function isSideways(roll: number): boolean {
  return Math.abs(roll) > SIDEWAYS_ROLL_DEGREES;
}

/**
 * A captured data URL as a `File`, which is what the signed-URL upload wants.
 *
 * Lived in `ScanPage` until the skin capture screen needed the same three lines. Here rather
 * than duplicated because the filename convention (`{view}.jpg`) is part of the upload contract
 * and two copies of a contract drift.
 */
export async function dataUrlToFile(dataUrl: string, view: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], `${view}.jpg`, { type: "image/jpeg" });
}
