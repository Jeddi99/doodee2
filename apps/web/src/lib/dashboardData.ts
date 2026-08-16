/**
 * Turns a completed scan from the API into the shape the ported qijek dashboard renders.
 *
 * qijek shipped every number as a literal — pillars at 7.4/7.0/6.8/7.2, three named strengths,
 * three improvements, a 102-entry measurement catalog. The backend scores twelve metrics across
 * five categories (reference_scoring.py CATEGORIES). Nothing here invents a value for the gap:
 * a pillar with no backing category stays locked, and a catalog entry with no matching metric is
 * reported as unavailable rather than filled in.
 *
 * Backend scores run 0–100; the qijek UI is a 0–10 scale, so scores are divided by ten.
 */

export type PillarId = 'harmony' | 'angularity' | 'dimorphism' | 'features';
export type MetricCategory = 'proportions' | 'eyes' | 'nose' | 'lips' | 'chin';

/** One entry of reference_scores.metrics, as reference_scoring.py emits it. */
export type ScoredMetric = {
  key: string;
  category: MetricCategory;
  observed: number;
  reference: number;
  normalized_deviation: number;
  score: number;
  unit: 'ratio' | 'degree';
};

export type ReferenceScores = {
  overall_score: number | null;
  categories: { key: MetricCategory; score: number; metric_count: number }[];
  metrics: ScoredMetric[];
};

export type Scan = { analysis_data?: { reference_scores?: ReferenceScores } } | null | undefined;

export type RatioRow = {
  id: string;
  name: string;
  value: string;
  score: number;
  ideal: string;
  status: string;
  detail: string;
  mayIndicate: string;
  affected: string[];
  category: MetricCategory;
  normalizedDeviation: number;
};

export type Pillar = {
  id: PillarId;
  label: string;
  note: string;
  score: string;
  locked: boolean;
  metricCount: number;
};

/** Which reference_scoring categories feed each qijek pillar. Empty means the pillar stays locked. */
const PILLAR_CATEGORIES: Record<PillarId, MetricCategory[]> = {
  harmony: ['proportions'],
  angularity: ['chin'],
  features: ['eyes', 'nose', 'lips'],
  // No published reference measures sexual dimorphism, so this pillar has nothing to unlock.
  dimorphism: [],
};

const PILLAR_LABELS: Record<PillarId, { label: string; note: string }> = {
  harmony: { label: 'Harmony', note: 'Balanced proportions' },
  angularity: { label: 'Angularity', note: 'Shape and definition' },
  dimorphism: { label: 'Dimorphism', note: 'No reference data yet' },
  features: { label: 'Features', note: 'Eyes, nose and lips' },
};

/**
 * Per-metric copy for the twelve keys the backend actually scores. Wording follows DESIGN.md:
 * describe what was measured and what it may indicate, never whether it looks good.
 */
