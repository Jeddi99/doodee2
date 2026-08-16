import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, ArrowLeft, BookOpen, Camera, CheckCircle2, Globe2, Lock, ScanFace, ShieldCheck, Sparkles } from 'lucide-react';
import { advanceCaptureTimer, evaluateCapture, getFramingHint, getPoseGuidance, SCAN_VIEW_MODES, startCaptureTimer } from '@doodee/shared';
import { captureQuality, isMeasuredView, needsCaptureConfirmation, reviewBadge, viewsRiskingRejection } from '../lib/captureConfidence';

import { getScan, uploadScan } from '../lib/api';
import { nextSlowInferenceStreak, shouldDisableAutoCapture } from '../lib/capturePerformance';
import { previewTransform } from '../lib/facePreview';
import AnalysisMetricsPanel from './AnalysisMetricsPanel';

// `name` identifies the view in review and error text; `action` is the instruction shown on
// camera. The turn directions follow pose_targets.json, where a "left" view is a negative yaw
// target, meaning the subject turns to their own left.
const VIEWS = {
  front: { name: ['หน้าตรง', 'Front'], action: ['มองตรง', 'Look straight ahead'] },
  front_smile: { name: ['หน้าตรง ยิ้ม', 'Front smile'], action: ['มองตรงแล้วยิ้ม', 'Look straight ahead and smile'] },
  left_oblique: { name: ['หน้าซ้าย', 'Left oblique'], action: ['หันหน้าไปทางซ้าย', 'Turn your head to your left'] },
  right_oblique: { name: ['หน้าขวา', 'Right oblique'], action: ['หันหน้าไปทางขวา', 'Turn your head to your right'] },
  left_profile: { name: ['โปรไฟล์ซ้าย', 'Left profile'], action: ['หันหน้าไปทางซ้ายจนสุด', 'Turn your head fully to your left'] },
  right_profile: { name: ['โปรไฟล์ขวา', 'Right profile'], action: ['หันหน้าไปทางขวาจนสุด', 'Turn your head fully to your right'] },
  basal: { name: ['เงยเห็นฐานจมูก', 'Basal nose view'], action: ['เงยหน้าขึ้น', 'Tilt your head up'] },
};
const viewText = (view, kind, isTh) => VIEWS[view]?.[kind][isTh ? 0 : 1] || view;

const viewGroup = (view) => view === 'front' || view === 'front_smile' ? 'front'
  : view === 'left_profile' || view === 'right_profile' ? 'profile'
  : view === 'basal' ? 'basal' : 'oblique';

// One instruction screen per view group, shown once, immediately before that group's first
// shot. The images are the onboarding lesson art these briefs replaced.
const BRIEFS = {
  front: {
    image: '/onboarding/lesson-distance.webp',
    title: ['ภาพหน้าตรง', 'The front photo'],
    body: [
      'ใช้กล้องหลังและวางเครื่องห่างประมาณ 2 เมตรที่ระดับสายตา อย่าถ่ายเซลฟี่ระยะใกล้เพราะจะบิดสัดส่วนใบหน้า มองตรงเข้ากล้อง ปล่อยสีหน้าตามปกติ ไม่ยิ้ม',
      'Use the rear camera about 2 metres away at eye level. Avoid close selfies — they distort your proportions. Look straight into the lens with a relaxed, unsmiling face.',
    ],
    tips: [
      ['กล้องอยู่ระดับสายตา ไม่ก้มไม่เงย', 'Camera at eye level, not tilted up or down'],
      ['แสงสม่ำเสมอ ไม่ย้อนแสง', 'Even light, no backlight'],
      ['เก็บผมออกจากหน้าผากและหู', 'Keep hair off your forehead and ears'],
    ],
  },
  profile: {
    image: '/onboarding/lesson-eye-level.webp',
    title: ['ภาพด้านข้าง ซ้ายและขวา', 'The side photos, left and right'],
    body: [
      'หันศีรษะไปด้านข้างจนเห็นใบหน้าจากด้านข้างเต็ม ๆ ระบบจะบอกด้วยลูกศรว่าต้องหันเพิ่มหรือน้อยลง ให้ไหล่อยู่นิ่งและหันเฉพาะศีรษะ ภาพสองมุมนี้ใช้วัดมุมจมูกและคางซึ่งภาพหน้าตรงวัดไม่ได้',
      'Turn your head to the side until your profile is fully visible. Arrows tell you to turn further or come back. Keep your shoulders still and turn only your head. These two views measure the nose and chin angles a front photo cannot.',
    ],
    tips: [
      ['หันเฉพาะศีรษะ ไหล่อยู่กับที่', 'Turn only your head; shoulders stay put'],
      ['คางขนานพื้น อย่าก้มหรือเงย', 'Chin level with the floor'],
      ['เก็บผมออกจากแนวกรอบหน้า', 'Clear hair away from your jawline'],
    ],
  },
  oblique: {
    image: '/onboarding/lesson-selfie.webp',
    title: ['ภาพเฉียง', 'The angled photos'],
    body: [
      'หันศีรษะไปด้านข้างประมาณครึ่งทางระหว่างหน้าตรงกับด้านข้าง ทำตามลูกศรบนหน้าจอ',
      'Turn your head about halfway between front and full profile. Follow the on-screen arrows.',
    ],
    tips: [['หันเฉพาะศีรษะ ไหล่อยู่กับที่', 'Turn only your head; shoulders stay put']],
  },
  basal: {
    image: '/onboarding/lesson-eye-level.webp',
    title: ['ภาพเงยเห็นฐานจมูก', 'The basal view'],
    body: [
      'เงยหน้าขึ้นจนเห็นฐานจมูก ให้กล้องอยู่ระดับเดิมและเงยเฉพาะศีรษะ',
      'Tilt your head up until the base of the nose is visible. Keep the camera where it is and tilt only your head.',
    ],
    tips: [['อย่ายกกล้องตาม เงยเฉพาะศีรษะ', 'Do not lift the camera; tilt only your head']],
  },
};


