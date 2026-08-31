/**
 * Client helpers for server-side AI routes. Prompts and provider keys stay
 * inside `/api/ai/*`; this file only sends typed user inputs and parses
 * responses.
 */

import type { Gender, Ethnicity } from "@/types";
import type { AestheticReference, ProfileGoal } from "@/lib/user-prefs";
import { consumeQuotaApi } from "@/lib/quota";
import { setSubscriptionCache } from "@/lib/subscription-cache";
import type { SubscriptionRow } from "@/lib/supabase/types";

export interface AiScoreResult {
  aiScore: number;
  aiConfidence: number;
  reasoning: string;
  perceived: {
    expression: string;
    photoQuality: "good" | "ok" | "poor";
  };
  categories?: Partial<{
    harmony: number;
    angularity: number;
    dimorphism: number;
    "eye-area": number;
    features: number;
    symmetry: number;
  }>;
  advice?: Array<{
    metric: string;
    observation: string;
    recommendations: string[];
    difficulty: "easy" | "mid" | "hard";
  }>;
  potential?: {
    ifEasy: number;
    ifMid: number;
    ifHard: number;
    note?: string;
  };
}

export interface WeakMetric {
  metric: string;
  raw: number;
  score: number;
  ideal: [number, number];
}

export type AiPhotoQualitySeverity = "ok" | "warn" | "bad";

export interface AiScorePhotoQualityContext {
  overall: AiPhotoQualitySeverity;
  scanConfidence?: number;
  issues: Array<{
    check: string;
    severity: AiPhotoQualitySeverity;
    value?: number;
  }>;
}

const AI_FETCH_TIMEOUT_MS = 15_000;
const AI_SCORE_MAX_ATTEMPTS = 1;
const AI_SCORE_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const SCORE_CACHE_KEY = "doodee.ai.scoreCache.v1";
const SCORE_CACHE_VERSION = "v1-calibrated-2026-06-26";
const SCORE_CACHE_TTL_MS = 72 * 60 * 60 * 1000;
const SCORE_CACHE_MAX_ENTRIES = 32;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  ms: number = AI_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convert an HTMLImageElement to base64-encoded JPEG. Uses an offscreen
 * canvas at a max size of 768px - Gemini doesn't need higher resolution
 * for face scoring and we save bandwidth.
 */
