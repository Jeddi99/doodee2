import { FormEvent, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Globe,
  LoaderCircle,
  Lock,
  Mail,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Brand from "../Brand";
import { useLocale } from "../useLocale";
import { canSubmitCode, normalizeCode } from "../lib/promoCode";
import { redeemCode } from "../lib/api";
import { errorMessage } from "../lib/apiError";
import { authErrorKey, formProblem } from "../lib/authForm";

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true" width={20} height={20}>
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.37l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.92A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.54l3.35-2.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.71 9.39 5.95 12 5.95Z"
      />
    </svg>
  );
}

type ReferralState = "idle" | "error" | "saved";
type Mode = "signin" | "signup";

export default function LoginPage() {
  const { locale, chooseLocale, copy } = useLocale();
  const t = copy.login;
  const th = locale !== "en";
  const navigate = useNavigate();

  const [showReferral, setShowReferral] = useState(false);
  const [referral, setReferral] = useState("");
  const [referralState, setReferralState] = useState<ReferralState>("idle");
  const [referralError, setReferralError] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const [signInError, setSignInError] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const busy = googleBusy || emailBusy;

  // Password strength calculation
  const pwdStrength = useMemo(() => {
    const minLen = password.length >= 8;
    const hasNum = /\d/.test(password);
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);

    let score = 0;
    if (minLen) score++;
    if (hasNum) score++;
    if (hasLetter) score++;
    if (hasSpecial && password.length >= 10) score++;

    // Annotated, or TS narrows `label` to the literal type of t.pwdWeak and rejects
    // every reassignment below it.
    let label: string = t.pwdWeak;
    let colorClass = "is-weak";
    if (score === 2) {
      label = t.pwdFair;
      colorClass = "is-fair";
    } else if (score === 3) {
      label = t.pwdGood;
      colorClass = "is-good";
    } else if (score >= 4) {
      label = t.pwdStrong;
      colorClass = "is-strong";
    }

    return {
      score,
      label,
      colorClass,
      minLen,
      hasNum,
      hasLetter,
    };
  }, [password, t]);

  const messageFor = (key: string) =>
    (t as Record<string, string>)[`err${key.charAt(0).toUpperCase()}${key.slice(1)}`] || t.errGeneric;

  const applyReferral = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmitCode(referral)) {
      setReferralState("error");
      setReferralError("");
      return;
    }
    setReferralState("saved");
  };

  const afterSignIn = async () => {
    if (referralState === "saved") {
      try {
        await redeemCode(normalizeCode(referral));
      } catch (error) {
        console.warn("referral redeem failed", errorMessage(error));
      }
    }
    navigate("/onboarding");
  };

  const continueWithGoogle = async () => {
    if (busy) return;
    setGoogleBusy(true);
    setSignInError("");
    setNotice("");
    try {
      const { googleSignIn } = await import("../lib/firebase");
      await googleSignIn();
      await afterSignIn();
    } catch (error) {
      setSignInError(messageFor(authErrorKey(error)) || t.signInFailed);
      setGoogleBusy(false);
    }
  };

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setNotice("");

    if (mode === "signup") {
      if (!displayName.trim()) {
        setSignInError(t.errName);
        return;
      }
      if (password !== confirmPassword) {
        setSignInError(t.errPasswordMismatch);
        return;
      }
      if (!acceptedTerms) {
        setSignInError(t.errTerms);
        return;
      }
    }

    const problem = formProblem({ email, password, confirmPassword, displayName, mode });
    if (problem) {
      if (problem === "name") setSignInError(t.errName);
      else if (problem === "email") setSignInError(t.errEmail);
      else if (problem === "passwordMismatch") setSignInError(t.errPasswordMismatch);
      else setSignInError(t.errShort);
      return;
    }
    setEmailBusy(true);
    setSignInError("");
    try {
      const { emailSignIn, emailSignUp } = await import("../lib/firebase");
      await (mode === "signup" ? emailSignUp(email, password, displayName) : emailSignIn(email, password));
      await afterSignIn();
    } catch (error) {
      setSignInError(messageFor(authErrorKey(error)));
      setEmailBusy(false);
    }
  };

  const resetPassword = async () => {
    if (busy) return;
    setSignInError("");
    setNotice("");
    const { isEmail } = await import("../lib/authForm");
    if (!isEmail(email)) {
      setSignInError(t.errEmail);
      return;
    }
    try {
      const { sendPasswordReset } = await import("../lib/firebase");
      await sendPasswordReset(email);
    } catch (error) {
      const key = authErrorKey(error);
      if (key === "methodDisabled" || key === "tooMany" || key === "network") {
        setSignInError(messageFor(key));
        return;
      }
    }
    setNotice(t.resetSent);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setSignInError("");
    setNotice("");
  };

  return (
    <main className="login-page login-page--split">
      {busy && (
        <div className="login-transition" role="status" aria-live="assertive" aria-label={t.preparing}>
          <div className="login-transition__logo" aria-hidden="true">
            <LoaderCircle className="login-transition__spinner" strokeWidth={1.5} />
            <Brand href="/" />
          </div>
          <div className="login-transition__copy">
            <strong>{t.preparing}</strong>
            <span>{t.preparingBody}</span>
          </div>
        </div>
      )}

      {/* LEFT SIDE: Brand Showcase & Trust Badges */}
      <section className="login-hero-brand">
        <div className="login-hero-brand__content">
          <div className="login-hero-brand__top">
            <Brand />
            <span className="login-hero-badge">
              <Sparkles size={13} />
              AI Aesthetics Standard
            </span>
          </div>

          <div className="login-hero-brand__titles">
            <h1>{t.heroTitle}</h1>
            <p>{t.heroSubtitle}</p>
          </div>

          <div className="login-hero-features">
            <div className="login-hero-feature-card">
              <div className="login-hero-feature-card__icon">
                <SlidersHorizontal size={20} />
              </div>
              <div>
                <strong>{t.feature1Title}</strong>
                <p>{t.feature1Desc}</p>
              </div>
            </div>

            <div className="login-hero-feature-card">
              <div className="login-hero-feature-card__icon">
                <ShieldCheck size={20} />
              </div>
              <div>
                <strong>{t.feature2Title}</strong>
                <p>{t.feature2Desc}</p>
              </div>
            </div>

            <div className="login-hero-feature-card">
              <div className="login-hero-feature-card__icon">
                <Sparkles size={20} />
              </div>
              <div>
                <strong>{t.feature3Title}</strong>
                <p>{t.feature3Desc}</p>
              </div>
            </div>
          </div>

          <div className="login-hero-trust-bar">
            <div className="trust-item">
              <CheckCircle2 size={15} />
              <span>{t.trust1}</span>
            </div>
            <div className="trust-item">
              <Lock size={15} />
              <span>{t.trust2}</span>
            </div>
            <div className="trust-item">
              <Zap size={15} />
              <span>{t.trust3}</span>
            </div>
          </div>
        </div>
      </section>

      {/* RIGHT SIDE: Auth Form Container */}
      <section className="login-card-container">
        <header className="login-top-nav">
          <Link className="login-back-btn" to="/">
            <ArrowLeft size={16} />
            <span>{t.back}</span>
          </Link>

          <button
            type="button"
            className="doodee-lang-toggle"
            onClick={() => chooseLocale(th ? "en" : "th")}
            title={th ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
            aria-label="Toggle language"
          >
            <Globe size={15} />
            <span>{locale.toUpperCase()}</span>
          </button>
        </header>

        <div className="login-panel" aria-labelledby="login-title">
          <div className="login-panel__heading">
            <h1 id="login-title">
              {mode === "signup"
                ? (th ? "สร้างบัญชีใหม่ " : "Create account ")
                : (th ? "เข้าสู่ระบบ " : "Sign in to ")}
              <span className="brand-accent">DOODEE</span>
            </h1>
            <p className="login-panel__subtitle">
              {mode === "signup"
                ? (th ? "เริ่มต้นวิเคราะห์โครงสร้างใบหน้าของคุณวันนี้ ฟรี" : "Start your facial harmony journey today — free")
                : (th ? "ยินดีต้อนรับกลับเข้าสู่แดชบอร์ดความงามของคุณ" : "Welcome back to your personalized aesthetic dashboard")}
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="auth-tabs" role="tablist" aria-label="Authentication Mode">
            <button
              type="button"
              role="tab"
              id="tab-signin"
              aria-controls="auth-form"
              aria-selected={mode === "signin"}
              className={mode === "signin" ? "is-active" : ""}
              onClick={() => switchMode("signin")}
            >
              {t.tabSignIn}
            </button>
            <button
              type="button"
              role="tab"
              id="tab-signup"
              aria-controls="auth-form"
              aria-selected={mode === "signup"}
              className={mode === "signup" ? "is-active" : ""}
              onClick={() => switchMode("signup")}
            >
              {t.tabSignUp}
            </button>
          </div>

          {/* Google SSO Button */}
          <button
            className="google-button"
            type="button"
            onClick={continueWithGoogle}
            disabled={busy}
            aria-busy={googleBusy}
          >
            <GoogleMark />
            <span className="google-button__label">
              <span>{googleBusy ? t.googleBusy : t.google}</span>
            </span>
            <ArrowRight size={17} />
          </button>

          <div className="auth-divider">
            <span>{t.or}</span>
          </div>

          {/* Main Auth Form */}
          <form
            id="auth-form"
            className="auth-form"
            onSubmit={submitEmail}
            noValidate
            role="tabpanel"
            aria-labelledby={mode === "signup" ? "tab-signup" : "tab-signin"}
          >
            {/* Full Name / Display Name on Sign Up */}
            {mode === "signup" && (
              <div className="auth-field-group">
                <label htmlFor="auth-name">
                  <span>{t.displayName}</span>
                </label>
                <div className="auth-input-wrapper">
                  <User className="auth-input-icon" size={17} />
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    placeholder={t.displayNamePlaceholder}
                    disabled={busy}
                    onChange={(event) => {
                      setDisplayName(event.target.value);
                      setSignInError("");
                    }}
                    required
                  />
                </div>
              </div>
            )}

            <div className="auth-field-group">
              <label htmlFor="auth-email">
                <span>{t.email}</span>
              </label>
              <div className="auth-input-wrapper">
                <Mail className="auth-input-icon" size={17} />
                <input
                  id="auth-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  placeholder={t.emailPlaceholder}
                  disabled={busy}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setSignInError("");
                  }}
                  required
                />
              </div>
            </div>

            <div className="auth-field-group">
              <div className="auth-label-row">
                <label htmlFor="auth-password">{t.password}</label>
                {mode === "signin" && (
                  <button
                    type="button"
                    className="auth-forgot-link"
                    onClick={resetPassword}
                    disabled={busy}
                  >
                    {t.forgot}
                  </button>
                )}
              </div>
              <div className="auth-input-wrapper">
                <Lock className="auth-input-icon" size={17} />
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  placeholder={t.passwordPlaceholder}
                  disabled={busy}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setSignInError("");
                  }}
                  required
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  disabled={busy}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t.hidePassword : t.showPassword}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Password Strength Meter in Sign Up mode */}
            {mode === "signup" && password.length > 0 && (
              <div className="password-strength-box" aria-live="polite">
                <div className="password-strength-box__bar">
                  <div
                    className={`strength-bar-fill ${pwdStrength.colorClass}`}
                    style={{ width: `${Math.max(15, (pwdStrength.score / 4) * 100)}%` }}
                  />
                </div>
                <div className="password-strength-box__details">
                  <span className="strength-label">
                    {th ? "ระดับความปลอดภัย:" : "Security:"}{" "}
                    <strong className={pwdStrength.colorClass}>{pwdStrength.label}</strong>
                  </span>
                  <div className="strength-rules">
                    <span className={pwdStrength.minLen ? "is-valid" : ""}>
                      {pwdStrength.minLen ? <Check size={12} /> : "•"} {t.ruleLength}
                    </span>
                    <span className={pwdStrength.hasLetter ? "is-valid" : ""}>
                      {pwdStrength.hasLetter ? <Check size={12} /> : "•"} {t.ruleLetter}
                    </span>
                    <span className={pwdStrength.hasNum ? "is-valid" : ""}>
                      {pwdStrength.hasNum ? <Check size={12} /> : "•"} {t.ruleNumber}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Confirm Password in Sign Up mode */}
            {mode === "signup" && (
              <div className="auth-field-group">
                <div className="auth-label-row">
                  <label htmlFor="auth-confirm-password">{t.confirmPassword}</label>
                  {confirmPassword.length > 0 && (
                    <span
                      className={`password-match-badge ${
                        password === confirmPassword ? "is-match" : "is-mismatch"
                      }`}
                    >
                      {password === confirmPassword ? <Check size={12} /> : "✗"}{" "}
                      {password === confirmPassword ? t.passwordsMatch : t.passwordsMismatch}
                    </span>
                  )}
                </div>
                <div className="auth-input-wrapper">
                  <Lock className="auth-input-icon" size={17} />
                  <input
                    id="auth-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    placeholder={t.confirmPasswordPlaceholder}
                    disabled={busy}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      setSignInError("");
                    }}
                    required
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    disabled={busy}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? t.hidePassword : t.showPassword}
                  >
                    {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
            )}

            {/* Terms and Privacy Checkbox in Sign Up mode */}
            {mode === "signup" && (
              <label className="auth-checkbox-label">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => {
                    setAcceptedTerms(e.target.checked);
                    setSignInError("");
                  }}
                  disabled={busy}
                />
                <span>
                  {th ? "ฉันยอมรับ " : "I agree to the "}
                  <a href="#terms" target="_blank" rel="noreferrer">
                    {t.terms}
                  </a>
                  {th ? " และ " : " and "}
                  <a href="#privacy" target="_blank" rel="noreferrer">
                    {t.privacy}
                  </a>
                </span>
              </label>
            )}

            {/* Error or Notice Alert */}
            {signInError && (
              <div className="login-alert is-error" role="alert">
                <p>{signInError}</p>
              </div>
            )}
            {notice && (
              <div className="login-alert is-saved" role="status">
                <p>{notice}</p>
              </div>
            )}

            <button className="auth-submit-btn" type="submit" disabled={busy} aria-busy={emailBusy}>
              {emailBusy ? (
                <>
                  <LoaderCircle className="auth-spinner" size={18} />
                  <span>{t.busy}</span>
                </>
              ) : (
                <span>{mode === "signup" ? t.submitSignUp : t.submitSignIn}</span>
              )}
            </button>
          </form>

          {/* Referral Code Accordion */}
          <div className={`referral ${showReferral ? "referral--open" : ""}`}>
            <button
              className="referral-toggle"
              type="button"
              onClick={() => {
                setShowReferral(!showReferral);
                setReferralState("idle");
              }}
              aria-expanded={showReferral}
              aria-controls="referral-form"
            >
              <span>{t.referralToggle}</span>
              <ChevronDown size={16} />
            </button>
            <form id="referral-form" onSubmit={applyReferral} aria-hidden={!showReferral}>
              <label htmlFor="referral-code">{t.referralLabel}</label>
              <div className="referral-field">
                <input
                  id="referral-code"
                  value={referral}
                  onChange={(event) => {
                    setReferral(event.target.value.toUpperCase());
                    setReferralState("idle");
                  }}
                  placeholder={t.referralPlaceholder}
                  autoComplete="off"
                  disabled={!showReferral || referralState === "saved"}
                  aria-invalid={referralState === "error"}
                  aria-describedby="referral-message"
                />
                <button type="submit" disabled={!showReferral || referralState === "saved"}>
                  {referralState === "saved" ? <Check size={16} /> : t.apply}
                </button>
              </div>
              <p
                id="referral-message"
                className={
                  referralState === "error"
                    ? "is-error"
                    : referralState === "saved"
                    ? "is-saved"
                    : ""
                }
                role="status"
              >
                {referralState === "error"
                  ? referralError || t.referralTooShort
                  : referralState === "saved"
                  ? t.referralSaved
                  : t.referralIdle}
              </p>
            </form>
          </div>

          {/* Security Assurance Badge */}
          <div className="login-security-badge">
            <Lock size={13} />
            <span>{t.securityBadge}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
