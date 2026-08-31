import type { Category } from "@/lib/scoring";
import type { Tier } from "@/lib/scoring/tier";
import type { Gender, Ethnicity } from "@/types";

/**
 * Minimal subset of a scan suitable for embedding in a URL.
 *
 * Schema versioned as `v` so future format bumps can be detected +
 * rejected without crashing on old links. Field names are intentionally
 * SHORT (single-char) to keep the encoded URL under ~300 chars even
 * with all optional fields populated.
 */
export interface SharedScan {
  v: 1;
  /** Overall doodee score 0..10 */
  o: number;
  /** Tier id */
  t: Tier;
  /** Per-category averages */
  c: Partial<Record<Category, number>>;
  /** Calibration */
  g: Gender;
  e: Ethnicity;
  /** Unix-ms timestamp */
  ts: number;
  /** Geometric (pre-blend) score — optional, Phase 27+ */
  geo?: number;
  /** Second-opinion ensemble score — optional, Phase 27+ */
  s?: number;
  /** Learned ML score — optional, Phase 28+ */
  l?: number;
}

interface ScanLike {
  overall: number;
  tier: Tier;
  categories: Partial<Record<Category, number>>;
  options: { gender: Gender; ethnicity: Ethnicity };
  timestamp: number;
  geometric?: number;
  secondOpinion?: number;
  learned?: number;
}

/**
 * Build a SharedScan from anything that quacks like a ScanRecord. Used
 * by both the live scan path (passing a ScanResult + tier) and the
 * history-share path (passing a stored ScanRecord).
 */
export function toSharedScan(scan: ScanLike): SharedScan {
  return {
    v: 1,
    o: round(scan.overall, 2),
    t: scan.tier,
    c: roundCategories(scan.categories),
    g: scan.options.gender,
    e: scan.options.ethnicity,
    ts: scan.timestamp,
    ...(scan.geometric !== undefined ? { geo: round(scan.geometric, 2) } : {}),
    ...(scan.secondOpinion !== undefined ? { s: round(scan.secondOpinion, 2) } : {}),
    ...(scan.learned !== undefined ? { l: round(scan.learned, 2) } : {}),
  };
}

function round(n: number, digits: number): number {
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}

function roundCategories(
  cats: Partial<Record<Category, number>>
): Partial<Record<Category, number>> {
  const out: Partial<Record<Category, number>> = {};
  for (const [k, v] of Object.entries(cats)) {
    if (typeof v === "number") out[k as Category] = round(v, 2);
  }
  return out;
}

/**
 * Encode to a URL-safe base64 string. ~200-300 chars typical, well
 * under the 2 KB practical URL limit.
 *
 * Base64URL: replace `+` with `-`, `/` with `_`, strip trailing `=`.
 */
export function encodeShare(scan: SharedScan): string {
  const json = JSON.stringify(scan);
  if (typeof window !== "undefined") {
    return base64UrlEncode(window.btoa(unescape(encodeURIComponent(json))));
  }
  // SSR fallback — Buffer is the Node equivalent
  return base64UrlEncode(Buffer.from(json, "utf-8").toString("base64"));
}

/**
 * Decode a base64url-encoded SharedScan. Returns null on:
 *  - bad base64
 *  - bad JSON
 *  - missing/invalid required fields
 *  - unknown schema version
 */
/**
 * Phase 192 (Share-agent CRIT-3) — Length cap. The decoded payload is
 * piped into `JSON.parse` on the edge runtime via `/api/og` and the
 * client. An attacker crafting `?d=<10MB of base64>` would burn the
 * edge function's CPU budget on every unfurler hit. Real legitimate
 * payloads are well under 2 KB.
 */
const MAX_ENCODED_LENGTH = 2048;

export function decodeShare(encoded: string): SharedScan | null {
  if (!encoded || typeof encoded !== "string") return null;
  if (encoded.length > MAX_ENCODED_LENGTH) return null;
  try {
    const base64 = base64UrlDecode(encoded);
    let json: string;
    if (typeof window !== "undefined") {
      json = decodeURIComponent(escape(window.atob(base64)));
    } else {
      json = Buffer.from(base64, "base64").toString("utf-8");
    }
    const obj = JSON.parse(json);
    return validate(obj);
  } catch {
    return null;
  }
}

