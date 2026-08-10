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
