/**
 * Phase 157 — Preview cache.
 *
 * Content-addressed LRU cache for AI surgery previews. We hash the
 * (photo, procedure, intensity, gender) tuple and store the resulting
 * image data URL so repeat requests on the same inputs skip the API
 * call entirely. Quota-aware: trims aggressively on QuotaExceededError
 * so a flooded cache never blocks the UI from saving a fresh result.
 *
 * Also exposes a dev fixture loader (NEXT_PUBLIC_USE_FIXTURE_PREVIEWS=1)
 * for local dev work without burning real API calls. Drop static
 * "before/after" PNGs under /public/fixtures/previews/ and the runtime
 * reads them straight from there.
 */

const STORAGE_KEY = "doodee_preview_cache_v1";
const MAX_ENTRIES = 30;
const TRIM_TO_ENTRIES = 10;
const MAX_ENTRY_BYTES = 300 * 1024;

export interface PreviewResult {
  imageDataUrl: string;
  description?: string;
}

export interface MakeCacheKeyInput {
  photoDataUrl: string;
  procedureKey: string;
  intensity: string;
  gender: string;
}

interface CacheEntry {
  key: string;
  imageDataUrl: string;
  description?: string;
  lastAccessedAt: number;
}

interface CacheBlob {
  entries: CacheEntry[];
}

const EMPTY_BLOB: CacheBlob = { entries: [] };

function readBlob(): CacheBlob {
  if (typeof window === "undefined") return { entries: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { entries: [] };
    const entries = (parsed as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) return { entries: [] };
    return { entries: entries.filter(isValidEntry) };
  } catch {
    return { entries: [] };
  }
}

function isValidEntry(value: unknown): value is CacheEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === "string" &&
    typeof v.imageDataUrl === "string" &&
    typeof v.lastAccessedAt === "number" &&
    (v.description === undefined || typeof v.description === "string")
  );
}

function writeBlob(blob: CacheBlob): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

function trimByLruDesc(entries: readonly CacheEntry[], limit: number): CacheEntry[] {
  return [...entries]
    .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
    .slice(0, limit);
}

function estimateEntrySize(entry: CacheEntry): number {
  return JSON.stringify(entry).length;
}

function getSubtleCrypto(): SubtleCrypto | null {
  if (typeof globalThis === "undefined") return null;
  const g = globalThis as { crypto?: { subtle?: SubtleCrypto } };
  return g.crypto?.subtle ?? null;
}

function bufferToHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < view.length; i++) {
    const byte = view[i] ?? 0;
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

function fallbackHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ ch, 2246822507) >>> 0;
  }
  return `fb${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

function shortPhotoFingerprint(dataUrl: string): string {
  if (dataUrl.length <= 256) return dataUrl;
  const head = dataUrl.slice(0, 128);
  const tail = dataUrl.slice(-128);
  return `${head}|len=${dataUrl.length}|${tail}`;
}

export async function makeCacheKey(input: MakeCacheKeyInput): Promise<string> {
  const composed = `${shortPhotoFingerprint(input.photoDataUrl)}|${input.procedureKey}|${input.intensity}|${input.gender}`;
  const subtle = getSubtleCrypto();
  if (!subtle) return fallbackHash(composed);
  try {
    const data = new TextEncoder().encode(composed);
    const hash = await subtle.digest("SHA-256", data);
    return bufferToHex(hash);
  } catch {
    return fallbackHash(composed);
  }
}

export async function lookupPreview(
  key: string
): Promise<PreviewResult | null> {
  if (typeof window === "undefined") return null;
  const blob = readBlob();
  const idx = blob.entries.findIndex((e) => e.key === key);
  if (idx < 0) return null;
  const entry = blob.entries[idx];
  if (!entry) return null;
  const updated: CacheEntry = { ...entry, lastAccessedAt: Date.now() };
  const nextEntries = [...blob.entries];
  nextEntries[idx] = updated;
  try {
    writeBlob({ entries: nextEntries });
  } catch {
    // Refresh-of-lastAccessedAt is best-effort; never block the hit.
  }
  const result: PreviewResult = { imageDataUrl: updated.imageDataUrl };
  if (updated.description) result.description = updated.description;
  return result;
}

export async function storePreview(
  key: string,
  result: PreviewResult
): Promise<void> {
  if (typeof window === "undefined") return;
  const entry: CacheEntry = {
    key,
    imageDataUrl: result.imageDataUrl,
    lastAccessedAt: Date.now(),
    ...(result.description ? { description: result.description } : {}),
  };
  if (estimateEntrySize(entry) > MAX_ENTRY_BYTES) return;
  const blob = readBlob();
  const deduped = blob.entries.filter((e) => e.key !== entry.key);
  deduped.push(entry);
  let trimmed =
    deduped.length > MAX_ENTRIES
      ? trimByLruDesc(deduped, MAX_ENTRIES)
      : deduped;
  try {
    writeBlob({ entries: trimmed });
    return;
  } catch (err) {
    if (!isQuotaError(err)) return;
    trimmed = trimByLruDesc(deduped, TRIM_TO_ENTRIES);
    try {
      writeBlob({ entries: trimmed });
    } catch {
      // Storage is unusable — drop the cache entry entirely.
    }
  }
}

export function clearPreviewCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getPreviewCacheSize(): number {
  return readBlob().entries.length;
}

export function shouldUseFixturePreviews(): boolean {
  if (typeof process === "undefined") return false;
  return import.meta.env.VITE_USE_FIXTURE_PREVIEWS === "1";
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("read-failed"));
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") resolve(result);
        else reject(new Error("read-failed"));
      };
      reader.readAsDataURL(blob);
    });
  }
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return `data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`;
}

export async function loadFixturePreview(
  procedureKey: string,
  intensity: string
): Promise<PreviewResult | null> {
  if (typeof fetch === "undefined") return null;
  const safeKey = procedureKey.replace(/[^a-z0-9_-]/gi, "");
  const safeIntensity = intensity.replace(/[^a-z0-9_-]/gi, "");
  if (!safeKey || !safeIntensity) return null;
  const url = `/fixtures/previews/${safeKey}_${safeIntensity}.jpg`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const imageDataUrl = await blobToDataUrl(blob);
    return { imageDataUrl, description: `Fixture preview for ${procedureKey} (${intensity})` };
  } catch {
    return null;
  }
}
