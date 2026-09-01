import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Globe,
  LoaderCircle,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Brand from "../Brand";
import { useLocale } from "../useLocale";
import { canSubmitCode, normalizeCode } from "../lib/promoCode";
import { redeemCode } from "../lib/api";
import { errorMessage } from "../lib/apiError";
import { authErrorKey } from "../lib/authForm";

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

  const busy = googleBusy;

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
    try {
      const { googleSignIn } = await import("../lib/firebase");
      await googleSignIn();
      await afterSignIn();
    } catch (error) {
      setSignInError(messageFor(authErrorKey(error)) || t.signInFailed);
      setGoogleBusy(false);
    }
  };

  return (
    // Single-column layout. The two-column `login-page--split` variant, with the
    // marketing hero down the left, was built for a page that also carried an
    // e-mail form and needed the height. With Google as the only control there
    // is nothing to fill it, so this returns to the original centred card — the
    // CSS for which never went away (`.login-header`, `.login-layout`,
    // `.login-panel`, `.google-button`, `.referral`, `.login-legal`).
    <main className="login-page">
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

      <header className="login-header">
        <Brand />
        <div className="login-header__actions">
          {/* Kept although the reference design has no language control: it is
              the only one on this page, and dropping it strands anyone whose
              browser opened the app in the other language. */}
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
          <Link className="login-back" to="/">
            <ArrowLeft size={16} />
            <span>{t.back}</span>
          </Link>
        </div>
      </header>

      <div className="login-layout">
        <div className="login-panel" aria-labelledby="login-title">
          {/* Two spans, not one: `.login-panel h1 > span` staggers them in. */}
          <h1 id="login-title">
            <span>{t.titleLead}</span> <span>DOODEE</span>
          </h1>

          {/* Google is the only way in. The e-mail/password form and the
              sign-in/sign-up tabs were removed: Google sign-in both signs in
              and registers, so a second credential path was extra surface to
              secure for no additional reach. lib/firebase still exports
              emailSignIn/emailSignUp/sendPasswordReset — nothing calls them. */}
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

          {signInError && (
            <div className="login-alert is-error" role="alert">
              <p>{signInError}</p>
            </div>
          )}

          {/* Not a sign-in method: the code is redeemed in afterSignIn()
              against the account Google just created. `.referral` carries the
              rules above and below it. */}
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

          {/* The sign-up tab carried a terms checkbox. Without it the consent
              still has to be stated, so it becomes the standard notice — copy
              that already existed in both locales and was never rendered. */}
          <p className="login-legal">
            {t.legalLead}{" "}
            <a href="#terms" target="_blank" rel="noreferrer">
              {t.terms}
            </a>{" "}
            {t.legalMid}{" "}
            <a href="#privacy" target="_blank" rel="noreferrer">
              {t.privacy}
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
