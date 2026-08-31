/**
 * Phase 135 — saved procedure previews.
 *
 * Keeps a small ring-buffer of generated previews in localStorage so a
 * user can revisit results without burning another generation request.
 *
 * Storage shape: array of records keyed by timestamp, capped at
 * MAX_PREVIEWS most recent. Each record carries the data: URL for the
 * generated image plus the procedure metadata + intensity at gen time.
 */

import type { ProcedureKey } from "./ai-gemini-image";
import type { ProcedureVariantId } from "./procedure-variant-options";

export interface SavedPreviewVariant {
  id: ProcedureVariantId;
  afterDataUrl: string;
  label_th?: string;
  label_en?: string;
}

interface SavedPreviewBase {
  /** Stable id (timestamp-based) for delete/select. */
  id: string;
  /** When the preview was generated (Date.now()). */
  timestamp: number;
  /** Procedure that was previewed. */
  procedureKey: ProcedureKey;
  /** Intensity at gen time ("mild" | "normal" | "strong"). */
  intensity: "mild" | "normal" | "strong";
  /** Optional combo — when more than one procedure was merged into one image. */
  comboKeys?: ProcedureKey[];
  /** The original "before" photo, as data: URL. Lets the user see B/A
   *  even after they've left the surgery flow. */
  beforeDataUrl: string;
  /** Optional descriptive text returned by the model. */
  description?: string;
}

type SavedPreviewImages =
  | {
      /** Legacy single-image record. */
      afterDataUrl: string;
      variants?: SavedPreviewVariant[];
    }
  | {
      /** One paid generation preserved as its complete A-D result set. */
      variants: SavedPreviewVariant[];
      afterDataUrl?: string;
    };

export type SavedPreview = SavedPreviewBase & SavedPreviewImages;
export type SavedPreviewInput = Omit<SavedPreviewBase, "id"> & SavedPreviewImages;

const KEY = "doodee:procedure-previews";
const MAX_PREVIEWS = 10;

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Phase 192o — Cache parsed previews. Each item carries before+after
// data URLs (~200-400 KB each), so reparsing 12 items is a multi-MB
// JSON.parse on every navigation. Raw-string compare keeps the cache
// honest across test resets + cross-tab edits.
let cachedRaw: string | null = null;
let cachedPreviews: SavedPreview[] = [];

function invalidateCache(): void {
  cachedRaw = null;
  cachedPreviews = [];
}

export function loadSavedPreviews(): SavedPreview[] {
  const ls = safeLocalStorage();
  if (!ls) return [];
  const raw = ls.getItem(KEY);
  if (raw === null) {
    if (cachedRaw !== null) invalidateCache();
    return [];
  }
  if (raw === cachedRaw) return cachedPreviews;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      cachedRaw = raw;
      cachedPreviews = [];
      return cachedPreviews;
    }
    cachedPreviews = parsed.filter(isValidPreview).slice(0, MAX_PREVIEWS);
    cachedRaw = raw;
    return cachedPreviews;
  } catch {
    cachedRaw = raw;
    cachedPreviews = [];
    return cachedPreviews;
  }
}

function isValidPreview(p: unknown): p is SavedPreview {
  if (!p || typeof p !== "object") return false;
  const r = p as Record<string, unknown>;
  const hasLegacyAfter = isImageDataUrl(r.afterDataUrl);
  const variantsAreValid =
    r.variants === undefined || isValidVariantSet(r.variants);
  const hasVariantSet =
    Array.isArray(r.variants) && r.variants.length > 0 && variantsAreValid;
  return (
    typeof r.id === "string" &&
    typeof r.timestamp === "number" &&
    typeof r.procedureKey === "string" &&
    typeof r.beforeDataUrl === "string" &&
    r.beforeDataUrl.startsWith("data:image/") &&
    variantsAreValid &&
    (hasLegacyAfter || hasVariantSet)
  );
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/");
}

function isValidVariantSet(value: unknown): value is SavedPreviewVariant[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) return false;
  const ids = new Set<ProcedureVariantId>();
  for (const item of value) {
    if (!item || typeof item !== "object") return false;
    const variant = item as Record<string, unknown>;
    if (!isVariantId(variant.id) || ids.has(variant.id)) return false;
    if (!isImageDataUrl(variant.afterDataUrl)) return false;
    if (variant.label_th !== undefined && typeof variant.label_th !== "string") return false;
    if (variant.label_en !== undefined && typeof variant.label_en !== "string") return false;
    ids.add(variant.id);
  }
  return true;
}

function isVariantId(value: unknown): value is ProcedureVariantId {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

function persist(records: SavedPreview[]): boolean {
  const ls = safeLocalStorage();
  if (!ls) return false;
  if (records.length === 0) {
    try {
      ls.setItem(KEY, "[]");
      invalidateCache();
      return true;
    } catch {
      return false;
    }
  }
  for (let keep = records.length; keep >= 1; keep -= 1) {
    try {
      ls.setItem(KEY, JSON.stringify(records.slice(0, keep)));
      invalidateCache();
      return true;
    } catch {
      // Preserve the newest complete generation and discard one older record.
    }
  }
  return false;
}

export function savePreview(input: SavedPreviewInput): SavedPreview | null {
  const record: SavedPreview = {
    id: `preview-${input.timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    ...input,
  };
  const existing = loadSavedPreviews();
  // Most-recent-first ordering, capped at MAX_PREVIEWS.
  const next = [record, ...existing].slice(0, MAX_PREVIEWS);
  return persist(next) ? record : null;
}

export function deleteSavedPreview(id: string): SavedPreview[] {
  const next = loadSavedPreviews().filter((p) => p.id !== id);
  persist(next);
  return next;
}

export function clearSavedPreviews(): void {
  const ls = safeLocalStorage();
  if (!ls) {
    invalidateCache();
    return;
  }
  try {
    ls.removeItem(KEY);
    invalidateCache();
  } catch {
    /* no-op */
  }
}

export const PROCEDURE_PREVIEW_MAX = MAX_PREVIEWS;
