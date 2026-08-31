import type { MakeoverLook } from "./makeover";
import { HAIR_COLORS } from "./hair-recolor";
import { EYE_COLORS } from "./eye-color-recolor";
import { BLUSH_COLORS } from "./blush-recolor";
import { LIPSTICK_COLORS } from "./lip-recolor";

/**
 * Phase 69 — user-saved custom looks for the try-on hub.
 *
 * Lets a user save the current `MakeoverLook` with a memorable name,
 * persisted in localStorage, and recall it later from the same Looks
 * strip that surfaces curated presets. Saved looks live alongside
 * the curated ones, but the user can delete their own.
 *
 * Schema is independent of `tryon-presets.ts`: saved looks store the
 * color KEYS (not full records) so the structure stays serializable.
 * Resolution back to `MakeoverLook` happens at recall time, mirroring
 * the preset module.
 *
 * Storage key: `doodee:tryon:saved`
 * Cap: 12 looks. Past that, the oldest gets evicted on save.
 * Schema rev `v: 1` with graceful fallback to empty on bad data.
 */
const STORAGE_KEY = "doodee:tryon:saved";
const MAX_SAVED = 12;

export interface SavedLook {
  id: string;
  name: string;
  createdAt: number;
  hair?: { key: string; intensity: number };
  eyes?: { key: string; intensity: number };
  blush?: { key: string; intensity: number };
  lips?: { key: string; intensity: number };
}

interface PersistedShape {
  v: 1;
  looks: SavedLook[];
}

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isValidLook(x: unknown): x is SavedLook {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.length === 0) return false;
  if (typeof r.name !== "string") return false;
  if (typeof r.createdAt !== "number") return false;
  return true;
}

export function loadSavedLooks(): SavedLook[] {
  const ls = safeLocalStorage();
  if (!ls) return [];
  const raw = ls.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PersistedShape;
    if (parsed.v !== 1 || !Array.isArray(parsed.looks)) return [];
    return parsed.looks
      .filter(isValidLook)
      .map(normalizeSavedLook)
      .slice(0, MAX_SAVED);
  } catch {
    return [];
  }
}

function normalizeSavedLook(saved: SavedLook): SavedLook {
  return {
    id: saved.id,
    name: saved.name,
    createdAt: saved.createdAt,
    ...(saved.hair ? { hair: saved.hair } : {}),
    ...(saved.eyes ? { eyes: saved.eyes } : {}),
    ...(saved.blush ? { blush: saved.blush } : {}),
    ...(saved.lips ? { lips: saved.lips } : {}),
  };
}

function persist(looks: SavedLook[]): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    const payload: PersistedShape = { v: 1, looks: looks.slice(0, MAX_SAVED) };
    ls.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota / disabled — silently skip
  }
}

function makeId(): string {
  // Combination of timestamp + random for collision-resistance — we
  // don't need crypto-grade uniqueness, just enough that two clicks
  // within the same millisecond can't collide.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Save the current `MakeoverLook` as a named saved look. Inserts at
 * the front of the list (most recent first). Returns the updated list.
 *
 * Returns `null` if the look is empty (no effects set) — callers
 * should guard their UI accordingly.
 */
export function saveLook(name: string, look: MakeoverLook): SavedLook[] | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (!look.hair && !look.eyes && !look.blush && !look.lips) return null;

  const next: SavedLook = {
    id: makeId(),
    name: trimmed.slice(0, 40),
    createdAt: Date.now(),
    ...(look.hair
      ? { hair: { key: look.hair.color.key, intensity: look.hair.intensity } }
      : {}),
    ...(look.eyes
      ? { eyes: { key: look.eyes.color.key, intensity: look.eyes.intensity } }
      : {}),
    ...(look.blush
      ? { blush: { key: look.blush.color.key, intensity: look.blush.intensity } }
      : {}),
    ...(look.lips
      ? { lips: { key: look.lips.color.key, intensity: look.lips.intensity } }
      : {}),
  };

  const existing = loadSavedLooks();
  const updated = [next, ...existing].slice(0, MAX_SAVED);
  persist(updated);
  return updated;
}

/**
 * Delete a saved look by id. Returns the updated list. If the id
 * doesn't exist, the list is unchanged (and no write occurs).
 */