async function imageToBase64Jpeg(image: HTMLImageElement, maxSide = 768): Promise<string> {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-2d-unavailable");
  ctx.drawImage(image, 0, 0, tw, th);
  try {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    // Strip the "data:image/jpeg;base64," prefix.
    return dataUrl.split(",")[1] ?? "";
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Phase 158.27 — Result of `callGeminiScoreWithOutcome`. Lets the UI
 * surface a "Gemini was used" / "MediaPipe-only" badge so users see
 * proof of work instead of guessing.
 */
export type AiScoreSource = "ai" | "fallback" | "disabled";

export interface AiScoreOutcome {
  source: AiScoreSource;
  result: AiScoreResult | null;
  reason?: "ai-disabled" | "proxy-error" | "parse-error" | "quota-exhausted";
  /** Server / proxy error message slice for diagnostics. */
  errorDetail?: string;
  /** Roundtrip time including quota reservation + proxy call. */
  latencyMs: number;
}

export interface GeminiScoreInput {
  image: HTMLImageElement;
  gender: Gender;
  ethnicity: Ethnicity;
  profileContext?: {
    goal: ProfileGoal;
    aestheticReference: AestheticReference;
  };
  /**
   * Phase 158.13 — optional override for the Gemini model. Server reads
   * from the request body and falls back to its own default if absent.
   */
  lang?: "th" | "en";
  /**
   * Phase 122 — the user's 5 lowest-scoring metrics from MediaPipe, passed
   * to Gemini as context so it can write specific advice referencing the
   * actual measured values. Empty array = no advice block in response.
   */
  weakMetrics?: WeakMetric[];
  photoQuality?: AiScorePhotoQualityContext;
  /** Phase 152 — optional Supabase access token. Triggers server-side
   *  scan quota enforcement; absent token falls back to localStorage. */
  idToken?: string;
}

/**
 * Phase 158.13 → 192o — Call the server proxy /api/ai/score.
 *
 * Phase 158.36 — quota is consumed for the SCAN, not for the AI response.
 * The MediaPipe geometric pipeline already runs (the user gets a 0-10 score,
 * categories, photo-quality assessment, and the proportion comparison
 * regardless of whether Gemini succeeds). AI is a bonus layer on top, so
 * we no longer refund the quota when the AI call errors out — the user
 * received a scan, and the counter must reflect that. Without this fix the
 * counter looked frozen every time Gemini timed out, which produced the
 * "โควต้าไม่ลด" bug report.
 *
 * Phase 192o — Dropped the client-side `reserveQuotaSlot("scans")` call.
 * Server-side `/api/ai/score` already burns the slot via `consumeQuota`
 * (Phase 184). The duplicate client burn meant every successful scan
 * decremented `scans_used` by TWO — paid users were burning out at half
 * speed. Mirrors the Phase 192j fix that removed `withQuotaGuard` from
 * image-gen and recommend.
 */
export async function callGeminiScore(input: GeminiScoreInput): Promise<AiScoreResult> {
  const {
    image,
    gender,
    ethnicity,
    lang = "th",
    weakMetrics = [],
    photoQuality,
    profileContext,
    idToken,
  } = input;

  const result = await runGeminiScore({
    image,
    gender,
    ethnicity,
    lang,
    weakMetrics,
    ...(profileContext ? { profileContext } : {}),
    ...(photoQuality ? { photoQuality } : {}),
    ...(idToken ? { idToken } : {}),
  });
  // Phase 192ad — Finding 3 (CWE-345): removed the client `trackUsageApi`
  // POST. `/api/ai/score` now writes the authoritative usage_log row
  // server-side after its real provider call, so the client no longer
  // declares (and could forge) the op.
  return result;
}

/**
 * Phase 158.27 — Same as `callGeminiScore` but never throws on AI failure.
 * Returns an `AiScoreOutcome` so the UI can render a proof-of-work badge
 * (Gemini-used / fallback / disabled). Quota reservation errors still
 * throw — they're the caller's job to surface as "ran out of credits".
 */
export async function callGeminiScoreWithOutcome(
  input: GeminiScoreInput
): Promise<AiScoreOutcome> {
  const t0 = Date.now();
  try {
    const result = await callGeminiScore(input);
    return {
      source: "ai",
      result,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    // Quota exhaustion must bubble — it's a paying-customer signal, not
    // a silent fallback.
    if (err instanceof Error && err.message.startsWith("quota-exhausted")) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : "unknown";
    const reason: AiScoreOutcome["reason"] =
      msg === "ai-disabled" || msg.includes("AI_UNAVAILABLE")
        ? "ai-disabled"
        : msg.includes("AI_PROXY_BAD_JSON")
          ? "parse-error"
          : "proxy-error";
    return {
      source: reason === "ai-disabled" ? "disabled" : "fallback",
      result: null,
      reason,
      errorDetail: msg.slice(0, 200),
      latencyMs: Date.now() - t0,
    };
  }
}

async function runGeminiScore(args: {
  image: HTMLImageElement;
  gender: Gender;
  ethnicity: Ethnicity;
  lang: "th" | "en";
  weakMetrics: WeakMetric[];
  profileContext?: {
    goal: ProfileGoal;
    aestheticReference: AestheticReference;
  };
  photoQuality?: AiScorePhotoQualityContext;
  /** Phase 183 fix — Supabase JWT forwarded as Authorization header so
   * /api/ai/score can verify the user and burn their quota slot. Without
   * this the route always returned 401 even for logged-in users because
   * the token was received by callGeminiScore but never passed down here. */
  idToken?: string;
}): Promise<AiScoreResult> {
  const {
    image,
    gender,
    ethnicity,
    lang,
    weakMetrics,
    profileContext,
    photoQuality,
    idToken,
  } = args;
  const base64 = await imageToBase64Jpeg(image);
  const body = JSON.stringify({
    imageBase64: base64,
    gender,
    ethnicity,
    lang,
    weakMetrics,
    ...(profileContext ? { profileContext } : {}),
    ...(photoQuality ? { photoQuality } : {}),
  });
  const cacheKey = scoreCacheKey(body);
  const cached = loadScoreCache(cacheKey);
  if (cached) {
    if (idToken) await consumeQuotaApi("scans", idToken);
    return cached;
  }

  let res: Response | null = null;
  for (let attempt = 1; attempt <= AI_SCORE_MAX_ATTEMPTS; attempt += 1) {
    res = await fetchWithTimeout("/api/ai/score", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body,
    });

    if (res.ok) break;
    if (res.status === 402) throw new Error("quota-exhausted");

    const retryable = AI_SCORE_RETRYABLE_STATUS.has(res.status);
    const isLastAttempt = attempt === AI_SCORE_MAX_ATTEMPTS;
    if (!retryable || isLastAttempt) break;

    await res.arrayBuffer().catch(() => undefined);
    await sleep(1_000 * 2 ** (attempt - 1));
  }

  if (!res) throw new Error("AI_PROXY_FAILED:NO_RESPONSE");

  if (res.status === 503) {
    throw new Error("ai-disabled");
  }

  if (!res.ok) {
    await res.arrayBuffer().catch(() => undefined);
    throw new Error(`AI_PROXY_FAILED:${res.status}`);
  }

  const proxied = (await res.json()) as {
    raw?: string;
    subscription?: SubscriptionRow;
  };
  if (proxied.subscription?.user_id) setSubscriptionCache(proxied.subscription);
  const text = proxied.raw;
  if (!text) throw new Error("AI_PROXY_EMPTY");

  let parsed: AiScoreResult;
  try {
    parsed = JSON.parse(text) as AiScoreResult;
  } catch {
    throw new Error("AI_PROXY_BAD_JSON");
  }

  // Defensive normalize — clamp + fill defaults so reconciliation can't NaN.
  const normalized: AiScoreResult = {
    aiScore: clamp(parsed.aiScore ?? 5, 0, 10),
    aiConfidence: clamp(parsed.aiConfidence ?? 0.5, 0, 1),
    reasoning: parsed.reasoning ?? "",
    perceived: {
      expression: parsed.perceived?.expression ?? "neutral",
      photoQuality: parsed.perceived?.photoQuality ?? "ok",
    },
    ...(parsed.categories ? { categories: parsed.categories } : {}),
    ...(Array.isArray(parsed.advice) ? { advice: parsed.advice } : {}),
    ...(parsed.potential
      ? {
          potential: {
            ifEasy: clamp(parsed.potential.ifEasy ?? parsed.aiScore ?? 5, 0, 10),
            ifMid: clamp(parsed.potential.ifMid ?? parsed.aiScore ?? 5, 0, 10),
            ifHard: clamp(parsed.potential.ifHard ?? parsed.aiScore ?? 5, 0, 10),
            ...(parsed.potential.note ? { note: parsed.potential.note } : {}),
          },
        }
      : {}),
  };
  saveScoreCache(cacheKey, normalized);
  return normalized;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, v));
}

