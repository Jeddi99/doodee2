import type { Category, QualitySeverity } from "@/lib/scoring";
import type { Tier } from "@/lib/scoring/tier";
import type { MetricOptions } from "@/types";

export interface ScanRecord {
  timestamp: number;
  overall: number;
  tier: Tier;
  categories: Partial<Record<Category, number>>;
  options: MetricOptions;
  views: { front: true; side: boolean };
  /**
   * Pre-blend geometric overall (Phase 27). Optional — older saved
   * scans don't carry it and code MUST handle the undefined case.
   */
  geometric?: number;
  /**
   * Second-opinion ensemble score (Phase 27). Optional, same reason as
   * `geometric`.
   */
  secondOpinion?: number;
  /**
   * Learned (ONNX) attractiveness score (Phase 28). Optional — present
   * only when the model file is dropped into `/public/models/` and the
   * inference returned successfully.
   */
  learned?: number;
  /**
   * Photo-quality summary at scan time (Phase 35). Compact subset of
   * the full PhotoQualityReport — just enough to surface a badge in
   * history without storing the per-issue detail.
   */
  quality?: {
    overall: QualitySeverity;
    issueCount: number;
  };
  /**
   * Phase 138 — downscaled JPEG of the scanned photo as a data URL.
   * Lets history surface thumbnails and lets users revisit a scan
   * with the original image intact. Kept around 100-200 KB so 20
   * records sit comfortably inside browser quota.
   */
  photoDataUrl?: string;
  /**
   * Phase 138 — AI summary text captured at scan time. Preserved
   * verbatim so the same personalized note shows when re-opening
   * the scan, instead of being regenerated (or missing entirely
   * if the user's access key was cleared in the meantime).
   */
  aiReasoning?: string;
  /** Raw provider score before deterministic calibration. */
  aiRawScore?: number;
  /**
   * Phase 138 — AI confidence in the judgement (0-1).
   */
  aiConfidence?: number;
  /**
   * Phase 138 — whether the overall score came from the AI verdict
   * or the geometric blend.
   */
  aiSource?: "ai" | "geometric";
  /**
   * Phase 138 — what the AI perceived about the photo subject.
   */
  aiPerceived?: {
    expression: string;
    photoQuality: "good" | "ok" | "poor";
  };
  /**
   * Phase 138 — personalized advice + recommendations per weak metric.
   * Captured at scan time so the roadmap card stays consistent
   * between visits.
   */
  aiAdvice?: Array<{
    metric: string;
    observation: string;
    recommendations: string[];
    difficulty: "easy" | "mid" | "hard";
  }>;
  /**
   * Phase 138 — AI-projected scores after completing each roadmap
   * phase. Drives the progression bar in `RoadmapCard`.
   */
  aiPotential?: {
    ifEasy: number;
    ifMid: number;
    ifHard: number;
    note?: string;
  };
}

const KEY = "doodee:history";
export const SCAN_HISTORY_CHANGED_EVENT = "doodee:scan-history-changed";
const MAX_RECORDS = 20;
// Phase 82: collapse near-duplicate scans (same overall + tier within
// this window) into a single entry. Catches the "user accidentally
// scanned the same photo twice" case without affecting legitimate
// retries that produce different numbers.
const DEDUPE_WINDOW_MS = 30_000;

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Phase 192o — module-level cache so re-mounting components that call
// loadHistory() (history page, scan cockpit, shared scan, OverallScore
// retry, settings) don't re-parse the 20-record JSON blob (~100-200 KB
// when photos are embedded) on every mount. Cache key is the raw string
// returned by localStorage; if the raw string is unchanged we skip the
// expensive JSON.parse + filter. Writes through this module invalidate
// `cachedRaw` directly. External writes (tests, other tabs) still cost
// one parse to refresh.
let cachedRaw: string | null = null;
let cachedRecords: ScanRecord[] = [];

function invalidateCache(): void {
  cachedRaw = null;
  cachedRecords = [];
}

function notifyHistoryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SCAN_HISTORY_CHANGED_EVENT));
}

export function loadHistory(): ScanRecord[] {
  const ls = safeLocalStorage();
  if (!ls) return [];
  const raw = ls.getItem(KEY);
  if (raw === null) {
    if (cachedRaw !== null) invalidateCache();
    return [];
  }
  if (raw === cachedRaw) return cachedRecords;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cachedRaw = raw;
      cachedRecords = [];
      return cachedRecords;
    }
    cachedRecords = parsed.filter(
      (r): r is ScanRecord =>
        typeof r === "object" &&
        r !== null &&
        typeof r.timestamp === "number" &&
        typeof r.overall === "number" &&
        typeof r.tier === "string"
    );
    cachedRaw = raw;
    return cachedRecords;
  } catch {
    cachedRaw = raw;
    cachedRecords = [];
    return cachedRecords;
  }
}

