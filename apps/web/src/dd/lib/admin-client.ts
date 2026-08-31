"use client";

/**
 * Phase 158 — Admin API fetch helpers.
 *
 * Centralizes the auth-header pattern (Supabase access JWT) and unwraps
 * 403 admin-locked responses so callers can branch on a typed error.
 */

import { getAccessToken } from "@/lib/supabase/auth-client";

export class AdminUnauthorizedError extends Error {
  constructor(public readonly reason: string) {
    super(`admin-unauthorized:${reason}`);
    this.name = "AdminUnauthorizedError";
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  if (!token) {
    throw new AdminUnauthorizedError("not-signed-in");
  }
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

export async function adminFetch<T>(path: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(path, { headers, cache: "no-store" });
  if (res.status === 401 || res.status === 403) {
    const body = await res.json().catch(() => ({}));
    throw new AdminUnauthorizedError(
      typeof body?.reason === "string" ? body.reason : "forbidden"
    );
  }
  if (!res.ok) {
    throw new Error(`admin-${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * Phase 158.23 — Send a JSON body with arbitrary method. Used by the
 * admin UI to PATCH / POST mutation endpoints. Returns parsed JSON on
 * 2xx, throws on 4xx/5xx with the server's error string.
 */
export async function adminMutate<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const headers = await authHeaders();
  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  if (res.status === 401 || res.status === 403) {
    const errBody = await res.json().catch(() => ({}));
    throw new AdminUnauthorizedError(
      typeof errBody?.reason === "string" ? errBody.reason : "forbidden"
    );
  }
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: string;
      reason?: string;
    };
    const msg =
      errBody.reason ?? errBody.error ?? `admin-${res.status}`;
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

/**
 * Phase 158.23 — Trigger a CSV download with auth header. Standard
 * `<a download>` can't set headers, so we fetch as blob + invent an
 * anchor with the blob URL.
 */
export async function adminDownload(
  path: string,
  filename: string
): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(path, { headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`download-${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