interface ScoreCacheEntry {
  t: number;
  result: AiScoreResult;
}

function scoreCacheKey(body: string): string {
  let hash = 2166136261;
  const input = `${SCORE_CACHE_VERSION}:${body}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function readScoreCache(): Record<string, ScoreCacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SCORE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, ScoreCacheEntry>;
  } catch {
    return {};
  }
}

function validScoreResult(value: unknown): value is AiScoreResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Partial<AiScoreResult>;
  return (
    typeof obj.aiScore === "number" &&
    Number.isFinite(obj.aiScore) &&
    typeof obj.aiConfidence === "number" &&
    Number.isFinite(obj.aiConfidence) &&
    typeof obj.reasoning === "string"
  );
}

function loadScoreCache(key: string): AiScoreResult | null {
  const cache = readScoreCache();
  const entry = cache[key];
  if (!entry || Date.now() - entry.t > SCORE_CACHE_TTL_MS) return null;
  return validScoreResult(entry.result) ? entry.result : null;
}

function saveScoreCache(key: string, result: AiScoreResult): void {
  if (typeof window === "undefined") return;
  try {
    const cache = readScoreCache();
    cache[key] = { t: Date.now(), result };
    const entries = Object.entries(cache)
      .filter(([, entry]) => Date.now() - entry.t <= SCORE_CACHE_TTL_MS)
      .sort((a, b) => b[1].t - a[1].t)
      .slice(0, SCORE_CACHE_MAX_ENTRIES);
    window.localStorage.setItem(SCORE_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // localStorage unavailable or full: scoring still works without cache.
  }
}

// ============================================================================
// Phase 125 — Compare Commentary
// ============================================================================

/**
 * Light-weight scan summary used to ask Gemini for a delta narrative.
 * Doesn't include the image — comparing TWO photos blows up the prompt
 * size, and the text deltas already carry enough information for a
 * 2-3 sentence narrative.
 */
export interface CompareScanSummary {
  timestamp: number;
  overall: number;
  tier: string;
  categories: Partial<Record<string, number>>;
  gender: "male" | "female";
  ethnicity: "universal" | "asian";
}

export interface CompareCommentary {
  /** 2-3 sentence narrative explaining the delta. */
  narrative: string;
  /** What changed most positively, if anything (category key). */
  topImprovement?: string;
  /** What declined most, if anything (category key). */
  topRegression?: string;
  /** Suggested focus area for the next 30 days. */
  nextFocus?: string;
}

export interface CompareCommentaryInput {
  earlier: CompareScanSummary;
  later: CompareScanSummary;
  lang?: "th" | "en";
  idToken?: string;
}

/**
 * Phase 158.13 — Ask the server proxy /api/ai/compare for a 2-3 sentence
 * narrative explaining the delta. Used by `CompareDialog` to turn cold
 * numbers into coaching. Throws "ai-disabled" when server lacks a key.
 */
export async function callGeminiCompareCommentary(
  input: CompareCommentaryInput
): Promise<CompareCommentary> {
  const { earlier, later, lang = "th", idToken } = input;

  const buildBody: Record<string, unknown> = { earlier, later, lang };

  const res = await fetchWithTimeout("/api/ai/compare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(buildBody),
  });

  if (res.status === 503) throw new Error("ai-disabled");
  if (!res.ok) {
    await res.arrayBuffer().catch(() => undefined);
    throw new Error(`AI_PROXY_FAILED:${res.status}`);
  }

  const proxied = (await res.json()) as { raw?: string };
  const text = proxied.raw;
  if (!text) throw new Error("AI_PROXY_EMPTY");

  try {
    const parsed = JSON.parse(text) as CompareCommentary;
    return {
      narrative: parsed.narrative ?? "",
      ...(parsed.topImprovement ? { topImprovement: parsed.topImprovement } : {}),
      ...(parsed.topRegression ? { topRegression: parsed.topRegression } : {}),
      ...(parsed.nextFocus ? { nextFocus: parsed.nextFocus } : {}),
    };
  } catch {
    throw new Error("AI_PROXY_BAD_JSON");
  }
}

// --- Compare commentary cache (localStorage, by scan pair) ------------------

const COMPARE_CACHE_KEY = "doodee.ai.compareCache.v2";

function pairKey(aTs: number, bTs: number): string {
  return `${Math.min(aTs, bTs)}-${Math.max(aTs, bTs)}`;
}

export function loadCompareCommentaryFromCache(
  aTs: number,
  bTs: number
): CompareCommentary | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COMPARE_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Record<string, CompareCommentary>;
    return obj[pairKey(aTs, bTs)] ?? null;
  } catch {
    return null;
  }
}

export function saveCompareCommentaryToCache(
  aTs: number,
  bTs: number,
  c: CompareCommentary
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(COMPARE_CACHE_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, CompareCommentary>) : {};
    obj[pairKey(aTs, bTs)] = c;
    // Keep cache small — drop oldest entries when over 32.
    const keys = Object.keys(obj);
    if (keys.length > 32) {
      const drop = keys.slice(0, keys.length - 32);
      for (const k of drop) delete obj[k];
    }
    window.localStorage.setItem(COMPARE_CACHE_KEY, JSON.stringify(obj));
  } catch {
    /* localStorage full / disabled — no-op */
  }
}

// ---------------- Model preference (localStorage) ----------------

// Phase 180 — Per-user API key storage removed. Gemini access is now
// gated by `GEMINI_API_SECRET` on the server side; all calls go through
// `/api/ai/score` and `/api/ai/image-gen` (Phase 158.13, Phase 180).
