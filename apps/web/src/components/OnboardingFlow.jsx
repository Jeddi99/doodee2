import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  LogIn,
  LockKeyhole,
} from 'lucide-react';
import { signIn } from '../lib/api';
import { AGE_BANDS, ageBandFor, canContinueFromAge } from '../lib/onboardingAnswers';

// Countries the reference cohort might plausibly be extended to. The published data is Thai
// only, so anything other than TH is recorded and flagged, never rescaled.
const POPULATIONS = [
  ['TH', 'ไทย', 'Thailand'],
  ['LA', 'ลาว', 'Laos'],
  ['KH', 'กัมพูชา', 'Cambodia'],
  ['MM', 'เมียนมา', 'Myanmar'],
  ['VN', 'เวียดนาม', 'Vietnam'],
  ['MY', 'มาเลเซีย', 'Malaysia'],
  ['SG', 'สิงคโปร์', 'Singapore'],
  ['ID', 'อินโดนีเซีย', 'Indonesia'],
  ['PH', 'ฟิลิปปินส์', 'Philippines'],
  ['CN', 'จีน', 'China'],
  ['JP', 'ญี่ปุ่น', 'Japan'],
  ['KR', 'เกาหลีใต้', 'South Korea'],
  ['OTHER', 'อื่น ๆ', 'Other'],
];

const STEP_COUNT = 4;

function Progress({ active, count = STEP_COUNT }) {
  return (
    <div className="onboarding-progress" aria-label={`Step ${active + 1} of ${count}`}>
      {Array.from({ length: count }, (_, index) => (
        <span
          className={index === active ? 'is-active' : index < active ? 'is-complete' : ''}
          key={index}
        />
      ))}
    </div>
  );
}

