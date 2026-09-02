import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Droplets, FileText, Globe2, LogOut, MailCheck, Shield, Ticket, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { GlassCard } from "../DashboardPage";
import { deleteAccount, getSession, redeemCode, setSkinVisionConsent } from "../../lib/api";
import { errorMessage } from "../../lib/apiError";
import { firebaseSignOut, resendEmailVerification } from "../../lib/firebase";
import { canSubmitCode, daysRemaining, normalizeCode } from "../../lib/promoCode";
import { useLocale } from "../../useLocale";

const COPY = {
  th: {
    eyebrow: "ตั้งค่าระบบ",
    heading: "บัญชีและความเป็นส่วนตัว",
    intro: "เราเก็บอะไรไว้ นานแค่ไหน และจะยกเลิกได้อย่างไร",
    language: "ภาษา",
    retention: "การเก็บรักษาข้อมูล",
    retentionBody:
      "รูปต้นฉบับของผู้ใหญ่จะถูกลบภายใน 30 วัน ของผู้เยาว์ภายใน 24 ชั่วโมง คุณลบเองก่อนกำหนดได้ตลอดเวลาจากหน้าประวัติการสแกน",
    legal: "เอกสารข้อกำหนดและความเป็นส่วนตัว",
    legalBody:
      "นโยบายความเป็นส่วนตัวบอกครบว่าเราเก็บอะไร นานแค่ไหน ใครได้รับบ้าง และคุณใช้สิทธิตาม PDPA ได้อย่างไร",
    legalTerms: "ข้อกำหนดการใช้งาน",
    legalPrivacy: "นโยบายความเป็นส่วนตัว",
    skinVision: "คำอธิบายผิวจาก AI",
    // The one control in the product that governs a photograph of the user's face leaving this
    // system. It names what is sent, who receives it, what they do not do with it, and what
    // switching it off actually changes — not "your data" and not a promise of deletion the
    // consent log (append-only) could not keep.
    skinVisionBody: (provider: string) =>
      `เมื่อเปิด เราจะส่งภาพหน้าตรงจากการสแกนของคุณไปให้ ${provider} อ่าน แล้วเขียนคำอธิบายจากตัวเลขที่เราวัดไว้แล้ว ` +
      `นี่เป็นจุดเดียวในระบบที่ภาพใบหน้าของคุณออกจากเซิร์ฟเวอร์ของเรา — ส่วนอื่นทั้งหมดส่งเฉพาะตัวเลข ` +
      `ปิดเมื่อไรก็ได้ แล้วการสแกนครั้งต่อไปจะไม่ส่งภาพอีก (คำอธิบายที่เคยสร้างไว้จะถูกซ่อน ไม่แสดงอีก)`,
    skinVisionOn: (provider: string) => `เปิดอยู่ · ส่งภาพให้ ${provider}`,
    skinVisionOff: "ปิดอยู่ · ไม่มีภาพใบหน้าออกจากระบบ",
    skinVisionEnable: "เปิดใช้งาน",
    skinVisionDisable: "ปิดใช้งาน",
    verify: "ยืนยันอีเมลของคุณ",
    verifyBody:
      "ต้องยืนยันอีเมลก่อนจึงจะรับคำเชิญจากเพื่อนได้ ถ้าเข้าสู่ระบบด้วย Google ถือว่ายืนยันแล้ว",
    verifySend: "ส่งอีเมลยืนยัน",
    verifySent: "ส่งอีเมลยืนยันแล้ว",
    verifyAlready: "อีเมลของคุณยืนยันแล้ว",
    verifyFailed: "ส่งไม่สำเร็จในตอนนี้ ลองใหม่อีกครั้งในอีกสักครู่",
    redeem: "ใช้โค้ด",
    redeemBody:
      "โค้ดให้สิทธิ์ดูภาพจำลองแบบไม่จำกัดเป็นเวลาเจ็ดวัน ส่วนการบันทึกภาพเต็มยังจำกัดสามครั้งต่อเดือนทุกแผน",
    redeemActive: (days: number) => `ใช้งานอยู่ · เหลืออีก ${days} วัน`,
    redeemPlaceholder: "กรอกโค้ด",
    redeemLabel: "ใช้โค้ดส่วนลด",
    redeemChecking: "กำลังตรวจสอบ…",
    redeemSubmit: "ใช้โค้ด",
    redeemInvalid: "โค้ดนี้ไม่ถูกต้องหรือหมดอายุแล้ว",
    redeemApplied: "ใช้โค้ดเรียบร้อยแล้ว",
    leaving: "ออกจากบัญชี",
    signOut: "ออกจากระบบ",
    confirmDeleteLabel: "ยืนยันการลบบัญชี",
    confirmDeleteBody:
      "การลบนี้จะลบบัญชีของคุณ ผลวิเคราะห์ทุกรายการ รูปต้นฉบับทุกรูป และภาพจำลองทุกภาพอย่างถาวร",
    cancel: "ยกเลิก",
    deleteEverything: "ลบทั้งหมด",
    deleteAccount: "ลบบัญชีและข้อมูลทั้งหมด",
  },
  en: {
    eyebrow: "Settings",
    heading: "Account and privacy.",
    intro: "What we keep, for how long, and how to end it.",
    language: "Language",
    retention: "Data retention",
    retentionBody:
      "Adult source images are deleted within 30 days and minors’ within 24 hours. You can delete sooner from History at any time.",
    legal: "Terms and privacy",
    legalBody:
      "The Privacy Policy sets out in full what we collect, for how long, who else receives it, and how to exercise your rights under the PDPA.",
    legalTerms: "Terms of Service",
    legalPrivacy: "Privacy Policy",
    skinVision: "AI skin description",
    skinVisionBody: (provider: string) =>
      `When this is on, the front photo from your scan is sent to ${provider}, which reads it and ` +
      `describes what the measurements we already took look like on your face. This is the only ` +
      `point in the system where a photo of your face leaves our servers — everything else sends ` +
      `numbers only. Turn it off at any time and your next scan sends nothing; descriptions ` +
      `already written are hidden rather than shown again.`,
    skinVisionOn: (provider: string) => `On · sent to ${provider}`,
    skinVisionOff: "Off · no photo of your face leaves the system",
    skinVisionEnable: "Turn on",
    skinVisionDisable: "Turn off",
    verify: "Verify your email",
    verifyBody:
      "A verified address is required to accept an invite from a friend. Signing in with Google already counts as verified.",
    verifySend: "Send verification email",
    verifySent: "Verification email sent.",
    verifyAlready: "Your email is already verified.",
    verifyFailed: "Could not send it just now. Try again in a few minutes.",
    redeem: "Redeem a code",
    redeemBody:
      "A code gives unlimited simulation previews for seven days. Saving full images stays capped at three per month on every plan.",
    redeemActive: (days: number) => `Active · ${days} day${days === 1 ? "" : "s"} left`,
    redeemPlaceholder: "Enter code",
    redeemLabel: "Redeem code",
    redeemChecking: "Checking…",
    redeemSubmit: "Redeem",
    redeemInvalid: "That code is not valid or is no longer active.",
    redeemApplied: "Code applied.",
    leaving: "Leaving",
    signOut: "Sign out",
    confirmDeleteLabel: "Confirm account deletion",
    confirmDeleteBody:
      "This permanently deletes your account, every analysis, every source image and every simulation.",
    cancel: "Cancel",
    deleteEverything: "Delete everything",
    deleteAccount: "Delete account and all data",
  },
} as const;

