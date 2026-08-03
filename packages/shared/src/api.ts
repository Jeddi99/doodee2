export type TokenProvider = () => Promise<string | null>;

export const SCAN_VIEWS = ['front', 'front_smile', 'left_oblique', 'right_oblique', 'left_profile', 'right_profile', 'basal'] as const;
export type ScanView = typeof SCAN_VIEWS[number];

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
    getScan: (id: string) => request(`/scans/${id}/status/`),
    deleteScan: (id: string) => request(`/scans/${id}/`, { method: 'DELETE' }),
    createSimulation: (scanId: string, region: string, parameters: Record<string, number>) => request('/simulations/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scan_id: scanId, region, parameters, simulation_consent_version: '2026.1' }),
    }),
    getSimulation: (id: string) => request(`/simulations/${id}/status/`),
  };
}
