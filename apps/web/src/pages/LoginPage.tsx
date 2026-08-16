import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, LoaderCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Brand from "../Brand";
import { useLocale } from "../useLocale";
import { canSubmitCode, normalizeCode } from "../lib/promoCode";
import { redeemCode } from "../lib/api";
import { errorMessage } from "../lib/apiError";

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

  const continueWithGoogle = async () => {
    if (googleBusy) return;
    setGoogleBusy(true);
    setSignInError("");
    try {
      const { googleSignIn } = await import("../lib/firebase");
      await googleSignIn();
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
    } catch (error) {
      setSignInError(errorMessage(error) || t.signInFailed);
      setGoogleBusy(false);
    }
  };

  return (
    <main className="login-page">
      {googleBusy && (
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
              <span>{t.titleLead}</span> <span>DOODEE</span>
            </h1>
          </div>

          <button
            className="google-button"
            type="button"
            onClick={continueWithGoogle}
            disabled={googleBusy}
            aria-busy={googleBusy}
          >
            <GoogleMark />
            <span className="google-button__label">
              <span>{googleBusy ? t.googleBusy : t.google}</span>
            </span>
            <ArrowRight size={17} />
          </button>

          {signInError && (
            <p className="login-error is-error" role="alert">
              {signInError}
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
