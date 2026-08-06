import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, ArrowLeft, Camera, CheckCircle2, Globe2, RotateCcw, ScanFace, ShieldCheck } from 'lucide-react';
import { advanceCaptureTimer, evaluateCapture, getPoseGuidance, SCAN_VIEW_MODES, startCaptureTimer } from '@doodee/shared';

import { createSimulation, deleteScan, getProcedures, getScan, getSimulation, uploadScan } from '../lib/api';
import { nextSlowInferenceStreak, shouldDisableAutoCapture } from '../lib/capturePerformance';
import { previewTransform } from '../lib/facePreview';
import '../capture-flow.css';

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

const REGION_PARAMETERS = {
  eyes: { outer_corner_lift: 20, eyelid_definition: 20 },
  nose: { bridge_height: 20, tip_projection: 15, tip_rotation: 10, alar_width: -10 },
  lips: { fullness: 15, lip_height: 10, corner_lift: 10 },
  cheeks: { projection: 15, volume: 15 },
  jaw: { width: -15, definition: 20 },
  chin: { projection: 15, height: 10, width: 0 },
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

function poseGuidanceText(guidance, isTh) {
  const arrow = DIRECTION_ARROW[guidance.direction];
  if (isTh) {
    if (guidance.centerFirst) return `กลับหน้าตรงตามลูกศร ${arrow} อีกประมาณ ${guidance.degrees}°`;
    if (guidance.axis === 'pitch') return `${guidance.delta > 0 ? 'เงย' : 'ก้ม'}อีกประมาณ ${guidance.degrees}° ${arrow}`;
    if (guidance.axis === 'roll') return `เอียงศีรษะตามลูกศร ${arrow} อีกประมาณ ${guidance.degrees}°`;
    return `หันตามลูกศร ${arrow} อีกประมาณ ${guidance.degrees}°`;
  }
  if (guidance.centerFirst) return `Return to center ${arrow} about ${guidance.degrees}°`;
  const action = guidance.axis === 'pitch' ? (guidance.delta > 0 ? 'Tilt up' : 'Tilt down') : guidance.axis === 'roll' ? 'Tilt your head' : 'Turn';
  return `${action} ${arrow} about ${guidance.degrees}°`;
}

function scanFailureText(errorCode, fallback, isTh) {
  if (!errorCode?.startsWith('pose_')) return fallback;
  const [viewCode, axis, rawDelta] = errorCode.split(':');
  const view = viewCode.slice(5);
  const label = viewText(view, 'name', isTh);
  const delta = Number(rawDelta);
  if (!axis || !Number.isFinite(delta)) return isTh ? `${label} ไม่ผ่านการตรวจ กรุณาถ่ายใหม่` : `${label} failed validation. Please retake it.`;
  const direction = axis === 'pitch' ? (delta < 0 ? 'down' : 'up') : delta < 0 ? 'left' : 'right';
  const guidance = { axis, delta, direction, degrees: Math.max(5, Math.round(Math.abs(delta) / 5) * 5), centerFirst: false };
  return isTh ? `${label} ไม่ผ่าน: ${poseGuidanceText(guidance, true)}` : `${label} failed: ${poseGuidanceText(guidance, false)}`;
}

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

function SimulationPanel({ scanId, isMinor, lang }) {
  const isTh = lang === 'th';
  const [region, setRegion] = useState('nose');
  const [parameters, setParameters] = useState(REGION_PARAMETERS.nose);
  const [consented, setConsented] = useState(false);
  const [simulationId, setSimulationId] = useState(null);
  const procedures = useQuery({ queryKey: ['procedures', region], queryFn: () => getProcedures(region) });
  const mutation = useMutation({
    mutationFn: () => createSimulation(scanId, region, parameters, '2026.1'),
    onSuccess: (simulation) => setSimulationId(simulation.id),
  });
  const simulation = useQuery({
    queryKey: ['simulation', simulationId],
    queryFn: () => getSimulation(simulationId),
    enabled: Boolean(simulationId),
    refetchInterval: (query) => ['completed', 'failed'].includes(query.state.data?.status) ? false : 1500,
  });

  if (isMinor) {
    return <section className="skin-panel"><h2>{isTh ? 'โหมดผู้เยาว์' : 'Minor mode'}</h2><p>{isTh ? 'ไม่มีคำแนะนำหัตถการหรือภาพจำลอง และข้อมูลทั้งหมดจะถูกลบภายใน 24 ชั่วโมง' : 'Procedures and simulations are unavailable. All session data is deleted within 24 hours.'}</p></section>;
  }

  const changeRegion = (next) => {
    setRegion(next);
    setParameters(REGION_PARAMETERS[next]);
    setSimulationId(null);
  };
  const result = simulation.data;

  return (
    <section className="skin-panel skin-findings-panel">
      <div className="skin-panel-heading"><div><span className="skin-step">EDUCATIONAL PREVIEW</span><h2>{isTh ? 'สำรวจการเปลี่ยนแปลงเพื่อคุยกับแพทย์' : 'Explore changes to discuss with a clinician'}</h2></div><span className="skin-count-badge">NOT A PREDICTION</span></div>
      <div className="onboarding-choice-row">{Object.keys(REGION_PARAMETERS).map((item) => <button type="button" key={item} className={region === item ? 'is-selected' : ''} onClick={() => changeRegion(item)}>{item}</button>)}</div>
      <div className="face-metric-list">{Object.entries(parameters).map(([key, value]) => <label key={key}><strong>{key.replaceAll('_', ' ')}</strong><input type="range" min="-100" max="100" value={value} onChange={(event) => setParameters((current) => ({ ...current, [key]: Number(event.target.value) }))} /><span>{value}</span></label>)}</div>
      {procedures.data?.map((procedure) => <details key={procedure.id}><summary>{isTh ? procedure.name_th : procedure.name_en}</summary><p>{procedure.summary_th}</p><p>{procedure.limitations_th}</p><a href={procedure.source} target="_blank" rel="noreferrer">Source</a></details>)}
      <label><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} /> {isTh ? 'ฉันยินยอมให้ส่งภาพไปยัง Gemini เพื่อสร้างภาพจำลอง และเข้าใจว่านี่ไม่ใช่ผลผ่าตัดจริง' : 'I consent to sending this image to Gemini and understand this is not a surgical outcome.'}</label>
      <button type="button" disabled={!consented || mutation.isPending || (result && !['completed', 'failed'].includes(result.status))} onClick={() => mutation.mutate()}>{mutation.isPending || result?.status === 'processing' ? <Activity size={18} /> : <ScanFace size={18} />}{isTh ? 'สร้างภาพจำลอง' : 'Create simulation'}</button>
      {(mutation.error || simulation.error || result?.status === 'failed') ? <small role="alert">{mutation.error?.message || simulation.error?.message || result.error_message}</small> : null}
      {result?.status === 'completed' ? <div className="compare-stage"><img src={result.before_url} alt={isTh ? 'ภาพต้นฉบับ' : 'Before'} /><img src={result.after_url} alt={isTh ? 'ภาพจำลอง มีลายน้ำ' : 'Watermarked simulation'} /></div> : null}
    </section>
  );
}

