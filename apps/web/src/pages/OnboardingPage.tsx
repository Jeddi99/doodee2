import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Globe2, Mars, Minus, Plus, Search, ShieldCheck, Venus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Brand from "../Brand";
import { canContinueFromAge, saveOnboardingAnswers } from "../lib/onboardingAnswers";
import { useLocale } from "../useLocale";

/**
 * POST /scans/ rejects an upload without this, and ConsentEvent records it against the user.
 * Matches the analysis_consent_version the old OnboardingFlow sent.
 */
export const ANALYSIS_CONSENT_VERSION = "2026.3";

/* Onboarding shipped English-only while the rest of the app is Thailand-first, so a Thai user
   met six English screens right after signing in. Rich paragraphs are stored as functions
   returning JSX because the <strong> emphasis falls in different places in each language. */
const COPY = {
  th: {
    stepOf: (step: number, total: number) => `ขั้นที่ ${step} จาก ${total}`,
    stepShort: (step: number, total: number) => `${step} จาก ${total}`,
    back: "ย้อนกลับ",
    continue: "ถัดไป",

    yes: "ใช่",
    no: "ไม่ใช่",

    q1Label: "ความประทับใจแรก",
    q1Title: "คนหน้าตาดีได้รับการปฏิบัติที่ดีกว่าจริงไหม?",
    q1Hint: "เลือกสิ่งที่คุณคิด",
    q1ResultLabel: "งานวิจัยพบว่า",
    q1TitleNo: "คนส่วนใหญ่คิดต่างจากคุณ",
    q1TitleYes: "87% คิดเหมือนคุณ",
    q1LeadNo: "จากการสำรวจของ YouGov ในกลุ่มผู้ใหญ่ชาวอังกฤษ ปี 2021:",
    q1LeadYes: () => (
      <>จากการสำรวจของ YouGov ปี 2021 <strong>ผู้ใหญ่ 87% บอกว่าคนหน้าตาดีได้รับการปฏิบัติที่ดีกว่าจากคนรอบข้าง</strong></>
    ),
    q1ChartLabel: "87 เปอร์เซ็นต์บอกว่าคนหน้าตาดีได้รับการปฏิบัติที่ดีกว่า ส่วนอีก 13 เปอร์เซ็นต์ตอบอย่างอื่นหรือไม่แน่ใจ",
    q1CaptionNo: "ไม่ใช่ / ไม่แน่ใจ",
    q1CaptionYes: "ใช่",
    q1BodyNo: () => (
      <><strong>87%</strong> เชื่อว่าคนหน้าตาดีได้รับการปฏิบัติที่ดีกว่า มีเพียง <strong>13%</strong> ที่คิดต่างหรือไม่แน่ใจ</>
    ),
    q1BodyYes: () => (
      <>ความได้เปรียบนี้ปรากฏในเรื่องอย่าง <strong>ความประทับใจแรก การเข้าสังคม ไปจนถึงโอกาสในการทำงาน</strong></>
    ),
    q1Source1: "YouGov Body Image Study · สหราชอาณาจักร · 2021",
    q1Source2: "Beauty and the Labor Market · NBER",

    q2Label: "ตัดสินใจเร็วๆ",
    q2Title: "สองคนนี้มีทักษะและประสบการณ์เท่ากัน คุณจะเลือกใครก่อน?",
    q2GroupLabel: "เลือกผู้สมัคร",
    personA: "คนที่ A",
    personB: "คนที่ B",
    candidateAlt: (which: string) => `ผู้สมัคร ${which}`,
    sameSkills: "ทักษะเท่ากัน · ประสบการณ์เท่ากัน",
    q2ResultLabel: "งานวิจัยพบว่า",
    q2Title2: "คุณเพิ่งเลือกจากรูปลักษณ์",
    q2Lead: () => (
      <>ผู้สมัครทั้งสองมี <strong>คุณสมบัติเท่ากัน</strong> สิ่งเดียวที่ต่างกันคือรูปลักษณ์ — และนั่นคือสิ่งที่คุณใช้ตัดสิน</>
    ),
    q2BodyB1: "รูปแบบนี้เกิดขึ้นจริงในการจ้างงาน",
    q2BodyB2: () => (
      <>ในการทดลองภาคสนามที่ใช้ <strong>เรซูเม่ 4,899 ฉบับ</strong> ผู้สมัครที่หน้าตาดีได้รับการติดต่อกลับ <strong>เกือบสองเท่า</strong> ของผู้สมัครที่มีคุณสมบัติใกล้เคียงกันแต่ถูกประเมินว่าหน้าตาด้อยกว่า</>
    ),
    q2BodyB3: () => (
      <><strong>คุณสมบัติเท่ากัน รูปลักษณ์ต่างกัน ผลลัพธ์ต่างกัน</strong></>
    ),
    q2Source: "Galarza & Yamada · Journal of Applied Economics",

    q3Label: "กลุ่มอ้างอิงของคุณ",
    q3Title: "ให้เราใช้เกณฑ์อ้างอิงของเพศใดในการวิเคราะห์?",
    q3Hint: "ช่วยให้เราเทียบสัดส่วนใบหน้ากับช่วงอ้างอิงที่ตรงกับคุณมากขึ้น",
    q3GroupLabel: "เพศอ้างอิง",
    male: "ชาย",
    female: "หญิง",

    q4Label: "อายุของคุณ",
    q4Title: "คุณอายุเท่าไหร่?",
    q4Hint: "อายุช่วยให้เราเลือกกลุ่มเปรียบเทียบที่เหมาะสม และอธิบายปัจจัยที่มาตามวัยได้ชัดขึ้น",
    ageDrag: "ลากเพื่อเลือกอายุ",
    ageValue: (age: number) => `อายุ ${age} ปี`,
    ageDecrease: "ลดอายุ",
    ageIncrease: "เพิ่มอายุ",
    ageFine: "ปรับอายุอย่างละเอียด",
    minorNotice: "DOODEE วิเคราะห์เฉพาะใบหน้าผู้ใหญ่ คุณต้องมีอายุ 18 ปีขึ้นไปจึงจะใช้งานต่อได้",

    q5Label: "ภูมิหลังของคุณ",
    q5Title: "คุณเกิดที่ประเทศใด?",
    q5Hint: "เราใช้ประเทศเกิดเพื่อเลือกกลุ่มประชากรอ้างอิงที่ตรงกว่า ไม่ได้ใช้ระบุเชื้อชาติของคุณ",
    countryLabel: "ประเทศที่เกิด",
    countrySelect: "เลือกประเทศ",
    countrySearch: "ค้นหาประเทศ",
    countryList: "รายชื่อประเทศ",
    countryEmpty: "ไม่พบประเทศที่ค้นหา",

    q6Label: "ก่อนเริ่ม",
    q6Title: "ความยินยอมของคุณ",
    q6Hint: "DOODEE วิเคราะห์ใบหน้าผู้ใหญ่เพื่อให้ความรู้ความเข้าใจ ไม่ใช่การวินิจฉัยทางการแพทย์ และไม่ทดแทนผู้เชี่ยวชาญ",
    consentAnalyseTitle: "วิเคราะห์รูปของฉัน",
    consentAnalyseBody: "เราวัดจุดอ้างอิงบนใบหน้าและสัญญาณผิว เพื่อสร้างรายงานของคุณ",
    consentStoreTitle: "เก็บรูปไว้ 30 วัน",
    consentStoreBody: "รูปเก็บใน bucket ส่วนตัวหลังลิงก์ที่หมดอายุได้ และคุณลบเองได้ตลอดเวลา",
    startScan: "เริ่มสแกน",
  },
  en: {
    stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
    stepShort: (step: number, total: number) => `${step} of ${total}`,
    back: "Back",
    continue: "Continue",

    yes: "Yes",
    no: "No",

    q1Label: "First impressions",
    q1Title: "Do good-looking people get treated better?",
    q1Hint: "Choose what you think.",
    q1ResultLabel: "What the research found",
    q1TitleNo: "Most people disagree with you.",
    q1TitleYes: "87% agree with you.",
    q1LeadNo: "In a 2021 YouGov survey of adults in Great Britain:",
    q1LeadYes: () => (
      <>In a 2021 YouGov survey, <strong>87% of adults said attractive people are treated better by others.</strong></>
    ),
    q1ChartLabel: "87 percent said good-looking people are treated better while 13 percent gave another response or were unsure",
    q1CaptionNo: "No / unsure",
    q1CaptionYes: "Yes",
    q1BodyNo: () => (
      <><strong>87%</strong> believe good-looking people are treated more favourably. Only <strong>13%</strong> said otherwise or weren’t sure.</>
    ),
    q1BodyYes: () => (
      <>That advantage can show up in things like <strong>first impressions, social interactions, and even work opportunities.</strong></>
    ),
    q1Source1: "YouGov Body Image Study · Great Britain · 2021",
    q1Source2: "Beauty and the Labor Market · NBER",

    q2Label: "A quick decision",
    q2Title: "These two people have the same skills and experience. Who would you choose first?",
    q2GroupLabel: "Choose a candidate",
    personA: "Person A",
    personB: "Person B",
    candidateAlt: (which: string) => `Candidate ${which}`,
    sameSkills: "Same skills · Same experience",
    q2ResultLabel: "What the research found",
    q2Title2: "You just chose on appearance.",
    q2Lead: () => (
      <>Both candidates had the <strong>same qualifications</strong>. Appearance was the only thing separating them — and it is what you decided on.</>
    ),
    q2BodyB1: "This pattern shows up in real hiring.",
    q2BodyB2: () => (
      <>In a field experiment involving <strong>4,899 résumés</strong>, attractive candidates received <strong>nearly twice as many callbacks</strong> as similarly qualified candidates rated as less attractive.</>
    ),
    q2BodyB3: () => (
      <><strong>Same qualifications. Different appearance. Different outcome.</strong></>
    ),
    q2Source: "Galarza & Yamada · Journal of Applied Economics",

    q3Label: "Your reference",
    q3Title: "Which sex should we use for your analysis?",
    q3Hint: "This helps us compare facial proportions with a more relevant reference range.",
    q3GroupLabel: "Sex reference",
    male: "Male",
    female: "Female",

    q4Label: "Your age",
    q4Title: "How old are you?",
    q4Hint: "Age helps us use a more relevant comparison and explain age-related factors clearly.",
    ageDrag: "Drag to choose age",
    ageValue: (age: number) => `${age} years old`,
    ageDecrease: "Decrease age",
    ageIncrease: "Increase age",
    ageFine: "Fine tune age",
    minorNotice: "DOODEE analyses adult faces only. You need to be 18 or older to continue.",

    q5Label: "Your background",
    q5Title: "Where were you born?",
    q5Hint: "We use your country of birth to select a more relevant population reference. It does not define your ethnicity.",
    countryLabel: "Country of birth",
    countrySelect: "Select country",
    countrySearch: "Search country",
    countryList: "Countries",
    countryEmpty: "No country found",

    q6Label: "Before we start",
    q6Title: "Your consent",
    q6Hint: "DOODEE analyses adult faces for educational insight. It is not a diagnosis and does not replace a qualified professional.",
    consentAnalyseTitle: "Analyse my photos",
    consentAnalyseBody: "Facial landmarks and skin signals are measured to build your report.",
    consentStoreTitle: "Store them for 30 days",
    consentStoreBody: "Photos sit in a private bucket behind expiring links, and you can delete them at any time.",
    startScan: "Start my scan",
  },
} as const;