const QUALITY_TEXT = {
  no_face: ['จัดใบหน้าให้อยู่ในกรอบ', 'Position your face in the guide'],
  multiple_faces: ['ต้องมีหนึ่งใบหน้าเท่านั้น', 'Only one face can be visible'],
  too_dark: ['แสงน้อยเกินไป', 'Move to brighter light'],
  too_bright: ['แสงจ้าหรือย้อนแสงเกินไป', 'Reduce glare or backlight'],
  too_far: ['เข้าใกล้กล้องอีกนิด', 'Move closer'],
  too_close: ['ถอยจากกล้องอีกนิด', 'Move farther away'],
  off_center: ['จัดใบหน้าให้อยู่กลางกรอบ', 'Center your face'],
  wrong_pose: ['ปรับศีรษะตามมุมที่ระบุ', 'Match the requested angle'],
  wrong_expression: ['ปรับสีหน้าตามที่ระบุ', 'Match the requested expression'],
  not_stable: ['อยู่นิ่งสักครู่', 'Hold still'],
  ready: ['ดีมาก อยู่นิ่งไว้', 'Good — hold still'],
};
const DIRECTION_ARROW = { left: '←', right: '→', up: '↑', down: '↓' };

// Advice rather than a rejection, so it says what it buys instead of what is wrong.
const FRAMING_HINT_TEXT = {
  move_closer: ['เข้าใกล้กล้องอีกนิด ภาพจะคมขึ้น', 'A little closer gives a sharper image'],
};

const REVIEW_BADGE_TEXT = {
  passed: ['ผ่าน', 'Passed'],
  off_target: ['ท่าทางไม่เข้าเป้า', 'Off target'],
  not_cropped: ['ไม่พบใบหน้าตอนถ่าย', 'No face detected'],
  rejected: ['ถูกปฏิเสธ ถ่ายใหม่', 'Rejected — retake'],
};

function poseGuidanceText(guidance, isTh) {
  const arrow = DIRECTION_ARROW[guidance.direction];
  if (isTh) {
    if (guidance.centerFirst) return `กลับหน้าตรงตามลูกศร ${arrow} อีกประมาณ ${guidance.degrees}°`;
    if (guidance.axis === 'pitch') return `${guidance.direction === 'up' ? 'เงย' : 'ก้ม'}อีกประมาณ ${guidance.degrees}° ${arrow}`;
    if (guidance.axis === 'roll') return `เอียงศีรษะตามลูกศร ${arrow} อีกประมาณ ${guidance.degrees}°`;
    return `หันตามลูกศร ${arrow} อีกประมาณ ${guidance.degrees}°`;
  }
  if (guidance.centerFirst) return `Return to center ${arrow} about ${guidance.degrees}°`;
  const action = guidance.axis === 'pitch' ? (guidance.direction === 'up' ? 'Tilt up' : 'Tilt down') : guidance.axis === 'roll' ? 'Tilt your head' : 'Turn';
  return `${action} ${arrow} about ${guidance.degrees}°`;
}

// Server rejections that are not about head angle arrive as "<reason>:<view>" (analysis_engine
// wraps _decode and _landmarks failures that way). Without this the UI showed the server's
// English "Retake the indicated images", which named neither the view nor the reason.


const canvasBlob = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('capture_failed')), 'image/jpeg', quality);
});

// Standard framing the crop aims for: face height fills FACE_FILL of the output, with the face
// centre slightly above the middle. Backend metrics are all ratios normalised by face size, so
// cropping does not change any measurement — but upscaling would blur the image past the
// backend's sharpness check, so the crop never magnifies beyond the source pixels.
const FACE_FILL = .6;
const FACE_CENTRE_Y = .45;

export function faceCropRect(faceBox, videoWidth, videoHeight) {
  if (!faceBox) return { x: 0, y: 0, width: videoWidth, height: videoHeight };
  const faceHeight = (faceBox.bottom - faceBox.top) * videoHeight;
  if (faceHeight <= 0) return { x: 0, y: 0, width: videoWidth, height: videoHeight };
  const aspect = videoWidth / videoHeight;
  // Never exceed the source frame: that would mean upscaling.
  let height = Math.min(videoHeight, faceHeight / FACE_FILL);
  let width = Math.min(videoWidth, height * aspect);
  height = width / aspect;
  const centreX = (faceBox.left + faceBox.right) / 2 * videoWidth;
  const centreY = (faceBox.top + faceBox.bottom) / 2 * videoHeight;
  const x = Math.max(0, Math.min(videoWidth - width, centreX - width / 2));
  const y = Math.max(0, Math.min(videoHeight - height, centreY - height * FACE_CENTRE_Y));
  return { x, y, width, height };
}