export default function FacialAnalysisView({ lang, setLang, onboardingData, onBack }) {
  const isTh = lang === 'th';
  const isMinor = onboardingData?.age === 'under18';
  const [files, setFiles] = useState({});
  const [thumbnails, setThumbnails] = useState({});
  const [scanMode, setScanMode] = useState('fast');
  const [scanId, setScanId] = useState(null);
  const [error, setError] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [consented, setConsented] = useState(false);
  const [activeView, setActiveView] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [detectorReady, setDetectorReady] = useState(false);
  const [autoDisabled, setAutoDisabled] = useState(false);
  const [qualityStatus, setQualityStatus] = useState('no_face');
  const [poseGuidance, setPoseGuidance] = useState(null);
  const [videoTransform, setVideoTransform] = useState('scaleX(-1)');
  const [timer, setTimer] = useState(() => startCaptureTimer(0));
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(timer);
  const filesRef = useRef(files);
  const previousObservationRef = useRef(null);
  const captureRef = useRef(null);
  const capturingRef = useRef(false);
  const failedScanRef = useRef(null);
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
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
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
    setPoseGuidance(null);
    setVideoTransform('scaleX(-1)');
    previousObservationRef.current = null;
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
          setVideoTransform(previewTransform(observation.faceBox, video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight));
          previousObservationRef.current = observation;
          const nextTimer = advanceCaptureTimer(timerRef.current, status, now);
          timerRef.current = nextTimer;
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
    enabled: Boolean(scanId),
    refetchInterval: (query) => ['completed', 'failed'].includes(query.state.data?.status) ? false : 1500,
  });
  const upload = useMutation({
    mutationFn: () => uploadScan(files, isMinor ? 'minor' : 'adult', '2026.1', scanMode),
    onSuccess: (queued) => setScanId(queued.id),
  });
  const result = scan.data;
  const metrics = result?.analysis_data?.metrics || [];
  const isScanning = upload.isPending || (result && !['completed', 'failed'].includes(result.status));
  const analysisTier = result?.analysis_tier || scanMode;
  const isFastResult = analysisTier === 'fast';

  useEffect(() => {
    if (result?.status !== 'failed' || failedScanRef.current === result.id) return;
    failedScanRef.current = result.id;
    const failedView = Object.keys(VIEWS).find((key) => result.error_code?.includes(key));
    setError(scanFailureText(result.error_code, result.error_message || (isTh ? 'ภาพไม่ผ่านการตรวจ กรุณาถ่ายใหม่' : 'A photo failed validation. Please retake it.'), isTh));
    const nextFiles = failedView ? Object.fromEntries(Object.entries(filesRef.current).filter(([key]) => key !== failedView)) : {};
    filesRef.current = nextFiles;
    setFiles(nextFiles);
    setThumbnails((current) => failedView ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== failedView)) : {});
    deleteScan(result.id).catch(() => {});
    setScanId(null);
    setActiveView(failedView || scanViews[0]);
  }, [isTh, result, scanViews]);

  useEffect(() => {
    if (result?.status !== 'completed') return;
    filesRef.current = {};
    setFiles({});
    setThumbnails({});
  }, [result?.status]);

  // `mode` is passed explicitly by the secondary full-scan link so the first view comes from
  // the mode being started, not from the scanMode state that has not re-rendered yet.
  const startCapture = (mode = scanMode) => {
    if (!consentChecked) return;
    setScanMode(mode);
    setConsented(true);
    const views = SCAN_VIEW_MODES[mode];
    setActiveView(views.find((key) => !filesRef.current[key]) || views[0]);
  };
  const analyze = () => {
    setError('');
    if (!consented) return setError(isTh ? 'กรุณายืนยันความยินยอมก่อนวิเคราะห์' : 'Analysis consent is required.');
    liveModuleRef.current?.then((module) => module.closeLiveFaceLandmarker());
    detectorRef.current = null;
    upload.mutate(undefined, { onError: (uploadError) => setError(uploadError.message) });
  };
  const retake = (view) => {
    setError('');
    setActiveView(view);
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
    setPoseGuidance(null);
    setVideoTransform('scaleX(-1)');
    previousObservationRef.current = null;
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
      const captured = await captureFiles(video, activeView, previousObservationRef.current?.faceBox);
      const nextFiles = { ...filesRef.current, [activeView]: captured.file };
      filesRef.current = nextFiles;
      setFiles(nextFiles);
      setThumbnails((current) => ({ ...current, [activeView]: captured.thumbnail }));
      setActiveView(scanViews.find((key) => !nextFiles[key]) || null);
    } catch {
      setCameraError(isTh ? 'ถ่ายภาพไม่สำเร็จ กรุณาลองใหม่' : 'Capture failed. Please try again.');
    } finally {
      capturingRef.current = false;
    }
  }
  captureRef.current = capture;

  const currentView = activeView || scanViews[currentIndex];
  const phase = result?.status === 'completed' ? 'result' : cameraOpen ? 'camera' : allCaptured ? 'review' : 'consent';

  return (
    <div className="capture-page">
      <header className="capture-topbar">
        <button type="button" className="capture-icon-button" onClick={onBack} aria-label={isTh ? 'ย้อนกลับ' : 'Back'}><ArrowLeft /></button>
        <div className="capture-brand"><ScanFace /><strong>DOODEE</strong><span>{isTh ? `วิเคราะห์ใบหน้า ${scanMode === 'fast' ? '3' : '7'} มุม` : `${scanMode === 'fast' ? '3' : '7'}-view facial analysis`}</span></div>
        <button type="button" className="capture-language" onClick={() => setLang(isTh ? 'en' : 'th')}><Globe2 />{isTh ? 'TH' : 'EN'}</button>
      </header>

      <main className={`capture-main is-${phase}`}>
        {phase === 'consent' ? <section className="capture-consent-card">
          <span className="capture-eyebrow">PRIVATE FACE CAPTURE</span>
          <h1>{isTh ? 'สแกน 3 มุม ใช้ประมาณ 1 นาที' : 'Scan 3 views, about one minute'}</h1>
          <p>{isTh ? 'มองตรง หันซ้าย หันขวา ระบบจะเช็กแสง ระยะ และท่าทางเองแล้วถ่ายให้อัตโนมัติเมื่อพร้อม' : 'Look straight, turn left, turn right. Lighting, distance, and pose are checked on device and capture happens automatically when ready.'}</p>
          <div className="capture-consent-points"><div><Camera /><span><strong>{isTh ? 'ทีละมุม' : 'One view at a time'}</strong>{isTh ? 'ทำตามคำแนะนำบนหน้ากล้อง' : 'Follow the instruction on camera'}</span></div><div><ShieldCheck /><span><strong>{isTh ? 'ข้อมูลชีวมิติส่วนตัว' : 'Private biometric data'}</strong>{isMinor ? (isTh ? 'ลบภายใน 24 ชั่วโมง' : 'Deleted within 24 hours') : (isTh ? 'ลบภายใน 30 วัน' : 'Deleted within 30 days')}</span></div></div>
          <label className="capture-consent-check"><input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} /><span>{isTh ? 'ฉันยินยอมให้ Doodee เปิดกล้อง วิเคราะห์ข้อมูลชีวมิติ และเก็บภาพตามระยะเวลาที่แจ้ง' : 'I consent to camera access, biometric analysis, and the stated image retention period.'}</span></label>
          <button type="button" className="capture-primary" disabled={!consentChecked} onClick={() => startCapture('fast')}>{isTh ? 'ยินยอมและเริ่มถ่าย' : 'Consent and start'}<ArrowLeft className="capture-forward" /></button>
          <button type="button" className="capture-secondary-link" disabled={!consentChecked} onClick={() => startCapture('full')}>{isTh ? 'ต้องการวิเคราะห์ละเอียด 7 มุม (ประมาณ 2 นาที)' : 'I want the detailed 7-view scan (about two minutes)'}</button>
          <small>{isTh ? 'ยังไม่มีการส่งภาพไป Gemini การจำลองภาพจะขอความยินยอมแยกภายหลัง' : 'No image is sent to Gemini. Simulation consent is requested separately.'}</small>
        </section> : null}

        {phase === 'camera' ? <section className="capture-camera-layout">
          <div className="capture-progress" aria-label={isTh ? `มุมที่ ${currentIndex + 1} จาก ${scanViews.length}` : `View ${currentIndex + 1} of ${scanViews.length}`}><span>{currentIndex + 1}/{scanViews.length}</span><div style={{ gridTemplateColumns: `repeat(${scanViews.length}, 1fr)` }}>{scanViews.map((key, index) => <i key={key} className={files[key] ? 'is-done' : index === currentIndex ? 'is-current' : ''} />)}</div></div>
          <div className="capture-instruction"><span>{viewText(currentView, 'name', isTh)}</span><h1>{viewText(currentView, 'action', isTh)}</h1></div>
          <div className="capture-camera-stage">
            <video ref={videoRef} autoPlay muted playsInline style={{ transform: videoTransform }} />
            <div className={`capture-face-guide${qualityStatus === 'ready' ? ' is-ready' : ''}`} aria-hidden="true" />
            {!cameraReady || (!detectorReady && !autoDisabled) ? <div className="capture-preparing"><Activity /><strong>{isTh ? 'กำลังเตรียมกล้องและ AI…' : 'Preparing camera and AI…'}</strong><span>{isTh ? 'อาจใช้เวลา 2–5 วินาที' : 'This may take 2–5 seconds'}</span></div> : null}
            <div className="capture-live-status" role="status" aria-live="polite"><span className={qualityStatus === 'ready' ? 'is-ready' : ''} /><div><strong>{autoDisabled ? (isTh ? 'ตัวตรวจหยุดทำงาน' : 'Guidance stopped') : qualityStatus === 'wrong_pose' && poseGuidance ? poseGuidanceText(poseGuidance, isTh) : QUALITY_TEXT[qualityStatus][isTh ? 0 : 1]}{qualityStatus === 'ready' ? ` · ${Math.round(timer.progress * 100)}%` : ''}</strong>{!autoDisabled && poseGuidance && qualityStatus !== 'wrong_pose' ? <small>{isTh ? 'มุมต่อไป: ' : 'Next: '}{poseGuidanceText(poseGuidance, isTh)}</small> : null}</div></div>
          </div>
          {autoDisabled
            ? <div className="capture-fallback-row">
                <button type="button" className="capture-shutter" onClick={() => captureRef.current?.()}><Camera />{isTh ? 'ถ่ายเลย' : 'Take it now'}</button>
                <button type="button" className="capture-manual" onClick={retryDetector}><RotateCcw />{isTh ? 'ลองเปิดตัวตรวจใหม่' : 'Retry guidance'}</button>
              </div>
            : timer.fallbackAvailable
              ? <div className="capture-fallback-row">
                  <button type="button" className="capture-shutter" onClick={() => captureRef.current?.()}><Camera />{isTh ? 'ถ่ายเลย' : 'Take it now'}</button>
                  <button type="button" className="capture-manual" onClick={restartViewCheck}><RotateCcw />{isTh ? 'เริ่มตรวจมุมนี้ใหม่' : 'Restart this view'}</button>
                </div>
              : <p className="capture-hint">{isTh ? 'ระบบจะถ่ายให้เองเมื่อพร้อม · องศาเป็นค่าประมาณ ไม่ใช่การวัดทางการแพทย์' : 'Captured automatically when ready · Angles are estimates, not medical measurements.'}</p>}
          {cameraError ? <p className="capture-error" role="alert">{cameraError}</p> : null}
          {error ? <p className="capture-error" role="alert">{error}</p> : null}
        </section> : null}

        {phase === 'review' ? <section className="capture-review">
          <span className="capture-eyebrow">REVIEW</span><h1>{isTh ? 'ตรวจรูปก่อนวิเคราะห์' : 'Review before analysis'}</h1><p>{isTh ? `แก้ไขเฉพาะมุมที่ไม่ผ่าน แล้วส่งครบ ${scanMode === 'fast' ? '3' : '7'} มุม` : `Retake any failed views, then submit all ${scanMode === 'fast' ? '3' : '7'} views.`}</p>
          <div className="capture-review-grid">{scanViews.map((key) => <article key={key}><img src={previews[key]} alt={viewText(key, 'name', isTh)} /><div><span>{viewText(key, 'name', isTh)}<small><CheckCircle2 />{isTh ? 'ผ่าน' : 'Passed'}</small></span><button type="button" onClick={() => retake(key)}><RotateCcw />{isTh ? 'ถ่ายใหม่' : 'Retake'}</button></div></article>)}</div>
          <div className="capture-review-actions"><div><ShieldCheck /><span>{isTh ? 'ภาพจะถูกส่งเมื่อกดปุ่มนี้เท่านั้น' : 'Images are uploaded only after you press this button.'}</span></div><button type="button" className="capture-primary" disabled={isScanning} onClick={analyze}>{isScanning ? <Activity /> : <ScanFace />}{isTh ? 'อัปโหลดและเริ่มวิเคราะห์' : 'Upload and analyze'}</button></div>
          {isScanning ? <div className="capture-processing"><Activity /><strong>{result?.progress || 0}%</strong><span>{isTh ? 'กำลังวิเคราะห์…' : 'Analyzing…'}</span></div> : null}
          {error || upload.error || scan.error ? <p className="capture-error" role="alert">{error || upload.error?.message || scan.error?.message}</p> : null}
        </section> : null}

        {phase === 'result' ? <div className="capture-results">
          <p className="capture-result-mode">{isFastResult ? (isTh ? 'โหมดเร็ว: ครอบคลุม 3 มุมหลัก สำหรับการตรวจเชิงสั้น' : 'Fast mode completed with 3 core views for quicker preview.') : (isTh ? 'โหมดเต็ม: ครบ 7 มุม สำหรับการวิเคราะห์ละเอียดขึ้น' : 'Full mode completed with all 7 angles for more complete analysis.')}</p>
          {result.missing_optional_views?.length ? <p className="capture-result-missing">{isTh
            ? `ไม่ได้วัด: ${result.missing_optional_views.map((view) => viewText(view, 'name', true)).join(', ')} — โหมดนี้จึงไม่มีค่าด้านข้าง (side profile)`
            : `Not measured: ${result.missing_optional_views.map((view) => viewText(view, 'name', false)).join(', ')} — side profile values are unavailable in this mode`}</p> : null}
          <section className="skin-panel skin-findings-panel"><div className="skin-panel-heading"><div><span className="skin-step">MEASUREMENTS</span><h2>{metrics.length} {isTh ? 'ค่าที่วัดได้' : 'measurements'}</h2></div><span className="skin-count-badge">EXPERIMENTAL</span></div><p>{isTh ? 'ผลเป็นการทดลอง ไม่ใช่คะแนนความสวยหรือการวินิจฉัย' : 'Experimental measurements, not a beauty score or diagnosis.'}</p><div className="face-metric-list">{metrics.map((metric) => <article key={metric.key}><CheckCircle2 size={15} /><div><span><strong>{metric.key.replaceAll('_', ' ')}</strong><b>{metric.value}</b></span><small>{metric.unit} · confidence {metric.confidence} · {metric.status}</small></div></article>)}</div></section>
          <SimulationPanel scanId={result.id} isMinor={result.age_band === 'minor'} lang={lang} />
        </div> : null}
      </main>
    </div>
  );
}
