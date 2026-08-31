"use client";

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Crown,
  Cpu,
  Lock,
  Palette,
  ScanFace,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { useAuthUser } from "@/lib/use-auth-user";
import { hasOnboarded, markOnboarded } from "@/lib/onboarding";
import { loadHistory } from "@/lib/scan-history";
import {
  loadUserPrefs,
  saveUserPrefs,
  type AgeRange,
  type AestheticReference,
  type ProfileGoal,
} from "@/lib/user-prefs";
import { trackProductEvent } from "@/lib/product-events";
import { syncUserProfile } from "@/lib/user-profile-sync";
import type { Gender } from "@/types";

const TOTAL_STEPS = 6;
const REPLAY_EVENT = "doodee:replay-onboarding";

type FirstAction = "/scan" | "/try-on" | "/upgrade";

export function OnboardingWizard() {
  const { t, lang } = useT();
  const router = useRouter();
  const { displayName } = useAuthUser();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [gender, setGender] = useState<Gender>("male");
  const [ageRange, setAgeRange] = useState<AgeRange>("not_set");
  const [goal, setGoal] = useState<ProfileGoal>("overall");
  const [aestheticReference, setAestheticReference] =
    useState<AestheticReference>("no_preference");
  const [reducedMotion, setReducedMotion] = useState(false);

  const loadProfile = useCallback((): void => {
    const prefs = loadUserPrefs();
    setGender(prefs.gender);
    setAgeRange(prefs.ageRange);
    setGoal(prefs.goal);
    setAestheticReference(prefs.aestheticReference);
  }, []);

  function saveProfile(): void {
    const next = {
      ...loadUserPrefs(),
      gender,
      ethnicity: "universal" as const,
      ageRange,
      goal,
      aestheticReference,
    };
    saveUserPrefs(next);
    void syncUserProfile(next);
  }

  const openWizard = useCallback((): void => {
    loadProfile();
    setStep(0);
    setOpen(true);
  }, [loadProfile]);

  useEffect(() => {
    if (loadHistory().length > 0 && !hasOnboarded()) {
      markOnboarded();
    } else if (!hasOnboarded()) {
      openWizard();
    }
    window.addEventListener(REPLAY_EVENT, openWizard);
    return () => window.removeEventListener(REPLAY_EVENT, openWizard);
  }, [openWizard]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent): void =>
      setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function dismiss(): void {
    saveProfile();
    markOnboarded();
    setOpen(false);
  }

  function advance(): void {
    if (step <= 3) saveProfile();
    if (step >= TOTAL_STEPS - 1) {
      dismiss();
      return;
    }
    setStep((s) => s + 1);
  }

  function back(): void {
    setStep((s) => Math.max(0, s - 1));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (!open) return;
    if (e.key === "ArrowRight" && step < TOTAL_STEPS - 1) {
      e.preventDefault();
      advance();
    } else if (e.key === "ArrowLeft" && step > 0) {
      e.preventDefault();
      back();
    }
  }

  function pick(route: FirstAction): void {
    saveProfile();
    markOnboarded();
    void trackProductEvent("onboarding_completed", {
      source: "onboarding",
      ageRange,
      gender,
      goal,
      aestheticReference,
    });
    setOpen(false);
    router.push(route as never);
  }

  const w = t.onboarding.wizard;
  const firstName =
    displayName && displayName.trim() !== ""
      ? displayName.split(" ")[0] || null
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) dismiss();
      }}
    >
      <DialogContent
        className="onboarding-tour-dialog theme-locked-dark flex max-h-[88dvh] w-[calc(100%-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden border-[#263149] bg-[#050816] p-0 text-[#f8fafc] shadow-[0_34px_92px_rgba(0,0,0,0.82),0_0_0_1px_rgba(255,255,255,0.04)]"
        onKeyDown={onKeyDown}
      >
        <div
          className="flex flex-none items-center justify-center gap-2 pt-5"
          aria-hidden
        >
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? "w-8 bg-[#06b6d4]"
                  : i < step
                    ? "w-2 bg-[#0e7490]"
                    : "w-2 bg-[#263149]"
              }`}
            />
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#070b1a] px-6 pb-6 pt-5">
          <AnimatePresence mode="wait">
            <m.div
              data-testid="onboarding-step-panel"
              className="rounded-2xl border border-[#1e2a44] bg-[#0b1020] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_22px_58px_rgba(0,0,0,0.28)]"
              key={step}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 16 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -16 }}
              transition={{
                duration: reducedMotion ? 0 : 0.28,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {step === 0 && (
                <StepGender
                  firstName={firstName}
                  lang={lang}
                  gender={gender}
                  onGender={setGender}
                  copy={w}
                />
              )}
              {step === 1 && (
                <StepAge
                  ageRange={ageRange}
                  onAgeRange={setAgeRange}
                  copy={w}
                />
              )}
              {step === 2 && (
                <StepGoal
                  goal={goal}
                  onGoal={setGoal}
                  copy={w}
                />
              )}
              {step === 3 && (
                <StepReference
                  aestheticReference={aestheticReference}
                  onAestheticReference={setAestheticReference}
                  copy={w}
                />
              )}
              {step === 4 && <StepHowItWorks copy={w} />}
              {step === 5 && <StepPickAction onPick={pick} copy={w} />}
            </m.div>
          </AnimatePresence>
        </div>

        <div className="flex flex-none items-center justify-between gap-3 border-t border-white/10 bg-[#050816] px-6 py-4">
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-xs text-white/62 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {w.back}
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="min-h-[44px] rounded-lg px-3 text-xs text-white/62 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35"
            >
              {w.skip}
            </button>
          </div>
          {step < TOTAL_STEPS - 1 && (
            <button
              type="button"
              onClick={advance}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-[#050816] shadow-[0_14px_28px_rgba(6,182,212,0.18)] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35"
            >
              {w.next}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface WizardCopy {
  skip: string;
  next: string;
  back: string;
  genderQuestion: string;
  genderHint: string;
  ageQuestion: string;
  ageHint: string;
  goalQuestion: string;
  goalHint: string;
  referenceQuestion: string;
  referenceHint: string;
  s1Title: string;
  s1Subtitle: string;
  s1GenderLabel: string;
  s1AgeLabel: string;
  s1GoalLabel: string;
  s1ReferenceLabel: string;
  s2Title: string;
  s2Subtitle: string;
  s2Bullet1Title: string;
  s2Bullet1Body: string;
  s2Bullet2Title: string;
  s2Bullet2Body: string;
  s2Bullet3Title: string;
  s2Bullet3Body: string;
  s3Title: string;
  s3Subtitle: string;
  s3ScanLabel: string;
  s3ScanBody: string;
  s3TryOnLabel: string;
  s3TryOnBody: string;
  s3UpgradeLabel: string;
  s3UpgradeBody: string;
  male: string;
  female: string;
  age18_24: string;
  age25_34: string;
  age35_44: string;
  age45Plus: string;
  goalSkin: string;
  goalHair: string;
  goalFaceBalance: string;
  goalPreClinic: string;
  goalOverall: string;
  refNaturalClean: string;
  refKBeauty: string;
  refWesternModel: string;
  refThaiEveryday: string;
  refNoPreference: string;
}

function StepGender({
  firstName,
  lang,
  gender,
  onGender,
  copy,
}: {
  firstName: string | null;
  lang: "th" | "en";
  gender: Gender;
  onGender: (g: Gender) => void;
  copy: WizardCopy;
}): React.JSX.Element {
  const greeting =
    firstName && lang === "th"
      ? `สวัสดี ${firstName}`
      : firstName
        ? `Hello, ${firstName}`
        : copy.s1Title;
  return (
    <QuestionStep
      eyebrow={greeting}
      title={copy.genderQuestion}
      body={`${copy.s1Subtitle} ${copy.genderHint}`}
      label={copy.s1GenderLabel}
    >
      <Choice
        active={gender === "male"}
        onClick={() => onGender("male")}
        icon={<User className="h-4 w-4" />}
      >
        {copy.male}
      </Choice>
      <Choice
        active={gender === "female"}
        onClick={() => onGender("female")}
        icon={<Users className="h-4 w-4" />}
      >
        {copy.female}
      </Choice>
    </QuestionStep>
  );
}

function StepAge({
  ageRange,
  onAgeRange,
  copy,
}: {
  ageRange: AgeRange;
  onAgeRange: (v: AgeRange) => void;
  copy: WizardCopy;
}): React.JSX.Element {
  return (
    <QuestionStep
      title={copy.ageQuestion}
      body={copy.ageHint}
      label={copy.s1AgeLabel}
    >
      <Choice active={ageRange === "18_24"} onClick={() => onAgeRange("18_24")}>
        {copy.age18_24}
      </Choice>
      <Choice active={ageRange === "25_34"} onClick={() => onAgeRange("25_34")}>
        {copy.age25_34}
      </Choice>
      <Choice active={ageRange === "35_44"} onClick={() => onAgeRange("35_44")}>
        {copy.age35_44}
      </Choice>
      <Choice
        active={ageRange === "45_plus"}
        onClick={() => onAgeRange("45_plus")}
      >
        {copy.age45Plus}
      </Choice>
    </QuestionStep>
  );
}

function StepGoal({
  goal,
  onGoal,
  copy,
}: {
  goal: ProfileGoal;
  onGoal: (v: ProfileGoal) => void;
  copy: WizardCopy;
}): React.JSX.Element {
  return (
    <QuestionStep
      title={copy.goalQuestion}
      body={copy.goalHint}
      label={copy.s1GoalLabel}
    >
      <Choice active={goal === "skin"} onClick={() => onGoal("skin")}>
        {copy.goalSkin}
      </Choice>
      <Choice active={goal === "hair"} onClick={() => onGoal("hair")}>
        {copy.goalHair}
      </Choice>
      <Choice
        active={goal === "face_balance"}
        onClick={() => onGoal("face_balance")}
      >
        {copy.goalFaceBalance}
      </Choice>
      <Choice active={goal === "pre_clinic"} onClick={() => onGoal("pre_clinic")}>
        {copy.goalPreClinic}
      </Choice>
      <Choice active={goal === "overall"} onClick={() => onGoal("overall")}>
        {copy.goalOverall}
      </Choice>
    </QuestionStep>
  );
}

function StepReference({
  aestheticReference,
  onAestheticReference,
  copy,
}: {
  aestheticReference: AestheticReference;
  onAestheticReference: (v: AestheticReference) => void;
  copy: WizardCopy;
}): React.JSX.Element {
  return (
    <QuestionStep
      title={copy.referenceQuestion}
      body={copy.referenceHint}
      label={copy.s1ReferenceLabel}
    >
      <Choice
        active={aestheticReference === "natural_clean"}
        onClick={() => onAestheticReference("natural_clean")}
      >
        {copy.refNaturalClean}
      </Choice>
      <Choice
        active={aestheticReference === "k_beauty"}
        onClick={() => onAestheticReference("k_beauty")}
      >
        {copy.refKBeauty}
      </Choice>
      <Choice
        active={aestheticReference === "western_model"}
        onClick={() => onAestheticReference("western_model")}
      >
        {copy.refWesternModel}
      </Choice>
      <Choice
        active={aestheticReference === "thai_everyday"}
        onClick={() => onAestheticReference("thai_everyday")}
      >
        {copy.refThaiEveryday}
      </Choice>
      <Choice
        active={aestheticReference === "no_preference"}
        onClick={() => onAestheticReference("no_preference")}
      >
        {copy.refNoPreference}
      </Choice>
    </QuestionStep>
  );
}

function QuestionStep({
  eyebrow,
  title,
  body,
  label,
  children,
}: {
  eyebrow?: string;
  title: string;
  body: string;
  label: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        {eyebrow ? (
          <p className="text-xs font-semibold text-[#67e8f9]">{eyebrow}</p>
        ) : null}
        <DialogTitle className="font-serif text-2xl italic text-[#f8fafc]">
          {title}
        </DialogTitle>
        <DialogDescription className="text-sm leading-relaxed text-white/70">
          {body}
        </DialogDescription>
      </div>
      <Field label={label}>{children}</Field>
    </div>
  );
}

function StepHowItWorks({ copy }: { copy: WizardCopy }): React.JSX.Element {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <DialogTitle className="font-serif text-2xl italic text-[#f8fafc]">
          {copy.s2Title}
        </DialogTitle>
        <DialogDescription className="text-sm leading-relaxed text-white/70">
          {copy.s2Subtitle}
        </DialogDescription>
      </div>
      <ul className="space-y-3">
        <Bullet
          icon={<ScanFace className="h-4 w-4" />}
          title={copy.s2Bullet1Title}
          body={copy.s2Bullet1Body}
        />
        <Bullet
          icon={<Cpu className="h-4 w-4" />}
          title={copy.s2Bullet2Title}
          body={copy.s2Bullet2Body}
        />
        <Bullet
          icon={<Lock className="h-4 w-4" />}
          title={copy.s2Bullet3Title}
          body={copy.s2Bullet3Body}
        />
      </ul>
    </div>
  );
}

function StepPickAction({
  onPick,
  copy,
}: {
  onPick: (route: FirstAction) => void;
  copy: WizardCopy;
}): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <DialogTitle className="font-serif text-2xl italic text-[#f8fafc]">
          {copy.s3Title}
        </DialogTitle>
        <DialogDescription className="text-sm leading-relaxed text-white/70">
          {copy.s3Subtitle}
        </DialogDescription>
      </div>
      <div className="space-y-2.5">
        <ActionCard
          onClick={() => onPick("/scan")}
          icon={<Camera className="h-5 w-5" />}
          label={copy.s3ScanLabel}
          body={copy.s3ScanBody}
          tone="primary"
        />
        <ActionCard
          onClick={() => onPick("/try-on")}
          icon={<Palette className="h-5 w-5" />}
          label={copy.s3TryOnLabel}
          body={copy.s3TryOnBody}
        />
        <ActionCard
          onClick={() => onPick("/upgrade")}
          icon={<Crown className="h-5 w-5" />}
          label={copy.s3UpgradeLabel}
          body={copy.s3UpgradeBody}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#67e8f9]">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35 ${
        active
          ? "border-[#06b6d4]/55 bg-[#08324a] text-[#67e8f9] shadow-[0_12px_30px_rgba(6,182,212,0.14)] [&_svg]:stroke-[#67e8f9]"
          : "border-[#334155] bg-[#111827] text-[#f8fafc] hover:border-[#06b6d4]/30 hover:bg-[#172033] [&_svg]:stroke-[#f8fafc]"
      }`}
      aria-pressed={active}
    >
      {icon}
      {children}
    </button>
  );
}

