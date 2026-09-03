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

export type PillarId = 'harmony' | 'angularity' | 'eyes' | 'features';
export type MetricCategory = 'proportions' | 'eyes' | 'nose' | 'lips' | 'chin';
/** The two photographs a measurement can be read off. `reference_scoring.SCORED_VIEWS`. */
export type ScoredView = 'front' | 'side';

/** One entry of reference_scores.metrics, as reference_scoring.py emits it. */
export type ScoredMetric = {
  key: string;
  category: MetricCategory;
  observed: number;
  reference: number;
  normalized_deviation: number;
  score: number;
  unit: 'ratio' | 'degree';
  /** Which photograph it was read off. Absent on scans analysed before per-view scoring. */
  view?: ScoredView;
};

export type ReferenceScores = {
  overall_score: number | null;
  categories: { key: MetricCategory; score: number; metric_count: number }[];
  metrics: ScoredMetric[];
  /** Present only on scans analysed after per-view scoring landed; derived here when it is not. */
  views?: { key: ScoredView; score: number; metric_count: number }[];
  /** Who the published means were measured on. `reference_scoring.score_observations`. */
  reference?: {
    profile?: string;
    population?: string;
    age_range?: string;
    sample_size?: number;
    source?: string;
    version?: string;
  };
  cohort_match?: string;
  population_match?: string;
  reported_population?: string;
};

export type Scan = {
  analysis_data?: { reference_scores?: ReferenceScores; metrics?: unknown[] };
} | null | undefined;

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
  /**
   * Why it is locked, which is not one thing.
   *
   * `not_scored` means this scan has no score for it yet — a paid plan or a better scan can
   * change that. `unmeasurable` means no published reference measures it at all, so paying
   * changes nothing and offering the upgrade is selling something that does not exist.
   */
  lockReason: 'not_scored' | 'unmeasurable' | null;
  metricCount: number;
};

/**
 * Which reference_scoring categories feed each qijek pillar. Empty means the pillar stays locked.
 *
 * The fourth card used to be `dimorphism`, and it was empty on purpose: no published reference
 * measures sexual dimorphism from a photograph, so it showed an em dash forever, could not be
 * clicked, and no plan unlocked it. Filling it with a masculinity figure was never an option —
 * `reference_scoring.REFERENCE` carries a male and a female mean for all twelve observations, and
 * once they are divided by n-gn the way a photograph forces (there is no scale in a photo), the
 * two collapse: seven of the twelve separate by under 0.2 of a pooled SD and eleven by under 0.5.
 * The dimorphism in that cohort is almost entirely overall size — 120.6 mm of facial height
 * against 110.8 — which is the one thing a photograph cannot read. Only the nasofrontal angle
 * reaches 0.8, and a pillar built on one angle would be a coin flip wearing a decimal point.
 *
 * So the fourth card is filled from measurements that are real instead. `features` was carrying
 * eight of the twelve averaged into a single number, which hid more than it showed; the eyes now
 * stand on their own and the card that was dead carries the nose and mouth. Nothing was invented
 * and nothing was dropped — all twelve observations are still scored, in four groups instead of
 * three plus a blank.
 */
const PILLAR_CATEGORIES: Record<PillarId, MetricCategory[]> = {
  harmony: ['proportions'],
  angularity: ['chin'],
  eyes: ['eyes'],
  features: ['nose', 'lips'],
};

/**
 * Which pillar a scored category belongs to — the inverse of the table above.
 *
 * Derived rather than written down. `DashboardPage` kept its own copy of this mapping, and when
 * the fourth card was filled the copy was not updated, so the analysis tab for "nose and mouth"
 * listed the two eye measurements under it. A second table nothing checks is a second answer to
 * the same question; this one cannot disagree with `PILLAR_CATEGORIES` because it is built from it.
 */
export const pillarOfCategory = (category: MetricCategory): PillarId | undefined =>
  (Object.keys(PILLAR_CATEGORIES) as PillarId[])
    .find((id) => PILLAR_CATEGORIES[id].includes(category));

