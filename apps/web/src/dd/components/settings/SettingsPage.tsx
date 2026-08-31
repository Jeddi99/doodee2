"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Globe,
  Eye,
  Trash2,
  LogOut,
  ShieldCheck,
  Settings as SettingsIcon,
  ArrowRight,
  Palette,
  Download,
  Upload,
  Crown,
  Gift,
  Moon,
  Sun,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { LangToggle } from "@/components/LangToggle";
import { ExpiryPill } from "@/components/billing/ExpiryPill";
import { activeBillingTier } from "@/lib/subscription-status";
import {
  loadUserPrefs,
  saveUserPrefs,
  type AgeRange,
  type AestheticReference,
  type ProfileGoal,
} from "@/lib/user-prefs";
import { clearHistory, loadHistory } from "@/lib/scan-history";
import { isGuest, readGuestUser } from "@/lib/guest";
import { resetOnboarded } from "@/lib/onboarding";
import { clearRecentColors, loadRecentColors } from "@/lib/tryon-recent";
import {
  clearSavedLooks,
  importSavedLooks,
  loadSavedLooks,
} from "@/lib/tryon-saved-looks";
import { useAuthUser } from "@/lib/use-auth-user";
import { useSubscription } from "@/lib/use-subscription";
import { useTheme } from "@/lib/use-theme";
import { signOut, getAccessToken } from "@/lib/supabase/auth-client";
import { setSubscriptionCache } from "@/lib/subscription-cache";
import { useTrackedTimeout } from "@/lib/use-tracked-timeout";
import { syncUserProfile } from "@/lib/user-profile-sync";
import type { SubscriptionRow } from "@/lib/supabase/types";
import type { Gender } from "@/types";

// Phase 192p: module-level Intl.DateTimeFormat so we don't recreate
// the formatter on every render. Settings is touched
// often on mobile; this and the gregorian-short variant below replace
// inline `.toLocaleDateString(undefined, {...})` calls.
const FMT_DATE_GREGORIAN_SHORT = new Intl.DateTimeFormat(undefined, {
  calendar: "gregory",
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "short",
  day: "numeric",
});
const FMT_DATE_GREGORIAN_DEFAULT = new Intl.DateTimeFormat(undefined, {
  calendar: "gregory",
  timeZone: "Asia/Bangkok",
});