function base64UrlEncode(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(b64url: string): string {
  let s = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  return s;
}

// Phase 192 (Share-agent HIGH-4,5,6,7) — Range clamps + allowlists so
// a stranger crafting `?d=...` can't render arbitrary text or a 999.9
// score into the OG card and a chat preview. Without these, any
// `o`, `t`, `c.<key>` was rendered as-is — React escapes XSS but the
// values still drove visible UI.
const VALID_TIERS: ReadonlySet<Tier> = new Set<Tier>([
  "gigachad",
  "chad",
  "chadlite",
  "goddess",
  "stacy",
  "stacylite",
  "htn",
  "mtn",
  "ltn",
]);
const VALID_CATEGORIES = new Set<Category>([
  "harmony",
  "angularity",
  "dimorphism",
  "eye-area",
  "features",
  "symmetry",
]);
const MIN_TS = Date.UTC(2020, 0, 1);

function validate(obj: unknown): SharedScan | null {
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;
  if (r.v !== 1) return null;
  if (typeof r.o !== "number" || !Number.isFinite(r.o)) return null;
  if (r.o < 0 || r.o > 10) return null;
  if (typeof r.t !== "string" || !VALID_TIERS.has(r.t as Tier)) return null;
  if (typeof r.c !== "object" || r.c === null) return null;
  if (r.g !== "male" && r.g !== "female") return null;
  if (r.e !== "universal" && r.e !== "asian") return null;
  if (typeof r.ts !== "number" || !Number.isFinite(r.ts)) return null;
  if (r.ts < MIN_TS || r.ts > Date.now() + 86_400_000) return null;
  const c: Partial<Record<Category, number>> = {};
  for (const [k, v] of Object.entries(r.c)) {
    if (!VALID_CATEGORIES.has(k as Category)) continue;
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10) {
      c[k as Category] = v;
    }
  }
  const result: SharedScan = {
    v: 1,
    o: r.o,
    t: r.t as Tier,
    c,
    g: r.g,
    e: r.e,
    ts: r.ts,
  };
  // Phase 192 — clamp the optional aux scores to 0..10 too.
  if (typeof r.geo === "number" && Number.isFinite(r.geo) && r.geo >= 0 && r.geo <= 10)
    result.geo = r.geo;
  if (typeof r.s === "number" && Number.isFinite(r.s) && r.s >= 0 && r.s <= 10)
    result.s = r.s;
  if (typeof r.l === "number" && Number.isFinite(r.l) && r.l >= 0 && r.l <= 10)
    result.l = r.l;
  return result;
}

/**
 * Build a full share URL from a base origin. Caller passes the origin
 * (`window.location.origin` on client, env-driven on server).
 */
export function shareUrl(origin: string, scan: SharedScan): string {
  const encoded = encodeShare(scan);
  return `${origin.replace(/\/$/, "")}/share?d=${encoded}`;
}

/**
 * Project a SharedScan back to a ScanRecord-shape so the CompareDialog
 * (which takes ScanRecord) can render against a shared scan. Used by
 * the "compare with shared URL" feature.
 *
 * `views` defaults to `front-only` since the shared format doesn't
 * carry the front+side view info — most scans are front-only anyway.
 */
export function sharedToRecord(s: SharedScan): {
  timestamp: number;
  overall: number;
  tier: string;
  categories: Partial<Record<Category, number>>;
  options: { gender: "male" | "female"; ethnicity: "universal" | "asian" };
  views: { front: true; side: boolean };
  geometric?: number;
  secondOpinion?: number;
  learned?: number;
} {
  return {
    timestamp: s.ts,
    overall: s.o,
    tier: s.t,
    categories: s.c,
    options: { gender: s.g, ethnicity: s.e },
    views: { front: true, side: false },
    ...(s.geo !== undefined ? { geometric: s.geo } : {}),
    ...(s.s !== undefined ? { secondOpinion: s.s } : {}),
    ...(s.l !== undefined ? { learned: s.l } : {}),
  };
}

/**
 * Convenience: parse a full share URL (or just the `d` query value) and
 * decode the scan. Returns null on any malformed input.
 *
 * Accepts:
 *   - "https://doodee.app/share?d=eyJ..."
 *   - "/share?d=eyJ..."
 *   - "?d=eyJ..."
 *   - "eyJ..." (raw encoded)
 */
export function decodeShareUrl(input: string): SharedScan | null {
  if (!input || typeof input !== "string") return null;
  // Phase 192 (Share-agent CRIT-3 follow-up) — Bound the raw input before
  // `URLSearchParams` runs over it. `decodeShare` caps the extracted `d`,
  // but a multi-MB pasted string would still be split + parsed first. The
  // prefix budget (origin + `/share?d=`) is small, so cap a bit above the
  // payload limit rather than at it.
  if (input.length > MAX_ENCODED_LENGTH + 512) return null;
  const trimmed = input.trim();
  // Try to extract `d` from a URL or query string
  try {
    if (trimmed.includes("?")) {
      const qs = trimmed.split("?")[1] ?? "";
      const params = new URLSearchParams(qs);
      const d = params.get("d");
      if (d) return decodeShare(d);
    }
  } catch {
    // fall through to raw decode
  }
  return decodeShare(trimmed);
}
