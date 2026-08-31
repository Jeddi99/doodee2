import type { Ethnicity, Gender } from "@/types";

const KEY = "doodee:prefs:v1";
export const ANALYSIS_CONSENT_VERSION = "face-profile-v1";

export type AgeRange = "18_24" | "25_34" | "35_44" | "45_plus" | "not_set";
export type ProfileGoal =
  | "skin"
  | "hair"
  | "face_balance"
  | "pre_clinic"
  | "overall";
export type AestheticReference =
  | "natural_clean"
  | "k_beauty"
  | "western_model"
  | "thai_everyday"
  | "no_preference";

export interface UserPrefs {
  gender: Gender;
  ethnicity: Ethnicity;
  ageRange: AgeRange;
  goal: ProfileGoal;
  aestheticReference: AestheticReference;
  analysisConsentVersion: string | null;
  improvementConsent: boolean;
}

const DEFAULT: UserPrefs = {
  gender: "male",
  ethnicity: "universal",
  ageRange: "not_set",
  goal: "overall",
  aestheticReference: "no_preference",
  analysisConsentVersion: null,
  improvementConsent: false,
};

function parseAgeRange(value: unknown): AgeRange {
  return value === "18_24" ||
    value === "25_34" ||
    value === "35_44" ||
    value === "45_plus"
    ? value
    : "not_set";
}

function parseGoal(value: unknown): ProfileGoal {
  return value === "skin" ||
    value === "hair" ||
    value === "face_balance" ||
    value === "pre_clinic" ||
    value === "overall"
    ? value
    : "overall";
}

function parseAestheticReference(value: unknown): AestheticReference {
  return value === "natural_clean" ||
    value === "k_beauty" ||
    value === "western_model" ||
    value === "thai_everyday" ||
    value === "no_preference"
    ? value
    : "no_preference";
}

// Phase 192o — cache parsed prefs across mounts. Every screen with a
// gender/ethnicity selector hits loadUserPrefs() on mount (settings,
// scan, surgery, onboarding); without a cache that's a fresh parse on
// every navigation. Raw-string compare keeps tests + cross-tab edits
// honest: same string → return cached; different string → re-parse.
let cachedRaw: string | null = null;
let cachedPrefs: UserPrefs = DEFAULT;

function invalidateCache(): void {
  cachedRaw = null;
  cachedPrefs = DEFAULT;
}

export function loadUserPrefs(): UserPrefs {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) {
      if (cachedRaw !== null) invalidateCache();
      return DEFAULT;
    }
    if (raw === cachedRaw) return cachedPrefs;
    const parsed = JSON.parse(raw) as Partial<UserPrefs> | null;
    const next: UserPrefs = {
      gender: parsed?.gender === "female" ? "female" : "male",
      ethnicity: parsed?.ethnicity === "asian" ? "asian" : "universal",
      ageRange: parseAgeRange(parsed?.ageRange),
      goal: parseGoal(parsed?.goal),
      aestheticReference: parseAestheticReference(parsed?.aestheticReference),
      analysisConsentVersion:
        typeof parsed?.analysisConsentVersion === "string"
          ? parsed.analysisConsentVersion
          : null,
      improvementConsent: parsed?.improvementConsent === true,
    };
    cachedRaw = raw;
    cachedPrefs = next;
    return next;
  } catch {
    return DEFAULT;
  }
}

export function saveUserPrefs(prefs: Partial<UserPrefs>): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadUserPrefs();
    const next: UserPrefs = { ...current, ...prefs };
    window.localStorage.setItem(KEY, JSON.stringify(next));
    invalidateCache();
  } catch {
    // Storage blocked — preferences just won't persist this session.
  }
}

export function clearUserPrefs(): void {
  if (typeof window === "undefined") {
    invalidateCache();
    return;
  }
  try {
    window.localStorage.removeItem(KEY);
    invalidateCache();
  } catch {
    // Ignored.
  }
}