export function SettingsPage() {
  const { t } = useT();
  const router = useRouter();
  // Phase 174: surface profile + subscription + theme in the same page.
  const { email, displayName, avatarUrl } = useAuthUser();
  const { subscription } = useSubscription();
  const { theme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const [gender, setGender] = useState<Gender>("male");
  const [ageRange, setAgeRange] = useState<AgeRange>("not_set");
  const [goal, setGoal] = useState<ProfileGoal>("overall");
  const [aestheticReference, setAestheticReference] =
    useState<AestheticReference>("no_preference");
  const [historyCount, setHistoryCount] = useState(0);
  const [guestActive, setGuestActive] = useState(false);
  const [guestCreatedAt, setGuestCreatedAt] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [tourReset, setTourReset] = useState(false);
  const schedule = useTrackedTimeout();
  // Phase 71: try-on data counts + clear-confirm state
  const [savedCount, setSavedCount] = useState(0);
  const [recentCount, setRecentCount] = useState(0);
  const [confirmClearTryOn, setConfirmClearTryOn] = useState(false);
  // Phase 94: import-status toast for backup/restore feedback
  const [importToast, setImportToast] = useState<string | null>(null);

  useEffect(() => {
    const prefs = loadUserPrefs();
    setGender(prefs.gender);
    setAgeRange(prefs.ageRange);
    setGoal(prefs.goal);
    setAestheticReference(prefs.aestheticReference);
    setHistoryCount(loadHistory().length);
    setGuestActive(isGuest());
    const user = readGuestUser();
    setGuestCreatedAt(user?.createdAt ?? null);
    setSavedCount(loadSavedLooks().length);
    const recent = loadRecentColors();
    setRecentCount(
      (recent.hair?.length ?? 0) +
        (recent.eyes?.length ?? 0) +
        (recent.blush?.length ?? 0) +
        (recent.lips?.length ?? 0)
    );
  }, []);

  // Phase 190: Reset all "double-click to confirm" flags when the tab
  // goes background or loses focus. Without this, a backgrounded tab's
  // setTimeout can get throttled past the 4-s expiry, leaving the flag
  // armed. The user comes back, taps a destructive button once, and
  // the second-tap action fires immediately with no second confirmation
  // they lose history / try-on data with one click.
  useEffect(() => {
    function clearAllConfirms(): void {
      setConfirmClear(false);
      setConfirmReset(false);
      setConfirmClearTryOn(false);
    }
    function onVisibility(): void {
      if (document.visibilityState === "hidden") clearAllConfirms();
    }
    window.addEventListener("blur", clearAllConfirms);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", clearAllConfirms);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const handleClearTryOnData = useCallback(() => {
    if (!confirmClearTryOn) {
      setConfirmClearTryOn(true);
      schedule(() => setConfirmClearTryOn(false), 4000);
      return;
    }
    clearSavedLooks();
    clearRecentColors();
    setSavedCount(0);
    setRecentCount(0);
    setConfirmClearTryOn(false);
  }, [confirmClearTryOn, schedule]);

  // Phase 94: export saved looks as a downloadable JSON file. Uses
  // the same envelope shape the storage layer reads back (v: 1).
  const handleExportSavedLooks = useCallback(() => {
    const looks = loadSavedLooks();
    if (looks.length === 0) return;
    try {
      const payload = JSON.stringify({ v: 1, looks }, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `doodee-looks-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Browser blocked the download or stringify failed; ignore.
    }
  }, []);

  // Phase 94: read a JSON file and merge its looks into local storage.
  const handleImportSavedLooks = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking same file fires the change again
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        const result = importSavedLooks(json);
        if (!result) {
          setImportToast(t.settings.importErr);
        } else {
          setImportToast(
            t.settings.importOk
              .replace("{added}", result.added.toString())
              .replace("{skipped}", result.skipped.toString())
          );
          setSavedCount(loadSavedLooks().length);
        }
      } catch {
        setImportToast(t.settings.importErr);
      } finally {
        schedule(() => setImportToast(null), 2500);
      }
    };
    reader.onerror = () => {
      setImportToast(t.settings.importErr);
      schedule(() => setImportToast(null), 2500);
    };
    reader.readAsText(file);
  }, [schedule, t.settings.importErr, t.settings.importOk]);

  const updatePref = useCallback(
    (
      next: Partial<{
        gender: Gender;
        ageRange: AgeRange;
        goal: ProfileGoal;
        aestheticReference: AestheticReference;
      }>
    ) => {
      const current = loadUserPrefs();
      const merged = {
        ...current,
        gender,
        ethnicity: "universal" as const,
        ageRange,
        goal,
        aestheticReference,
        ...next,
      };
      setGender(merged.gender);
      setAgeRange(merged.ageRange);
      setGoal(merged.goal);
      setAestheticReference(merged.aestheticReference);
      saveUserPrefs(merged);
      void syncUserProfile(merged);
    },
    [gender, ageRange, goal, aestheticReference]
  );

  const handleClearHistory = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true);
      schedule(() => setConfirmClear(false), 4000);
      return;
    }
    clearHistory();
    setHistoryCount(0);
    setConfirmClear(false);
  }, [confirmClear, schedule]);

  const handleResetGuest = useCallback(() => {
    if (!confirmReset) {
      setConfirmReset(true);
      schedule(() => setConfirmReset(false), 4000);
      return;
    }
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("doodee_guest_mode");
        window.localStorage.removeItem("doodee_user");
      } catch {
        // ignore
      }
    }
    router.push("/login");
  }, [confirmReset, router, schedule]);

  const handleGenderChange = useCallback(
    (v: string) => updatePref({ gender: v as Gender }),
    [updatePref]
  );
  const handleAgeRangeChange = useCallback(
    (v: string) => updatePref({ ageRange: v as AgeRange }),
    [updatePref]
  );
  const handleGoalChange = useCallback(
    (v: string) => updatePref({ goal: v as ProfileGoal }),
    [updatePref]
  );
  const handleAestheticReferenceChange = useCallback(
    (v: string) => updatePref({ aestheticReference: v as AestheticReference }),
    [updatePref]
  );
  const handleThemeChange = useCallback(
    (v: string) => setTheme(v === "light" ? "light" : "dark"),
    [setTheme]
  );
  const handleTourReplay = useCallback(() => {
    resetOnboarded();
    window.dispatchEvent(new Event("doodee:replay-onboarding"));
    setTourReset(true);
    schedule(() => setTourReset(false), 1800);
  }, [schedule]);

  // Phase 192h: L5 audit: push-first signOut.
  // Previously we awaited signOut() (a network round-trip to revoke the
  // session globally PLUS a localStorage/sessionStorage wipe) before
  // calling router.push. The UI sat frozen with the disabled button
  // for the full duration. Auth-client now invalidates its cached user
  // synchronously at the top of signOut(), so by the time /login mounts
  // any AuthGate or getCurrentUser() read already sees null; there is
  // no race where the user lands on /login still appearing authed.
  // setSigningOut stays true since we're navigating away anyway; the
  // background promise is fire-and-forget with a logged tail.
  const handleSignOut = useCallback(async (): Promise<void> => {
    if (signingOut) return;
    setSigningOut(true);
    router.push("/login");
    void signOut().catch(() => undefined);
  }, [router, signingOut]);

  const handleSignOutClick = useCallback(() => {
    void handleSignOut();
  }, [handleSignOut]);

  // Phase 192p: derived strings memoized so the avatar regex + Intl
  // format don't run on every keystroke in the redeem input below.
  const profileName = useMemo(
    () => displayName ?? email ?? t.upgrade.sidebar.guestName,
    [displayName, email, t.upgrade.sidebar.guestName]
  );
  const avatarInitial = useMemo(
    () => (profileName.match(/[A-Za-zก-๙]/)?.[0] ?? "D").toUpperCase(),
    [profileName]
  );
  // Phase 609 — show the EFFECTIVE tier: an expired paid row renders as
  // FREE (same rule as /upgrade and the sidebar).
  const tierUpper = useMemo(
    () => activeBillingTier(subscription ?? null).toUpperCase(),
    [subscription]
  );
  const periodEnd = subscription?.current_period_end;
  const periodEndText = useMemo(
    () => (periodEnd ? FMT_DATE_GREGORIAN_SHORT.format(new Date(periodEnd)) : null),
    [periodEnd]
  );
  const guestBodyText = useMemo(() => {
    if (!guestActive) return "";
    return guestCreatedAt
      ? t.settings.guestBody.replace(
          "{date}",
          FMT_DATE_GREGORIAN_DEFAULT.format(new Date(guestCreatedAt))
        )
      : t.settings.guestBody.replace("{date}", "-");
  }, [guestActive, guestCreatedAt, t.settings.guestBody]);

  // Phase 192p: pre-build picker option arrays so the memo'd Picker
  // doesn't see a fresh `options` reference every render.
  const themeOptions = useMemo(
    () => [
      { value: "dark", label: t.settings.themeDark },
      { value: "light", label: t.settings.themeLight },
    ],
    [t.settings.themeDark, t.settings.themeLight]
  );
  const genderOptions = useMemo(
    () => [
      { value: "male", label: t.calibration.male },
      { value: "female", label: t.calibration.female },
    ],
    [t.calibration.male, t.calibration.female]
  );
  const ageRangeOptions = useMemo(
    () => [
      { value: "18_24", label: t.profilePrefs.age18_24 },
      { value: "25_34", label: t.profilePrefs.age25_34 },
      { value: "35_44", label: t.profilePrefs.age35_44 },
      { value: "45_plus", label: t.profilePrefs.age45Plus },
    ],
    [
      t.profilePrefs.age18_24,
      t.profilePrefs.age25_34,
      t.profilePrefs.age35_44,
      t.profilePrefs.age45Plus,
    ]
  );
  const goalOptions = useMemo(
    () => [
      { value: "skin", label: t.profilePrefs.goalSkin },
      { value: "hair", label: t.profilePrefs.goalHair },
      { value: "face_balance", label: t.profilePrefs.goalFaceBalance },
      { value: "pre_clinic", label: t.profilePrefs.goalPreClinic },
      { value: "overall", label: t.profilePrefs.goalOverall },
    ],
    [
      t.profilePrefs.goalSkin,
      t.profilePrefs.goalHair,
      t.profilePrefs.goalFaceBalance,
      t.profilePrefs.goalPreClinic,
      t.profilePrefs.goalOverall,
    ]
  );
  const referenceOptions = useMemo(
    () => [
      { value: "natural_clean", label: t.profilePrefs.refNaturalClean },
      { value: "k_beauty", label: t.profilePrefs.refKBeauty },
      { value: "western_model", label: t.profilePrefs.refWesternModel },
      { value: "thai_everyday", label: t.profilePrefs.refThaiEveryday },
      { value: "no_preference", label: t.profilePrefs.refNoPreference },
    ],
    [
      t.profilePrefs.refNaturalClean,
      t.profilePrefs.refKBeauty,
      t.profilePrefs.refWesternModel,
      t.profilePrefs.refThaiEveryday,
      t.profilePrefs.refNoPreference,
    ]
  );

  return (
    <div className="app-glass-page mx-auto max-w-2xl space-y-8 pb-4 text-[#241f1a]">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/45 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#0f6f7f] shadow-[0_14px_34px_-30px_rgba(36,31,26,0.38)] backdrop-blur-md">
          <SettingsIcon className="h-3 w-3" />
          {t.settings.eyebrow}
        </div>
        <h1 className="font-serif text-4xl font-light italic tracking-normal text-[#241f1a] md:text-5xl">
          {t.settings.title}
        </h1>
        <p className="text-sm leading-relaxed text-[#5f574f] md:text-base">
          {t.settings.subtitle}
        </p>
      </header>

      {/* Phase 174: Profile card (Gmail identity + tier badge). */}
      <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/50 p-5 shadow-[0_24px_70px_-48px_rgba(36,31,26,0.34)] backdrop-blur-md sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#0f6f7f]/20 to-transparent"
        />
        {/* Phase 192s: soft corner wash via radial-gradient, NOT
            filter:blur. The NUCLEAR mobile-lag waves cut all decorative
            blur()/backdrop-filter; a gradient gives the same glow with
            zero compositor cost. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-10 -top-12 h-44 w-44 rounded-full opacity-60 [background:radial-gradient(circle,rgba(122,91,214,0.13),transparent_70%)]"
        />
        <div className="relative flex flex-wrap items-center gap-4">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={profileName}
              width={64}
              height={64}
              unoptimized
              referrerPolicy="no-referrer"
              className="h-16 w-16 flex-none rounded-2xl border border-[#241f1a]/10 object-cover shadow-[0_16px_34px_-24px_rgba(36,31,26,0.42)]"
            />
          ) : (
            <div className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl bg-[#241f1a] font-serif text-2xl font-bold text-white shadow-[0_16px_34px_-24px_rgba(36,31,26,0.42)]">
              {avatarInitial}
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#8b8178]">
              {t.settings.eyebrow}
            </p>
            <p
              className="truncate font-serif text-xl font-light italic text-[#241f1a]"
              title={email ?? profileName}
            >
              {profileName}
            </p>
            {email && email !== profileName && (
              <p className="truncate text-xs text-[#6f625a]">{email}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0f6f7f] shadow-[0_8px_18px_-16px_rgba(36,31,26,0.32)] backdrop-blur">
                <Crown className="h-2.5 w-2.5" />
                {tierUpper}
              </span>
              {/* Phase 182c: days-left countdown pill. Same component +
                  logic as the sidebar so both surfaces stay in sync. */}
              {subscription && (
                <ExpiryPill
                  periodEnd={subscription.current_period_end}
                  tier={activeBillingTier(subscription)}
                  labels={t.upgrade.sidebar}
                />
              )}
              {periodEndText && (
                <span className="text-[11px] text-[#766c64]">
                  {t.settings.activeUntil} {periodEndText}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Phase 174 -> 182: Subscription quick actions + inline redeem
          (user asked to redeem codes without leaving Settings) */}
      <Section
        eyebrow={t.settings.eyebrow}
        icon={<Crown className="h-4 w-4" />}
        title={t.settings.subscriptionTitle}
        body={t.settings.subscriptionBody.replace("{tier}", tierUpper)}
      >
        <Link
          href={"/upgrade" as never}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#241f1a] px-4 text-sm font-semibold text-white shadow-[0_18px_34px_-26px_rgba(36,31,26,0.48)] transition-[transform,background-color] duration-200 hover:bg-[#342d27] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6f7f]/35"
        >
          <Crown className="h-4 w-4" />
          {t.settings.viewPlans}
        </Link>
        <Link
          href={"/account/usage" as never}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/60 bg-white/45 px-4 text-sm font-medium text-[#4d453e] shadow-[0_10px_28px_-24px_rgba(36,31,26,0.4)] backdrop-blur transition-[transform,background-color,border-color] duration-200 hover:border-white/80 hover:bg-white/[0.65] active:scale-[0.97]"
        >
          <ArrowRight className="h-4 w-4" />
          {t.settings.usage}
        </Link>
        <RedeemInlineForm />
      </Section>

      {/* Phase 174: Theme picker (Dark / Light / System) */}
      <Section
        eyebrow={t.settings.eyebrow}
        icon={<Palette className="h-4 w-4" />}
        title={t.settings.themeTitle}
        body={t.settings.themeBody}
      >
        <Picker
          label={t.settings.themeTitle}
          options={themeOptions}
          value={theme}
          onChange={handleThemeChange}
        />
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-[#766c64]">
          {theme === "dark" ? (
            <Moon className="h-3 w-3" />
          ) : (
            <Sun className="h-3 w-3" />
          )}
          {t.settings.themeActive}
        </span>
      </Section>

      <Section
        eyebrow={t.settings.eyebrow}
        icon={<Eye className="h-4 w-4" />}
        title={t.settings.calibrationTitle}
        body={t.settings.calibrationBody}
      >
        <Picker
          label={t.calibration.male + " / " + t.calibration.female}
          options={genderOptions}
          value={gender}
          onChange={handleGenderChange}
        />
        <Picker
          label={t.profilePrefs.ageRangeLabel}
          options={ageRangeOptions}
          value={ageRange}
          onChange={handleAgeRangeChange}
        />
        <Picker
          label={t.profilePrefs.goalLabel}
          options={goalOptions}
          value={goal}
          onChange={handleGoalChange}
        />
        <Picker
          label={t.profilePrefs.aestheticReferenceLabel}
          options={referenceOptions}
          value={aestheticReference}
          onChange={handleAestheticReferenceChange}
        />
      </Section>

      <Section
        eyebrow={t.settings.eyebrow}
        icon={<Globe className="h-4 w-4" />}
        title={t.settings.languageTitle}
        body={t.settings.languageBody}
      >
        <LangToggle />
      </Section>

      <Section
        eyebrow={t.settings.eyebrow}
        icon={<Trash2 className="h-4 w-4" />}
        title={t.settings.historyTitle}
        body={t.settings.historyBody.replace(
          "{n}",
          historyCount.toString()
        )}
        tone="destructive"
      >
        <button
          type="button"
          onClick={handleClearHistory}
          disabled={historyCount === 0 && !confirmClear}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-4 text-sm transition-[transform,background-color,border-color,color] duration-200 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none ${
            confirmClear
              ? "border-[#b42318]/40 bg-white/[0.68] text-[#b42318]"
              : "border-[#b42318]/25 bg-white/45 text-[#b42318] backdrop-blur hover:bg-white/[0.65]"
          }`}
        >
          <Trash2 className="h-4 w-4" />
          {confirmClear ? t.settings.confirmClear : t.settings.clearHistory}
        </button>
      </Section>

      <Section
        eyebrow={t.settings.eyebrow}
        icon={<Palette className="h-4 w-4" />}
        title={t.settings.tryOnDataTitle}
        body={t.settings.tryOnDataBody
          .replace("{saved}", savedCount.toString())
          .replace("{recent}", recentCount.toString())}
      >
        <button
          type="button"
          onClick={handleExportSavedLooks}
          disabled={savedCount === 0}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/60 bg-white/45 px-4 text-sm font-medium text-[#0f6f7f] shadow-[0_10px_28px_-24px_rgba(36,31,26,0.36)] backdrop-blur transition-[transform,background-color,border-color] duration-200 hover:border-[#0f6f7f]/35 hover:bg-white/[0.65] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          {t.settings.exportLooks}
        </button>
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-white/60 bg-white/45 px-4 text-sm font-medium text-[#4d453e] shadow-[0_10px_28px_-24px_rgba(36,31,26,0.4)] backdrop-blur transition-[transform,background-color,border-color] duration-200 hover:border-white/80 hover:bg-white/[0.65] active:scale-[0.97]">
          <Upload className="h-4 w-4" />
          {t.settings.importLooks}
          <input
            type="file"
            accept="application/json,.json"
            onChange={handleImportSavedLooks}
            className="hidden"
          />
        </label>
        <button
          type="button"
          onClick={handleClearTryOnData}
          disabled={savedCount === 0 && recentCount === 0 && !confirmClearTryOn}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-4 text-sm transition-[transform,background-color,border-color,color] duration-200 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none ${
            confirmClearTryOn
              ? "border-[#b42318]/40 bg-white/[0.68] text-[#b42318]"
              : "border-[#b42318]/25 bg-white/45 text-[#b42318] backdrop-blur hover:bg-white/[0.65]"
          }`}
        >
          <Trash2 className="h-4 w-4" />
          {confirmClearTryOn
            ? t.settings.confirmClearTryOn
            : t.settings.clearTryOnData}
        </button>
        {importToast && (
          <span
            role="status"
            aria-live="polite"
            className="text-[11px] font-medium text-[#0f6f7f]"
          >
            {importToast}
          </span>
        )}
      </Section>

      <Section
        eyebrow={t.settings.eyebrow}
        icon={<SettingsIcon className="h-4 w-4" />}
        title={t.settings.tourTitle}
        body={t.settings.tourBody}
      >
        <button
          type="button"
          onClick={handleTourReplay}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#06b6d4]/35 bg-[#08324a] px-4 text-sm font-medium text-[#67e8f9] shadow-[0_10px_28px_-24px_rgba(6,182,212,0.45)] transition-[transform,background-color,border-color] duration-200 hover:border-[#06b6d4]/55 hover:bg-[#0b3a54] active:scale-[0.97]"
        >
          {tourReset ? t.settings.tourReset : t.settings.tourReplay}
        </button>
      </Section>

      <Section
        eyebrow={t.settings.eyebrow}
        icon={<ShieldCheck className="h-4 w-4" />}
        title={t.settings.privacyTitle}
        body={t.settings.privacyBody}
      >
        <Link
          href="/privacy"
          className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-[#0f6f7f] transition-colors duration-200 hover:text-[#0b4f5b]"
        >
          {t.settings.privacyLink}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Section>

      {guestActive && (
        <Section
          eyebrow={t.settings.guestTitle}
          icon={<LogOut className="h-4 w-4" />}
          title={t.settings.guestTitle}
          body={guestBodyText}
          tone="destructive"
        >
          <button
            type="button"
            onClick={handleResetGuest}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-4 text-sm transition-[transform,background-color,border-color,color] duration-200 active:scale-[0.97] ${
              confirmReset
                ? "border-[#a16207]/40 bg-white/[0.65] text-[#92400e]"
                : "border-white/60 bg-white/45 text-[#4d453e] backdrop-blur hover:bg-white/[0.65]"
            }`}
          >
            <LogOut className="h-4 w-4" />
            {confirmReset ? t.settings.confirmReset : t.settings.resetGuest}
          </button>
        </Section>
      )}

      {/* Phase 192s: sign-out moved out of the profile card into its own
          red-accented section at the very bottom, so the page's most
          consequential action reads as deliberate and is hard to hit by
          accident. Push-first signOut (Phase 192h) preserved. */}
      <Section
        eyebrow={t.settings.signOut}
        icon={<LogOut className="h-4 w-4" />}
        title={t.settings.signOut}
        body={t.settings.subtitle}
        tone="destructive"
      >
        <button
          type="button"
          onClick={handleSignOutClick}
          disabled={signingOut}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#b42318]/25 bg-white/45 px-4 text-sm font-semibold text-[#b42318] backdrop-blur transition-[transform,background-color,border-color] duration-200 hover:border-[#b42318]/40 hover:bg-white/[0.65] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          {t.settings.signOut}
        </button>
      </Section>
    </div>
  );
}

// Phase 192p: memo'd to skip the section-card render when only sibling
// state (redeem input, toast, confirm flags) flips.
// Phase 192s: restyle only: added optional `eyebrow` (tiny uppercase
// section label) + `tone` (destructive sections get a red accent and a
// red icon chip). Memo boundary, prop identity, and children untouched.
const Section = memo(function Section({
  icon,
  title,
  body,
  eyebrow,
  tone = "default",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  eyebrow?: string;
  tone?: "default" | "destructive";
  children: React.ReactNode;
}) {
  const destructive = tone === "destructive";
  return (
    <section
      className={`space-y-3 rounded-3xl border p-5 shadow-[0_20px_60px_-46px_rgba(36,31,26,0.34)] backdrop-blur-md transition-[border-color,background-color] duration-200 sm:p-6 ${
        destructive
          ? "border-[#b42318]/25 bg-white/[0.55] hover:border-[#b42318]/35 hover:bg-white/[0.65]"
          : "border-white/60 bg-white/50 hover:border-white/80 hover:bg-white/[0.65]"
      }`}
    >
      {eyebrow && (
        <p
          className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${
            destructive ? "text-[#b42318]" : "text-[#0f6f7f]"
          }`}
        >
          {eyebrow}
        </p>
      )}
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl border ${
            destructive
              ? "border-[#b42318]/20 bg-white/45 text-[#b42318]"
              : "border-white/60 bg-white/40 text-[#0f6f7f]"
          }`}
        >
          {icon}
        </span>
        <h2 className="font-serif text-lg font-light italic text-[#241f1a]">{title}</h2>
      </div>
      <p className="text-sm leading-relaxed text-[#5f574f]">{body}</p>
      <div className="flex flex-wrap items-center gap-2.5 pt-1.5">{children}</div>
    </section>
  );
});

const PickerOption = memo(function PickerOption({
  optValue,
  label,
  active,
  onSelect,
}: {
  optValue: string;
  label: string;
  active: boolean;
  onSelect: (v: string) => void;
}) {
  const handleClick = useCallback(() => onSelect(optValue), [onSelect, optValue]);
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      className={`min-h-[44px] rounded-xl px-4 text-sm font-medium transition-[transform,background-color,color,box-shadow] duration-200 active:scale-[0.97] ${
        active
          ? "bg-[#241f1a] text-white shadow-[0_12px_26px_-20px_rgba(36,31,26,0.5)]"
          : "text-[#6f625a] hover:bg-white/60 hover:text-[#241f1a]"
      }`}
    >
      {label}
    </button>
  );
});

const Picker = memo(function Picker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex flex-wrap rounded-2xl border border-white/60 bg-white/40 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur"
    >
      {options.map((opt) => (
        <PickerOption
          key={opt.value}
          optValue={opt.value}
          label={opt.label}
          active={value === opt.value}
          onSelect={onChange}
        />
      ))}
    </div>
  );
});