async function captureFiles(video, view, faceBox) {
  const crop = faceCropRect(faceBox, video.videoWidth, video.videoHeight);
  const scale = Math.min(1, 1600 / Math.max(crop.width, crop.height));
  const width = Math.round(crop.width * scale);
  const height = Math.round(crop.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  const thumbnail = document.createElement('canvas');
  thumbnail.width = 280;
  thumbnail.height = Math.round(280 * height / width);
  thumbnail.getContext('2d').drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
  const [fullBlob, thumbnailBlob] = await Promise.all([canvasBlob(canvas, .9), canvasBlob(thumbnail, .78)]);
  return { file: new File([fullBlob], `${view}.jpg`, { type: 'image/jpeg' }), thumbnail: thumbnailBlob };
}

const FALLBACK_FACE_IMAGE = '/upgrade-assets/doodee-supplied-female-before.png';

// `calculateLivePresetTransform`, `RealPhotoSplitSlider` and `SimulationPanel` were removed with
// the unreachable results layout that was their only caller. Simulation lives on its own page
// (`SimulationView`), which is the version that is wired up and tested.

const SCORE_LABELS = {
  proportions: ['สัดส่วนรวม', 'Proportions'], eyes: ['ดวงตา', 'Eyes'], nose: ['จมูก', 'Nose'],
  lips: ['ริมฝีปาก', 'Lips'], chin: ['คาง', 'Chin'],
};

export function AnalysisResults({ result, imageUrl, lang, onBack, onSimulation, onScanNew }) {
  const isTh = lang === 'th';
  const scores = result.analysis_data?.reference_scores;
  const minor = result.age_band === 'minor';
  return <div className="analysis-results-page">
    <header className={`analysis-results-header${onBack ? '' : ' is-dashboard'}`}>
      {onBack && <button onClick={onBack} aria-label={isTh ? 'กลับ' : 'Back'}><ArrowLeft /></button>}
      <div><span><Sparkles /> THAI REFERENCE ANALYSIS</span><h1>{isTh ? 'ผลวิเคราะห์สัดส่วนใบหน้า' : 'Facial proportion analysis'}</h1><p>{isTh ? 'ดัชนีความใกล้ค่าอ้างอิง ไม่ใช่คะแนนความสวย' : 'Reference similarity, not a beauty score.'}</p></div>
      {!minor && <div className="analysis-overall"><strong>{scores?.overall_score ?? '—'}</strong><span>/100</span><small>{isTh ? 'ใกล้ค่าอ้างอิงไทย' : 'Thai reference similarity'}</small></div>}
    </header>
    <main className="analysis-results-layout">
      {/* The portrait and the measurement tables are one unit: tapping a row lights up the span it was
          measured from, so they cannot be separate components. */}
      <AnalysisMetricsPanel result={result} imageUrl={imageUrl || FALLBACK_FACE_IMAGE} lang={lang} />
      <section className="analysis-score-card">
        {minor ? <div className="analysis-minor-note"><Lock /><h2>{isTh ? 'โหมดผู้เยาว์' : 'Minor mode'}</h2><p>{isTh ? 'แสดงค่าการวัดพื้นฐานโดยไม่เทียบคะแนนผู้ใหญ่ และไม่มีการจำลองภาพ' : 'Basic measurements are shown without adult reference scores or simulation.'}</p></div> : <>
          {/* Read from the payload rather than hardcoded, so the page cannot claim a cohort the score
              was not computed against. */}
          <div className="analysis-reference-line"><div><span>{isTh ? 'ฐานอ้างอิง' : 'Reference'}</span><strong>{result.reference_profile}</strong></div><div><span>{isTh ? 'ประชากรอ้างอิง' : 'Reference population'}</span><strong>{result.reference_population || 'TH'}</strong></div><div><span>{isTh ? 'กลุ่มอายุงานวิจัย' : 'Research cohort'}</span><strong>{scores?.reference?.age_range || '—'}</strong></div><div><span>{isTh ? 'ขนาดกลุ่มตัวอย่าง' : 'Sample size'}</span><strong>{scores?.reference?.sample_size ?? '—'}</strong></div></div>
          {scores?.cohort_match === 'outside_reference_age_range' && <p className="analysis-cohort-warning">{isTh ? 'คุณอยู่นอกช่วงอายุของกลุ่มอ้างอิง จึงควรตีความคะแนนอย่างจำกัด' : 'You are outside the reference cohort age range; interpret with caution.'}</p>}
          {scores?.population_match === 'outside_reference_population' && <p className="analysis-cohort-warning">{isTh ? 'ค่าอ้างอิงมาจากประชากรไทย คะแนนของคุณไม่ได้ถูกปรับตามประเทศที่เลือก' : 'The reference values are Thai; your score is not adjusted for the country you selected.'}</p>}
          <h2>{isTh ? 'คะแนนรายหมวด' : 'Category scores'}</h2>
          <div className="analysis-category-grid">{scores?.categories?.map((category) => <article key={category.key}><div><span>{SCORE_LABELS[category.key]?.[isTh ? 0 : 1] || category.key}</span><strong>{category.score}</strong></div><div><i style={{ width: `${category.score}%` }} /></div><small>{category.metric_count} {isTh ? 'ตัววัด' : 'metrics'}</small></article>)}</div>
          <div className="analysis-unsupported"><strong>{isTh ? 'หมวดที่ยังไม่มีข้อมูลอ้างอิงไทย' : 'No Thai reference data yet'}</strong><p>{scores?.unsupported_categories?.join(' · ')}</p></div>
          <div className="analysis-scan-meta"><span>{isTh ? 'สแกนเมื่อ' : 'Scanned'}: {new Date(result.created_at).toLocaleString(isTh ? 'th-TH' : 'en-US')}</span><span>{isTh ? 'เก็บถึง' : 'Retained until'}: {new Date(result.expires_at).toLocaleDateString(isTh ? 'th-TH' : 'en-US')}</span></div>
          <button className="analysis-simulation-cta" onClick={onSimulation}><ScanFace />{isTh ? 'จำลองหัตถการจากผลสแกนนี้' : 'Simulate from this scan'}</button>
          {onScanNew && <button className="analysis-rescan-cta" onClick={onScanNew}>{isTh ? 'สแกนใหม่' : 'New scan'}</button>}
        </>}
      </section>
      <section className="analysis-evidence-card"><BookOpen /><div><h2>{isTh ? 'Golden ratio ไม่ใช่คะแนนความงาม' : 'Golden ratio is not a beauty score'}</h2><p>{isTh ? 'งานทบทวนไม่พบความสัมพันธ์สม่ำเสมอกับความดึงดูด และสัดส่วนแตกต่างตามประชากร จึงไม่รวม Golden ratio ในคะแนนนี้' : 'Reviews find no consistent association with attractiveness, and ratios vary by population, so it is excluded from this score.'}</p><a href="https://pubmed.ncbi.nlm.nih.gov/35738927/" target="_blank" rel="noreferrer">{isTh ? 'อ่านงานทบทวนเชิงระบบ' : 'Read the systematic review'}</a></div></section>
    </main>
  </div>;
}

export default function FacialAnalysisView({ lang, setLang, onboardingData, onBack, onNavigate }) {
  const isTh = lang === 'th';
  const [files, setFiles] = useState({});
  const [thumbnails, setThumbnails] = useState({});
  const [scanMode, setScanMode] = useState('standard');
  const [briefView, setBriefView] = useState(null);
  const [scanId, setScanId] = useState(() => new URLSearchParams(window.location.search).get('scan_id'));
  const [error, setError] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [consented, setConsented] = useState(false);
  const [activeView, setActiveView] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [detectorReady, setDetectorReady] = useState(false);
  const [autoDisabled, setAutoDisabled] = useState(false);
  const [qualityStatus, setQualityStatus] = useState('no_face');
  const [captureQualities, setCaptureQualities] = useState({});
  const [pendingManualCapture, setPendingManualCapture] = useState(false);
  const [poseGuidance, setPoseGuidance] = useState(null);
  const [framingHint, setFramingHint] = useState(null);
  const [videoTransform, setVideoTransform] = useState('scaleX(-1)');
  const [timer, setTimer] = useState(() => startCaptureTimer(0));
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(timer);
  const filesRef = useRef(files);
  const previousObservationRef = useRef(null);
  const captureRef = useRef(null);
  const capturingRef = useRef(false);
  const briefedRef = useRef(new Set());
  const lastFaceBoxRef = useRef(null);
  const qualityStatusRef = useRef('no_face');
  const liveModuleRef = useRef(null);
  const detectorRef = useRef(null);
  const cameraOpen = Boolean(activeView);
  const scanViews = SCAN_VIEW_MODES[scanMode];
  const allCaptured = scanViews.every((key) => files[key]);
  const currentIndex = Math.max(0, scanViews.indexOf(activeView));
  const previews = useMemo(() => Object.fromEntries(Object.entries(thumbnails).map(([key, blob]) => [key, URL.createObjectURL(blob)])), [thumbnails]);

  useEffect(() => () => Object.values(previews).forEach(URL.revokeObjectURL), [previews]);
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    liveModuleRef.current?.then((module) => module.closeLiveFaceLandmarker());
  }, []);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let cancelled = false;
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(isTh ? 'กล้องต้องเปิดผ่าน HTTPS หรือ localhost' : 'Camera access requires HTTPS or localhost.');
      return undefined;
    }
    // Asking for more than the guidance loop needs on purpose: detection runs on a fixed 640x480
    // canvas, so the extra pixels cost no inference time and land only in the uploaded file,
    // where the crop and later the simulation have more of a face to work with.
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraReady(true);
      })
      .catch(() => setCameraError(isTh ? 'เปิดกล้องไม่ได้ กรุณาอนุญาต Camera ให้ localhost' : 'Could not open the camera. Allow Camera access for localhost.'));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraReady(false);
    };
  }, [cameraOpen, isTh]);

  useLayoutEffect(() => {
    if (!activeView) return undefined;
    const nextTimer = { ...startCaptureTimer(performance.now()), fallbackAvailable: autoDisabled };
    timerRef.current = nextTimer;
    setTimer(nextTimer);
    setQualityStatus('no_face');
    qualityStatusRef.current = 'no_face';
    setPoseGuidance(null);
    setFramingHint(null);
    setVideoTransform('scaleX(-1)');
    previousObservationRef.current = null;
    // The head has moved on to a new pose, so the previous view's box must not crop this one.
    lastFaceBoxRef.current = null;
    setPendingManualCapture(false);
    capturingRef.current = false;
    return undefined;
  }, [activeView, autoDisabled]);

  useEffect(() => {
    if (!cameraOpen || !cameraReady || !activeView || autoDisabled) return undefined;
    let cancelled = false;
    let frameCallback;
    let timeout;
    let lastRun = 0;
    let slowStreak = 0;
    let frameIndex = 0;
    const detectCanvas = document.createElement('canvas');
    detectCanvas.width = 640;
    detectCanvas.height = 480;
    const lightCanvas = document.createElement('canvas');
    lightCanvas.width = 40;
    lightCanvas.height = 30;
    const video = videoRef.current;

    const cancelScheduled = () => {
      if (frameCallback != null && video?.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameCallback);
      window.clearTimeout(timeout);
    };
    const schedule = (tick) => {
      if (video?.requestVideoFrameCallback) frameCallback = video.requestVideoFrameCallback(tick);
      else timeout = window.setTimeout(() => tick(performance.now()), 333);
    };

    setDetectorReady(Boolean(detectorRef.current));
    liveModuleRef.current ||= import('../lib/liveFace');
    liveModuleRef.current.then(async (liveFace) => {
      const task = detectorRef.current || await liveFace.getLiveFaceLandmarker();
      detectorRef.current = task;
      if (cancelled) return;
      setDetectorReady(true);
      const tick = (now) => {
        if (cancelled) return;
        if (now - lastRun < 333 || video?.readyState < 2) return schedule(tick);
        lastRun = now;
        try {
          const observation = liveFace.observeVideo(task, video, detectCanvas, lightCanvas, previousObservationRef.current, now);
          slowStreak = nextSlowInferenceStreak(slowStreak, observation.inferenceMs, frameIndex);
          frameIndex += 1;
          if (shouldDisableAutoCapture(slowStreak)) {
            cancelled = true;
            setAutoDisabled(true);
            setDetectorReady(false);
            setPoseGuidance(null);
            setCameraError(isTh ? 'เครื่องใช้เวลาตรวจนาน กรุณาลองเปิดตัวตรวจใหม่หรือเปลี่ยนอุปกรณ์' : 'Guidance is too slow. Retry it or use another device.');
            const manual = { ...timerRef.current, fallbackAvailable: true };
            timerRef.current = manual;
            setTimer(manual);
            return;
          }
          const status = evaluateCapture(activeView, observation);
          setPoseGuidance(observation.faceCount === 1 ? getPoseGuidance(activeView, observation) : null);
          setFramingHint(getFramingHint(observation));
          setVideoTransform(previewTransform(observation.faceBox, video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight));
          previousObservationRef.current = observation;
          if (observation.faceBox) lastFaceBoxRef.current = observation.faceBox;
          const nextTimer = advanceCaptureTimer(timerRef.current, status, now);
          timerRef.current = nextTimer;
          qualityStatusRef.current = status;
          setQualityStatus(status);
          setTimer(nextTimer);
          if (nextTimer.shouldCapture && !capturingRef.current) captureRef.current?.();
        } catch {
          cancelled = true;
          setAutoDisabled(true);
          setCameraError(isTh ? 'ตัวตรวจใบหน้าหยุดทำงาน กรุณาลองเปิดตัวตรวจใหม่' : 'Face guidance stopped. Please retry it.');
        }
        schedule(tick);
      };
      schedule(tick);
    }).catch(() => {
      setAutoDisabled(true);
      setDetectorReady(false);
      setCameraError(isTh ? 'โหลดตัวตรวจใบหน้าไม่สำเร็จ กรุณาลองเปิดตัวตรวจใหม่' : 'Face guidance failed to load. Please retry it.');
    });
    return () => {
      cancelled = true;
      cancelScheduled();
    };
  }, [activeView, autoDisabled, cameraOpen, cameraReady, isTh]);

  const scan = useQuery({
    queryKey: ['scan', scanId],
    queryFn: () => getScan(scanId),
    enabled: Boolean(scanId) && !scanId?.startsWith('local-'),
    refetchInterval: (query) => ['completed', 'failed'].includes(query.state.data?.status) ? false : 1500,
  });
  const upload = useMutation({
    mutationFn: () => uploadScan(
      files,
      'adult',
      onboardingData?.referenceAgeBand || '18_35',
      onboardingData?.referenceProfile || 'neutral',
      onboardingData?.referencePopulation || 'TH',
      '2026.3',
      scanMode,
    ),
    onSuccess: (queued) => {
      setScanId(queued.id);
      onNavigate?.('analysis');
    },
  });
  const result = scan.data;
  const isScanning = upload.isPending || (result && !['completed', 'failed'].includes(result.status));

  // `mode` is passed explicitly by the secondary full-scan link so the first view comes from
  // the mode being started, not from the scanMode state that has not re-rendered yet.
  // Each view group gets one instruction screen before its first shot, so the guidance sits
  // next to the photo it applies to instead of in a deck of lessons read minutes earlier.
  const openView = (view) => {
    if (!view) return setActiveView(null);
    const group = viewGroup(view);
    if (briefedRef.current.has(group)) return setActiveView(view);
    setActiveView(null);
    setBriefView(view);
  };
  const dismissBrief = () => {
    if (!briefView) return;
    briefedRef.current.add(viewGroup(briefView));
    setActiveView(briefView);
    setBriefView(null);
  };
  const startCapture = (mode = scanMode) => {
    if (!consentChecked) return;
    setScanMode(mode);
    setConsented(true);
    const views = SCAN_VIEW_MODES[mode];
    openView(views.find((key) => !filesRef.current[key]) || views[0]);
  };
  const analyze = () => {
    setError('');
    if (!consented) return setError(isTh ? 'กรุณายืนยันความยินยอมก่อนวิเคราะห์' : 'Analysis consent is required.');
    liveModuleRef.current?.then((module) => module.closeLiveFaceLandmarker());
    detectorRef.current = null;
    upload.mutate();
  };
  const retake = (view) => {
    setError('');
    openView(view);
  };
  // The ten-second fallback is not a broken detector, so it deliberately leaves the landmarker
  // alone: closing it under the live tick loop would throw and trip the autoDisabled path.
  // Restarting the smoothed pose and the ten-second window is the whole reset.
  const restartViewCheck = () => {
    setCameraError('');
    setError('');
    const restarted = startCaptureTimer(performance.now());
    timerRef.current = restarted;
    setTimer(restarted);
    setQualityStatus('no_face');
    qualityStatusRef.current = 'no_face';
    setPoseGuidance(null);
    setFramingHint(null);
    setVideoTransform('scaleX(-1)');
    previousObservationRef.current = null;
    lastFaceBoxRef.current = null;
    setPendingManualCapture(false);
  };
  const retryDetector = () => {
    setCameraError('');
    setDetectorReady(false);
    const close = liveModuleRef.current?.then((module) => module.closeLiveFaceLandmarker()) || Promise.resolve();
    close.finally(() => {
      detectorRef.current = null;
      setAutoDisabled(false);
    });
  };

  async function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth || !activeView || capturingRef.current) return;
    capturingRef.current = true;
    try {
      // The last box that actually held a face, not this frame's: a single missed frame used
      // to drop the crop and upload the whole camera view, shoulders and room included.
      const faceBox = lastFaceBoxRef.current;
      const captured = await captureFiles(video, activeView, faceBox);
      const nextFiles = { ...filesRef.current, [activeView]: captured.file };
      filesRef.current = nextFiles;
      setFiles(nextFiles);
      setThumbnails((current) => ({ ...current, [activeView]: captured.thumbnail }));
      setCaptureQualities((current) => ({ ...current, [activeView]: captureQuality(qualityStatusRef.current, faceBox, activeView, scanMode) }));
      setPendingManualCapture(false);
      openView(scanViews.find((key) => !nextFiles[key]) || null);
    } catch {
      setCameraError(isTh ? 'ถ่ายภาพไม่สำเร็จ กรุณาลองใหม่' : 'Capture failed. Please try again.');
    } finally {
      capturingRef.current = false;
    }
  }
  captureRef.current = capture;

  // The manual shutter stays available for a broken detector, but it no longer fires blind:
  // an off-target press explains what is wrong first and only shoots on a second press.
  const manualShutter = () => {
    if (!needsCaptureConfirmation(qualityStatusRef.current) || pendingManualCapture) return capture();
    setPendingManualCapture(true);
    return undefined;
  };
  const manualWarning = !pendingManualCapture ? '' : (() => {
    const reason = qualityStatus === 'wrong_pose' && poseGuidance ? poseGuidanceText(poseGuidance, isTh) : QUALITY_TEXT[qualityStatus][isTh ? 0 : 1];
    const risk = isMeasuredView(activeView, scanMode)
      ? (isTh ? ' มุมนี้ถูกนำไปคำนวณ ถ้าท่าไม่เข้าเป้าสแกนทั้งชุดจะถูกปฏิเสธ' : ' This view is measured, so an off-target photo makes the whole scan fail.')
      : (isTh ? ' มุมนี้ไม่ถูกนำไปคำนวณ จึงถ่ายต่อได้' : ' This view is not measured, so it is safe to continue.');
    return `${reason}.${risk}`;
  })();

  const riskyViews = viewsRiskingRejection(captureQualities, scanViews);
  const currentView = activeView || scanViews[currentIndex];
  const phase = result?.status === 'completed' ? 'result' : briefView ? 'brief' : cameraOpen ? 'camera' : allCaptured ? 'review' : 'consent';
  const brief = briefView ? BRIEFS[viewGroup(briefView)] : null;

  if (phase === 'result') return <AnalysisResults
    result={result}
    imageUrl={previews.front || Object.values(previews)[0] || result.front_url}
    lang={lang}
    onBack={onBack}
    onSimulation={() => onNavigate?.('simulation', { scanId: result.id })}
    onScanNew={() => onNavigate?.('onboarding')}
  />;

  return (
    <div className="capture-page">
      <header className="capture-topbar">
        <button type="button" className="capture-icon-button" onClick={onBack} aria-label={isTh ? 'ย้อนกลับ' : 'Back'}><ArrowLeft /></button>
        <div className="capture-brand"><ScanFace /><strong>DOODEE</strong><span>{isTh ? `วิเคราะห์ใบหน้า ${scanViews.length} มุม` : `${scanViews.length}-view facial analysis`}</span></div>
        <button type="button" className="capture-language" onClick={() => setLang(isTh ? 'en' : 'th')}><Globe2 />{isTh ? 'TH' : 'EN'}</button>
      </header>

      <main className={`capture-main is-${phase}`}>
        {phase === 'consent' ? <section className="capture-consent-card">
          <span className="capture-eyebrow">PRIVATE FACE CAPTURE</span>
          <h1>{isTh ? 'สแกน 3 มุม ใช้ประมาณ 1 นาที' : 'Scan 3 views, about one minute'}</h1>
          <p>{isTh ? 'มองตรง หันซ้ายจนสุด หันขวาจนสุด ระบบจะเช็กแสง ระยะ และท่าทางเองแล้วถ่ายให้อัตโนมัติเมื่อพร้อม' : 'Look straight, turn fully left, turn fully right. Lighting, distance, and pose are checked on device and capture happens automatically when ready.'}</p>
          <div className="capture-consent-points"><div><Camera /><span><strong>{isTh ? 'ทีละมุม' : 'One view at a time'}</strong>{isTh ? 'ทำตามคำแนะนำบนหน้ากล้อง' : 'Follow the instruction on camera'}</span></div><div><ShieldCheck /><span><strong>{isTh ? 'ข้อมูลชีวมิติส่วนตัว' : 'Private biometric data'}</strong>{isTh ? 'ลบภายใน 30 วัน' : 'Deleted within 30 days'}</span></div></div>
          <label className="capture-consent-check"><input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} /><span>{isTh ? 'ฉันยินยอมให้ Doodee เปิดกล้อง วิเคราะห์ข้อมูลชีวมิติ และเก็บภาพตามระยะเวลาที่แจ้ง' : 'I consent to camera access, biometric analysis, and the stated image retention period.'}</span></label>
          <button type="button" className="capture-primary" disabled={!consentChecked} onClick={() => startCapture('standard')}>{isTh ? 'ยินยอมและเริ่มถ่าย' : 'Consent and start'}<ArrowLeft className="capture-forward" /></button>
          <button type="button" className="capture-secondary-link" disabled={!consentChecked} onClick={() => startCapture('full')}>{isTh ? 'ต้องการวิเคราะห์ละเอียด 7 มุม (ประมาณ 2 นาที)' : 'I want the detailed 7-view scan (about two minutes)'}</button>
          <small>{isTh ? 'การจำลองภาพจะขอความยินยอมแยกภายหลังและประมวลผลบนระบบ Doodee' : 'Simulation uses separate consent and is processed by Doodee.'}</small>
        </section> : null}

        {phase === 'brief' ? <section className="capture-brief-card">
          <span className="capture-eyebrow">{isTh ? 'วิธีถ่าย' : 'HOW TO SHOOT'}</span>
          <h1>{brief.title[isTh ? 0 : 1]}</h1>
          <img className="capture-brief-image" src={brief.image} alt="" />
          <p>{brief.body[isTh ? 0 : 1]}</p>
          <ul className="capture-brief-tips">
            {brief.tips.map((tip) => <li key={tip[1]}><ShieldCheck />{tip[isTh ? 0 : 1]}</li>)}
          </ul>
          <button type="button" className="capture-primary" onClick={dismissBrief}>
            {isTh ? 'เข้าใจแล้ว เริ่มถ่าย' : 'Got it, start capture'}<ArrowLeft className="capture-forward" />
          </button>
        </section> : null}

        {phase === 'camera' ? <section className="capture-camera-layout">
          <div className="capture-progress" aria-label={isTh ? `มุมที่ ${currentIndex + 1} จาก ${scanViews.length}` : `View ${currentIndex + 1} of ${scanViews.length}`}><span>{currentIndex + 1}/{scanViews.length}</span><div style={{ gridTemplateColumns: `repeat(${scanViews.length}, 1fr)` }}>{scanViews.map((key, index) => <i key={key} className={files[key] ? 'is-done' : index === currentIndex ? 'is-current' : ''} />)}</div></div>
          <div className="capture-instruction"><span>{viewText(currentView, 'name', isTh)}</span><h1>{viewText(currentView, 'action', isTh)}</h1></div>
          <div className="capture-camera-stage">
            <video ref={videoRef} autoPlay muted playsInline style={{ transform: videoTransform }} />
            <div className={`capture-face-guide${qualityStatus === 'ready' ? ' is-ready' : ''}`} aria-hidden="true" />
            {!cameraReady || (!detectorReady && !autoDisabled) ? <div className="capture-preparing"><Activity /><strong>{isTh ? 'กำลังเตรียมกล้องและ AI…' : 'Preparing camera and AI…'}</strong><span>{isTh ? 'อาจใช้เวลา 2–5 วินาที' : 'This may take 2–5 seconds'}</span></div> : null}
            <div className="capture-live-status" role="status" aria-live="polite"><span className={qualityStatus === 'ready' ? 'is-ready' : ''} /><div><strong>{autoDisabled ? (isTh ? 'ตัวตรวจหยุดทำงาน' : 'Guidance stopped') : qualityStatus === 'wrong_pose' && poseGuidance ? poseGuidanceText(poseGuidance, isTh) : QUALITY_TEXT[qualityStatus][isTh ? 0 : 1]}{qualityStatus === 'ready' ? ` · ${Math.round(timer.progress * 100)}%` : ''}</strong>{!autoDisabled && poseGuidance && qualityStatus !== 'wrong_pose' ? <small>{isTh ? 'มุมต่อไป: ' : 'Next: '}{poseGuidanceText(poseGuidance, isTh)}</small>
              : !autoDisabled && framingHint ? <small className="is-advice">{FRAMING_HINT_TEXT[framingHint][isTh ? 0 : 1]}</small> : null}</div></div>
          </div>
          {autoDisabled || timer.fallbackAvailable
            ? <>
                {manualWarning ? <p className="capture-manual-warning" role="alert">{manualWarning}</p> : null}
                <div className="capture-fallback-row">
                  <button type="button" className={`capture-shutter${pendingManualCapture ? ' is-confirming' : ''}`} onClick={manualShutter}>
                    <Camera />{pendingManualCapture ? (isTh ? 'ถ่ายทั้งที่ยังไม่เข้าเป้า' : 'Take it anyway') : (isTh ? 'ถ่ายเลย' : 'Take it now')}
                  </button>
                  <button type="button" className="capture-manual" onClick={autoDisabled ? retryDetector : restartViewCheck}>
                    <RotateCcw />{autoDisabled ? (isTh ? 'ลองเปิดตัวตรวจใหม่' : 'Retry guidance') : (isTh ? 'เริ่มตรวจมุมนี้ใหม่' : 'Restart this view')}
                  </button>
                </div>
              </>
            : <p className="capture-hint">{isTh ? 'ระบบจะถ่ายให้เองเมื่อพร้อม · องศาเป็นค่าประมาณ ไม่ใช่การวัดทางการแพทย์' : 'Captured automatically when ready · Angles are estimates, not medical measurements.'}</p>}
          {cameraError ? <p className="capture-error" role="alert">{cameraError}</p> : null}
          {error ? <p className="capture-error" role="alert">{error}</p> : null}
        </section> : null}

        {phase === 'review' ? <section className="capture-review">
          <span className="capture-eyebrow">REVIEW</span><h1>{isTh ? 'ตรวจรูปก่อนวิเคราะห์' : 'Review before analysis'}</h1><p>{isTh ? `แก้ไขเฉพาะมุมที่ไม่ผ่าน แล้วส่งครบ ${scanViews.length} มุม` : `Retake any failed views, then submit all ${scanViews.length} views.`}</p>
          <div className="capture-review-grid">
            {scanViews.map((key) => {
              const isFailedView = Boolean(error && error.includes(viewText(key, 'name', isTh)));
              const badge = reviewBadge(captureQualities[key], isFailedView);
              const label = REVIEW_BADGE_TEXT[badge.reason][isTh ? 0 : 1];
              return (
                <article key={key}>
                  <img src={previews[key]} alt={viewText(key, 'name', isTh)} />
                  <div>
                    <span>
                      {viewText(key, 'name', isTh)}
                      <small className={`capture-review-badge is-${badge.tone}`}>
                        {badge.tone === 'ok' ? <CheckCircle2 /> : <AlertTriangle size={12} />}
                        {label}
                      </small>
                    </span>
                    <button type="button" onClick={() => retake(key)}>
                      <RotateCcw />
                      {isTh ? 'ถ่ายใหม่' : 'Retake'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {riskyViews.length > 0 ? (
            <p className="capture-manual-warning" role="alert">
              {isTh
                ? `${riskyViews.map((key) => viewText(key, 'name', isTh)).join(' และ ')} ถ่ายมาโดยท่าทางไม่เข้าเป้า ถ้าส่งแบบนี้สแกนทั้งชุดจะถูกปฏิเสธ กรุณาถ่ายมุมนั้นใหม่ก่อน`
                : `${riskyViews.map((key) => viewText(key, 'name', isTh)).join(' and ')} were taken off target. Uploading now will fail the whole scan — retake them first.`}
            </p>
          ) : null}
          <div className="capture-review-actions"><div><ShieldCheck /><span>{isTh ? 'ภาพจะถูกส่งเมื่อกดปุ่มนี้เท่านั้น' : 'Images are uploaded only after you press this button.'}</span></div><button type="button" className="capture-primary" disabled={isScanning} onClick={analyze}>{isScanning ? <Activity /> : <ScanFace />}{isTh ? 'อัปโหลดและเริ่มวิเคราะห์' : 'Upload and analyze'}</button></div>
          {isScanning ? <div className="capture-processing"><Activity /><strong>{result?.progress || 0}%</strong><span>{isTh ? 'กำลังวิเคราะห์…' : 'Analyzing…'}</span></div> : null}
          {error || upload.error || scan.error ? <p className="capture-error" role="alert">{error || upload.error?.message || scan.error?.message}</p> : null}
        </section> : null}

        {/* The result view is handled by the early return at the top of this component, which
            hands off to AnalysisResults. A second results layout used to live here and could
            never render; it also carried hardcoded quality verdicts that were not derived from
            any measurement, so it was removed rather than left for someone to re-enable. */}
      </main>
    </div>
  );
}
