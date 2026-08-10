import { signInAnonymously } from 'firebase/auth';
import { getFirebaseAuth, googleSignIn } from './firebase';
import { errorMessage } from './apiError';


// Matches the port compose.yaml publishes the api service on, and the mobile app's default.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api/v1';

async function request(path, options = {}) {
  let token = null;
  try {
    const firebaseAuth = getFirebaseAuth();
    await firebaseAuth.authStateReady();
    if (!firebaseAuth.currentUser) {
      await signInAnonymously(firebaseAuth).catch(() => {});
    }
    token = await firebaseAuth.currentUser?.getIdToken();
  } catch {
    token = 'dev-guest-token';
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token || 'dev-guest-token'}` }
    });
  } catch (cause) {
    const error = new Error(`Cannot reach the API at ${API_URL}`, { cause });
    error.code = 'api_unreachable';
    throw error;
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(errorMessage(payload) || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

export async function signIn() {
  await googleSignIn();
  return request('/session/');
}

export function uploadScan(files, ageBand, referenceAgeBand, referenceProfile, referencePopulation, consentVersion, scanMode = 'standard') {
  const body = new FormData();
  for (const [view, file] of Object.entries(files)) {
    if (file) body.append(view, file);
  }
  body.append('age_band', ageBand);
  body.append('reference_age_band', referenceAgeBand);
  body.append('reference_profile', referenceProfile);
  body.append('reference_population', referencePopulation);
  body.append('analysis_consent_version', consentVersion);
  body.append('scan_mode', scanMode);
  return request('/scans/', { method: 'POST', body });
}

export const getScan = (scanId) => request(`/scans/${scanId}/status/`);
export const getScans = () => request('/scans/');
export const getSession = () => request('/session/');
export const deleteScan = (scanId) => request(`/scans/${scanId}/`, { method: 'DELETE' });
// Without a region this returns the whole catalog, which the simulation view needs: a stacked
// selection has to name shapes and procedures for regions whose tab is not open.
export const getProcedures = (region) => request(region ? `/procedures/?region=${encodeURIComponent(region)}` : '/procedures/');
// `selections` is an array of `{ region, preset_id }` — one entry per region being simulated.
export const createSimulation = (scanId, selections, consentVersion) => request('/simulations/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scan_id: scanId, selections, simulation_consent_version: consentVersion }),
});
export const previewSimulation = (scanId, selections, consentVersion) => request('/simulations/preview/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scan_id: scanId, selections, simulation_consent_version: consentVersion }),
});
export const getSimulation = (simulationId) => request(`/simulations/${simulationId}/status/`);
export const deleteAccount = () => request('/account/', { method: 'DELETE' });
export const redeemCode = (code) => request('/redeem/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code }),
});