/**
 * Phase 182: Inline redeem-code form for the Settings page. Same flow
 * as `/redeem` (POST /api/redeem, push the returned row into the shared
 * cache so the sidebar updates immediately) but compact: collapsed
 * pill-button that expands to a single input + submit row on click.
 */
type RedeemError =
  | "COUPON_NOT_FOUND"
  | "COUPON_DISABLED"
  | "COUPON_EXPIRED"
  | "COUPON_DEPLETED"
  | "COUPON_ALREADY_REDEEMED"
  | "COUPON_NO_SUBSCRIPTION"
  | "COUPON_STRIPE_ONLY"
  | "COUPON_BAD_GRANT_TIER"
  | "INVALID_CODE_FORMAT"
  | "UNAUTHORIZED"
  | "NETWORK"
  | "UNKNOWN";

const RedeemInlineForm = memo(function RedeemInlineForm(): React.JSX.Element {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<SubscriptionRow | null>(null);
  const [errorCode, setErrorCode] = useState<RedeemError | null>(null);
  const schedule = useTrackedTimeout();
  const r = t.redeem;

  const handleInputFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const el = e.target;
    schedule(() => {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 500);
  }, [schedule]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setSuccess(null);
    setErrorCode(null);
    const trimmed = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,64}$/.test(trimmed)) {
      setErrorCode("INVALID_CODE_FORMAT");
      return;
    }
    setBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        // Phase 183: Bug fix: previously this `return` exited the
        // function before `finally` could run, leaving busy=true forever.
        // The submit button stayed disabled with a spinner and the user
        // had no way to retry without closing the dialog.
        setBusy(false);
        setErrorCode("UNAUTHORIZED");
        return;
      }
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: trimmed }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        subscription?: SubscriptionRow;
        code?: RedeemError;
      };
      if (res.ok && body.subscription) {
        setSubscriptionCache(body.subscription);
        setSuccess(body.subscription);
        setCode("");
        return;
      }
      setErrorCode(body.code ?? "UNKNOWN");
    } catch {
      setErrorCode("NETWORK");
    } finally {
      setBusy(false);
    }
  }

  const errorMessage = errorCode ? r.errors[errorCode] ?? r.errors.UNKNOWN : null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/60 bg-white/45 px-4 py-2.5 text-sm font-medium text-[#0f6f7f] shadow-[0_10px_28px_-24px_rgba(36,31,26,0.36)] backdrop-blur transition hover:bg-white/[0.65]"
      >
        <Gift className="h-3.5 w-3.5" />
        {t.settings.redeemCode}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 flex w-full flex-col gap-2 rounded-xl border border-white/60 bg-white/40 p-3 shadow-[0_12px_28px_-24px_rgba(36,31,26,0.3)] backdrop-blur"
    >
      <label htmlFor="settings-redeem-code" className="text-[11px] font-medium text-[#6f625a]">
        {r.inputLabel}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="settings-redeem-code"
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setErrorCode(null);
          }}
          placeholder={r.inputPlaceholder}
          maxLength={64}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onFocus={handleInputFocus}
          className="min-w-[180px] flex-1 rounded-lg border border-white/60 bg-white/[0.55] px-3 py-2 text-center font-mono text-sm uppercase tracking-[0.25em] text-[#241f1a] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur placeholder:tracking-[0.15em] placeholder:text-[#8b8178] focus:border-[#0f6f7f]/40 focus:outline-none focus:ring-2 focus:ring-[#0f6f7f]/20"
        />
        <button
          type="submit"
          disabled={busy || code.trim().length === 0}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#241f1a] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_-24px_rgba(36,31,26,0.5)] transition hover:bg-[#342d27] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {busy ? r.submitting : r.submit}
        </button>
      </div>
      {errorMessage && (
        <p
          role="alert"
          className="rounded-lg border border-[#b42318]/25 bg-white/[0.55] px-2.5 py-1.5 text-[11px] text-[#b42318] backdrop-blur"
        >
          {errorMessage}
        </p>
      )}
      {success && (
        <p
          aria-live="polite"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#047857]/20 bg-white/[0.55] px-2.5 py-1.5 text-[11px] text-[#047857] backdrop-blur"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {r.successTitle} - {success.tier.toUpperCase()}
        </p>
      )}
    </form>
  );
});