function Bullet({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}): React.JSX.Element {
  return (
    <li className="flex gap-3 rounded-xl border border-[#24324d] bg-[#101827] px-3.5 py-3">
      <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-[#06b6d4]/35 bg-[#08324a] text-[#67e8f9]">
        {icon}
      </span>
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs leading-relaxed text-white/68">{body}</p>
      </div>
    </li>
  );
}

function ActionCard({
  onClick,
  icon,
  label,
  body,
  tone,
}: {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  body: string;
  tone?: "primary";
}): React.JSX.Element {
  const isPrimary = tone === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35 ${
        isPrimary
          ? "border-[#06b6d4]/45 bg-[#08324a] shadow-[0_14px_36px_rgba(6,182,212,0.14)] hover:bg-[#0b3a54]"
          : "border-[#24324d] bg-[#101827] hover:border-[#06b6d4]/30 hover:bg-[#142033]"
      }`}
    >
      <span
        className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${
          isPrimary
            ? "bg-white text-[#050816] shadow-[0_12px_26px_rgba(6,182,212,0.16)]"
            : "border border-[#06b6d4]/28 bg-[#10213a] text-[#67e8f9]"
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 space-y-0.5">
        <span className="block text-sm font-semibold text-white">{label}</span>
        <span className="block text-xs leading-relaxed text-white/68">
          {body}
        </span>
      </span>
      <Sparkles
        className={`h-3.5 w-3.5 flex-none transition-opacity ${
          isPrimary
            ? "text-[#067e96] opacity-100"
            : "text-[#067e96]/45 opacity-0 group-hover:opacity-100"
        }`}
      />
    </button>
  );
}