export const METRIC_COPY: Record<string, { name: string; detail: string; mayIndicate: string; affected: string[] }> = {
  midface_height: {
    name: 'Midface height',
    detail: 'Nasion to subnasale, over the nasion–gnathion height.',
    mayIndicate: 'How much of the face’s height sits in the middle third.',
    affected: ['Midface', 'Upper third'],
  },
  lower_face_height: {
    name: 'Lower face height',
    detail: 'Subnasale to gnathion, over the nasion–gnathion height.',
    mayIndicate: 'How much of the face’s height sits below the nose.',
    affected: ['Lower third', 'Chin'],
  },
  intercanthal: {
    name: 'Intercanthal distance',
    detail: 'Spacing between the inner eye corners, over face height.',
    mayIndicate: 'How widely set the eyes are relative to the face.',
    affected: ['Eyes', 'Nose bridge'],
  },
  eye_fissure: {
    name: 'Eye fissure width',
    detail: 'Mean corner-to-corner eye width, over face height.',
    mayIndicate: 'Eye aperture size relative to the face.',
    affected: ['Eyes'],
  },
  alar_width: {
    name: 'Alar width',
    detail: 'Width across the nostril bases, over face height.',
    mayIndicate: 'Nose base width relative to the face.',
    affected: ['Nose'],
  },
  nasofrontal_angle: {
    name: 'Nasofrontal angle',
    detail: 'Angle from glabella through nasion to nose tip, read from profile.',
    mayIndicate: 'How the forehead meets the nose bridge.',
    affected: ['Forehead', 'Nose bridge'],
  },
  nasolabial_angle: {
    name: 'Nasolabial angle',
    detail: 'Angle between the columella and the upper lip, read from profile.',
    mayIndicate: 'Nose tip rotation relative to the upper lip.',
    affected: ['Nose tip', 'Upper lip'],
  },
  upper_lip_length: {
    name: 'Upper lip length',
    detail: 'Subnasale to the upper vermillion border, over face height.',
    mayIndicate: 'Length of the area between nose and lip.',
    affected: ['Philtrum', 'Upper lip'],
  },
  upper_vermillion: {
    name: 'Upper vermillion height',
    detail: 'Visible height of the upper lip, over face height.',
    mayIndicate: 'Upper lip fullness relative to the face.',
    affected: ['Upper lip'],
  },
  lower_vermillion: {
    name: 'Lower vermillion height',
    detail: 'Visible height of the lower lip, over face height.',
    mayIndicate: 'Lower lip fullness relative to the face.',
    affected: ['Lower lip'],
  },
  chin_height: {
    name: 'Chin height',
    detail: 'Stomion to gnathion, over face height.',
    mayIndicate: 'How much lower-face height the chin accounts for.',
    affected: ['Chin'],
  },
  facial_convexity_angle: {
    name: 'Facial convexity angle',
    detail: 'Deviation from straight through nasion, subnasale and gnathion.',
    mayIndicate: 'Overall curvature of the side profile.',
    affected: ['Nose', 'Lips', 'Chin'],
  },
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Backend 0–100 becomes the 0–10 the qijek cards render. */
export const toTenScale = (score: number | null | undefined): number | null =>
  typeof score === 'number' && Number.isFinite(score) ? round1(score / 10) : null;

/**
 * Bands come from the normalized deviation, not the score, so the label says how far the
 * measurement sits from the reference rather than passing judgement on the face.
 */
export function deviationStatus(normalizedDeviation: number): string {
  const z = Math.abs(Number(normalizedDeviation) || 0);
  if (z <= 0.5) return 'Close to reference';
  if (z <= 1) return 'Within one SD';
  if (z <= 2) return 'Within two SD';
  return 'Beyond two SD';
}

// Angles read naturally to one decimal; ratios are small enough that two decimals would hide
// the difference between an observation and its reference, so they keep three.
const formatMeasure = (value: number, unit: string) =>
  unit === 'degree' ? `${round1(value)}°` : Number(value).toFixed(3);

const formatValue = (metric: ScoredMetric) => formatMeasure(metric.observed, metric.unit);
const formatReference = (metric: ScoredMetric) => formatMeasure(metric.reference, metric.unit);

/** One scored backend metric in the row shape the analysis tables render. */
export function toRatioRow(metric: ScoredMetric): RatioRow {
  const copy = METRIC_COPY[metric.key] || {};
  return {
    id: metric.key,
    name: copy.name || metric.key,
    value: formatValue(metric),
    score: toTenScale(metric.score) ?? 0,
    ideal: formatReference(metric),
    status: deviationStatus(metric.normalized_deviation),
    detail: copy.detail || '',
    mayIndicate: copy.mayIndicate || '',
    affected: copy.affected || [],
    category: metric.category,
    normalizedDeviation: metric.normalized_deviation,
  };
}

const referenceScores = (scan: Scan): ReferenceScores | null => scan?.analysis_data?.reference_scores || null;

/** Scored metrics as rows, or an empty list when the scan has not produced any. */
export function ratioRows(scan: Scan): RatioRow[] {
  return (referenceScores(scan)?.metrics || []).map(toRatioRow);
}

/**
 * The four pillar cards. A pillar whose categories the backend did not score comes back locked,
 * which is the state qijek already renders — the difference is that here it reflects the data.
 */
export function pillarsFor(scan: Scan): Pillar[] {
  const scores = referenceScores(scan);
  const byCategory = new Map((scores?.categories || []).map((item) => [item.key, item]));
  return (Object.keys(PILLAR_CATEGORIES) as PillarId[]).map((id) => {
    const categories = PILLAR_CATEGORIES[id];
    const present = categories.flatMap((key) => {
      const item = byCategory.get(key);
      return item ? [item] : [];
    });
    const { label, note } = PILLAR_LABELS[id];
    if (!present.length) return { id, label, note, score: '—', locked: true, metricCount: 0 };
    const mean = present.reduce((total, item) => total + item.score, 0) / present.length;
    return {
      id,
      label,
      note,
      score: (toTenScale(mean) ?? 0).toFixed(1),
      locked: false,
      metricCount: present.reduce((total, item) => total + item.metric_count, 0),
    };
  });
}

export const overallScore = (scan: Scan): number | null => toTenScale(referenceScores(scan)?.overall_score);

const byScoreDescending = (a: RatioRow, b: RatioRow) => b.score - a.score;

/** Highest-scoring measurements. Derived, never a stored literal. */
export function strengthsFor(scan: Scan, limit = 3) {
  return ratioRows(scan)
    .filter((row) => typeof row.score === 'number')
    .sort(byScoreDescending)
    .slice(0, limit)
    .map((row) => ({
      name: row.name,
      score: row.score.toFixed(1),
      detail: row.mayIndicate,
      ratios: [`${row.name} ${row.score.toFixed(1)}`, `Reference ${row.ideal}`],
    }));
}

/**
 * Measurements furthest from the reference. `score` is the signed deviation, matching the
 * "−0.42"-style figure the qijek card was designed around.
 */
export function improvementsFor(scan: Scan, limit = 3) {
  return ratioRows(scan)
    .filter((row) => typeof row.score === 'number')
    .sort((a, b) => Math.abs(b.normalizedDeviation) - Math.abs(a.normalizedDeviation))
    .slice(0, limit)
    .map((row) => ({
      name: row.name,
      score: row.normalizedDeviation > 0
        ? `+${round1(row.normalizedDeviation)}`
        : String(round1(row.normalizedDeviation)),
      level: deviationStatus(row.normalizedDeviation),
      detail: row.mayIndicate,
      ratios: [`Observed ${row.value}`, `Reference ${row.ideal}`],
    }));
}

/**
 * The measurement library's 102 entries are qijek's catalog; only twelve have a backend metric
 * behind them. Catalog ids are positional (`eyes-3`), so entries are matched by name instead.
 */
const CATALOG_NAME_TO_METRIC: Record<string, string> = {
  'midface ratio': 'midface_height',
  'lower-face height': 'lower_face_height',
  'intercanthal distance': 'intercanthal',
  'palpebral fissure length': 'eye_fissure',
  'alar width': 'alar_width',
  'nasofrontal angle': 'nasofrontal_angle',
  'nasolabial angle': 'nasolabial_angle',
  'upper-lip height': 'upper_lip_length',
  'vermilion height': 'upper_vermillion',
  'lower-lip height': 'lower_vermillion',
  'chin height': 'chin_height',
  'facial convexity angle': 'facial_convexity_angle',
};

/**
 * Catalog entries the backend can currently fill. Everything else is returned unavailable so the
 * measurement library can lock it instead of showing a number nobody computed.
 */
export function catalogAvailability(scan: Scan) {
  const rows = new Map(ratioRows(scan).map((row) => [row.id, row]));
  const rowForCatalogName = (name: string) =>
    rows.get(CATALOG_NAME_TO_METRIC[name.trim().toLowerCase()] ?? '') ?? null;
  return {
    /** Backend metric keys present on this scan — used by ratio rows and pillar tabs. */
    isAvailable: (metricKey: string) => rows.has(metricKey),
    /** The scored row behind a catalog entry, or null when nothing measures it. */
    rowForCatalogName,
    availableCount: rows.size,
  };
}

export const UNSUPPORTED_CATEGORIES = ['brows', 'cheeks', 'jaw', 'smile', 'neck', 'skin'];
