// The typed age never leaves the browser: only the band derived from it is sent to the API,
// so the server stores an age range rather than an exact age.
export const AGE_BANDS = { UNDER_18: 'under_18', ADULT_COHORT: '18_35', ADULT_OUTSIDE: '36_plus' };

export function ageBandFor(input) {
  if (!/^\d{1,3}$/.test(String(input).trim())) return null;
  const age = Number(input);
  if (age < 1 || age > 120) return null;
  if (age < 18) return AGE_BANDS.UNDER_18;
  return age >= 36 ? AGE_BANDS.ADULT_OUTSIDE : AGE_BANDS.ADULT_COHORT;
}

export const canContinueFromAge = (input) => {
  const band = ageBandFor(input);
  return Boolean(band) && band !== AGE_BANDS.UNDER_18;
};

/**
 * Populations `reference_scoring.py` actually publishes means for. Keep in step with
 * REFERENCE_POPULATIONS in backend/doodee/reference_scoring.py.
 */
export const REFERENCE_POPULATIONS = ['TH', 'LA', 'KH', 'MM', 'VN', 'MY', 'SG', 'ID', 'PH', 'CN', 'JP', 'KR', 'OTHER'];

/**
 * The onboarding country picker lists every ISO-3166 region, but only thirteen of them have a
 * published reference cohort. Anything else collapses to OTHER rather than 400-ing the upload.
 */
export const referencePopulationFor = (countryCode) => {
  const code = String(countryCode ?? '').trim().toUpperCase();
  return REFERENCE_POPULATIONS.includes(code) && code !== 'OTHER' ? code : 'OTHER';
};

/** qijek's picker offers two sexes; the backend also accepts `neutral`, which it is not asked for. */
export const referenceProfileFor = (sexReference) =>
  sexReference === 'male' ? 'masculine' : sexReference === 'female' ? 'feminine' : 'neutral';

const STORAGE_KEY = 'doodee:onboarding';

/**
 * Onboarding and the scan page are separate routes, so the answers travel through
 * sessionStorage. Only the derived band is stored — never the age that was typed.
 */
export function saveOnboardingAnswers({ age, sexReference, birthCountry, consentVersion }) {
  const referenceAgeBand = ageBandFor(age);
  const answers = {
    ageBand: 'adult',
    referenceAgeBand,
    referenceProfile: referenceProfileFor(sexReference),
    referencePopulation: referencePopulationFor(birthCountry),
    consentVersion,
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch {
    // Private-mode Safari throws; the scan page falls back to its own defaults.
  }
  return answers;
}

export function readOnboardingAnswers() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
