import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Brand from "../Brand";
import { useLocale } from "../useLocale";
import { canSubmitCode, normalizeCode } from "../lib/promoCode";
import { redeemCode } from "../lib/api";
import { errorMessage } from "../lib/apiError";
import { authErrorKey, formProblem } from "../lib/authForm";

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.37l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.92A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.54l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.71 9.39 5.95 12 5.95Z" />
    </svg>
  );
}

type ReferralState = "idle" | "error" | "saved";
type Mode = "signin" | "signup";

export default function LoginPage() {
  const { copy } = useLocale();
  const t = copy.login;
  const navigate = useNavigate();
  const [showReferral, setShowReferral] = useState(false);
  const [referral, setReferral] = useState("");
  const [referralState, setReferralState] = useState<ReferralState>("idle");
  const [referralError, setReferralError] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const [signInError, setSignInError] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const busy = googleBusy || emailBusy;

  // The error strings live on the same `login` copy object as everything else, so the key from
  // authErrorKey() is turned into a copy key here rather than the module knowing about locales.
  const messageFor = (key: string) =>
    (t as Record<string, string>)[`err${key.charAt(0).toUpperCase()}${key.slice(1)}`] || t.errGeneric;

  // Every API route is IsAuthenticated, so a code entered before sign-in cannot
  // be redeemed yet. Hold it here and spend it once the account exists — which
  // is exactly what "your code will be linked to this account" promises.
  const applyReferral = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmitCode(referral)) {
      setReferralState("error");
      setReferralError("");
      return;
    }
    setReferralState("saved");
  };

  // Shared by every way in, so a referral code entered before signing up is spent whichever
  // button the user ends up pressing.
  const afterSignIn = async () => {
    if (referralState === "saved") {
      try {
        await redeemCode(normalizeCode(referral));
      } catch (error) {
        // A bad code must not strand a user who just signed in successfully;
        // surface it on the settings page instead, where it can be retried.
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
    const problem = formProblem({ email, password, mode });
    if (problem) {
      setSignInError(problem === "email" ? t.errEmail : t.errShort);
      return;
    }
    setEmailBusy(true);
    setSignInError("");
    try {
      const { emailSignIn, emailSignUp } = await import("../lib/firebase");
      await (mode === "signup" ? emailSignUp(email, password) : emailSignIn(email, password));
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
      // Anything other than a configuration or rate-limit problem is swallowed on purpose:
      // reporting "no such account" here would turn this box into a way to test which emails
      // are registered, which is exactly what the vague sign-in error above avoids.
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
    <main className="login-page">
      {busy && (
        <div className="login-transition" role="status" aria-live="assertive" aria-label={t.preparing}>
          <div className="login-transition__logo" aria-hidden="true">
            <LoaderCircle className="login-transition__spinner" strokeWidth={1} />
            <Brand href="/" />
          </div>
          <div className="login-transition__copy">
            <strong>{t.preparing}</strong>
            <span>{t.preparingBody}</span>
          </div>
        </div>
      )}
      <header className="login-header">
        <Brand />
        <Link className="login-back" to="/">
          <ArrowLeft size={16} /> {t.back}
        </Link>
      </header>

      <div className="login-layout">
        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-panel__heading">
            <h1 id="login-title">
              <span>{mode === "signup" ? t.tabSignUp : t.titleLead}</span> <span>DOODEE</span>
            </h1>
          </div>

          <div className="auth-tabs" role="tablist" aria-label={t.tabSignIn}>
            <button
              type="button" role="tab" id="tab-signin" aria-controls="auth-form"
              aria-selected={mode === "signin"}
              className={mode === "signin" ? "is-active" : ""}
              onClick={() => switchMode("signin")}
            >
              {t.tabSignIn}
            </button>
            <button
              type="button" role="tab" id="tab-signup" aria-controls="auth-form"
              aria-selected={mode === "signup"}
              className={mode === "signup" ? "is-active" : ""}
              onClick={() => switchMode("signup")}
            >
              {t.tabSignUp}
            </button>
          </div>

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

          <div className="auth-divider"><span>{t.or}</span></div>

          <form id="auth-form" className="auth-form" onSubmit={submitEmail} noValidate
                role="tabpanel" aria-labelledby={mode === "signup" ? "tab-signup" : "tab-signin"}>
            <label htmlFor="auth-email">{t.email}</label>
            <input
              id="auth-email" type="email" inputMode="email" autoComplete="email"
              value={email} placeholder={t.emailPlaceholder} disabled={busy}
              onChange={(event) => { setEmail(event.target.value); setSignInError(""); }}
            />

            <label htmlFor="auth-password">{t.password}</label>
            <div className="auth-password">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                // Tells a password manager to offer a new password rather than an existing one.
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password} placeholder={t.passwordPlaceholder} disabled={busy}
                onChange={(event) => { setPassword(event.target.value); setSignInError(""); }}
              />
              <button
                type="button" className="auth-eye" disabled={busy}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t.hidePassword : t.showPassword}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            <button className="auth-submit" type="submit" disabled={busy} aria-busy={emailBusy}>
              {emailBusy ? t.busy : mode === "signup" ? t.submitSignUp : t.submitSignIn}
            </button>

            {mode === "signin" && (
              <button type="button" className="auth-forgot" onClick={resetPassword} disabled={busy}>
                {t.forgot}
              </button>
            )}
          </form>

          {signInError && (
            <p className="login-error is-error" role="alert">
              {signInError}
            </p>
          )}
          {notice && (
            <p className="login-error is-saved" role="status">
              {notice}
            </p>
          )}

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
              {t.referralToggle}
              <ChevronDown size={17} />
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
                  {referralState === "saved" ? <Check size={17} /> : t.apply}
                </button>
              </div>
              <p
                id="referral-message"
                className={referralState === "error" ? "is-error" : referralState === "saved" ? "is-saved" : ""}
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

          <p className="login-legal">
            {t.legalLead} <a href="#terms">{t.terms}</a> {t.legalMid} <a href="#privacy">{t.privacy}</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
