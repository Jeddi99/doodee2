import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  LogIn,
  LockKeyhole,
  ScanLine,
} from 'lucide-react';
import { signIn } from '../lib/api';

const LESSONS = [
  {
    image: '/onboarding/lesson-selfie.webp',
    eyebrowTh: 'บทเรียน 1 จาก 3',
    eyebrowEn: 'LESSON 1 OF 3',
    titleTh: 'อย่าใช้กล้องหน้า',
    titleEn: 'Don’t take selfies.',
    descriptionTh: 'ภาพระยะใกล้อาจบิดสัดส่วนใบหน้าและทำให้ผลคลาดเคลื่อน',
    descriptionEn: 'Close selfies can distort facial proportions and reduce accuracy.',
    altTh: 'ตัวอย่างความคลาดเคลื่อนจากการถ่ายเซลฟี่ระยะใกล้',
    altEn: 'Example of distortion from a close selfie',
  },
  {
    image: '/onboarding/lesson-distance.webp',
    eyebrowTh: 'บทเรียน 2 จาก 3',
    eyebrowEn: 'LESSON 2 OF 3',
    titleTh: 'ใช้กล้องหลัง ห่าง 6 ฟุต',
    titleEn: 'Rear camera. 6 feet back.',
    descriptionTh: 'วางกล้องห่างประมาณ 2 เมตร เพื่อให้รูปหน้าคงสัดส่วนจริง',
    descriptionEn: 'Stand about 2 meters away to preserve your true proportions.',
    altTh: 'ตัวอย่างการวางกล้องหลังห่างจากผู้ใช้ประมาณสองเมตร',
    altEn: 'Example rear-camera setup at a two-meter distance',
  },
  {
    image: '/onboarding/lesson-eye-level.webp',
    eyebrowTh: 'บทเรียน 3 จาก 3',
    eyebrowEn: 'LESSON 3 OF 3',
    titleTh: 'ถือกล้องระดับสายตา',
    titleEn: 'Hold the camera at eye level.',
    descriptionTh: 'การก้มหน้าหรือเงยหน้าจะเปลี่ยนสัดส่วนที่ระบบมองเห็น',
    descriptionEn: 'Looking down or up changes the proportions the scan sees.',
    altTh: 'ตัวอย่างภาพหน้าตรงที่ถ่ายจากระดับสายตา',
    altEn: 'Example front portrait captured at eye level',
  },
];

function Progress({ active, count = 3 }) {
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

export default function OnboardingFlow({ lang, onBack, onComplete }) {
  const isTh = lang === 'th';
  const [step, setStep] = useState(0);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [age, setAge] = useState('');
  const [referenceProfile, setReferenceProfile] = useState('');

  const goBack = () => {
    if (step === 0) onBack();
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
      setAuthError(error.message);
    } finally {
      setIsRedirecting(false);
    }
  };

  const finish = () => onComplete({ age, referenceProfile });

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
              ? 'การเข้าสู่ระบบยังไม่ถือเป็นความยินยอมให้วิเคราะห์หรือส่งภาพไปยัง AI คุณจะยืนยันแยกก่อนใช้งาน'
              : 'Signing in is not consent for analysis or external AI. Those choices are requested separately.'}
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
          <div className="onboarding-form-copy">
            <h1>{isTh ? 'ตรวจสอบสักครู่' : 'A quick check.'}</h1>
            <p>{isTh ? 'คุณมีอายุ 18 ปีขึ้นไปหรือไม่?' : 'Are you 18 or older?'}</p>
          </div>
          <div className="onboarding-choice-row">
            {[
              ['18plus', isTh ? 'ใช่ ฉันอายุ 18+' : 'Yes, I’m 18+'],
              ['under18', isTh ? 'ไม่ ฉันอายุต่ำกว่า 18' : 'No, under 18'],
            ].map(([value, label]) => (
              <button className={age === value ? 'is-selected' : ''} type="button" key={value} onClick={() => setAge(value)} aria-pressed={age === value}>
                <span>{label}</span>{age === value && <Check size={17} />}
              </button>
            ))}
          </div>
          {age === 'under18' && (
            <p className="onboarding-minor-note" role="status">
              {isTh
                ? 'คุณยังไปต่อได้ แต่ผลจะแสดงเฉพาะคำแนะนำดูแลตนเองและภาพรวม'
                : 'You can continue, but results will be limited to self-care and general guidance.'}
            </p>
          )}
          <button className="onboarding-primary" type="button" disabled={!age} onClick={() => setStep(2)}>
            {isTh ? 'ดำเนินการต่อ' : 'Continue'} <ArrowRight size={18} />
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
            <h1>{isTh ? 'เริ่มจากข้อมูลพื้นฐาน' : 'First, the basics.'}</h1>
            <p>{isTh ? 'คุณเป็นผู้เลือกโปรไฟล์อ้างอิงเอง ระบบจะไม่อนุมานจากใบหน้า' : 'You choose the reference profile; the system will not infer it from your face.'}</p>
          </div>
          <fieldset className="onboarding-fieldset">
            <legend>{isTh ? 'โปรไฟล์อ้างอิง' : 'REFERENCE PROFILE'}</legend>
            <div className="onboarding-background-grid">
              {[
                ['neutral', isTh ? 'เป็นกลาง' : 'Neutral'],
                ['masculine', isTh ? 'ลักษณะชาย' : 'Masculine'],
                ['feminine', isTh ? 'ลักษณะหญิง' : 'Feminine'],
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

  const lessonIndex = step - 3;
  const lesson = LESSONS[lessonIndex];
  const isLastLesson = lessonIndex === LESSONS.length - 1;

  return (
    <main className="onboarding-screen">
      <section className="onboarding-card is-lesson">
        <button className="onboarding-card-back" type="button" onClick={goBack} aria-label={isTh ? 'ย้อนกลับ' : 'Back'}>
          <ChevronLeft size={20} />
        </button>
        <Progress active={lessonIndex} />
        <div className="onboarding-lesson-copy">
          <span>{isTh ? lesson.eyebrowTh : lesson.eyebrowEn}</span>
          <h1>{isTh ? lesson.titleTh : lesson.titleEn}</h1>
          <p>{isTh ? lesson.descriptionTh : lesson.descriptionEn}</p>
        </div>
        <img
          className="onboarding-lesson-image"
          src={lesson.image}
          alt={isTh ? lesson.altTh : lesson.altEn}
        />
        <div className="onboarding-lesson-tip">
          <ScanLine size={18} />
          <span>{isTh ? 'ภาพที่ถูกต้องช่วยให้การวัดทั้ง 7 มุมสม่ำเสมอขึ้น' : 'A consistent setup improves all seven scan angles.'}</span>
        </div>
        <button className={`onboarding-primary${isLastLesson ? ' is-ready' : ''}`} type="button" onClick={isLastLesson ? finish : () => setStep((current) => current + 1)}>
          {isLastLesson ? (isTh ? 'ฉันพร้อมแล้ว' : 'I’m ready') : (isTh ? 'ถัดไป' : 'Next')}
          <ArrowRight size={18} />
        </button>
      </section>
    </main>
  );
}
