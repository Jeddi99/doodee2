import { HAIR_COLORS } from "./hair-recolor";
import { EYE_COLORS } from "./eye-color-recolor";
import { BLUSH_COLORS } from "./blush-recolor";
import { LIPSTICK_COLORS } from "./lip-recolor";
import type { MakeoverLook } from "./makeover";

/**
 * Phase 66 — share a try-on look as a tiny URL fragment.
 *
 * A composed `MakeoverLook` (hair + eyes + blush + lips, each
 * `{ color, intensity }`) is too verbose to put in a URL as JSON.
 * This module serializes a look to a compact pipe-delimited string,
 * then base64url-encodes it so it survives URL routing.
 *
 * Format (before base64):
 *   v1|h:jet-black,0.92|e:emerald,0.85|b:berry,0.60|l:classic-red,0.90
 *
 * - Leads with `v1` so we can rev the format later
 * - Each effect-section is `<letter>:<colorKey>,<2dp-intensity>`
 * - Missing effects are simply omitted (variable length)
 *
 * After base64url, "Bold evening" (all 4 effects) encodes to ~75 chars,
 * comfortably under any URL length limit and short enough to drop in
 * Twitter / IG-bio links.
 */
const VERSION = "v1";
export const MAX_LOOK_ENCODED_LENGTH = 512;
const LOOK_B64URL_RE = /^[A-Za-z0-9_-]+$/;

export function isEncodedLookCandidate(s: string): boolean {
  return s.length > 0 && s.length <= MAX_LOOK_ENCODED_LENGTH && LOOK_B64URL_RE.test(s);
}

function b64urlEncode(s: string): string {
  // Use UTF-8-safe base64 → strip padding → URL-safe alphabet
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const fill = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + fill);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function clampIntensity(n: number): number {
  if (!Number.isFinite(n)) return 0.7;
  if (n < 0) return 0;
  if (n > 1) return 1;
  // Snap to 2 decimal places to keep the URL short.
  return Math.round(n * 100) / 100;
}

/**
 * Encode a `MakeoverLook` to a URL-safe string.
 *
 * Returns `null` if the look is empty (no effects set) — callers
 * should hide the share button in that case anyway.
 */
export function encodeLook(look: MakeoverLook): string | null {
  const parts: string[] = [VERSION];
  if (look.hair) parts.push(`h:${look.hair.color.key},${clampIntensity(look.hair.intensity)}`);
  if (look.eyes) parts.push(`e:${look.eyes.color.key},${clampIntensity(look.eyes.intensity)}`);
  if (look.blush) parts.push(`b:${look.blush.color.key},${clampIntensity(look.blush.intensity)}`);
  if (look.lips) parts.push(`l:${look.lips.color.key},${clampIntensity(look.lips.intensity)}`);
  if (parts.length === 1) return null;
  return b64urlEncode(parts.join("|"));
}

/**
 * Decode a URL-safe string back to a `MakeoverLook`.
 *
 * Returns `null` for any failure: bad base64, wrong version, no
 * resolvable effects. Effects whose color keys are unknown are
 * silently dropped (forward-compat).
 */
export function decodeLook(s: string): MakeoverLook | null {
  if (!isEncodedLookCandidate(s)) return null;
  let raw: string;
  try {
    raw = b64urlDecode(s);
  } catch {
    return null;
  }
  const segments = raw.split("|");
  if (segments.length < 2 || segments[0] !== VERSION) return null;

  const look: MakeoverLook = {};
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    const colonIdx = seg.indexOf(":");
    if (colonIdx < 0) continue;
    const letter = seg.slice(0, colonIdx);
    const rest = seg.slice(colonIdx + 1);
    const commaIdx = rest.indexOf(",");
    if (commaIdx < 0) continue;
    const key = rest.slice(0, commaIdx);
    const intensity = clampIntensity(parseFloat(rest.slice(commaIdx + 1)));

    if (letter === "h") {
      const c = HAIR_COLORS.find((x) => x.key === key);
      if (c) look.hair = { color: c, intensity };
    } else if (letter === "e") {
      const c = EYE_COLORS.find((x) => x.key === key);
      if (c) look.eyes = { color: c, intensity };
    } else if (letter === "b") {
      const c = BLUSH_COLORS.find((x) => x.key === key);
      if (c) look.blush = { color: c, intensity };
    } else if (letter === "l") {
      const c = LIPSTICK_COLORS.find((x) => x.key === key);
      if (c) look.lips = { color: c, intensity };
    }
  }

  // Empty after filtering = no resolvable effects → treat as invalid
  if (!look.hair && !look.eyes && !look.blush && !look.lips) return null;
  return look;
}

/**
 * Build a full shareable URL on the current origin.
 *
 * If `window` isn't available (SSR) we fall back to a relative URL.
 */
export function buildLookShareUrl(look: MakeoverLook): string | null {
  const encoded = encodeLook(look);
  if (!encoded) return null;
  const path = `/try-on?look=${encoded}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}
