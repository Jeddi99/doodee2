// Phase 192n — iOS-safe image download helper.
// `<a download href={dataUrl}>` opens the image in a new tab on iOS
// Safari instead of saving to Photos, leaving users on iPhone unable
// to keep AI previews / saved comparisons. This helper prefers the
// Web Share API (iOS share sheet exposes "Save to Photos") and falls
// back to the classic anchor download for Android / desktop. The
// fetch+blob round-trip is required because `canShare({ files })`
// only accepts File objects, not raw data URLs.

/**
 * Save an image data URL to disk in the most native way the platform
 * supports. On iOS this opens the share sheet (Save to Photos works
 * from there); on Android/desktop it triggers the classic anchor
 * download. User-cancelled share is treated as success — we do NOT
 * fall back to the anchor download because that would dump a file the
 * user just declined.
 */
export async function saveImage(
  dataUrl: string,
  filename: string,
): Promise<void> {
  if (!dataUrl) return;
  let blob: Blob;
  try {
    const res = await fetch(dataUrl);
    blob = await res.blob();
  } catch {
    // Decoding the data URL failed — fall back to the anchor approach
    // pointing at the raw data URL. Same as the pre-helper behavior.
    triggerAnchorDownload(dataUrl, filename);
    return;
  }
  await saveBlob(blob, filename);
}

export async function saveBlob(blob: Blob, filename: string): Promise<void> {

  const file = new File([blob], filename, {
    type: blob.type || "image/png",
  });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      // Treat user-initiated cancellation as success; do NOT fall
      // through to anchor download (that would force a save after
      // the user declined the share sheet). Match on `.name` rather
      // than `instanceof Error` — Safari/WebKit rejects with a
      // DOMException, which is cross-realm and fails `instanceof Error`.
      if (
        typeof e === "object" &&
        e !== null &&
        (e as { name?: unknown }).name === "AbortError"
      )
        return;
      // Phase 192v — Other share errors fall through to anchor download,
      // but on iOS the anchor silently does nothing (opens a tab, no save)
      // so the user loses the image with no feedback. Log so the fall-
      // through is at least diagnosable. (A user-facing toast would need a
      // callback param — out of scope for this surgical fix.)
      console.warn("[saveImage] share failed, falling back to download", e);
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    triggerAnchorDownload(url, filename);
  } finally {
    // Defer revoke so Safari has time to read the URL before we drop
    // it; immediate revoke aborts the download on some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Heuristic iOS detection for surfacing the long-press hint. We
 * deliberately keep this loose — false positives just show an extra
 * helpful line; false negatives leave the save flow working.
 */
export function isLikelyIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports as Mac but exposes touch.
  const isMacTouch =
    /Macintosh/i.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;
  return isMacTouch;
}

function triggerAnchorDownload(href: string, filename: string): void {
  if (typeof document === "undefined") return;
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
