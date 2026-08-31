"use client";

import { getAccessToken } from "@/lib/supabase/auth-client";
import type { UserPrefs } from "@/lib/user-prefs";

export type UserProfileSyncInput = Pick<
  UserPrefs,
  | "gender"
  | "ageRange"
  | "goal"
  | "aestheticReference"
  | "analysisConsentVersion"
  | "improvementConsent"
>;

export async function syncUserProfile(
  prefs: UserProfileSyncInput
): Promise<void> {
  let token: string | null = null;
  try {
    token = await getAccessToken();
  } catch {
    return;
  }
  if (!token) return;
  try {
    await fetch("/api/user-profile", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        gender: prefs.gender,
        ageRange: prefs.ageRange,
        goal: prefs.goal,
        aestheticReference: prefs.aestheticReference,
        analysisConsentVersion: prefs.analysisConsentVersion,
        improvementConsent: prefs.improvementConsent,
      }),
      cache: "no-store",
      keepalive: true,
    });
  } catch {}
}
