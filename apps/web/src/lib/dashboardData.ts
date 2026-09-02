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

const PILLAR_LABELS: Record<'th' | 'en', Record<PillarId, { label: string; note: string }>> = {
  th: {
    harmony: { label: 'ความสมดุล', note: 'สัดส่วนโดยรวมสมดุล' },
    angularity: { label: 'โครงสร้างเหลี่ยมคม', note: 'มิติและความคมชัด' },
    dimorphism: { label: 'เอกลักษณ์เฉพาะ', note: 'สัดส่วนเฉพาะบุคคล' },
    features: { label: 'ตา จมูก ปาก', note: 'ความสมดุลขององค์ประกอบ' },
  },
  en: {
    harmony: { label: 'Harmony', note: 'Balanced proportions' },
    angularity: { label: 'Angularity', note: 'Shape and definition' },
    dimorphism: { label: 'Dimorphism', note: 'Individual characteristics' },
    features: { label: 'Features', note: 'Eyes, nose and lips' },
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
export function strengthsFor(scan: Scan, limit = 3, locale: 'th' | 'en' = 'en') {
  const refLabel = locale === 'th' ? 'เกณฑ์อ้างอิง' : 'Reference';
  return ratioRows(scan, locale)
    .filter((row) => typeof row.score === 'number')
    .sort(byScoreDescending)
    .slice(0, limit)
    .map((row) => ({
      name: row.name,
      score: row.score.toFixed(1),
      detail: row.mayIndicate,
      ratios: [`${row.name} ${row.score.toFixed(1)}`, `${refLabel} ${row.ideal}`],
    }));
}

/**
 * Measurements furthest from the reference.
 */
export function improvementsFor(scan: Scan, limit = 3, locale: 'th' | 'en' = 'en') {
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
