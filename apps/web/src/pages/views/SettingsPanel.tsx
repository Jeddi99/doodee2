import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2, LogOut, Shield, Ticket, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../DashboardPage";
import { deleteAccount, getSession, redeemCode } from "../../lib/api";
import { errorMessage } from "../../lib/apiError";
import { firebaseSignOut } from "../../lib/firebase";
import { canSubmitCode, daysRemaining, normalizeCode } from "../../lib/promoCode";
import { useLocale } from "../../useLocale";

/**
 * Rebuilt on qijek's GlassCard. The theme toggle the old settings page carried is gone: DESIGN.md
 * rules the product light-only, and the dark palette it switched to was removed with index.css.
 */
export default function SettingsPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { locale, chooseLocale } = useLocale();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const session = useQuery({ queryKey: ["session"], queryFn: getSession });
  const redeem = useMutation({
    mutationFn: () => redeemCode(normalizeCode(code)),
    onSuccess: () => {
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
  const remaining = daysRemaining(session.data?.vip_expires_at);

  const run = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
      navigate("/");
    } catch (actionError) {
      setError(errorMessage(actionError) || (actionError as Error).message);
    }
  };

  return (
    <div className="app-view settings-view">
      <div className="app-page-title">
        <span className="eyebrow">Settings</span>
        <h1>Account and privacy.</h1>
        <p>What we keep, for how long, and how to end it.</p>
      </div>

      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}

      <div className="settings-grid">
        <GlassCard className="settings-card">
          <h2>
            <Globe2 size={18} /> Language
          </h2>
          <div className="settings-choice">
            {(["th", "en"] as const).map((value) => (
              <button
                className={locale === value ? "is-selected" : ""}
                type="button"
                key={value}
                onClick={() => chooseLocale(value)}
                aria-pressed={locale === value}
              >
                {value.toUpperCase()}
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="settings-card">
          <h2>
            <Shield size={18} /> Data retention
          </h2>
          <p>
            Adult source images are deleted within 30 days and minors’ within 24 hours. You can
            delete sooner from History at any time.
          </p>
        </GlassCard>

        {session.data?.redeem_enabled && (
          <GlassCard className="settings-card">
            <h2>
              <Ticket size={18} /> Redeem a code
            </h2>
            <p>
              A code gives unlimited simulation previews for seven days. Saving full images stays
              capped at three per month on every plan.
            </p>
            {remaining !== null && (
              <p className="settings-status" role="status">
                Active · {remaining} day{remaining === 1 ? "" : "s"} left
              </p>
            )}
            <form
              className="settings-redeem"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmitCode(code)) redeem.mutate();
              }}
            >
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Enter code"
                aria-label="Redeem code"
                autoComplete="off"
              />
              <button type="submit" disabled={!canSubmitCode(code) || redeem.isPending}>
                {redeem.isPending ? "Checking…" : "Redeem"}
              </button>
            </form>
            {redeem.error && (
              <p className="settings-error" role="alert">
                That code is not valid or is no longer active.
              </p>
            )}
            {redeem.isSuccess && (
              <p className="settings-status" role="status">
                Code applied.
              </p>
            )}
          </GlassCard>
        )}

        <GlassCard className="settings-card settings-card--danger">
          <h2>Leaving</h2>
          <button className="settings-outline" type="button" onClick={() => run(firebaseSignOut)}>
            <LogOut size={16} /> Sign out
          </button>
          {confirmingDelete ? (
            <div className="settings-confirm" role="alertdialog" aria-label="Confirm account deletion">
              <span>
                This permanently deletes your account, every analysis, every source image and
                every simulation.
              </span>
              <button type="button" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
              <button
                className="is-danger"
                type="button"
                onClick={() =>
                  run(async () => {
                    await deleteAccount();
                    await firebaseSignOut();
                  })
                }
              >
                Delete everything
              </button>
            </div>
          ) : (
            <button
              className="settings-outline is-danger"
              type="button"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 size={16} /> Delete account and all data
            </button>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