/**
 * A pillar names the measurements behind it, not a quality of the face.
 *
 * `harmony` read "ความสมดุล · สัดส่วนโดยรวมสมดุล" — "overall proportions are balanced" — and a
 * reader saw 9.9 beside an overall of 7.8 and asked which of the two was made up. Neither was:
 * the pillar is the `proportions` category alone, two measurements of facial height, while the
 * overall averages all twelve including a weak one. The word "โดยรวม" was doing the damage, so
 * every note now says which part of the face was measured and none of them says "overall".
 */
const PILLAR_LABELS: Record<'th' | 'en', Record<PillarId, { label: string; note: string }>> = {
  th: {
    harmony: { label: 'สัดส่วนความสูงใบหน้า', note: 'ความสูงของกลางหน้าและหน้าส่วนล่าง เทียบค่าอ้างอิง' },
    angularity: { label: 'คาง', note: 'ความสูงและความกว้างของคาง เทียบค่าอ้างอิง' },
    eyes: { label: 'ดวงตา', note: 'ระยะระหว่างหัวตาและความกว้างของตา เทียบค่าอ้างอิง' },
    features: { label: 'จมูกและปาก', note: 'ความกว้างจมูก มุมจมูก และความหนาของริมฝีปาก เทียบค่าอ้างอิง' },
  },
  en: {
    harmony: { label: 'Facial height', note: 'Midface and lower-face height against the reference' },
    angularity: { label: 'Chin', note: 'Chin height and width against the reference' },
    eyes: { label: 'Eyes', note: 'Intercanthal width and eye fissure against the reference' },
    features: { label: 'Nose and mouth', note: 'Nasal width, nasal angles and lip thickness against the reference' },
  },
};

/**
 * Per-metric copy for the twelve keys the backend actually scores in Thai and English.
 */