export function deleteSavedLook(id: string): SavedLook[] {
  const existing = loadSavedLooks();
  const updated = existing.filter((l) => l.id !== id);
  if (updated.length !== existing.length) {
    persist(updated);
  }
  return updated;
}

/**
 * Phase 94 — Import an array of saved looks from a JSON payload
 * (e.g., loaded from a user's exported file). Merges with existing
 * looks, dedupes by `id`, and respects the global cap.
 *
 * Returns `{ added, skipped }` summary so the caller can show a toast.
 * Returns `null` if the payload is malformed.
 */
export function importSavedLooks(
  raw: unknown
): { added: number; skipped: number; total: number } | null {
  let candidates: SavedLook[] = [];
  // Accept either bare array or our { v: 1, looks: [...] } envelope.
  if (Array.isArray(raw)) {
    candidates = raw.filter(isValidLook);
  } else if (typeof raw === "object" && raw !== null) {
    const r = raw as { v?: unknown; looks?: unknown };
    if (r.v !== 1 || !Array.isArray(r.looks)) return null;
    candidates = r.looks.filter(isValidLook);
  } else {
    return null;
  }

  if (candidates.length === 0) {
    return { added: 0, skipped: 0, total: loadSavedLooks().length };
  }

  const existing = loadSavedLooks();
  const existingIds = new Set(existing.map((l) => l.id));
  const newOnes = candidates.filter((c) => !existingIds.has(c.id));
  const dedupedSkipped = candidates.length - newOnes.length;

  // Imported looks go to the back (older perceived recency); user's
  // current MRU order stays at the front. The cap is applied before we
  // count `added` so the user isn't told "5 added" when only 2 actually
  // landed in storage.
  const merged = [...existing, ...newOnes].slice(0, MAX_SAVED);
  const actuallyAdded = merged.length - existing.length;
  const capSkipped = newOnes.length - actuallyAdded;
  persist(merged);
  return {
    added: actuallyAdded,
    skipped: dedupedSkipped + capSkipped,
    total: merged.length,
  };
}

/** Wipe every saved look. */
export function clearSavedLooks(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Resolve a saved look's color keys back to full `MakeoverLook`
 * records. Effects whose keys are missing from the current palette
 * are silently dropped (forward-compat in case a future revision
 * renames a swatch).
 */
export function resolveSavedLook(saved: SavedLook): MakeoverLook {
  const out: MakeoverLook = {};
  if (saved.hair) {
    const c = HAIR_COLORS.find((x) => x.key === saved.hair!.key);
    if (c) out.hair = { color: c, intensity: saved.hair.intensity };
  }
  if (saved.eyes) {
    const c = EYE_COLORS.find((x) => x.key === saved.eyes!.key);
    if (c) out.eyes = { color: c, intensity: saved.eyes.intensity };
  }
  if (saved.blush) {
    const c = BLUSH_COLORS.find((x) => x.key === saved.blush!.key);
    if (c) out.blush = { color: c, intensity: saved.blush.intensity };
  }
  if (saved.lips) {
    const c = LIPSTICK_COLORS.find((x) => x.key === saved.lips!.key);
    if (c) out.lips = { color: c, intensity: saved.lips.intensity };
  }
  return out;
}

/**
 * Compact RGB-strip strings (one per set effect) for the Looks chip.
 * Order: [hair, eyes, blush, lips], skipping unset effects.
 */
export function savedLookSwatchStrip(saved: SavedLook): string[] {
  const out: string[] = [];
  if (saved.hair) {
    const c = HAIR_COLORS.find((x) => x.key === saved.hair!.key);
    if (c) out.push(`rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`);
  }
  if (saved.eyes) {
    const c = EYE_COLORS.find((x) => x.key === saved.eyes!.key);
    if (c) out.push(`rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`);
  }
  if (saved.blush) {
    const c = BLUSH_COLORS.find((x) => x.key === saved.blush!.key);
    if (c) out.push(`rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`);
  }
  if (saved.lips) {
    const c = LIPSTICK_COLORS.find((x) => x.key === saved.lips!.key);
    if (c) out.push(`rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`);
  }
  return out;
}

export const SAVED_LOOKS_MAX = MAX_SAVED;
