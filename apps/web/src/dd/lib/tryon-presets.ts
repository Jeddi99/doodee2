import { HAIR_COLORS, type HairColor } from "./hair-recolor";
import { EYE_COLORS, type EyeColor } from "./eye-color-recolor";
import { BLUSH_COLORS, type BlushColor } from "./blush-recolor";
import { LIPSTICK_COLORS, type LipstickColor } from "./lip-recolor";
import type { MakeoverLook } from "./makeover";

/**
 * Phase 65 — curated try-on presets.
 *
 * Each preset is a partial look (any subset of hair/eyes/blush/lips)
 * stored by color KEY so the data file stays serializable. Resolved
 * to full `MakeoverLook` records at apply-time via `resolvePreset`.
 *
 * Intensities are tuned for each preset rather than using the global
 * defaults, since "Bold evening" wants stronger lips than "Natural".
 */
export interface TryOnPreset {
  key: string;
  name: { en: string; th: string };
  hair?: { key: string; intensity: number };
  eyes?: { key: string; intensity: number };
  blush?: { key: string; intensity: number };
  lips?: { key: string; intensity: number };
}

// Phase 144 — final realism pull-back. Hair recolor now uses HSL swap
// instead of "scale-target-by-luminance", which means it actually
// shifts hue + saturation while keeping the strand luminance profile
// intact. That carries a lot of the visual lift on its own, so preset
// intensities drop another ~10-15% to land on "subtle dye job" rather
// than "instagram filter". Lips also dropped — 95/5 L-preservation
// means even 0.5 reads as worn satin.
export const TRYON_PRESETS: readonly TryOnPreset[] = [
  {
    key: "natural",
    name: { en: "Natural", th: "ธรรมชาติ" },
    hair: { key: "brown", intensity: 0.38 },
    blush: { key: "soft-pink", intensity: 0.28 },
    lips: { key: "nude-rose", intensity: 0.42 },
  },
  {
    key: "warm-autumn",
    name: { en: "Warm autumn", th: "ใบไม้ร่วง" },
    hair: { key: "caramel", intensity: 0.58 },
    eyes: { key: "hazel", intensity: 0.48 },
    blush: { key: "warm-nude", intensity: 0.38 },
    lips: { key: "cocoa", intensity: 0.55 },
  },
  {
    key: "soft-pink",
    name: { en: "Soft pink", th: "ชมพูนุ่ม" },
    blush: { key: "rose", intensity: 0.38 },
    lips: { key: "rose-pink", intensity: 0.52 },
  },
  {
    key: "k-beauty",
    name: { en: "K-beauty", th: "เกาหลีใส" },
    hair: { key: "dark-brown", intensity: 0.5 },
    blush: { key: "peach", intensity: 0.38 },
    lips: { key: "coral-peach", intensity: 0.52 },
  },
  {
    key: "bold-evening",
    name: { en: "Bold evening", th: "ออกงานคืน" },
    hair: { key: "jet-black", intensity: 0.68 },
    eyes: { key: "emerald", intensity: 0.55 },
    blush: { key: "berry", intensity: 0.42 },
    lips: { key: "classic-red", intensity: 0.65 },
  },
  {
    key: "editorial",
    name: { en: "Editorial", th: "เอดิทอเรียล" },
    hair: { key: "platinum", intensity: 0.68 },
    eyes: { key: "blue", intensity: 0.55 },
    blush: { key: "mauve", intensity: 0.38 },
    lips: { key: "berry", intensity: 0.58 },
  },
];

function findHair(key: string): HairColor | undefined {
  return HAIR_COLORS.find((c) => c.key === key);
}
function findEyes(key: string): EyeColor | undefined {
  return EYE_COLORS.find((c) => c.key === key);
}
function findBlush(key: string): BlushColor | undefined {
  return BLUSH_COLORS.find((c) => c.key === key);
}
function findLips(key: string): LipstickColor | undefined {
  return LIPSTICK_COLORS.find((c) => c.key === key);
}

/**
 * Resolve a preset's color keys to full color records. Effects whose
 * keys are missing from their palette are silently dropped — the look
 * still applies for whatever effects resolved correctly.
 */
export function resolvePreset(preset: TryOnPreset): MakeoverLook {
  const out: MakeoverLook = {};
  if (preset.hair) {
    const c = findHair(preset.hair.key);
    if (c) out.hair = { color: c, intensity: preset.hair.intensity };
  }
  if (preset.eyes) {
    const c = findEyes(preset.eyes.key);
    if (c) out.eyes = { color: c, intensity: preset.eyes.intensity };
  }
  if (preset.blush) {
    const c = findBlush(preset.blush.key);
    if (c) out.blush = { color: c, intensity: preset.blush.intensity };
  }
  if (preset.lips) {
    const c = findLips(preset.lips.key);
    if (c) out.lips = { color: c, intensity: preset.lips.intensity };
  }
  return out;
}

/**
 * Pick a random preset from the curated library. Used by the
 * "Surprise me" button — gives users a one-tap path to seeing a
 * varied look without having to scroll the swatch grids.
 *
 * Optionally takes an `excludeKey` to avoid re-picking the same
 * preset twice in a row (e.g., after the user shuffles once).
 */
export function randomPreset(excludeKey?: string): TryOnPreset {
  const pool = excludeKey
    ? TRYON_PRESETS.filter((p) => p.key !== excludeKey)
    : TRYON_PRESETS;
  // Pool is always non-empty: TRYON_PRESETS has 6 entries, and excluding one
  // leaves at least 5. The non-null assertion is justified.
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/**
 * Build a small color-strip summary (4 RGB swatches) for a preset
 * so the UI can render a chip showing what colors the preset uses
 * without having to apply it to a canvas.
 *
 * Returns hex-CSS strings in fixed order [hair, eyes, blush, lips],
 * with empty string for effects the preset doesn't set — callers
 * can filter those out before rendering.
 */
export function presetSwatchStrip(preset: TryOnPreset): string[] {
  const out: string[] = [];
  if (preset.hair) {
    const c = findHair(preset.hair.key);
    if (c) out.push(`rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`);
  }
  if (preset.eyes) {
    const c = findEyes(preset.eyes.key);
    if (c) out.push(`rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`);
  }
  if (preset.blush) {
    const c = findBlush(preset.blush.key);
    if (c) out.push(`rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`);
  }
  if (preset.lips) {
    const c = findLips(preset.lips.key);
    if (c) out.push(`rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`);
  }
  return out;
}
