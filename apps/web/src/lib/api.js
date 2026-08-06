import { getFirebaseAuth, googleSignIn } from './firebase';


// Matches the port compose.yaml publishes the api service on, and the mobile app's default.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api/v1';

async function request(path, options = {}) {
  const firebaseAuth = getFirebaseAuth();
  await firebaseAuth.authStateReady();
  const token = await firebaseAuth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in before continuing.');
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` }
    });
  } catch (cause) {
    // fetch rejects with an opaque "Failed to fetch" when the API is unreachable. Tag it so
    // callers can say something useful instead of leaking the browser's English string.
    const error = new Error(`Cannot reach the API at ${API_URL}`, { cause });
    error.code = 'api_unreachable';
    throw error;
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

export async function signIn() {
  await googleSignIn();
  return request('/session/');
}

export function uploadScan(files, ageBand, consentVersion, scanMode = 'full') {
  const body = new FormData();
  for (const [view, file] of Object.entries(files)) {
    if (file) body.append(view, file);
  }
  body.append('age_band', ageBand);
  body.append('analysis_consent_version', consentVersion);
  body.append('scan_mode', scanMode);
  return request('/scans/', { method: 'POST', body });
}

export const getScan = (scanId) => request(`/scans/${scanId}/status/`);
export const getScans = () => request('/scans/');
export const deleteScan = (scanId) => request(`/scans/${scanId}/`, { method: 'DELETE' });
export const getProcedures = (region) => request(`/procedures/?region=${encodeURIComponent(region)}`);
export const createSimulation = (scanId, region, parameters, consentVersion) => request('/simulations/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scan_id: scanId, region, parameters, simulation_consent_version: consentVersion }),
});
export const getSimulation = (simulationId) => request(`/simulations/${simulationId}/status/`);
export const deleteAccount = () => request('/account/', { method: 'DELETE' });
