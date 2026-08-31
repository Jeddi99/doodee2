export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type Landmarks = readonly Landmark[];

/**
 * Phase 97 — Blendshape coefficients from MediaPipe Face Landmarker
 * (the model already has these baked in; we just had `outputFaceBlendshapes:
 * false` until now). 52 facial expression coefficients in [0, 1].
 *
 * Common keys we read in metrics + quality pipeline:
 *   eyeBlinkLeft / eyeBlinkRight  — 1.0 = fully closed
 *   eyeSquintLeft / eyeSquintRight — squinting
 *   jawOpen — 1.0 = wide open
 *   mouthSmileLeft / mouthSmileRight — smile intensity
 *   browDownLeft / browDownRight — frown
 *   browInnerUp — surprise / brow lift
 *
 * Stored as `Record<string, number>` instead of fixed keys because the
 * model documents but doesn't lock the full key set; defensive lookup
 * (`b.eyeBlinkLeft ?? 0`) is safer than a strict typed shape.
 */
export type Blendshapes = Readonly<Record<string, number>>;

export type Gender = "male" | "female";
export type Ethnicity = "universal" | "asian";

export interface MetricOptions {
  gender: Gender;
  ethnicity: Ethnicity;
}

export interface MetricResult {
  raw: number;
  score: number;
  ideal: [number, number];
  unit: "" | "°" | "x" | "%";
  /**
   * Set by the scoring pipeline (not the metric impl itself) when `raw`
   * lands outside `SANITY_BOUNDS` for the metric — almost always a
   * landmark detection error rather than a real anatomical outlier.
   * Flagged metrics get `score: 0` and are excluded from category /
   * overall aggregation.
   */
  flagged?: boolean;
  /**
   * 0..1 confidence that this measurement is reliable on this photo.
   * Combines head-pose frontness with metric-specific pose sensitivity.
   * The aggregation pipeline weights metric scores by their confidence
   * AND blends low-confidence metrics toward a neutral 5.5 so detection
   * uncertainty doesn't dump 0s onto the user.
   */
  confidence?: number;
}

export type MetricKey =
  | "canthal-tilt"
  | "fwhr"
  | "gonial-angle"
  | "golden-ratio"
  | "facial-thirds"
  | "eye-spacing-ratio"
  | "nose-mouth-ratio"
  | "upper-lower-lip-ratio"
  | "philtrum-chin-ratio"
  | "lower-third-ratio"
  | "inter-pupillary-ratio"
  | "lip-fullness"
  | "nasolabial-angle"
  | "facial-convexity"
  | "lip-e-line"
  | "palpebral-fissure-aspect"
  | "eyebrow-eye-distance"
  | "brow-tilt"
  | "eye-width-to-face"
  | "eye-symmetry"
  | "jaw-width-to-cheek-ratio"
  | "midface-ratio"
  | "chin-height-ratio"
  | "mouth-corner-tilt"
  | "mouth-width-to-face"
  | "mouth-symmetry"
  | "nose-symmetry"
  | "brow-symmetry"
  | "jaw-symmetry"
  | "mentolabial-angle"
  | "forehead-inclination"
  | "nasal-dorsum-angle"
  | "chin-projection"
  | "upper-lip-protrusion-side"
  | "right-canthal-tilt"
  | "interbrow-distance"
  | "eye-mouth-distance-ratio"
  | "lower-face-height-ratio"
  | "lower-lip-protrusion-side"
  | "alar-base-width"
  | "nose-tip-angle"
  | "cupids-bow-height"
  | "forehead-width-ratio"
  | "eye-tilt-symmetry"
  | "nose-length-ratio"
  | "mouth-chin-distance-ratio"
  | "brow-arch-height"
  | "upper-lid-show"
  | "philtrum-length-ratio"
  | "mouth-tilt"
  | "eye-aspect-ratio"
  | "mouth-aspect-ratio"
  | "bizygomatic-width-ratio"
  | "chin-width-ratio"
  | "nasal-bridge-width"
  | "brow-thickness-symmetry"
  | "eye-vertical-symmetry"
  | "forehead-height-ratio"
  | "eyebrow-arch-position"
  | "lip-corner-tilt";

export type View = "front" | "side";

export interface ScanPhoto {
  image: HTMLImageElement;
  landmarks: Landmarks;
  /**
   * Phase 97 — 52 facial-expression coefficients from the same FaceLandmarker
   * model. Optional for backward-compat with stored scans that predate this.
   * Read defensively via `scan.blendshapes?.eyeBlinkLeft ?? 0`.
   */
  blendshapes?: Blendshapes;
}

/**
 * Phase 152 — plan tier identifiers (3-tier).
 *
 * One quota family `previews` covers both single and combo previews —
 * combo previews are 1 image gen, charged as 1 preview credit.
 *
 * Legacy tier names (`weekly`/`monthly`/`starter`/`premium`) get mapped at
 * the Supabase read boundary via `normalizeLegacyTier` so existing rows
 * still resolve to a known tier without a migration.
 */
export type SubscriptionTier = "free" | "plus" | "pro";

export interface SubscriptionDoc {
  tier: SubscriptionTier;
  expiryDate: Date | null;
  /** Full-photo facial analyses allowed in this billing period. */
  scansQuota: number;
  scansUsed: number;
  /** AI image generations — surgery preview AND combo both decrement this. */
  previewsQuota: number;
  previewsUsed: number;
}