/**
 * Phase 147 — quota-resilient persist. When the localStorage quota is
 * exceeded (common on Safari iOS and on origins with lots of stored
 * data), the previous implementation silently dropped the new record —
 * which meant the photo + AI fields the user expected to be saved just
 * vanished, with no fallback.
 *
 * The new strategy, in priority order:
 *   1. Try to write the new record + full existing history.
 *   2. If that throws, drop the oldest record(s) one at a time and retry.
 *   3. If still throwing with only the new record left, strip the
 *      heaviest optional fields off the new record (`photoDataUrl`
 *      first, then `aiAdvice`) and retry.
 *   4. Last resort: drop the photo entirely and persist the metadata
 *      so the history entry still exists. Better a record without a
 *      thumbnail than no record at all.
 */
function tryWrite(
  ls: Storage,
  key: string,
  records: ScanRecord[]
): boolean {
  try {
    ls.setItem(key, JSON.stringify(records));
    invalidateCache();
    notifyHistoryChanged();
    return true;
  } catch {
    return false;
  }
}

function persistWithFallbacks(
  ls: Storage,
  newRecord: ScanRecord,
  base: ScanRecord[]
): void {
  // Step 1: full write.
  let trial = [newRecord, ...base].slice(0, MAX_RECORDS);
  if (tryWrite(ls, KEY, trial)) return;

  // Step 2: drop the oldest one record at a time.
  for (let cut = 1; cut < trial.length; cut += 1) {
    const trimmed = trial.slice(0, trial.length - cut);
    if (tryWrite(ls, KEY, trimmed)) return;
  }

  // Step 3: alone but still failing — strip the new record's heaviest
  // optional fields and retry.
  const lean: ScanRecord = { ...newRecord };
  // photoDataUrl is by far the largest (~150-200 KB).
  delete lean.photoDataUrl;
  trial = [lean];
  if (tryWrite(ls, KEY, trial)) return;
  // Drop aiAdvice next (can be 10-20 KB of text).
  delete lean.aiAdvice;
  if (tryWrite(ls, KEY, [lean])) return;
  // Drop aiPotential, aiPerceived.
  delete lean.aiPotential;
  delete lean.aiPerceived;
  if (tryWrite(ls, KEY, [lean])) return;
  // Drop aiReasoning paragraph last.
  delete lean.aiReasoning;
  tryWrite(ls, KEY, [lean]); // best-effort, ignore final outcome
}

export function saveScan(record: ScanRecord): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  const current = loadHistory();

  // Phase 82: dedupe if the new record is a near-duplicate of the
  // most-recent one. The newer record REPLACES the previous one
  // (keeps the latest data shape — e.g., includes a `learned` score
  // and now also `photoDataUrl` / AI fields if the previous didn't).
  const head = current[0];
  const isNearDup =
    head &&
    Math.abs(record.timestamp - head.timestamp) <= DEDUPE_WINDOW_MS &&
    record.overall === head.overall &&
    record.tier === head.tier;

  const base = isNearDup ? current.slice(1) : current;
  persistWithFallbacks(ls, record, base);
}

export function clearHistory(): void {
  const ls = safeLocalStorage();
  if (!ls) {
    invalidateCache();
    return;
  }
  ls.removeItem(KEY);
  invalidateCache();
  notifyHistoryChanged();
}

/**
 * Phase 95 — Import scan history from an exported JSON payload.
 *
 * Accepts a bare array of `ScanRecord` (what `exportHistory` produces).
 * Merges with existing scans, dedupes by `timestamp` (assuming
 * timestamp uniquely identifies a scan), and respects `MAX_RECORDS`.
 *
 * Returns `{ added, skipped }` summary. Returns `null` if the payload
 * isn't an array (the exact shape `exportHistory` writes).
 */
export function importHistory(
  raw: unknown
): { added: number; skipped: number; total: number } | null {
  if (!Array.isArray(raw)) return null;

  const candidates = raw.filter(
    (r): r is ScanRecord =>
      typeof r === "object" &&
      r !== null &&
      typeof (r as ScanRecord).timestamp === "number" &&
      typeof (r as ScanRecord).overall === "number" &&
      typeof (r as ScanRecord).tier === "string"
  );

  const existing = loadHistory();
  const existingTs = new Set(existing.map((r) => r.timestamp));
  const newOnes = candidates.filter((c) => !existingTs.has(c.timestamp));
  const skipped = candidates.length - newOnes.length;

  // Merge then re-sort newest-first, then cap.
  const merged = [...newOnes, ...existing]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_RECORDS);

  const ls = safeLocalStorage();
  if (ls) {
    try {
      ls.setItem(KEY, JSON.stringify(merged));
      invalidateCache();
      notifyHistoryChanged();
    } catch {
      // ignore quota
    }
  }

  return {
    added: newOnes.length,
    skipped,
    total: merged.length,
  };
}

export function deleteScan(timestamp: number): ScanRecord[] {
  const ls = safeLocalStorage();
  const current = loadHistory();
  const next = current.filter((r) => r.timestamp !== timestamp);
  if (!ls) return next;
  try {
    if (next.length === 0) ls.removeItem(KEY);
    else ls.setItem(KEY, JSON.stringify(next));
    invalidateCache();
    notifyHistoryChanged();
  } catch {
    // ignore quota errors
  }
  return next;
}

export function previousScan(): ScanRecord | null {
  const history = loadHistory();
  return history[1] ?? null;
}
