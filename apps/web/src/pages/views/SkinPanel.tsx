import { useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, LockKeyhole, ScanFace, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../DashboardPage";
import { getScans, getSession, getSkinAnalysis, setSkinVisionConsent } from "../../lib/api";
import { errorMessage } from "../../lib/apiError";
import { isSettled, pollDelay } from "@doodee/shared";
import { useLocale } from "../../useLocale";
import { latestScanOfAnyMode } from "../../lib/latestScan";
import SkinTrend from "./SkinTrend";

/**
 * Skin observations for the latest scan.
 *
 * Two things this screen deliberately does not do, both inherited from the engine behind it
 * (`backend/doodee/skin_engine.py`):
 *
 * There is no score and no comparison to anyone else. Every value here is one region of the
 * user's face measured against another region of the same photograph — there is no published
 * skin reference the way there is for craniofacial distances, so a number out of ten would be
 * invented. The bars below show where a reading sits on its own scale, never a rank.
 *
 * And when the photograph could not be read, the advisories replace the readings rather than
 * appearing beside them. A caveat printed next to a number invites the number to be read
 * anyway, which is the failure the whole approach exists to avoid.
 *
 * The model-written description is a separate thing again: it is the only part of the product
 * that involved sending a photograph outside this system, so it is behind its own consent,
 * off until asked for, and switchable off here.
 */

const COPY = {
  th: {
    eyebrow: "วิเคราะห์ผิว",
    heading: "สิ่งที่เห็นได้จากภาพของคุณ",
    intro: "วัดโดยเทียบส่วนหนึ่งของใบหน้ากับอีกส่วนในภาพเดียวกัน แสงในห้องจึงหักล้างกันเอง",
    loading: "กำลังโหลด…",
    noScanTitle: "ยังไม่มีผลสแกน",
    noScanBody: "วิเคราะห์ผิวใช้ภาพหน้าตรงจากการสแกน",
    analysingTitle: "กำลังวิเคราะห์ภาพของคุณ",
    analysingBody: "ใช้เวลาสักครู่ หน้านี้จะอัปเดตเองเมื่อเสร็จ",
    skinScan: "ถ่ายภาพผิวระยะใกล้",
    retakeForSkin: "ถ่ายใหม่พร้อมคำแนะนำแสงแบบสด",
    startScan: "เริ่มสแกน",
    unreadableTitle: "ภาพนี้อ่านค่าผิวไม่ได้",
    unreadableBody: "สภาพการถ่ายไม่เอื้อให้วัดผิวอย่างซื่อสัตย์ เราจึงไม่แสดงตัวเลข ลองถ่ายใหม่ในแสงที่สม่ำเสมอกว่านี้",
    advisoryTitle: "เหตุผล",
    signalsTitle: "สัญญาณที่วัดได้",
    confidence: "ความเชื่อมั่น",
    // A bare percentage reads as a percentage of something the user cares about. This says
    // what it is a percentage *of*: how much weight to put on this one row.
    lowConfidence: "อ่านได้จากภาพเดียว ควรถือเป็นข้อสังเกตมากกว่าตัวเลข",
    notMeasured: "วัดไม่ได้",
    lockedTitle: "ดูครบทุกค่าด้วยแผนแบบเสียเงิน",
    lockedBody: "แผนฟรีเห็นสองค่าที่เชื่อมั่นได้มากที่สุด",
    seePlans: "ดูแพ็กเกจ",
    visionTitle: "คำอธิบายจาก AI",
    visionOffTitle: "ให้ AI ช่วยอธิบายผลนี้",
    visionOffBody: (provider: string) =>
      `ต้องส่งภาพหน้าตรงของคุณไปให้ ${provider} อ่าน ซึ่งเป็นครั้งเดียวที่ภาพใบหน้าออกนอกระบบของเรา ไม่ใช้ฝึกโมเดล ไม่ขาย และปิดกลับได้ทุกเมื่อ`,
    visionEnable: "เปิดใช้ และส่งภาพ",
    visionDisable: "ปิด และหยุดส่งภาพ",
    visionOn: (provider: string) => `เปิดอยู่ · ส่งภาพให้ ${provider}`,
    visionPending: "ยังไม่มีคำอธิบายสำหรับสแกนนี้ ระบบจะสร้างให้ในการสแกนครั้งถัดไป",
    limitsTitle: "สิ่งที่ภาพนี้บอกไม่ได้",
    noRanking: "ค่าเหล่านี้ไม่ได้เทียบกับคนอื่น และไม่ใช่การวินิจฉัยทางการแพทย์",
  },
  en: {
    eyebrow: "Skin analysis",
    heading: "What your photo shows",
    intro: "Measured by comparing one part of your face against another in the same photo, so the room's lighting cancels out.",
    loading: "Loading…",
    noScanTitle: "No scan yet",
    noScanBody: "Skin analysis reads the front photo from a scan.",
    analysingTitle: "Measuring your photo",
    analysingBody: "This takes a moment. The page updates itself when it is done.",
    skinScan: "Capture a close-up for skin",
    retakeForSkin: "Retake with live lighting guidance",
    startScan: "Start a scan",
    unreadableTitle: "This photo can't be read for skin",
    unreadableBody: "The capture conditions don't allow an honest skin measurement, so we're not showing numbers. Try again in more even light.",
    advisoryTitle: "Why",
    signalsTitle: "Measured signals",
    confidence: "Confidence",
    lowConfidence: "read from a single photo — treat it as an observation, not a figure",
    notMeasured: "Not measurable",
    lockedTitle: "See every reading on a paid plan",
    lockedBody: "The free plan shows the two most reliable readings.",
    seePlans: "See plans",
    visionTitle: "AI description",
    visionOffTitle: "Let AI explain these readings",
    visionOffBody: (provider: string) =>
      `This sends your front photo to ${provider} to be read — the only time a face image leaves our systems. Not used for training, never sold, and switchable off at any time.`,
    visionEnable: "Turn on, and send the photo",
    visionDisable: "Turn off, and stop sending",
    visionOn: (provider: string) => `On · sending the photo to ${provider}`,
    visionPending: "No description for this scan yet. One will be generated on your next scan.",
    limitsTitle: "What this photo can't show",
    noRanking: "These readings are not compared to anyone else, and are not a medical diagnosis.",
  },
} as const;

/** Signal labels and which direction each reading runs. */
/**
 * Below this a reading is marked as one to lean on less. Set at 0.5 so it catches `texture`
 * (0.4), the one absolute measurement among six differential ones — `skin_engine`'s own
 * SIGNAL_CONFIDENCE table says so and this is that table's judgement made visible.
 */
const LOW_CONFIDENCE = 0.5;

const SIGNALS = {
  undereye_shadow: {
    th: ["ความคล้ำใต้ตา", "ใต้ตาเทียบกับแก้ม"],
    en: ["Under-eye shadow", "Under-eye against cheek"],
    range: 20,
  },
  tone_spread: {
    th: ["ความสม่ำเสมอของโทนสี", "ความต่างของความสว่างระหว่างบริเวณ"],
    en: ["Tone evenness", "Spread of lightness across regions"],
    range: 15,
  },
  cheek_redness: {
    th: ["รอยแดงที่แก้ม", "แก้มเทียบกับหน้าผาก"],
    en: ["Cheek redness", "Cheeks against forehead"],
    range: 12,
  },
  nose_redness: {
    th: ["รอยแดงที่จมูก", "จมูกเทียบกับหน้าผาก"],
    en: ["Nose redness", "Nose against forehead"],
    range: 12,
  },
  tzone_shine: {
    th: ["ความมันบริเวณ T-zone", "หน้าผากและจมูกเทียบกับแก้ม"],
    en: ["T-zone shine", "Forehead and nose against cheeks"],
    range: 0.2,
  },
  texture: {
    th: ["พื้นผิว", "รายละเอียดละเอียด เทียบตามขนาดใบหน้า"],
    en: ["Texture", "Fine detail, scaled to face width"],
    range: 0.05,
  },
} as const;

type SignalKey = keyof typeof SIGNALS;
/* Both branches of COPY, because `as const` gives each language its own literal type and a
   parameter typed to just one of them rejects the other. */
type Copy = (typeof COPY)[keyof typeof COPY];

function SignalRow({
  signalKey, value, confidence, locale, copy,
}: {
  signalKey: SignalKey;
  value: number | null;
  confidence: number;
  locale: string;
  copy: Copy;
}) {
  const meta = SIGNALS[signalKey];
  const [label, detail] = locale === "en" ? meta.en : meta.th;
  // Magnitude only. A signed bar would need a "good" end, and nothing here has one — these are
  // observations, not a score with a direction to improve in.
  const fill = value === null ? 0 : Math.min(100, (Math.abs(value) / meta.range) * 100);

  return (
    <GlassCard className="skin-signal">
      <div className="skin-signal__head">
        <strong>{label}</strong>
        <span className="skin-signal__value">
          {value === null ? copy.notMeasured : value.toFixed(2)}
        </span>
      </div>
      <small>{detail}</small>
      {/* Confidence is drawn, not just printed. It rides on opacity — a reading the engine
          trusts less is literally fainter — and the least trusted of the six also gets a
          dashed track. Never on colour: colour already means "the reading", and reusing it
          would make a low-confidence row look like a bad result. */}
      <div
        className={`skin-signal__bar${confidence < LOW_CONFIDENCE ? " is-low-confidence" : ""}`}
        style={{ "--skin-confidence": confidence } as CSSProperties}
        role="meter"
        aria-valuenow={Math.round(fill)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <span style={{ width: `${fill}%` }} />
      </div>
      <small className="skin-signal__confidence">
        {copy.confidence} {Math.round(confidence * 100)}%
        {confidence < LOW_CONFIDENCE ? ` · ${copy.lowConfidence}` : ""}
      </small>
    </GlassCard>
  );
}

export default function SkinPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { locale } = useLocale();
  const copy: Copy = COPY[locale === "en" ? "en" : "th"];
  const [error, setError] = useState("");

  const session = useQuery({ queryKey: ["session"], queryFn: getSession });
  const scans = useQuery({
    queryKey: ["scans"],
    queryFn: getScans,
    // Only while something is actually processing. `pollDelay` is the same backoff the
    // analysis screen uses, so two screens watching one scan do not disagree about pace.
    refetchInterval: (query) => {
      const newest = latestScanOfAnyMode(query.state.data as { status?: string }[] | undefined);
      return newest && !isSettled(newest.status) ? pollDelay(0) : false;
    },
  });
  // Newest of any mode, deliberately — see `latestScanOfAnyMode`. This is the one screen where
  // a skin scan should win over a face scan, because it is the one framed and lit for this.
  const latest = latestScanOfAnyMode(scans.data);
  // A scan submitted from the capture page arrives here queued, not measured. Asking for its
  // skin reading would answer 409 and the screen would show an error to somebody whose photo is
  // perfectly fine and simply not finished — so the request waits, and the scan list polls until
  // the worker settles it.
  const settled = latest ? isSettled(latest.status) : false;
  const analysing = Boolean(latest) && !settled;
  const skin = useQuery({
    queryKey: ["skin", latest?.id],
    queryFn: () => getSkinAnalysis(latest.id),
    enabled: Boolean(latest?.id) && settled,
  });

  const provider = session.data?.skin_vision_provider || "AI";
  const consented = Boolean(session.data?.skin_vision_consented);

  const consent = useMutation({
    mutationFn: (accepted: boolean) =>
      setSkinVisionConsent(accepted, session.data?.skin_vision_consent_version),
    onSuccess: () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["session"] });
      queryClient.invalidateQueries({ queryKey: ["skin"] });
    },
    onError: (mutationError) =>
      setError(errorMessage(mutationError) || (mutationError as Error).message),
  });

  if (analysing) {
    return (
      <div className="app-view skin-view">
        <GlassCard className="skin-empty">
          <ScanFace />
          <strong>{copy.analysingTitle}</strong>
          <p aria-busy="true">{copy.analysingBody}</p>
        </GlassCard>
      </div>
    );
  }

  if (scans.isLoading || (latest && skin.isLoading)) {
    return (
      <div className="app-view skin-view">
        <GlassCard className="skin-empty">
          <p aria-busy="true">{copy.loading}</p>
        </GlassCard>
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="app-view skin-view">
        <GlassCard className="skin-empty">
          <ScanFace />
          <strong>{copy.noScanTitle}</strong>
          <p>{copy.noScanBody}</p>
          <button type="button" onClick={() => navigate("/scan")}>{copy.startScan}</button>
          {/* Secondary on purpose. A user with no scans at all needs a face scan for every other
              feature in the product; routing them into the narrower capture first would leave
              them with a skin reading and nothing else. */}
          <button type="button" className="skin-vision__toggle" onClick={() => navigate("/skin-scan")}>
            {copy.skinScan}
          </button>
        </GlassCard>
      </div>
    );
  }

  const data = skin.data;
  const signals = (data?.signals || {}) as Record<string, number | null>;
  const confidence = (data?.confidence || {}) as Record<string, number>;

  return (
    <div className="app-view skin-view">
      <div className="app-page-title">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.heading}</h1>
        <p>{copy.intro}</p>
      </div>

      {error && <p className="skin-error" role="alert">{error}</p>}

      {/* Advisories replace the readings rather than sitting beside them — see the note at the
          top of this file. */}
      {data && !data.readable ? (
        <GlassCard className="skin-unreadable">
          <CircleAlert />
          <strong>{copy.unreadableTitle}</strong>
          <p>{copy.unreadableBody}</p>
          <span className="eyebrow">{copy.advisoryTitle}</span>
          <ul>
            {(data.advisories || []).map((advisory: string) => (
              <li key={advisory}>{advisory}</li>
            ))}
          </ul>
          {/* The dead end this screen used to be: it explained why the photograph could not be
              read and then offered nothing to do about it. The capture flow that checks the same
              conditions before the shutter is the answer, so it is the primary action here. */}
          <button
            type="button"
            className="skin-vision__toggle skin-vision__toggle--enable"
            onClick={() => navigate("/skin-scan")}
          >
            {copy.retakeForSkin}
          </button>
        </GlassCard>
      ) : (
        <>
          <span className="eyebrow">{copy.signalsTitle}</span>
          <div className="skin-signals">
            {Object.keys(SIGNALS)
              .filter((key) => key in signals)
              .map((key) => (
                <SignalRow
                  key={key}
                  signalKey={key as SignalKey}
                  value={signals[key]}
                  confidence={confidence[key] ?? 0}
                  locale={locale}
                  copy={copy}
                />
              ))}
          </div>
          <p className="skin-disclaimer">{copy.noRanking}</p>

          {data?.redacted && (
            <GlassCard className="skin-empty">
              <LockKeyhole />
              <strong>{copy.lockedTitle}</strong>
              <p>{copy.lockedBody}</p>
              <button type="button" onClick={() => navigate("/pricing")}>{copy.seePlans}</button>
            </GlassCard>
          )}
        </>
      )}

      {/* Below the current reading, not instead of it. A trend is the second question a user
          asks; the first is what today's photograph says. */}
      <SkinTrend
        signalLabels={Object.fromEntries(
          (Object.keys(SIGNALS) as SignalKey[]).map((key) => [
            key, locale === "en" ? SIGNALS[key].en[0] : SIGNALS[key].th[0],
          ]),
        )}
      />

      <GlassCard className="skin-vision">
        {consented ? (
          <>
            <h2><Sparkles size={18} /> {copy.visionTitle}</h2>
            <p className="skin-vision__status">{copy.visionOn(provider)}</p>
            {data?.vision ? (
              <>
                <p>{data.vision.summary}</p>
                {(data.vision.observations || []).map((item: { signal: string; reading: string; care: string }) => (
                  <div className="skin-vision__item" key={item.signal}>
                    <strong>
                      {locale === "en"
                        ? SIGNALS[item.signal as SignalKey]?.en[0]
                        : SIGNALS[item.signal as SignalKey]?.th[0]}
                    </strong>
                    <p>{item.reading}</p>
                    {item.care && <small>{item.care}</small>}
                  </div>
                ))}
                {data.vision.limits && (
                  <>
                    <span className="eyebrow">{copy.limitsTitle}</span>
                    <p>{data.vision.limits}</p>
                  </>
                )}
              </>
            ) : (
              <p>{copy.visionPending}</p>
            )}
            <button
              className="skin-vision__toggle"
              type="button"
              disabled={consent.isPending}
              onClick={() => consent.mutate(false)}
            >
              {copy.visionDisable}
            </button>
          </>
        ) : (
          <>
            <h2><Sparkles size={18} /> {copy.visionOffTitle}</h2>
            <p>{copy.visionOffBody(provider)}</p>
            {/* Filled rather than outlined, unlike the disable button above it. Turning this on
                sends a photograph of the user's face to another company; the control should
                feel like a decision, not a toggle flick. */}
            <button
              className="skin-vision__toggle skin-vision__toggle--enable"
              type="button"
              disabled={consent.isPending || !session.data?.skin_vision_enabled}
              onClick={() => consent.mutate(true)}
            >
              {copy.visionEnable}
            </button>
          </>
        )}
      </GlassCard>
    </div>
  );
}
