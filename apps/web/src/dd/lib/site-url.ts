const DEFAULT_SITE_URL = "https://doodee.app";

export function getSiteUrl() {
  const raw = import.meta.env.VITE_SITE_URL?.trim().replace(/\/$/, "");
  if (!raw) return DEFAULT_SITE_URL;
  if (raw.includes("localhost") || raw.includes("127.0.0.1")) {
    return DEFAULT_SITE_URL;
  }
  return raw;
}

export const SITE_URL = getSiteUrl();