/**
 * Rebuilt on qijek's GlassCard. The theme toggle the old settings page carried is gone: DESIGN.md
 * rules the product light-only, and the dark palette it switched to was removed with index.css.
 */
export default function SettingsPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { locale, chooseLocale } = useLocale();
  const c = COPY[locale === "en" ? "en" : "th"];
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [verifySent, setVerifySent] = useState("");

  const session = useQuery({ queryKey: ["session"], queryFn: getSession });
  const skinVisionConsented = Boolean(session.data?.skin_vision_consented);
  const skinVision = useMutation({
    mutationFn: (accepted: boolean) =>
      setSkinVisionConsent(accepted, session.data?.skin_vision_consent_version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session"] });
      // The skin panel reads the description out of this query, so it has to be refetched or a
      // withdrawal here leaves the text on screen over there.
      queryClient.invalidateQueries({ queryKey: ["skin"] });
    },
  });
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
        <span className="eyebrow">{c.eyebrow}</span>
        <h1>{c.heading}</h1>
        <p>{c.intro}</p>
      </div>

      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}

      <div className="settings-grid">
        <GlassCard className="settings-card">
          <h2>
            <Globe2 size={18} /> {c.language}
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
            <Shield size={18} /> {c.retention}
          </h2>
          <p>{c.retentionBody}</p>
        </GlassCard>

        {/* Next to retention, because the card above states two numbers and the policy is where
            the rest of the answer lives. Both routes are public, so these work from anywhere. */}
        <GlassCard className="settings-card">
          <h2>
            <FileText size={18} /> {c.legal}
          </h2>
          <p>{c.legalBody}</p>
          <nav className="settings-legal">
            <Link to="/privacy">{c.legalPrivacy}</Link>
            <Link to="/terms">{c.legalTerms}</Link>
          </nav>
        </GlassCard>

        {/* Beside retention on purpose — both cards answer "what happens to my face". Hidden
            outright when the server has no provider key, because a switch for a capability this
            deployment does not have is worse than no switch. The same mutation runs from the
            skin panel; both invalidate the same two queries so the two screens cannot disagree
            about whether it is on. */}
        {session.data?.skin_vision_enabled ? (
          <GlassCard className="settings-card">
            <h2>
              <Droplets size={18} /> {c.skinVision}
            </h2>
            <p>{c.skinVisionBody(session.data?.skin_vision_provider || "AI")}</p>
            <p className="settings-status">
              {skinVisionConsented
                ? c.skinVisionOn(session.data?.skin_vision_provider || "AI")
                : c.skinVisionOff}
            </p>
            <button
              className={`skin-vision__toggle${skinVisionConsented ? "" : " skin-vision__toggle--enable"}`}
              type="button"
              disabled={skinVision.isPending}
              onClick={() => skinVision.mutate(!skinVisionConsented)}
            >
              {skinVisionConsented ? c.skinVisionDisable : c.skinVisionEnable}
            </button>
          </GlassCard>
        ) : null}

        {/* Nothing sent this before, so `email_verified` was false forever on every password
            account — and the referral claim now refuses an unverified identity. A user who
            missed the mail at signup needs a way to ask for it again, or the invite they were
            sent is unusable and nothing on screen explains why. */}
        <GlassCard className="settings-card">
          <h2>
            <MailCheck size={18} /> {c.verify}
          </h2>
          <p>{c.verifyBody}</p>
          <button
            className="settings-outline"
            type="button"
            onClick={async () => {
              try {
                const sent = await resendEmailVerification();
                setVerifySent(sent ? c.verifySent : c.verifyAlready);
              } catch {
                setVerifySent(c.verifyFailed);
              }
            }}
          >
            {c.verifySend}
          </button>
          {verifySent && (
            <p className="settings-status" role="status">
              {verifySent}
            </p>
          )}
        </GlassCard>

        {session.data?.redeem_enabled && (
          <GlassCard className="settings-card">
            <h2>
              <Ticket size={18} /> {c.redeem}
            </h2>
            <p>{c.redeemBody}</p>
            {remaining !== null && (
              <p className="settings-status" role="status">
                {c.redeemActive(remaining)}
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
                placeholder={c.redeemPlaceholder}
                aria-label={c.redeemLabel}
                autoComplete="off"
              />
              <button type="submit" disabled={!canSubmitCode(code) || redeem.isPending}>
                {redeem.isPending ? c.redeemChecking : c.redeemSubmit}
              </button>
            </form>
            {redeem.error && (
              <p className="settings-error" role="alert">
                {c.redeemInvalid}
              </p>
            )}
            {redeem.isSuccess && (
              <p className="settings-status" role="status">
                {c.redeemApplied}
              </p>
            )}
          </GlassCard>
        )}

        <GlassCard className="settings-card settings-card--danger">
          <h2>{c.leaving}</h2>
          <button className="settings-outline" type="button" onClick={() => run(firebaseSignOut)}>
            <LogOut size={16} /> {c.signOut}
          </button>
          {confirmingDelete ? (
            <div className="settings-confirm" role="alertdialog" aria-label={c.confirmDeleteLabel}>
              <span>{c.confirmDeleteBody}</span>
              <button type="button" onClick={() => setConfirmingDelete(false)}>
                {c.cancel}
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
                {c.deleteEverything}
              </button>
            </div>
          ) : (
            <button
              className="settings-outline is-danger"
              type="button"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 size={16} /> {c.deleteAccount}
            </button>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
