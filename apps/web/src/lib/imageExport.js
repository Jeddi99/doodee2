/**
 * The decisions behind handing a rendered image to the user as a file.
 *
 * The mechanics live at the call sites — `new Image()`, `drawImage`, `toBlob`, a synthetic
 * `<a download>` — for the reason `captureImage.ts` states about itself: none of that runs under
 * `node --test`, so putting it here would only move untested lines into a file that looks tested.
 * What is here is the part that goes wrong silently and cannot be spotted by looking at the
 * screen: how large the exported file is, what it is called once it lands in a downloads folder,
 * and which sentence a failure has earned.
 *
 * Its own module, with no imports, for the same reason `simulationError.js` is.
 */

/**
 * Longest edge of an exported file.
 *
 * The export is taken at the source image's own resolution rather than the size of the box it is
 * being displayed in — a 320 px canvas screenshot of a face is not a file anybody wants — and
 * this is the ceiling on that. Two thousand keeps a phone photograph intact while refusing to
 * turn a 6000 px DSLR frame into a 40 MB PNG the browser has to hold in memory twice.
 */
export const EXPORT_MAX_SIDE = 2000;

/**
 * The pixel size to export at: the image's own, capped, never magnified.
 *
 * `Math.min(1, …)` is the half that matters. Scaling *up* to the cap would hand the user a
 * blurred enlargement of a small render and call it a higher-resolution file.
 */
export function exportSize(naturalWidth, naturalHeight) {
  // Both edges, not just the longer one: an image reporting a height and no width is not an
  // image, and letting it through produces a one-pixel-wide canvas rather than an obvious refusal.
  const width = Number(naturalWidth) || 0;
  const height = Number(naturalHeight) || 0;
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, EXPORT_MAX_SIDE / Math.max(width, height));
  // Floored at one pixel: an extreme aspect ratio rounds the short edge to zero, and a canvas
  // with a zero edge encodes to nothing at all.
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * What the file is called once it is on the user's device.
 *
 * Dated, because a downloads folder is where these end up next to each other: without the date a
 * second front-view export is "doodee-simulation-front (1).png", which says nothing about which
 * of the two is the newer one. `label` is the angle, or the region in reference mode, so the
 * three angles of one face do not collide either.
 *
 * The label is reduced to the characters a filename can safely carry on every platform rather
 * than trusted: it comes from a catalog id, and a slash or a colon in one would silently produce
 * a file in an unexpected place or a download that fails outright.
 */
export function simulationFileName(label, date = new Date()) {
  const slug = String(label ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return `doodee-simulation${slug ? `-${slug}` : ''}-${day}.png`;
}

/**
 * Why the download did not happen, in the language on screen.
 *
 * Three distinguishable causes, because the remedy differs for each and "download failed" sends
 * a person looking in the wrong place for all three:
 *
 * * `source` — the picture could not be fetched again, even after asking the server for a fresh
 *   link. The image on screen was loaded while its link was still valid, so it is still there to
 *   look at; only the file is unavailable.
 * * `blocked` — the canvas is tainted, so `toBlob` refuses. That is a storage CORS setting
 *   somebody can fix, not something the user did, and naming it is what makes it fixable. The
 *   wording is the one `TryOnView.downloadLook` already uses for the same failure.
 * * `encode` — the browser produced no PNG from a canvas it accepted. Nothing to advise beyond
 *   trying again.
 */
export function exportFailureText(reason, isTh) {
  if (reason === 'blocked') {
    return isTh
      ? 'ดาวน์โหลดไม่ได้เพราะที่เก็บภาพไม่อนุญาตให้อ่านภาพข้ามโดเมน (CORS) — ภาพบนหน้าจอยังใช้ดูได้ปกติ'
      : 'Download blocked: the image host does not allow cross-origin reads (CORS). The on-screen preview still works.';
  }
  if (reason === 'source') {
    return isTh
      ? 'ดาวน์โหลดไม่สำเร็จ โหลดไฟล์ภาพต้นทางไม่ได้ — ลองสร้างภาพใหม่อีกครั้ง ภาพบนหน้าจอยังดูได้ปกติ'
      : 'The image file could not be fetched. Render it again — the picture on screen still works.';
  }
  return isTh ? 'บันทึกภาพไม่สำเร็จ ลองอีกครั้ง' : 'The image could not be saved. Try again.';
}
