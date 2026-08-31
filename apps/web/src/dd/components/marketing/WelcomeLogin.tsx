"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Globe2,
  Loader2,
  LockKeyhole,
  Mail,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { useT, type Lang } from "@/lib/i18n";
import { DoodeeLogo } from "@/components/DoodeeLogo";
import { BlurText } from "@/components/marketing/BlurText";
import {
  authClientIssue,
  createGoogleNoncePair,
  getGoogleClientId,
  getCurrentUser,
  localDevLoginAvailable,
  sendEmailLink,
  signInLocalDev,
  supabaseConfigured,
  type AuthClientIssue,
} from "@/lib/supabase/auth-client";
import { flushCameraAdoptionQueue } from "@/lib/camera-adoption";

function safeNext(raw: string | null): string {
  if (!raw) return "/scan";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/scan";
  return raw;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const NEXT_KEY = "doodee.login.next";
const GOOGLE_SCRIPT_LOAD_FAILED = "google-script-load-failed";
const GOOGLE_REDIRECT_STATE_KEY = "doodee.google.redirect.state";
const GOOGLE_REDIRECT_NONCE_KEY = "doodee.google.redirect.nonce";

function storeNextPath(path: string): void {
  try {
    window.sessionStorage.setItem(NEXT_KEY, path);
  } catch {}
}

function clearNextPath(): void {
  try {
    window.sessionStorage.removeItem(NEXT_KEY);
  } catch {}
}

function randomHex(bytesLength: number): string {
  const bytes = new Uint8Array(bytesLength);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function startGoogleRedirect(
  clientId: string,
  noncePair: { nonce: string; hashedNonce: string }
): void {
  const state = randomHex(24);
  window.sessionStorage.setItem(GOOGLE_REDIRECT_STATE_KEY, state);
  window.sessionStorage.setItem(GOOGLE_REDIRECT_NONCE_KEY, noncePair.nonce);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/auth/callback`,
    response_type: "id_token",
    response_mode: "fragment",
    scope: "openid email profile",
    nonce: noncePair.hashedNonce,
    state,
    prompt: "select_account",
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  const event = new CustomEvent<{ url: string }>("doodee:google-redirect", {
    cancelable: true,
    detail: { url },
  });
  window.dispatchEvent(event);
  if (!event.defaultPrevented) {
    window.location.assign(url);
  }
}

type BusyAction = "google" | "email" | null;

type ToastState =
  | { kind: "error"; message: string }
  | { kind: "emailSent"; email: string }
  | null;

const TH_COPY = {
  heroTitleAria: "เช็กก่อนตัดสินใจเรื่องใบหน้า",
  heroTitleLineA: "เช็กก่อน",
  heroTitleLineB: "ตัดสินใจเรื่องใบหน้า",
  heroBody: "ดูสมดุลใบหน้าและคำถามที่ควรถาม ก่อนจองคลินิก ซื้อคอร์ส หรือเริ่มหัตถการ",
  formTitle: "บัญชีส่วนตัว",
  formBody: "เข้าสู่ระบบเพื่อปกป้องรายงาน แพ็กเกจ และข้อมูลบัญชีของคุณ",
  formEyebrow: "บัญชีส่วนตัว",
  divider: "หรือ",
  emailLabel: "อีเมล",
  emailHelp: "เราจะส่งลิงก์เข้าสู่ระบบแบบใช้ครั้งเดียวไปยังอีเมลนี้",
  invalidEmail: "กรุณากรอกอีเมลให้ถูกต้อง",
  sendLink: "ส่งลิงก์เข้าสู่ระบบ",
  sendingLink: "กำลังส่งลิงก์...",
  googleLoading: "กำลังเปิด Google...",
  emailLoading: "กำลังเตรียมอีเมล...",
  backToOptions: "กลับไปตัวเลือกเข้าสู่ระบบ",
  callbackError: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่",
  signInError: "เข้าสู่ระบบไม่สำเร็จ ลองใหม่หรือใช้อีเมล",
  googleConfigError:
    "Google ยังไม่พร้อมใช้งานตอนนี้ กรุณาใช้อีเมลหรือลองใหม่ภายหลัง",
  googleScriptError:
    "โหลด Google sign-in ไม่สำเร็จ กรุณาใช้อีเมลหรือลองใหม่",
  googleCredentialError:
    "เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่หรือใช้อีเมล",
  googleOriginError: "Google sign-in ยังไม่พร้อมบนโดเมนนี้",
  googleProviderError: "Google sign-in ยังไม่พร้อมใช้งาน กรุณาใช้อีเมล",
  networkError: "เชื่อมต่อระบบเข้าสู่ระบบไม่ได้ กรุณาลองใหม่หรือใช้อีเมล",
  emailConfigError: "อีเมลเข้าสู่ระบบยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง",
  sentTitle: "ส่งลิงก์ปลอดภัยแล้ว",
  sentBody: "เปิดลิงก์ในอีเมลของคุณ",
  errorTitle: "เข้าสู่ระบบผิดพลาด",
  close: "ปิด",
  accountNote: "เป็นส่วนตัวตั้งแต่เริ่ม",
  accountNoteBody: "เราใช้ข้อมูลเท่าที่จำเป็นสำหรับบัญชี รายงาน และแพ็กเกจของคุณ",
  legalFooter: "เมื่อเข้าสู่ระบบ คุณยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว",
  proof: ["รู้ว่าควรถามอะไร", "มีบริบทก่อนตัดสินใจ"],
  contextChip: "เช็ก DOODEE ก่อนตัดสินใจเรื่องใบหน้า",
  trust: [
    { title: "ความเป็นส่วนตัวมาก่อน", body: "ตั้งค่าให้เป็นส่วนตัวโดยพื้นฐาน" },
    { title: "วิเคราะห์บนอุปกรณ์", body: "ประมวลผลบนอุปกรณ์ของคุณ" },
    { title: "เข้ารหัสและปลอดภัย", body: "ปกป้องการเข้าถึงบัญชี" },
  ],
};
const EN_COPY = {
  heroTitleAria: "Check before deciding on your face",
  heroTitleLineA: "Check before",
  heroTitleLineB: "deciding on your face",
  heroBody: "Review your facial balance and questions to ask before booking a clinic, buying a package, or starting a procedure.",
  formTitle: "Private account",
  formBody: "Sign-in protects access to your reports, plan, and account.",
  formEyebrow: "Private account",
  divider: "or",
  emailLabel: "Email",
  emailHelp: "We'll send a secure one-time sign-in link to this address.",
  invalidEmail: "Enter a valid email address.",
  sendLink: "Send sign-in link",
  sendingLink: "Sending link...",
  googleLoading: "Opening Google...",
  emailLoading: "Preparing email...",
  backToOptions: "Back to sign-in options",
  callbackError: "Sign-in failed. Please try again.",
  signInError: "Sign-in failed. Try again or use email.",
  googleConfigError:
    "Google sign-in is not available right now. Please use email or try again later.",
  googleScriptError:
    "Google sign-in could not load. Please use email or try again later.",
  googleCredentialError: "Google sign-in failed. Please try again or use email.",
  googleOriginError: "Google sign-in is not available on this domain yet.",
  googleProviderError: "Google sign-in is not available right now. Please use email.",
  networkError: "The auth service is unreachable. Try again or use email.",
  emailConfigError: "Email sign-in is not available right now. Please try again later.",
  sentTitle: "Secure link sent",
  sentBody: "Open the link in your email",
  errorTitle: "Sign-in error",
  close: "Close",
  accountNote: "Private by default",
  accountNoteBody: "We use only what is needed for your account, reports, and plan.",
  legalFooter: "By signing in, you agree to the Terms of Use and Privacy Policy.",
  proof: ["Know what to ask", "Context before deciding"],
  contextChip: "Check DOODEE before deciding on your face",
  trust: [
    { title: "Privacy first", body: "Private by default" },
    { title: "On-device analysis", body: "Processed on your device" },
    { title: "Encrypted & secure", body: "Protected access" },
  ],
};

type LoginCopy = typeof EN_COPY;

function authMessage(issue: AuthClientIssue | null, copy: LoginCopy): string {
  if (issue === "google-client-missing") return copy.googleConfigError;
  if (issue === "google-origin-not-allowed") return copy.googleOriginError;
  if (issue === "google-provider-misconfigured") return copy.googleProviderError;
  if (issue === "google-token-missing") return copy.googleCredentialError;
  if (issue === "network") return copy.networkError;
  if (issue === "session-missing") return copy.signInError;
  return copy.signInError;
}

function callbackMessage(code: string | null, copy: LoginCopy): string {
  if (code === "missing-code") return copy.emailConfigError;
  if (code === "google-origin-not-allowed") return copy.googleOriginError;
  if (code === "google-provider-misconfigured") return copy.googleProviderError;
  if (code === "network") return copy.networkError;
  return copy.callbackError;
}

export function WelcomeLogin() {
  const { t, lang, setLang } = useT();
  const copy = lang === "th" ? TH_COPY : EN_COPY;
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams?.get("next") ?? null);
  const callbackError = searchParams?.get("error") ?? null;
  const [toast, setToast] = useState<ToastState>(null);
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState("");
  const [emailIssue, setEmailIssue] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const isConfigured = useMemo(() => supabaseConfigured(), []);

  useEffect(() => {
    if (!isConfigured) return;

    getCurrentUser()
      .then((user) => {
        if (user) {
          void flushCameraAdoptionQueue();
          clearNextPath();
          router.replace(nextPath as never);
        }
      })
      .catch(() => {});
  }, [isConfigured, router, nextPath]);

  useEffect(() => {
    storeNextPath(nextPath);
  }, [nextPath]);

  useEffect(() => {
    if (callbackError) {
      setToast({ kind: "error", message: callbackMessage(callbackError, copy) });
    }
  }, [callbackError, copy]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const handleGoogleClick = useCallback(async () => {
    if (localDevLoginAvailable()) {
      signInLocalDev();
      void flushCameraAdoptionQueue();
      clearNextPath();
      router.replace(nextPath as never);
      return;
    }
    if (!isConfigured) {
      setToast({ kind: "error", message: copy.emailConfigError });
      return;
    }
    storeNextPath(nextPath);
    setBusy("google");
    try {
      const clientId = getGoogleClientId();
      if (!clientId) {
        throw new Error("google-client-id-missing");
      }

      const noncePair = await createGoogleNoncePair();
      if (!noncePair) {
        throw new Error(GOOGLE_SCRIPT_LOAD_FAILED);
      }
      startGoogleRedirect(clientId, noncePair);
    } catch (err) {
      setBusy(null);
      const message =
        err instanceof Error &&
        (err.message === GOOGLE_SCRIPT_LOAD_FAILED ||
          err.message === "google-client-id-missing")
          ? copy.googleScriptError
          : copy.googleCredentialError;
      setToast({ kind: "error", message });
    }
  }, [copy, isConfigured, nextPath, router]);

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!validEmail(normalizedEmail)) {
      setEmailIssue(copy.invalidEmail);
      return;
    }
    if (!isConfigured) {
      setToast({ kind: "error", message: copy.emailConfigError });
      return;
    }
    try {
      storeNextPath(nextPath);
    } catch {}
    setBusy("email");
    setEmailIssue(null);
    try {
      await sendEmailLink(normalizedEmail);
      setToast({ kind: "emailSent", email: normalizedEmail });
      setEmailMode(false);
    } catch (err) {
      setToast({ kind: "error", message: authMessage(authClientIssue(err), copy) });
    } finally {
      setBusy(null);
    }
  }

  function handleEmailClick() {
    setEmailIssue(null);
    if (!isConfigured) {
      setToast({ kind: "error", message: copy.emailConfigError });
      return;
    }
    setEmailMode(true);
  }

  function handleBackToOptions() {
    setEmailIssue(null);
    setEmailMode(false);
  }

  return (
    <main className="login-mobile-lock theme-locked-dark relative h-[100dvh] overflow-hidden bg-[#02040c] text-[#f8fafc] md:min-h-[100dvh] md:overflow-y-auto">
      <BackgroundField />

      <section className="relative mx-auto flex h-full min-h-0 w-full max-w-[100rem] flex-col px-5 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-8 sm:pt-7 md:min-h-[100dvh] md:px-5 md:pb-[max(env(safe-area-inset-bottom),1.25rem)] lg:px-10">
        <nav className="flex animate-fade-in items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="group inline-flex min-h-11 items-center rounded-full pr-1">
              <DoodeeLogo
                markClassName="h-9 w-9 rounded-xl"
                wordmarkClassName="text-[1.45rem] text-white/92 transition group-hover:text-white sm:text-[1.65rem]"
              />
            </Link>
          </div>
          <LoginLangToggle lang={lang} setLang={setLang} ariaLabel={t.lang.toggleAria} />
        </nav>

        <div className="grid min-h-0 flex-1 items-start gap-3 pb-3 pt-[4dvh] md:items-center md:gap-4 md:py-3 xl:grid-cols-[1.02fr_0.98fr] xl:gap-12 xl:py-6">
          <div className="order-2 hidden animate-fade-in xl:order-1 xl:block xl:pt-12">
            <div className="max-w-[46rem] lg:ml-12">
              <span className="liquid-glass inline-flex rounded-full px-3.5 py-1 text-xs font-medium text-white">
                {copy.contextChip}
              </span>
              <h1 aria-label={copy.heroTitleAria} className="max-w-[45rem] font-serif text-[3.35rem] font-normal leading-[0.92] tracking-normal text-white sm:text-[5.2rem] lg:text-[5.8rem] xl:text-[6.2rem]">
                <BlurText text={copy.heroTitleLineA} className="mt-6 block" />
                {" "}
                <BlurText text={copy.heroTitleLineB} className="block" delay={0.08} />
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#b8bfd4] sm:text-xl">
                {copy.heroBody}
              </p>
            </div>
            <ProofStrip copy={copy} />
          </div>

          <div className="order-1 flex min-h-0 w-full animate-fade-in justify-center xl:order-2 xl:translate-x-6 xl:justify-self-end">
            <AuthPanel
              copy={copy}
              isConfigured={isConfigured}
              emailMode={emailMode}
              email={email}
              emailIssue={emailIssue}
              busy={busy}
              onEmail={setEmail}
              onEmailIssue={setEmailIssue}
              onEmailSubmit={handleEmailSubmit}
              onBackToOptions={handleBackToOptions}
              onEmailClick={handleEmailClick}
              onGoogleClick={handleGoogleClick}
              googleLabel={t.login.continueGoogle}
              emailLabel={t.login.continueEmail}
              soonNote={t.login.soonNote}
            />
          </div>
        </div>

        <TrustBar copy={copy} />
      </section>

      <Toast state={toast} copy={copy} onClose={() => setToast(null)} />
    </main>
  );
}

function AuthPanel({
  copy,
  isConfigured,
  emailMode,
  email,
  emailIssue,
  busy,
  onEmail,
  onEmailIssue,
  onEmailSubmit,
  onBackToOptions,
  onEmailClick,
  onGoogleClick,
  googleLabel,
  emailLabel,
  soonNote,
}: {
  copy: LoginCopy;
  isConfigured: boolean;
  emailMode: boolean;
  email: string;
  emailIssue: string | null;
  busy: BusyAction;
  onEmail: (value: string) => void;
  onEmailIssue: (value: string | null) => void;
  onEmailSubmit: (e: FormEvent) => void;
  onBackToOptions: () => void;
  onEmailClick: () => void;
  onGoogleClick: () => void;
  googleLabel: string;
  emailLabel: string;
  soonNote: string;
}) {
  return (
    <div data-login-card className="liquid-glass relative w-full max-w-[20.75rem] overflow-hidden rounded-[1.35rem] px-3 py-3 max-[380px]:max-w-[20rem] sm:max-w-[25.5rem] sm:rounded-[1.65rem] sm:px-7 sm:py-6 lg:px-8 lg:py-7">
      <div aria-hidden className="pointer-events-none absolute inset-px rounded-[1.95rem] bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.16),transparent_36%),radial-gradient(circle_at_100%_100%,rgba(6,182,212,0.14),transparent_38%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 border border-cyan/[0.10]" />

      <div className="relative flex min-h-full flex-col">
        <div className="text-center">
          <span className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-dashed border-violet/45 bg-violet/[0.07] text-violet shadow-[0_0_38px_-18px_rgba(168,85,247,0.95)] sm:h-12 sm:w-12">
            <LockKeyhole className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <h2 className="mt-2 text-[1.25rem] font-semibold tracking-normal text-white sm:mt-3 sm:text-[1.75rem]">
            {copy.formTitle}
          </h2>
          <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-5 text-[#c3c9dc] sm:mt-2 sm:text-[13px] sm:leading-5">
            {copy.formBody}
          </p>
        </div>

        <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent sm:my-5" />

        <div>
          {emailMode ? (
            <form onSubmit={onEmailSubmit} className="space-y-3" noValidate>
              <label className="block">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f8fafc]/[0.52]">
                  {copy.emailLabel}
                </span>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    onEmail(e.target.value);
                    if (emailIssue) onEmailIssue(null);
                  }}
                  placeholder="name@email.com"
                  aria-invalid={emailIssue ? "true" : "false"}
                  aria-describedby="login-email-help"
                  className="h-14 w-full rounded-xl border border-[#f8fafc]/[0.14] bg-[#08101f]/70 px-4 text-base text-[#f8fafc] outline-none transition placeholder:text-[#f8fafc]/[0.32] focus:border-violet/60 focus:bg-[#101426]/85 focus:ring-2 focus:ring-violet/20 sm:h-14"
                />
              </label>
              <p
                id="login-email-help"
                className={emailIssue ? "text-xs font-medium text-rose-200" : "text-xs text-[#f8fafc]/[0.48]"}
              >
                {emailIssue ?? copy.emailHelp}
              </p>
              <button
                type="submit"
                disabled={busy === "email"}
                className="flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-white px-5 text-base font-semibold text-[#0d0b1f] shadow-[0_18px_50px_-30px_rgba(255,255,255,0.9)] transition hover:bg-cyan-50 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 sm:min-h-14"
                aria-busy={busy === "email"}
              >
                {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {busy === "email" ? copy.sendingLink : copy.sendLink}
              </button>
              <button
                type="button"
                onClick={onBackToOptions}
                className="block min-h-[3rem] w-full rounded-xl text-center text-sm font-semibold text-[#f8fafc]/[0.62] transition hover:bg-[#f8fafc]/[0.08] hover:text-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/55"
              >
                {copy.backToOptions}
              </button>
            </form>
          ) : (
            <div className="space-y-2.5 sm:space-y-3">
              <ProviderButton
                label={googleLabel}
                loadingLabel={copy.googleLoading}
                onClick={onGoogleClick}
                busy={busy === "google"}
                disabled={busy !== null}
                icon={<GoogleIcon />}
              />
              <div className="flex items-center gap-4 py-1.5 text-xs font-medium text-[#b3bad0] sm:py-2">
                <span className="h-px flex-1 bg-white/14" />
                <span>{copy.divider}</span>
                <span className="h-px flex-1 bg-white/14" />
              </div>
              <ProviderButton
                label={emailLabel}
                loadingLabel={copy.emailLoading}
                onClick={onEmailClick}
                busy={busy === "email"}
                disabled={busy !== null}
                icon={<Mail className="h-4 w-4" />}
                secondary
              />
            </div>
          )}
        </div>

        <div className="mt-3 flex items-start justify-center gap-2.5 text-center text-[11px] leading-relaxed text-[#c3c9dc] sm:mt-5 sm:gap-3 sm:text-xs">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-violet sm:h-5 sm:w-5" />
          <span>
            <strong className="block text-[12.5px] font-medium text-[#d9ddff] sm:text-sm">
              {copy.accountNote}
            </strong>
            <span className="mt-1 block text-[#b7bfd4] sm:mt-2">{copy.accountNoteBody}</span>
          </span>
        </div>
        <p className="mx-auto mt-2.5 max-w-sm text-center text-[9.5px] leading-relaxed text-[#f8fafc]/[0.52] sm:mt-3 sm:text-[11px]">{copy.legalFooter}</p>

        {isConfigured ? null : (
          <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] px-4 py-3 text-center text-xs font-semibold text-amber-100">
            {soonNote}
          </p>
        )}
      </div>
    </div>
  );
}

function ProviderButton({
  label,
  loadingLabel,
  onClick,
  icon,
  busy,
  disabled,
  secondary = false,
}: {
  label: string;
  loadingLabel: string;
  onClick: () => void;
  icon: ReactNode;
  busy: boolean;
  disabled: boolean;
  secondary?: boolean;
}) {
  const classes = secondary
    ? "border-[#f8fafc]/[0.18] bg-[#0b1020]/55 text-[#c9cee0] hover:border-violet/45 hover:bg-[#f8fafc]/[0.08] hover:text-white"
    : "border-white bg-white text-[#0d0b1f] shadow-[0_18px_50px_-30px_rgba(255,255,255,0.9)] hover:bg-cyan-50";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-busy={busy}
        className={`flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border px-4 text-base font-semibold transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/55 disabled:pointer-events-none disabled:opacity-60 sm:min-h-14 ${classes}`}
      >
        <span
          className={`grid h-7 w-7 flex-none place-items-center rounded-full ${
            secondary ? "bg-[#f8fafc]/[0.08] text-[#c9cee0]" : "bg-white text-[#0d0b1f]"
          }`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        </span>
        <span>{busy ? loadingLabel : label}</span>
      </button>
    </div>
  );
}

function ProofStrip({ copy }: { copy: LoginCopy }) {
  const icons = [LockKeyhole, Globe2];
  return (
    <div className="mt-5 flex flex-wrap gap-3 sm:mt-7 lg:ml-12">
      {copy.proof.map((item, index) => {
        const Icon = icons[index] ?? LockKeyhole;
        return (
        <span
          key={item}
          className="liquid-glass inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 py-1 text-sm font-medium text-[#e4d6ff] sm:text-base"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-violet/18 text-violet">
            <Icon className="h-4 w-4" />
          </span>
          {item}
        </span>
        );
      })}
    </div>
  );
}

function TrustBar({ copy }: { copy: LoginCopy }) {
  const icons = [ShieldCheck, ScanLine, LockKeyhole];
  return (
    <div className="hidden gap-4 pt-4 text-[#b8bfd4] xl:grid xl:grid-cols-3">
      {copy.trust.map((item, index) => {
        const Icon = icons[index] ?? ShieldCheck;
        return (
          <div key={item.title} className="flex items-center gap-4">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl text-violet">
              <Icon className="h-7 w-7" />
            </span>
            <span>
              <strong className="block text-sm font-semibold text-[#dcd8ff]">
                {item.title}
              </strong>
              <span className="text-xs text-[#8e95ad]">{item.body}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

const LOGIN_LANG_OPTIONS: { value: Lang; label: string }[] = [
  { value: "th", label: "TH" },
  { value: "en", label: "EN" },
];

function LoginLangToggle({
  lang,
  setLang,
  ariaLabel,
}: {
  lang: Lang;
  setLang: (value: Lang) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="liquid-glass inline-flex min-h-12 items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-[#c3cadc]"
    >
      <Globe2 className="ml-1 mr-0.5 h-4 w-4 text-[#c8d0e5]" />
      {LOGIN_LANG_OPTIONS.map((option, index) => (
        <span key={option.value} className="inline-flex items-center">
          {index > 0 ? <span className="px-0.5 text-[#6f7890]">/</span> : null}
          <button
            type="button"
            onClick={() => setLang(option.value)}
            aria-pressed={lang === option.value}
            className={`inline-flex min-h-11 min-w-12 items-center justify-center rounded-full px-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/55 ${
              lang === option.value
                ? "login-lang-active bg-white/[0.86] text-[#0d0b1f]"
                : "text-[#aeb6cc] hover:bg-white/[0.05] hover:text-[#f8fafc]"
            }`}
          >
            {option.value === "th" ? "ไทย" : "EN"}
          </button>
        </span>
      ))}
    </div>
  );
}

function Toast({
  state,
  copy,
  onClose,
}: {
  state: ToastState;
  copy: LoginCopy;
  onClose: () => void;
}) {
  const open = state !== null;
  const isError = state?.kind === "error";
  const title = state?.kind === "error" ? copy.errorTitle : state?.kind === "emailSent" ? copy.sentTitle : "";
  const body =
    state?.kind === "error"
      ? state.message
      : state?.kind === "emailSent"
        ? `${copy.sentBody}: ${state.email}`
        : "";

  if (!open) return null;

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className="pointer-events-none fixed bottom-[max(env(safe-area-inset-bottom),1rem)] left-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 animate-fade-in"
    >
      <div
        className={`pointer-events-auto relative rounded-2xl border bg-[#0b1020]/[0.92] p-4 shadow-[0_24px_70px_-42px_rgba(0,0,0,0.9)] backdrop-blur-md ${
          isError ? "border-rose-300/[0.28]" : "border-cyan/[0.24]"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={copy.close}
          className="absolute right-2 top-2 rounded-xl p-3 text-[#f8fafc]/50 transition hover:bg-[#f8fafc]/[0.08] hover:text-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/55"
        >
          <span aria-hidden>x</span>
        </button>
        <div className="flex items-start gap-3 pr-8">
          <div className="grid h-9 w-9 flex-none place-items-center rounded-xl border border-cyan/20 bg-cyan/[0.10] text-cyan">
            {isError ? <LockKeyhole className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#f8fafc]">{title}</p>
            <p className="break-words text-xs leading-relaxed text-[#f8fafc]/[0.62]">{body}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackgroundField() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(115deg,#02040c_0%,#060716_44%,#02040c_100%)]" />
      <div className="absolute inset-0 opacity-[0.10] [background-image:linear-gradient(rgba(248,250,252,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(248,250,252,0.10)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,4,12,0.74)_0%,rgba(2,4,12,0.50)_42%,rgba(2,4,12,0.42)_78%,rgba(2,4,12,0.72)_100%)]" />
      <div className="absolute left-[3%] top-[16%] h-[38rem] w-[38rem] rounded-full border border-violet/[0.18] opacity-55 [background:radial-gradient(circle,transparent_0_44%,rgba(168,85,247,0.14)_45%,transparent_46%,transparent_58%,rgba(6,182,212,0.13)_59%,transparent_60%,transparent_70%,rgba(248,250,252,0.08)_71%,transparent_72%)]" />
      <div className="absolute left-[9%] top-[38%] h-px w-[38rem] max-w-[58vw] bg-gradient-to-r from-violet/45 via-cyan/18 to-transparent" />
      <div className="absolute left-[2%] top-[8%] h-[26rem] w-[26rem] rounded-full bg-violet/[0.10] blur-[8px]" />
      <div className="absolute right-[8%] top-[20%] h-[34rem] w-[34rem] rounded-full bg-violet/[0.08] blur-[8px]" />
      <div className="absolute bottom-[-16rem] left-[28%] h-[34rem] w-[34rem] rounded-full bg-cyan/[0.08] blur-[8px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_43%_46%,rgba(168,85,247,0.12),transparent_28%),radial-gradient(circle_at_50%_96%,rgba(6,182,212,0.14),transparent_34%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.035),transparent_12%,transparent_88%,rgba(255,255,255,0.03))]" />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