type Frequency = "yes" | "no";
type CandidateChoice = "a" | "b";
type SexReference = "female" | "male";
type Step = 1 | 2 | 3 | 4 | 5 | 6;

const TOTAL_STEPS = 6;

const countryCodes = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");

/* Built per locale rather than once at module load: hard-coding "en" here left the country
   list in English on an otherwise Thai screen. Sorting also has to follow the locale. */
function countriesFor(locale: string) {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return countryCodes
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

function detectCountry() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezoneCountry: Record<string, string> = {
    "Asia/Bangkok": "TH",
    "Asia/Tokyo": "JP",
    "Asia/Seoul": "KR",
    "Asia/Singapore": "SG",
    "Asia/Hong_Kong": "HK",
    "Asia/Jakarta": "ID",
    "Asia/Kuala_Lumpur": "MY",
    "Asia/Manila": "PH",
    "Asia/Ho_Chi_Minh": "VN",
    "Europe/London": "GB",
    "Australia/Sydney": "AU",
    "Pacific/Auckland": "NZ",
  };
  if (timezoneCountry[zone]) return timezoneCountry[zone];
  for (const language of navigator.languages) {
    const region = new Intl.Locale(language).region;
    if (region && countryCodes.includes(region)) return region;
  }
  return "";
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const c = COPY[locale === "en" ? "en" : "th"];
  const countries = useMemo(() => countriesFor(locale), [locale]);
  const frequencyOptions = useMemo(
    () => [
      { value: "yes" as const, label: c.yes },
      { value: "no" as const, label: c.no },
    ],
    [c],
  );
  const [step, setStep] = useState<Step>(1);
  const [analysisConsent, setAnalysisConsent] = useState(false);
  const [storageConsent, setStorageConsent] = useState(false);
  const [frequency, setFrequency] = useState<Frequency | null>(null);
  const [candidate, setCandidate] = useState<CandidateChoice | null>(null);
  const [sexReference, setSexReference] = useState<SexReference | null>(null);
  const [age, setAge] = useState(18);
  const [isDraggingAge, setIsDraggingAge] = useState(false);
  const ageDrag = useRef<{ pointerId: number; startX: number; startAge: number; currentAge: number; stepWidth: number } | null>(null);
  const [birthCountry, setBirthCountry] = useState(() => detectCountry());
  const [countryQuery, setCountryQuery] = useState("");
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const countryPickerRef = useRef<HTMLDivElement>(null);
  const countrySearchRef = useRef<HTMLInputElement>(null);
  const ageWindow = useMemo(
    () => [-2, -1, 0, 1, 2].map((offset) => Math.min(80, Math.max(15, age + offset))),
    [age],
  );
  const selectedCountry = countries.find((country) => country.code === birthCountry);
  const filteredCountries = useMemo(() => {
    const query = countryQuery.trim().toLocaleLowerCase();
    if (!query) return countries.slice(0, 10);
    return countries.filter((country) => country.name.toLocaleLowerCase().includes(query)).slice(0, 10);
  }, [countryQuery, countries]);

  useEffect(() => {
    if (!isCountryOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!countryPickerRef.current?.contains(event.target as Node)) setIsCountryOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [isCountryOpen]);

  useEffect(() => {
    if (isCountryOpen) requestAnimationFrame(() => countrySearchRef.current?.focus());
  }, [isCountryOpen]);

  const clampAge = (value: number) => Math.min(80, Math.max(15, value));

  const startAgeDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const numbers = event.currentTarget.querySelectorAll("span");
    const stepWidth = numbers.length > 1
      ? Math.abs(numbers[1].getBoundingClientRect().left - numbers[0].getBoundingClientRect().left)
      : 56;
    ageDrag.current = { pointerId: event.pointerId, startX: event.clientX, startAge: age, currentAge: age, stepWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingAge(true);
  };

  const moveAgeDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = ageDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    const nextAge = clampAge(drag.startAge + Math.round(-delta / drag.stepWidth));
    const renderedSteps = nextAge - drag.startAge;
    const remainder = Math.max(-drag.stepWidth, Math.min(drag.stepWidth, delta + renderedSteps * drag.stepWidth));
    event.currentTarget.style.setProperty("--age-drag-x", `${remainder}px`);
    if (nextAge !== drag.currentAge) {
      drag.currentAge = nextAge;
      setAge(nextAge);
    }
  };

  const stopAgeDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (ageDrag.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDraggingAge(false);
    const wheel = event.currentTarget;
    requestAnimationFrame(() => wheel.style.setProperty("--age-drag-x", "0px"));
    ageDrag.current = null;
  };

  const handleAgeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const nextAge = {
      ArrowLeft: age - 1,
      ArrowDown: age - 1,
      ArrowRight: age + 1,
      ArrowUp: age + 1,
      Home: 15,
      End: 80,
    }[event.key];
    if (nextAge === undefined) return;
    event.preventDefault();
    setAge(clampAge(nextAge));
  };

  // Steps 1 and 2 are framing questions with no field behind them, so only steps 3–5 and the
  // consent from step 6 are persisted. The typed age never leaves the browser — only its band.
  const finish = () => {
    saveOnboardingAnswers({
      age,
      sexReference,
      birthCountry,
      consentVersion: ANALYSIS_CONSENT_VERSION,
    });
    navigate("/scan");
  };

  const isMinor = !canContinueFromAge(String(age));

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <Brand />
        <div className="onboarding-progress" aria-label={c.stepOf(step, TOTAL_STEPS)}>
          <span>{c.stepShort(step, TOTAL_STEPS)}</span>
          <span className="onboarding-progress__track" aria-hidden="true">
            <span style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
          </span>
        </div>
      </header>

      <section className="onboarding-shell" aria-live="polite">
        {step === 1 ? (
          <div className={`onboarding-step ${frequency ? "onboarding-step--survey-result" : ""}`} key={frequency ? "question-one-result" : "question-one"}>
            {!frequency ? (
              <>
                <div className="onboarding-question onboarding-question--centered">
                  <p className="onboarding-label">{c.q1Label}</p>
                  <h1>{c.q1Title}</h1>
                  <p>{c.q1Hint}</p>
                </div>

                <div className="frequency-options frequency-options--binary" role="radiogroup" aria-label={c.q1Title}>
                  {frequencyOptions.map((option) => (
                    <button
                      className="frequency-option frequency-option--binary"
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked="false"
                      onClick={() => setFrequency(option.value)}
                    >
                      <span>{option.label}</span>
                      <span className="frequency-option__check" aria-hidden="true">
                        <Check size={15} />
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="survey-result-heading" role="status">
                  <p className="onboarding-label">{c.q1ResultLabel}</p>
                  <h1>{frequency === "no" ? c.q1TitleNo : c.q1TitleYes}</h1>
                  <p>{frequency === "no" ? c.q1LeadNo : c.q1LeadYes()}</p>
                </div>

                <figure className={`survey-result-chart ${frequency === "no" ? "survey-result-chart--minority" : ""}`} aria-label={c.q1ChartLabel}>
                  <div className="survey-result-chart__bar" aria-hidden="true">
                    <span className={frequency === "no" ? "survey-result-chart__other" : "survey-result-chart__yes"} />
                  </div>
                  <figcaption>
                    {frequency === "no" ? (
                      <span><strong>13%</strong><small>{c.q1CaptionNo}</small></span>
                    ) : (
                      <span><strong>87%</strong><small>{c.q1CaptionYes}</small></span>
                    )}
                  </figcaption>
                </figure>

                <div className="survey-result-copy">
                  <p>{frequency === "no" ? c.q1BodyNo() : c.q1BodyYes()}</p>
                  <div className="response-research__links">
                    <a href="https://yougov.com/en-gb/articles/35834-physical-appearance-todays-society" target="_blank" rel="noreferrer">
                      {c.q1Source1} <ArrowRight size={14} />
                    </a>
                    <a href="https://www.nber.org/papers/w4518" target="_blank" rel="noreferrer">
                      {c.q1Source2} <ArrowRight size={14} />
                    </a>
                  </div>
                </div>

                <div className="onboarding-actions onboarding-actions--end">
                  <button className="onboarding-primary" type="button" onClick={() => setStep(2)}>
                    {c.continue} <ArrowRight size={17} />
                  </button>
                </div>
              </>
            )}
          </div>
        ) : step === 2 ? (
          <div className={`onboarding-step ${candidate ? "onboarding-step--survey-result" : ""}`} key={candidate ? "question-two-result" : "question-two"}>
            {!candidate ? (
              <>
                <div className="onboarding-question onboarding-question--centered">
                  <p className="onboarding-label">{c.q2Label}</p>
                  <h1>{c.q2Title}</h1>
                </div>

                <div className="candidate-grid" role="radiogroup" aria-label={c.q2GroupLabel}>
                  <button
                    className="candidate-option"
                    type="button"
                    role="radio"
                    aria-checked="false"
                    onClick={() => setCandidate("a")}
                  >
                    <span className="candidate-option__image">
                      <img src="/assets/candidate-right-glasses.webp" alt={c.candidateAlt("A")} />
                      <span className="candidate-option__check"><Check size={16} /></span>
                    </span>
                    <span className="candidate-option__copy">
                      <strong>{c.personA}</strong>
                      <span>{c.sameSkills}</span>
                    </span>
                  </button>

                  <button
                    className="candidate-option"
                    type="button"
                    role="radio"
                    aria-checked="false"
                    onClick={() => setCandidate("b")}
                  >
                    <span className="candidate-option__image">
                      <img src="/assets/candidate-left.webp" alt={c.candidateAlt("B")} />
                      <span className="candidate-option__check"><Check size={16} /></span>
                    </span>
                    <span className="candidate-option__copy">
                      <strong>{c.personB}</strong>
                      <span>{c.sameSkills}</span>
                    </span>
                  </button>
                </div>

                <div className="onboarding-actions">
                  <button className="onboarding-secondary" type="button" onClick={() => setStep(1)}>
                    <ArrowLeft size={17} /> {c.back}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* One result for either choice, and no bar.

                    What stood here: "82% chose Person B in this example", over a bar filled to a
                    hardcoded 82% width, with "18% chose Person A" on the other branch. Nobody has
                    ever counted how visitors answer this — the two photographs are stock images
                    and the choice is not even sent anywhere — so both figures described a survey
                    that does not exist. The 82 was borrowed from the study cited below, where it
                    is a *callback premium* and not a share of people; printing it as "82% chose"
                    was the same number asserting a different, unmeasured fact.

                    So the screen now says the one thing this step really established, which is
                    what the reader themselves just did, and hands the statistics back to the
                    citation that can carry them. If the choice is ever recorded server-side, a
                    real share can come back — with the count of respondents beside it. */}
                <div className="survey-result-heading" role="status">
                  <p className="onboarding-label">{c.q2ResultLabel}</p>
                  <h1>{c.q2Title2}</h1>
                  <p>{c.q2Lead()}</p>
                </div>

                <div className="survey-result-copy">
                  <p>{c.q2BodyB1}</p>
                  <p>{c.q2BodyB2()}</p>
                  <p>{c.q2BodyB3()}</p>
                  <div className="response-research__links">
                    <a href="https://www.tandfonline.com/doi/pdf/10.1016/S1514-0326%2817%2930002-8" target="_blank" rel="noreferrer">
                      {c.q2Source} <ArrowRight size={14} />
                    </a>
                  </div>
                </div>

                <div className="onboarding-actions onboarding-actions--end">
                  <button className="onboarding-primary" type="button" onClick={() => setStep(3)}>
                    {c.continue} <ArrowRight size={17} />
                  </button>
                </div>
              </>
            )}
          </div>
        ) : step === 3 ? (
          <div className="onboarding-step onboarding-step--profile" key="sex-reference">
            <div className="profile-question">
              <p className="onboarding-label">{c.q3Label}</p>
              <h1>{c.q3Title}</h1>
              <p>{c.q3Hint}</p>
            </div>

            <div className="sex-options" role="radiogroup" aria-label={c.q3GroupLabel}>
              {([
                ["male", c.male, Mars],
                ["female", c.female, Venus],
              ] as const).map(([value, label, Icon]) => (
                <button
                  className={`sex-option ${sexReference === value ? "is-selected" : ""}`}
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={sexReference === value}
                  onClick={() => setSexReference(value)}
                >
                  <span className="sex-option__symbol" aria-hidden="true"><Icon /></span>
                  <span className="sex-option__label">{label}</span>
                  <span className="frequency-option__check" aria-hidden="true"><Check size={15} /></span>
                </button>
              ))}
            </div>

            <div className="onboarding-actions">
              <button className="onboarding-secondary" type="button" onClick={() => setStep(2)}>
                <ArrowLeft size={17} /> {c.back}
              </button>
              <button className="onboarding-primary" type="button" disabled={!sexReference} onClick={() => setStep(4)}>
                {c.continue} <ArrowRight size={17} />
              </button>
            </div>
          </div>
        ) : step === 4 ? (
          <div className="onboarding-step onboarding-step--profile onboarding-step--age" key="age-step">
            <div className="profile-question">
              <p className="onboarding-label">{c.q4Label}</p>
              <h1>{c.q4Title}</h1>
              <p>{c.q4Hint}</p>
            </div>

            <div className="age-picker">
              <div
                aria-label={c.ageDrag}
                aria-valuemax={80}
                aria-valuemin={15}
                aria-valuenow={age}
                aria-valuetext={c.ageValue(age)}
                className={`age-wheel${isDraggingAge ? " is-dragging" : ""}`}
                onKeyDown={handleAgeKey}
                onPointerCancel={stopAgeDrag}
                onPointerDown={startAgeDrag}
                onPointerMove={moveAgeDrag}
                onPointerUp={stopAgeDrag}
                role="slider"
                tabIndex={0}
              >
                <div className="age-wheel__track">
                  {ageWindow.map((value, index) => (
                    <span className={index === 2 ? "is-current" : ""} key={`${value}-${index}`}>{value}</span>
                  ))}
                </div>
              </div>
              <div className="age-controls">
                <button type="button" aria-label={c.ageDecrease} disabled={age <= 15} onClick={() => setAge((value) => Math.max(15, value - 1))}><Minus size={17} /></button>
                <input
                  aria-label={c.ageFine}
                  type="range"
                  min="15"
                  max="80"
                  value={age}
                  onChange={(event) => setAge(Number(event.target.value))}
                />
                <button type="button" aria-label={c.ageIncrease} disabled={age >= 80} onClick={() => setAge((value) => Math.min(80, value + 1))}><Plus size={17} /></button>
              </div>
              <div className="age-limits"><span>15</span><span>80</span></div>
            </div>

            {isMinor && (
              <p className="onboarding-minor-notice" role="status">
                {c.minorNotice}
              </p>
            )}

            <div className="onboarding-actions">
              <button className="onboarding-secondary" type="button" onClick={() => setStep(3)}><ArrowLeft size={17} /> {c.back}</button>
              <button className="onboarding-primary" type="button" disabled={isMinor} onClick={() => setStep(5)}>{c.continue} <ArrowRight size={17} /></button>
            </div>
          </div>
        ) : step === 5 ? (
          <div className="onboarding-step onboarding-step--profile onboarding-step--country" key="birth-country">
            <div className="profile-question">
              <p className="onboarding-label">{c.q5Label}</p>
              <h1>{c.q5Title}</h1>
              <p>{c.q5Hint}</p>
            </div>

            <div className={`country-picker${isCountryOpen ? " is-open" : ""}`} ref={countryPickerRef}>
              <Globe2 className="country-picker__icon" aria-hidden="true" strokeWidth={1.25} />
              <div className="country-picker__control">
                <span className="country-picker__label">{c.countryLabel}</span>
                <button
                  aria-controls="country-options"
                  aria-expanded={isCountryOpen}
                  className="country-picker__trigger"
                  type="button"
                  onClick={() => {
                    setCountryQuery("");
                    setIsCountryOpen((open) => !open);
                  }}
                >
                  {selectedCountry ? (
                    <span className="country-picker__value">
                      <img alt="" src={`https://flagcdn.com/w40/${selectedCountry.code.toLocaleLowerCase()}.png`} />
                      {selectedCountry.name}
                    </span>
                  ) : <span className="country-picker__placeholder">{c.countrySelect}</span>}
                  <ChevronDown aria-hidden="true" size={18} />
                </button>

                {isCountryOpen && (
                  <div className="country-menu" id="country-options">
                    <div className="country-menu__search">
                      <Search aria-hidden="true" size={17} />
                      <input
                        aria-label={c.countrySearch}
                        autoComplete="off"
                        placeholder={c.countrySearch}
                        ref={countrySearchRef}
                        type="search"
                        value={countryQuery}
                        onChange={(event) => setCountryQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setIsCountryOpen(false);
                        }}
                      />
                    </div>
                    <div aria-label={c.countryList} className="country-menu__list" role="listbox">
                      {filteredCountries.map((country) => (
                        <button
                          aria-selected={country.code === birthCountry}
                          className={country.code === birthCountry ? "is-selected" : ""}
                          key={country.code}
                          role="option"
                          type="button"
                          onClick={() => {
                            setBirthCountry(country.code);
                            setCountryQuery("");
                            setIsCountryOpen(false);
                          }}
                        >
                          <img alt="" loading="lazy" src={`https://flagcdn.com/w40/${country.code.toLocaleLowerCase()}.png`} />
                          <span>{country.name}</span>
                          {country.code === birthCountry && <Check aria-hidden="true" size={16} />}
                        </button>
                      ))}
                      {!filteredCountries.length && <p className="country-menu__empty">{c.countryEmpty}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="onboarding-actions">
              <button className="onboarding-secondary" type="button" onClick={() => setStep(4)}><ArrowLeft size={17} /> {c.back}</button>
              <button className="onboarding-primary" type="button" disabled={!birthCountry} onClick={() => setStep(6)}>{c.continue} <ArrowRight size={17} /></button>
            </div>
          </div>
        ) : (
          /* Step 6 exists only in doodee: POST /scans/ requires analysis_consent_version and
             the backend records a ConsentEvent per purpose. Built on the same card, label and
             option markup as steps 3–5 so it reads as part of the same flow. */
          <div className="onboarding-step onboarding-step--profile" key="consent">
            <div className="profile-question">
              <p className="onboarding-label">{c.q6Label}</p>
              <h1>{c.q6Title}</h1>
              <p>{c.q6Hint}</p>
            </div>

            <div className="consent-options">
              <button
                className={`consent-option ${analysisConsent ? "is-selected" : ""}`}
                type="button"
                role="checkbox"
                aria-checked={analysisConsent}
                onClick={() => setAnalysisConsent((value) => !value)}
              >
                <span className="consent-option__symbol" aria-hidden="true"><ShieldCheck /></span>
                <span className="consent-option__copy">
                  <strong>{c.consentAnalyseTitle}</strong>
                  <span>{c.consentAnalyseBody}</span>
                </span>
                <span className="frequency-option__check" aria-hidden="true"><Check size={15} /></span>
              </button>

              <button
                className={`consent-option ${storageConsent ? "is-selected" : ""}`}
                type="button"
                role="checkbox"
                aria-checked={storageConsent}
                onClick={() => setStorageConsent((value) => !value)}
              >
                <span className="consent-option__symbol" aria-hidden="true"><Globe2 /></span>
                <span className="consent-option__copy">
                  <strong>{c.consentStoreTitle}</strong>
                  <span>{c.consentStoreBody}</span>
                </span>
                <span className="frequency-option__check" aria-hidden="true"><Check size={15} /></span>
              </button>
            </div>

            <div className="onboarding-actions">
              <button className="onboarding-secondary" type="button" onClick={() => setStep(5)}><ArrowLeft size={17} /> {c.back}</button>
              <button
                className="onboarding-primary"
                type="button"
                disabled={!analysisConsent || !storageConsent}
                onClick={finish}
              >
                {c.startScan} <ArrowRight size={17} />
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