export default function OnboardingFlow({ lang, authenticated = false, onBack, onComplete }) {
  const isTh = lang === 'th';
  const [step, setStep] = useState(authenticated ? 1 : 0);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [analysisConsent, setAnalysisConsent] = useState(false);
  const [storageConsent, setStorageConsent] = useState(false);
  const [referenceProfile, setReferenceProfile] = useState('');
  const [age, setAge] = useState('');
  const [referencePopulation, setReferencePopulation] = useState('');

  const goBack = () => {
    if (step === 0 || (authenticated && step === 1)) onBack();
    else setStep((current) => current - 1);
  };

  const handleSignIn = async () => {
    if (isRedirecting) return;
    setIsRedirecting(true);
    setAuthError('');
    try {
      await signIn();
      setStep(1);
    } catch (error) {
      setAuthError(error.code === 'api_unreachable'
        ? (isTh ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วกดปุ่มด้านบนอีกครั้ง' : 'Could not reach the server. Check your connection and press the button above again.')
        : error.message);
    } finally {
      setIsRedirecting(false);
    }
  };

  const ageBand = ageBandFor(age);
  const isMinor = ageBand === AGE_BANDS.UNDER_18;
  const isOutsideCohort = ageBand === AGE_BANDS.ADULT_OUTSIDE;

  const finish = () => onComplete({
    referenceAgeBand: ageBand,
    referenceProfile,
    referencePopulation,
  });

  if (step === 0) {
    return (
      <main className="onboarding-screen is-auth">
        <button className="onboarding-exit" type="button" onClick={onBack} aria-label={isTh ? 'กลับหน้าแรก' : 'Back to home'}>
          <ChevronLeft size={20} />
        </button>
        <section className="onboarding-auth-card" aria-labelledby="onboarding-auth-title">
          <img className="onboarding-logo" src="/doodee-logo.webp" alt="" />
          <h1 id="onboarding-auth-title">{isTh ? 'เข้าสู่ระบบ DOODEE' : 'Sign in to DOODEE'}</h1>
          <p>{isTh ? 'ดำเนินการต่อด้วยบัญชี Google ของคุณ' : 'Continue with your Google account'}</p>
          <button className="onboarding-google-button" type="button" onClick={handleSignIn} disabled={isRedirecting}>
            <LogIn size={20} aria-hidden="true" />
            <span>{isRedirecting ? (isTh ? 'กำลังเชื่อมต่อ…' : 'Redirecting…') : (isTh ? 'ดำเนินการต่อด้วย Google' : 'Continue with Google')}</span>
          </button>
          {authError && <p role="alert">{authError}</p>}
          <small>
            {isTh
              ? 'การเข้าสู่ระบบยังไม่ถือเป็นความยินยอมให้วิเคราะห์หรือเก็บภาพ คุณจะยืนยันแยกในขั้นถัดไป'
              : 'Signing in is not consent to analyse or store your photos. Those choices are requested separately.'}
          </small>
          <div className="onboarding-security"><LockKeyhole size={14} /> {isTh ? 'ยืนยันตัวตนด้วย Firebase' : 'Secured by Firebase Authentication'}</div>
        </section>
      </main>
    );
  }

  if (step === 1) {
    return (
      <main className="onboarding-screen">
        <section className="onboarding-card is-form">
          <button className="onboarding-card-back" type="button" onClick={goBack} aria-label={isTh ? 'ย้อนกลับ' : 'Back'}>
            <ChevronLeft size={20} />
          </button>
          <Progress active={0} />
          <div className="onboarding-form-copy is-compact">
            <h1>{isTh ? 'ก่อนเริ่มต้น' : 'Before you start.'}</h1>
            <p>
              {isTh
                ? 'DOODEE เป็นเครื่องมือเชิงงานวิจัยเพื่อช่วยสื่อสารก่อนพบแพทย์ ไม่ใช่การวินิจฉัย แผนรักษา หรือการทำนายผลลัพธ์'
                : 'DOODEE is a research tool for communicating before a consultation. It is not a diagnosis, a treatment plan, or a prediction of outcomes.'}
            </p>
          </div>

          <div className="onboarding-plan-note">
            <strong>{isTh ? 'ค่าใช้จ่าย' : 'What it costs'}</strong>
            <p>
              {isTh
                ? 'การสแกนและดูคะแนนใช้ได้ฟรี ฟังก์ชันจำลองใบหน้าให้ผู้ใช้ฟรีดูตัวอย่างได้ 3 ครั้งต่อเดือน และบันทึกภาพเต็มได้ 3 ภาพต่อเดือน สมาชิกแบบเสียเงินดูตัวอย่างได้ไม่จำกัดภายใต้ fair-use'
                : 'Scanning and viewing your scores are free. Simulation gives free accounts 3 previews a month and 3 saved images a month. Paid members get unlimited previews under fair use.'}
            </p>
          </div>

          <fieldset className="onboarding-fieldset">
            <legend>{isTh ? 'ความยินยอม' : 'CONSENT'}</legend>
            <label className="onboarding-consent-row">
              <input type="checkbox" checked={analysisConsent} onChange={(event) => setAnalysisConsent(event.target.checked)} />
              <span>
                {isTh
                  ? 'ยินยอมให้ประมวลผลภาพใบหน้าเพื่อวัดสัดส่วนและคำนวณคะแนนอ้างอิง ประมวลผลบนเซิร์ฟเวอร์ของเราเท่านั้น ไม่ส่งภาพไปยังผู้ให้บริการภายนอก'
                  : 'I consent to my face photos being processed to measure proportions and compute reference scores, on our own servers only, never sent to an outside provider.'}
              </span>
            </label>
            <label className="onboarding-consent-row">
              <input type="checkbox" checked={storageConsent} onChange={(event) => setStorageConsent(event.target.checked)} />
              <span>
                {isTh
                  ? 'ยินยอมให้จัดเก็บภาพและผลวิเคราะห์ไว้ในประวัติของฉัน ข้อมูลหมดอายุอัตโนมัติภายใน 30 วัน และฉันลบเองได้ทุกเมื่อ'
                  : 'I consent to my photos and results being stored in my history. They expire automatically within 30 days and I can delete them at any time.'}
              </span>
            </label>
          </fieldset>

          <button
            className="onboarding-primary"
            type="button"
            disabled={!analysisConsent || !storageConsent}
            onClick={() => setStep(2)}
          >
            {isTh ? 'ยอมรับและดำเนินการต่อ' : 'Accept and continue'} <ArrowRight size={18} />
          </button>
        </section>
      </main>
    );
  }

  if (step === 2) {
    return (
      <main className="onboarding-screen">
        <section className="onboarding-card is-basics">
          <button className="onboarding-card-back" type="button" onClick={goBack} aria-label={isTh ? 'ย้อนกลับ' : 'Back'}>
            <ChevronLeft size={20} />
          </button>
          <Progress active={1} />
          <div className="onboarding-form-copy is-compact">
            <h1>{isTh ? 'เพศที่ใช้เป็นฐานเปรียบเทียบ' : 'Comparison baseline.'}</h1>
            <p>
              {isTh
                ? 'คุณเป็นผู้เลือกเอง ระบบจะไม่อนุมานเพศจากใบหน้าของคุณ ตัวเลือกนี้กำหนดว่าจะเทียบสัดส่วนกับค่าเฉลี่ยชุดใด'
                : 'You choose this yourself; the system never infers it from your face. It decides which set of published averages your proportions are compared against.'}
            </p>
          </div>
          <fieldset className="onboarding-fieldset">
            <legend>{isTh ? 'ฐานอ้างอิง' : 'REFERENCE BASELINE'}</legend>
            <div className="onboarding-background-grid">
              {[
                ['neutral', isTh ? 'เป็นกลาง' : 'Neutral'],
                ['feminine', isTh ? 'หญิง' : 'Female'],
                ['masculine', isTh ? 'ชาย' : 'Male'],
              ].map(([value, label]) => (
                <button className={referenceProfile === value ? 'is-selected' : ''} type="button" key={value} onClick={() => setReferenceProfile(value)} aria-pressed={referenceProfile === value}>
                  <span>{label}</span>{referenceProfile === value && <Check size={16} />}
                </button>
              ))}
            </div>
          </fieldset>
          <button className="onboarding-primary" type="button" disabled={!referenceProfile} onClick={() => setStep(3)}>
            {isTh ? 'ดำเนินการต่อ' : 'Continue'} <ArrowRight size={18} />
          </button>
        </section>
      </main>
    );
  }

  if (step === 3) {
    return (
      <main className="onboarding-screen">
        <section className="onboarding-card is-form">
          <button className="onboarding-card-back" type="button" onClick={goBack} aria-label={isTh ? 'ย้อนกลับ' : 'Back'}>
            <ChevronLeft size={20} />
          </button>
          <Progress active={2} />
          <div className="onboarding-form-copy is-compact">
            <h1>{isTh ? 'อายุของคุณ' : 'Your age.'}</h1>
            <p>{isTh ? 'กรอกอายุเป็นตัวเลข เราเก็บเฉพาะช่วงอายุ ไม่เก็บตัวเลขที่คุณกรอก' : 'Type your age. We store only the age band, never the number you type.'}</p>
          </div>
          <label className="onboarding-age-field">
            <span>{isTh ? 'อายุ (ปี)' : 'Age (years)'}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              value={age}
              onChange={(event) => setAge(event.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder={isTh ? 'เช่น 27' : 'e.g. 27'}
              aria-describedby={isMinor || isOutsideCohort ? 'onboarding-age-note' : undefined}
            />
          </label>
          {isMinor && (
            <p className="onboarding-minor-note" id="onboarding-age-note" role="alert">
              {isTh
                ? 'บริการนี้เปิดให้ผู้ที่มีอายุ 18 ปีขึ้นไปเท่านั้น เราจึงยังไม่สามารถรับภาพใบหน้าของคุณได้'
                : 'This service is for people aged 18 and over, so we cannot accept your face photos yet.'}
            </p>
          )}
          {isOutsideCohort && (
            <p className="onboarding-minor-note" id="onboarding-age-note" role="status">
              {isTh
                ? 'งานวิจัยอ้างอิงเก็บข้อมูลจากช่วงอายุ 18–35 ปี ผลของคุณจะแสดงป้ายว่าอยู่นอกช่วงอายุงานวิจัย และเราจะไม่ปรับตัวเลขคะแนนด้วยตัวคูณสมมติ'
                : 'The reference study covers ages 18–35. Your result will be labelled as outside that range, and we will not adjust the numbers with an invented multiplier.'}
            </p>
          )}
          <button className="onboarding-primary" type="button" disabled={!canContinueFromAge(age)} onClick={() => setStep(4)}>
            {isTh ? 'ดำเนินการต่อ' : 'Continue'} <ArrowRight size={18} />
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="onboarding-screen">
      <section className="onboarding-card is-basics">
        <button className="onboarding-card-back" type="button" onClick={goBack} aria-label={isTh ? 'ย้อนกลับ' : 'Back'}>
          <ChevronLeft size={20} />
        </button>
        <Progress active={3} />
        <div className="onboarding-form-copy is-compact">
          <h1>{isTh ? 'ประเทศของคุณ' : 'Your country.'}</h1>
          <p>{isTh ? 'ใช้เพื่อบอกว่าค่าอ้างอิงที่ใช้เทียบตรงกับกลุ่มประชากรของคุณหรือไม่' : 'Used to tell you whether the reference values match your population group.'}</p>
        </div>
        <fieldset className="onboarding-fieldset">
          <legend>{isTh ? 'ประเทศ' : 'COUNTRY'}</legend>
          <div className="onboarding-background-grid">
            {POPULATIONS.map(([value, labelTh, labelEn]) => (
              <button className={referencePopulation === value ? 'is-selected' : ''} type="button" key={value} onClick={() => setReferencePopulation(value)} aria-pressed={referencePopulation === value}>
                <span>{isTh ? labelTh : labelEn}</span>{referencePopulation === value && <Check size={16} />}
              </button>
            ))}
          </div>
        </fieldset>
        {referencePopulation && referencePopulation !== 'TH' && (
          <p className="onboarding-minor-note" role="status">
            {isTh
              ? 'ค่าอ้างอิงที่มีอยู่มาจากงานวิจัยภาพถ่ายคนไทย 240 คน ผลของคุณจะแสดงป้ายว่าอยู่นอกกลุ่มประชากรอ้างอิง โดยตัวเลขคะแนนไม่ถูกปรับ'
              : 'The available reference values come from a study of 240 Thai adults. Your result will be labelled as outside the reference population, with no adjustment to the numbers.'}
          </p>
        )}
        <button className="onboarding-primary is-ready" type="button" disabled={!referencePopulation} onClick={finish}>
          {isTh ? 'ไปที่การถ่ายภาพ' : 'Go to capture'} <ArrowRight size={18} />
        </button>
      </section>
    </main>
  );
}
