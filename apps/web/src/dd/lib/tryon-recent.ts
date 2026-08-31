import type { EffectKey } from "./makeover";

type ColorEffectKey = "hair" | "eyes" | "blush" | "lips";

/**
 * Phase 64 — recently-used colors memory for the try-on hub.
 *
 * Stores up to 3 most-recently-selected color keys per effect, in
 * order of use. Click a swatch → its key bubbles to the front.
 * Persisted in `localStorage` so the memory survives page reloads.
 *
 * Schema:
 *   {
 *     v: 1,
 *     hair:  ["jet-black", "burgundy", "auburn"],
 *     eyes:  ["green", "sky"],
 *     blush: ["rose"],
 *     lips:  ["classic-red", "berry", "nude-rose"],
 *   }
 *
 * No timestamps — the array order IS the recency. Most recent at index 0.
 */
const STORAGE_KEY = "doodee:tryon:recent";
const MAX_PER_EFFECT = 3;

export type RecentColors = Partial<Record<EffectKey, string[]>>;

interface PersistedShape {
  v: 1;
  hair?: string[];
  eyes?: string[];
  blush?: string[];
  lips?: string[];
}

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Read the current recent-colors record. Returns an empty object on
 * any failure (missing key, bad JSON, schema mismatch).
 */
export function loadRecentColors(): RecentColors {
  const ls = safeLocalStorage();
  if (!ls) return {};
  const raw = ls.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as PersistedShape;
    if (parsed.v !== 1) return {};
    const out: RecentColors = {};
    const colorEffects: ColorEffectKey[] = ["hair", "eyes", "blush", "lips"];
    for (const key of colorEffects) {
      const arr = parsed[key];
      if (Array.isArray(arr)) {
        out[key] = arr.filter((x): x is string => typeof x === "string").slice(0, MAX_PER_EFFECT);
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Record a color selection. Moves the key to the front of its effect's
 * list (or inserts it). Caps the list at `MAX_PER_EFFECT` entries.
 *
 * Returns the updated record so callers can update state without
 * re-reading from disk.
 */
export function recordColorUse(
  effect: ColorEffectKey,
  colorKey: string
): RecentColors {
  const current = loadRecentColors();
  const list = current[effect] ?? [];
  const next = [colorKey, ...list.filter((k) => k !== colorKey)].slice(0, MAX_PER_EFFECT);
  const updated: RecentColors = { ...current, [effect]: next };

  const ls = safeLocalStorage();
  if (ls) {
    try {
      const persisted: PersistedShape = { v: 1, ...updated };
      ls.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // quota / disabled — silently skip
    }
  }
  return updated;
}

/** Clear all recent-colors memory. Used by settings page if added later. */
export function clearRecentColors(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
