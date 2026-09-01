export type TokenProvider = () => Promise<string | null>;

// One version string for every simulation consent record, on both clients. Preview and save
// ask for the same consent, so recording two different versions would misstate what the user
// actually agreed to.
export const SIMULATION_CONSENT_VERSION = '2026.3-local';

// Keep in step with backend/doodee/analysis_engine.py SCAN_VIEW_MODES.
export const SCAN_VIEW_MODES = {
  full: ['front', 'front_smile', 'left_oblique', 'right_oblique', 'left_profile', 'right_profile', 'basal'],
  standard: ['front', 'left_profile', 'right_profile'],
  fast: ['front', 'left_oblique', 'right_oblique'],
} as const;

export const SCAN_VIEWS = SCAN_VIEW_MODES.full;

export type ScanMode = keyof typeof SCAN_VIEW_MODES;
export type ScanView = (typeof SCAN_VIEWS)[number];

/** One body shape for both simulation calls. `view` is omitted when the caller names none, so
 *  the server keeps its own choice rather than being handed `undefined` to interpret. */
const simulationBody = (scanId: string, selections: unknown[], view?: string) => JSON.stringify({
  scan_id: scanId,
  selections,
  simulation_consent_version: SIMULATION_CONSENT_VERSION,
  ...(view ? { view } : {}),
});

export function createApi(baseUrl: string, tokenProvider: TokenProvider) {
  async function request(path: string, options: RequestInit = {}) {
    const token = await tokenProvider();
    if (!token) throw new Error('Sign in before continuing.');
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail || JSON.stringify(payload) || `Request failed (${response.status})`);
    }
    return response.status === 204 ? null : response.json();
  }

  return {
    session: () => request('/session/'),
    uploadScan: (body: FormData) => request('/scans/', { method: 'POST', body }),
    uploadScanDirect: async (files: Record<string, { uri: string; type?: string }>, metadata: Record<string, unknown>) => {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const types = Object.fromEntries(Object.entries(files).map(([view, file]) => [view, file.type || 'image/jpeg']));
      const reserved = await request('/scans/uploads/', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ ...metadata, files: types }),
      });
      await Promise.all(Object.entries(reserved.uploads).map(async ([view, grant]: [string, any]) => {
        const blob = await fetch(files[view].uri).then((response) => response.blob());
        const response = await fetch(grant.url, { method: 'PUT', headers: { 'Content-Type': grant.content_type }, body: blob });
        if (!response.ok) throw new Error(`Storage upload failed (${response.status})`);
      }));
      return request(`/scans/${reserved.id}/commit/`, { method: 'POST' });
    },
    getScan: (id: string) => request(`/scans/${id}/status/`),
    deleteScan: (id: string) => request(`/scans/${id}/`, { method: 'DELETE' }),
    // The clinical catalog: what a clinic actually does, one row per procedure. Without a
    // category this returns every renderable row, which is what a client grouping them itself
    // wants — one request rather than one per tab.
    getProcedures: (category?: string | number) =>
      request(category === undefined ? '/procedures/' : `/procedures/?category=${encodeURIComponent(String(category))}`),
    // The headings, derived on the server, so one with nothing renderable behind it never
    // arrives here and no client has to hardcode the list.
    getProcedureCategories: () => request('/procedures/categories/'),
    // `selections` is `{ procedure_id, intensity_level }` per procedure. `view` names which of
    // the three renders comes back as the image; the fused engine draws all three either way.
    previewSimulation: (scanId: string, selections: unknown[], view?: string) => request('/simulations/preview/', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `${Date.now()}-${Math.random()}` },
      body: simulationBody(scanId, selections, view),
    }),
    createSimulation: (scanId: string, selections: unknown[], view?: string) => request('/simulations/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `${Date.now()}-${Math.random()}` },
      body: simulationBody(scanId, selections, view),
    }),
    getSimulation: (id: string) => request(`/simulations/${id}/status/`),
  };
}