export const METRIC_COPY: Record<'th' | 'en', Record<string, { name: string; detail: string; mayIndicate: string; affected: string[] }>> = {
  th: {
    midface_height: {
      name: 'ความสูงใบหน้าส่วนกลาง',
      detail: 'ระยะจากหัวคิ้วถึงใต้จมูก เทียบกับความสูงใบหน้ารวม',
      mayIndicate: 'สัดส่วนความยาวของใบหน้าช่วงกลาง',
      affected: ['ใบหน้าส่วนกลาง', 'ใบหน้าส่วนบน'],
    },
    lower_face_height: {
      name: 'ความสูงใบหน้าส่วนล่าง',
      detail: 'ระยะจากใต้จมูกถึงปลายคาง เทียบกับความสูงใบหน้ารวม',
      mayIndicate: 'สัดส่วนความยาวของใบหน้าช่วงล่างใต้จมูก',
      affected: ['ใบหน้าส่วนล่าง', 'คาง'],
    },
    intercanthal: {
      name: 'ระยะห่างหัวตา',
      detail: 'ระยะห่างระหว่างหัวตาทั้งสองข้าง เทียบกับความกว้างใบหน้า',
      mayIndicate: 'ความกว้างของช่องว่างระหว่างตาทั้งสองข้าง',
      affected: ['ดวงตา', 'สันจมูก'],
    },
    eye_fissure: {
      name: 'ความกว้างของดวงตา',
      detail: 'ความกว้างเฉลี่ยจากหัวตาถึงหางตา เทียบกับสัดส่วนใบหน้า',
      mayIndicate: 'ขนาดช่องเปิดและความยาวของดวงตา',
      affected: ['ดวงตา'],
    },
    alar_width: {
      name: 'ความกว้างปีกจมูก',
      detail: 'ความกว้างของฐานปีกจมูกทั้งสองข้าง เทียบกับสัดส่วนใบหน้า',
      mayIndicate: 'ความกว้างของฐานจมูกเมื่อมองตรง',
      affected: ['จมูก'],
    },
    nasofrontal_angle: {
      name: 'มุมหน้าผาก-จมูก',
      detail: 'มุมรอยต่อระหว่างหน้าผากกับสันจมูก จากมุมมองด้านข้าง',
      mayIndicate: 'ความลาดเอียงและความต่อเนื่องของสันจมูก',
      affected: ['หน้าผาก', 'สันจมูก'],
    },
    nasolabial_angle: {
      name: 'มุมจมูก-ริมฝีปาก',
      detail: 'มุมระหว่างฐานจมูกกับริมฝีปากบน จากมุมมองด้านข้าง',
      mayIndicate: 'การเชิดขึ้นหรือชี้ลงของปลายจมูก',
      affected: ['ปลายจมูก', 'ริมฝีปากบน'],
    },
    upper_lip_length: {
      name: 'ความยาวริมฝีปากบน (ร่องแก้ม)',
      detail: 'ระยะจากใต้จมูกถึงขอบปากบน เทียบกับความสูงใบหน้า',
      mayIndicate: 'ความยาวของร่องริมฝีปากบน (Philtrum)',
      affected: ['ร่องปากบน', 'ริมฝีปากบน'],
    },
    upper_vermillion: {
      name: 'ความหนาริมฝีปากบน',
      detail: 'ความสูงเนื้อปากบนสีชมพู เทียบกับสัดส่วนใบหน้า',
      mayIndicate: 'ความอวบอิ่มของริมฝีปากบน',
      affected: ['ริมฝีปากบน'],
    },
    lower_vermillion: {
      name: 'ความหนาริมฝีปากล่าง',
      detail: 'ความสูงเนื้อปากล่างสีชมพู เทียบกับสัดส่วนใบหน้า',
      mayIndicate: 'ความอวบอิ่มของริมฝีปากล่าง',
      affected: ['ริมฝีปากล่าง'],
    },
    chin_height: {
      name: 'ความสูงของคาง',
      detail: 'ระยะจากรอยประกบริมฝีปากถึงปลายคาง',
      mayIndicate: 'สัดส่วนความยาวและความเด่นชัดของคาง',
      affected: ['คาง'],
    },
    facial_convexity_angle: {
      name: 'มุมความนูนของใบหน้า',
      detail: 'มุมความโค้งของแนวด้านข้างตั้งแต่สันจมูก ฐานจมูก ถึงปลายคาง',
      mayIndicate: 'มิติความนูนหรือเว้าของใบหน้าด้านข้าง',
      affected: ['จมูก', 'ริมฝีปาก', 'คาง'],
    },
  },
  en: {
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
export function deviationStatus(normalizedDeviation: number, locale: 'th' | 'en' = 'en'): string {
  const z = Math.abs(Number(normalizedDeviation) || 0);
  if (locale === 'th') {
    if (z <= 0.5) return 'ใกล้เคียงเกณฑ์อ้างอิง';
    if (z <= 1) return 'อยู่ในเกณฑ์ 1 SD';
    if (z <= 2) return 'อยู่ในเกณฑ์ 2 SD';
    return 'เกินกว่า 2 SD';
  }
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
export function toRatioRow(metric: ScoredMetric, locale: 'th' | 'en' = 'en'): RatioRow {
  const dict = METRIC_COPY[locale] || METRIC_COPY.en;
  const copy = dict[metric.key] || METRIC_COPY.en[metric.key] || {};
  return {
    id: metric.key,
    name: copy.name || metric.key,
    value: formatValue(metric),
    score: toTenScale(metric.score) ?? 0,
    ideal: formatReference(metric),
    status: deviationStatus(metric.normalized_deviation, locale),
    detail: copy.detail || '',
    mayIndicate: copy.mayIndicate || '',
    affected: copy.affected || [],
    category: metric.category,
    normalizedDeviation: metric.normalized_deviation,
  };
}

const referenceScores = (scan: Scan): ReferenceScores | null => scan?.analysis_data?.reference_scores || null;

/** Scored metrics as rows, or an empty list when the scan has not produced any. */
export function ratioRows(scan: Scan, locale: 'th' | 'en' = 'en'): RatioRow[] {
  return (referenceScores(scan)?.metrics || []).map((m) => toRatioRow(m, locale));
}

/**
 * The four pillar cards. A pillar whose categories the backend did not score comes back locked.
 */
export function pillarsFor(scan: Scan, locale: 'th' | 'en' = 'en'): Pillar[] {
  const scores = referenceScores(scan);
  const byCategory = new Map((scores?.categories || []).map((item) => [item.key, item]));
  const dict = PILLAR_LABELS[locale] || PILLAR_LABELS.en;
  return (Object.keys(PILLAR_CATEGORIES) as PillarId[]).map((id) => {
    const categories = PILLAR_CATEGORIES[id];
    const present = categories.flatMap((key) => {
      const item = byCategory.get(key);
      return item ? [item] : [];
    });
    const { label, note } = dict[id] || PILLAR_LABELS.en[id];
    if (!present.length) {
      // No category behind it at all means no study measures it — as against a category that
      // exists but this particular scan did not score.
      const lockReason = categories.length ? 'not_scored' : 'unmeasurable';
      return { id, label, note, score: '—', locked: true, lockReason, metricCount: 0 };
    }
    const mean = present.reduce((total, item) => total + item.score, 0) / present.length;
    return {
      id,
      label,
      note,
      score: (toTenScale(mean) ?? 0).toFixed(1),
      locked: false,
      lockReason: null,
      metricCount: present.reduce((total, item) => total + item.metric_count, 0),
    };
  });
}

export const overallScore = (scan: Scan): number | null => toTenScale(referenceScores(scan)?.overall_score);

/** The order the Front/Side strip renders them in. Mirrors `reference_scoring.SCORED_VIEWS`. */
const SCORED_VIEWS: ScoredView[] = ['front', 'side'];

/**
 * Which photograph each scored measurement was read off.
 *
 * A mirror of `reference_scoring.VIEW_OF`, and needed here for the same reason the server keeps
 * its own fallback: most scans in the database were analysed before per-view scoring existed and
 * carry neither a `views` summary nor a `view` on each metric, only the twelve keys. Without this
 * table those scans have no front or side score at all, which is what the two photographs were
 * taken to produce. `dashboardData.test.js` reads `VIEW_OF` out of `reference_scoring.py` and
 * fails if the two ever disagree, so a key added server-side cannot go quietly missing here.
 */
export const METRIC_VIEW: Record<string, ScoredView> = {
  midface_height: 'front',
  lower_face_height: 'front',
  intercanthal: 'front',
  eye_fissure: 'front',
  alar_width: 'front',
  upper_lip_length: 'front',
  upper_vermillion: 'front',
  lower_vermillion: 'front',
  chin_height: 'front',
  nasofrontal_angle: 'side',
  nasolabial_angle: 'side',
  facial_convexity_angle: 'side',
};

export type ViewScore = {
  key: ScoredView;
  /** The ten-point figure the strip prints, or an em dash when this view was never scored. */
  score: string;
  /** How many measurements the average is over, so the screen can say what backs the number. */
  metricCount: number;
  scored: boolean;
};

/**
 * The Front and Side scores, from this scan's own measurements.
 *
 * Both views always come back, scored or not, because the strip has two buttons either way and a
 * view with nothing behind it has to read as absent rather than as a low score. A front-only scan
 * has no side measurements, so its side entry is unscored — not zero, and certainly not a number
 * carried over from somebody else.
 *
 * Three sources, in the same order the server tries them (`reference_scoring.views_from_metrics`):
 * the stored `views` summary, then the `view` written on each metric, then the key table above.
 * The average is over the metrics of that view rather than over its categories, matching the
 * server exactly — going through categories would weight the side score, three angles spread
 * across two categories, quite differently.
 */
export function viewScoresFor(scan: Scan): ViewScore[] {
  const scores = referenceScores(scan);
  const summarised = new Map(
    (scores?.views || []).map((item) => [item.key, { score: item.score, count: item.metric_count }]),
  );
  if (!summarised.size) {
    const buckets = new Map<ScoredView, number[]>(SCORED_VIEWS.map((view) => [view, []]));
    for (const metric of scores?.metrics || []) {
      if (typeof metric.score !== 'number' || !Number.isFinite(metric.score)) continue;
      buckets.get(metric.view || METRIC_VIEW[metric.key])?.push(metric.score);
    }
    for (const [view, found] of buckets) {
      // Rounded to a whole score before the ten-point division, which is where the server rounds
      // it too — otherwise a scan with a stored summary and one without would print different
      // numbers for the same twelve measurements.
      if (found.length) {
        summarised.set(view, {
          score: Math.round(found.reduce((total, score) => total + score, 0) / found.length),
          count: found.length,
        });
      }
    }
  }
  return SCORED_VIEWS.map((key) => {
    const found = summarised.get(key);
    const ten = toTenScale(found?.score);
    if (!found || ten === null) return { key, score: '—', metricCount: 0, scored: false };
    return { key, score: ten.toFixed(1), metricCount: found.count, scored: true };
  });
}

const byScoreDescending = (a: RatioRow, b: RatioRow) => b.score - a.score;

/**
 * The two insight cards rank the same measurements two different ways, so the number each one
 * prints is a different quantity: a strength shows a closeness score out of ten, an improvement
 * shows a signed distance in standard deviations. They land in the same slot on screen, and a
 * bare "+2.4" beside a bare "9.5" reads as two scores on one scale. The unit travels with the
 * figure so it cannot.
 */
export type InsightRow = {
  name: string;
  score: string;
  scoreUnit: string;
  /** How far this measurement sits from the reference, in `deviationStatus`'s own words. */
  level: string;
  detail: string;
  ratios: string[];
};

/**
 * Highest-scoring measurements, ranked. Derived, never a stored literal.
 *
 * The whole ranking by default rather than a top three: the card that renders these shows three
 * and offers to show the rest, and it can only say how many "the rest" is if it is holding them.
 * It used to be handed exactly three under a "3 of 18" counter and a "Show 15 more" button, and
 * there was neither an eighteen nor a fifteen anywhere in the system.
 */
export function strengthsFor(scan: Scan, limit = Infinity, locale: 'th' | 'en' = 'en'): InsightRow[] {
  const refLabel = locale === 'th' ? 'เกณฑ์อ้างอิง' : 'Reference';
  return ratioRows(scan, locale)
    .filter((row) => typeof row.score === 'number')
    .sort(byScoreDescending)
    .slice(0, limit)
    .map((row) => ({
      name: row.name,
      score: row.score.toFixed(1),
      scoreUnit: '/10',
      // The band this measurement actually falls in. The card used to label every strength
      // "Ideal", which is a verdict `deviationStatus` never returns and the scorer never makes:
      // the closest band it knows is "close to the published mean".
      level: deviationStatus(row.normalizedDeviation, locale),
      detail: row.mayIndicate,
      ratios: [`${row.name} ${row.score.toFixed(1)}`, `${refLabel} ${row.ideal}`],
    }));
}

/**
 * Measurements furthest from the reference, ranked. See `strengthsFor` on the default limit.
 */
export function improvementsFor(scan: Scan, limit = Infinity, locale: 'th' | 'en' = 'en'): InsightRow[] {
  const obsLabel = locale === 'th' ? 'ค่าที่วัดได้' : 'Observed';
  const refLabel = locale === 'th' ? 'เกณฑ์อ้างอิง' : 'Reference';
  return ratioRows(scan, locale)
    .filter((row) => typeof row.score === 'number')
    .sort((a, b) => Math.abs(b.normalizedDeviation) - Math.abs(a.normalizedDeviation))
    .slice(0, limit)
    .map((row) => ({
      name: row.name,
      score: row.normalizedDeviation > 0
        ? `+${round1(row.normalizedDeviation)}`
        : String(round1(row.normalizedDeviation)),
      scoreUnit: 'SD',
      level: deviationStatus(row.normalizedDeviation, locale),
      detail: row.mayIndicate,
      ratios: [`${obsLabel} ${row.value}`, `${refLabel} ${row.ideal}`],
    }));
}

/**
 * How many characteristics this product claims to read.
 *
 * A constant rather than a query in the three places that only need the headline number —
 * a loading spinner, a pricing bullet and a tab label. Pinned to `metric_catalog.CATALOG` by
 * `faceMetrics.test.js`'s sibling check, so it cannot drift into a claim the server disagrees
 * with the way the hardcoded 102-entry client list did.
 */
export const CATALOG_SIZE = 85;

/** One measured metric as `analysis_engine` emits it — the 51, not the 12 that get scored. */
export type MeasuredMetric = { key: string; value: number; unit?: string; category?: string };

/** A row of `metric_catalog`, as `GET /metric-catalog/` serves it. */
export type CatalogEntry = {
  number: number;
  id: string;
  group: string;
  name_th: string;
  name_en: string;
  metrics: string[];
  reference: string[];
  skin_signals: string[];
  status: 'measured' | 'not_measured';
  note_th: string | null;
  note_en: string | null;
};

/**
 * What this scan can fill in on a catalog entry.
 *
 * Joined on metric keys, which is what the two sides actually share. It used to be joined on the
 * *display name* — a lowercased English string matched against a twelve-entry lookup table —
 * because the library's catalog was a hardcoded list with positional ids that had nothing to do
 * with what the server measures. The server serves the catalog now, and each entry names its own
 * keys, so the guessing is gone.
 *
 * Two families, tried in order. `reference` keys are the twelve with a published mean, so they
 * come with a value *and* something to compare it against. `metrics` keys are the fifty-one this
 * face was measured on, which have a number but no norm — worth showing, but never as a score.
 */
export function catalogAvailability(scan: Scan) {
  const scored = new Map(ratioRows(scan).map((row) => [row.id, row]));
  const measured = new Map(
    ((scan?.analysis_data?.metrics as MeasuredMetric[] | undefined) || []).map((m) => [m.key, m]),
  );
  return {
    /** Backend metric keys present on this scan — used by ratio rows and pillar tabs. */
    isAvailable: (metricKey: string) => scored.has(metricKey),
    /** The scored row behind a catalog entry, or null when nothing scores it. */
    scoredFor: (entry: CatalogEntry) =>
      entry.reference.map((key) => scored.get(key)).find(Boolean) ?? null,
    /** The raw measurement behind a catalog entry, for the rows with no published norm. */
    measuredFor: (entry: CatalogEntry) =>
      entry.metrics.map((key) => measured.get(key)).find(Boolean) ?? null,
    availableCount: scored.size,
    measuredCount: measured.size,
  };
}

export const UNSUPPORTED_CATEGORIES = ['brows', 'cheeks', 'jaw', 'smile', 'neck', 'skin'];

/**
 * Who the published means this scan was scored against were actually measured on.
 *
 * A measurement compared against "the reference" says nothing until the reader can see which
 * reference: which population, which age band, and how many people are in it. All three are on
 * the scan already — `score_observations` writes them into `reference_scores.reference` — so this
 * only reshapes them, and reports the two mismatch flags the server sets when the person being
 * scored falls outside the cohort their score was computed against.
 */
export type ReferenceCohort = {
  /** e.g. "Thai adults". Null on a scan stored before the reference block existed. */
  population: string | null;
  /** e.g. "18-35". */
  ageRange: string | null;
  sampleSize: number | null;
  /** Which set of means, e.g. "neutral". */
  profile: string | null;
  source: string | null;
  version: string | null;
  /** The score is never rescaled for either mismatch, so the screen has to be able to say so. */
  outsideAgeRange: boolean;
  outsidePopulation: boolean;
  /** The country the user selected, which is what `outsidePopulation` is measured against. */
  reportedPopulation: string | null;
  /** False when this scan carries no cohort at all, in which case nothing above may be shown. */
  known: boolean;
};

export function referenceCohortFor(scan: Scan): ReferenceCohort {
  const scores = referenceScores(scan);
  const reference = scores?.reference;
  return {
    population: reference?.population ?? null,
    ageRange: reference?.age_range ?? null,
    sampleSize: typeof reference?.sample_size === 'number' ? reference.sample_size : null,
    profile: reference?.profile ?? null,
    source: reference?.source ?? null,
    version: reference?.version ?? null,
    // Compared against the exact strings the server writes rather than by negating the "within"
    // ones: an unrecognised value must not silently become a warning about a cohort mismatch
    // nobody established.
    outsideAgeRange: scores?.cohort_match === 'outside_reference_age_range',
    outsidePopulation: scores?.population_match === 'outside_reference_population',
    reportedPopulation: scores?.reported_population ?? null,
    known: Boolean(reference?.population && reference?.sample_size),
  };
}

/** The three regions with a published mean behind them, in the simulation screen's own vocabulary. */
export type SimulationRegion = 'nose' | 'lips' | 'chin';

/**
 * Which simulation region a scored measurement feeds, for the measurements that feed one.
 *
 * A mirror of `reference_scoring.REFERENCE_TARGETS`, which is the only place a measured ratio and
 * a warp the simulator can actually perform are connected. Four of the twelve scored keys appear
 * here, and that is the point: for the other eight there is no target to move toward, so the
 * modal must not offer to simulate them. `dashboardData.test.js` reads the table out of the Python
 * so a region gaining or losing a key cannot leave a dead button behind.
 */
export const METRIC_SIMULATION_REGION: Record<string, SimulationRegion> = {
  alar_width: 'nose',
  upper_vermillion: 'lips',
  lower_vermillion: 'lips',
  chin_height: 'chin',
};
