import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Button, Image, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { useRouter } from 'expo-router';
import {
  Camera, useCameraDevice, useCameraPermission, useFrameOutput, usePhotoOutput, type Frame,
} from 'react-native-vision-camera';
import { createFaceDetectorOutput, type Face } from 'react-native-vision-camera-face-detector';
import { useResizer } from 'react-native-vision-camera-resizer';
import { scheduleOnRN } from 'react-native-worklets';
import {
  advanceCaptureTimer, evaluateCapture, SCAN_VIEWS, startCaptureTimer,
  type CaptureTimer, type FaceObservation, type QualityStatus, type ScanView,
  pollUntilSettled,
} from '@doodee/shared';
import { api, auth } from '../lib/backend';
import { colors } from '../theme';

WebBrowser.maybeCompleteAuthSession();

// @doodee/shared expects yaw in pose_targets.json coordinates, where positive means the head
// is turned to the subject's right. ML Kit (which the face detector wraps) documents positive
// yaw as the face turning toward the right side of the *image*; on an un-mirrored front-camera
// frame that is the subject's left, so the sign is inverted here.
// UNVERIFIED ON HARDWARE — confirm on a device before trusting mobile capture. If the first
// oblique view never reaches `ready` while the on-screen arrow is followed, flip this to 1.
const EXPO_YAW_SIGN = -1;
const LABELS: Record<ScanView, string> = {
  front: 'หน้าตรง สีหน้าปกติ', front_smile: 'หน้าตรง ยิ้ม', left_oblique: 'เฉียงซ้าย 45°',
  right_oblique: 'เฉียงขวา 45°', left_profile: 'ด้านซ้าย 60–75°', right_profile: 'ด้านขวา 60–75°', basal: 'เงยเห็นฐานจมูก',
};
const QUALITY_TEXT: Record<QualityStatus, string> = {
  no_face: 'จัดใบหน้าให้อยู่ในกรอบ', multiple_faces: 'ต้องมีหนึ่งใบหน้าเท่านั้น', too_dark: 'แสงน้อยเกินไป',
  too_bright: 'แสงจ้าหรือย้อนแสงเกินไป', too_far: 'เข้าใกล้กล้องอีกนิด', too_close: 'ถอยจากกล้องอีกนิด',
  off_center: 'จัดใบหน้าให้อยู่กลางกรอบ', wrong_pose: 'ปรับศีรษะตามมุมที่ระบุ', wrong_expression: 'ปรับสีหน้าตามที่ระบุ',
  not_stable: 'อยู่นิ่งสักครู่', ready: 'ดีมาก อยู่นิ่งไว้',
};

export default function Home() {
  const router = useRouter();
  const device = useCameraDevice('front');
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const photoOutput = usePhotoOutput({ quality: 0.92, qualityPrioritization: 'quality' });
  const resizerState = useResizer({ width: 24, height: 24, channelOrder: 'rgb', dataType: 'uint8', scaleMode: 'cover', pixelLayout: 'interleaved' });
  const resizer = resizerState.state === 'ready' ? resizerState.resizer : undefined;
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  const [signedIn, setSignedIn] = useState(Boolean(auth.currentUser));
  const [captureStarted, setCaptureStarted] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);
  const [photos, setPhotos] = useState<Partial<Record<ScanView, string>>>({});
  const [ageRange, setAgeRange] = useState<'under_18' | '18_35' | '36_plus'>('18_35');
  const [referenceProfile, setReferenceProfile] = useState<'neutral' | 'masculine' | 'feminine'>('neutral');
  const [consented, setConsented] = useState(false);
  const [quality, setQuality] = useState<QualityStatus>('no_face');
  const [timer, setTimer] = useState<CaptureTimer>(() => startCaptureTimer(Date.now()));
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const [guidanceError, setGuidanceError] = useState('');
  const brightnessRef = useRef<{ brightness: number; clippedRatio: number } | null>(null);
  const previousRef = useRef<(FaceObservation & { at: number }) | null>(null);
  const timerRef = useRef(timer);
  const photosRef = useRef(photos);
  const viewIndexRef = useRef(viewIndex);
  const capturingRef = useRef(false);
  const captureRef = useRef<() => void>(() => {});
  const facesHandlerRef = useRef<(faces: Face[]) => void>(() => {});
  const lastFaceRunRef = useRef(0);

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.authentication?.idToken;
    if (!idToken) return setError('Google did not return an ID token.');
    signInWithCredential(auth, GoogleAuthProvider.credential(idToken)).then(() => api.session()).then(() => setSignedIn(true)).catch((cause) => setError(cause.message));
  }, [response]);

  const updateBrightness = useCallback((brightness: number, clippedRatio: number) => {
    brightnessRef.current = { brightness, clippedRatio };
  }, []);
  const onLightFrame = useCallback((frame: Frame) => {
    'worklet';
    if (resizer != null) {
      const resized = resizer.resize(frame);
      const pixels = new Uint8Array(resized.getPixelBuffer());
      let total = 0;
      let clipped = 0;
      const count = pixels.length / 3;
      for (let index = 0; index < pixels.length; index += 3) {
        const luminance = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
        total += luminance;
        if (luminance >= 245) clipped += 1;
      }
      scheduleOnRN(updateBrightness, total / count, clipped / count);
      resized.dispose();
    }
    frame.dispose();
  }, [resizer, updateBrightness]);
  const lightOutput = useFrameOutput({
    targetResolution: { width: 160, height: 120 },
    pixelFormat: 'yuv',
    onFrame: onLightFrame,
  });
  const faceOutput = useMemo(() => createFaceDetectorOutput({
    cameraFacing: 'front', performanceMode: 'fast', runClassifications: true, trackingEnabled: true, outputResolution: 'preview',
    onFacesDetected: (faces) => facesHandlerRef.current(faces),
    onError: () => setGuidanceError('ตัวตรวจใบหน้าไม่ทำงาน คุณยังใช้ปุ่มถ่ายเองได้หลัง 10 วินาที'),
  }), []);

  const capture = useCallback(async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    const reset = startCaptureTimer(Date.now());
    timerRef.current = reset;
    setTimer(reset);
    const index = viewIndexRef.current;
    const view = SCAN_VIEWS[index];
    try {
      const photo = await photoOutput.capturePhotoToFile({ flashMode: 'off', enableShutterSound: true }, {});
      const nextPhotos = { ...photosRef.current, [view]: `file://${photo.filePath}` };
      photosRef.current = nextPhotos;
      setPhotos(nextPhotos);
      const nextIndex = SCAN_VIEWS.findIndex((key) => !nextPhotos[key]);
      if (nextIndex < 0) setReviewing(true);
      else {
        viewIndexRef.current = nextIndex;
        setViewIndex(nextIndex);
      }
    } catch (cause: any) {
      setError(cause.message || 'ถ่ายภาพไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      capturingRef.current = false;
    }
  }, [photoOutput]);
  captureRef.current = capture;

  facesHandlerRef.current = (faces) => {
    const now = Date.now();
    if (now - lastFaceRunRef.current < 200) return;
    lastFaceRunRef.current = now;
    const light = brightnessRef.current;
    const face = faces[0];
    if (!face || !light) {
      previousRef.current = null;
      const next = advanceCaptureTimer(timerRef.current, 'no_face', now);
      timerRef.current = next;
      setQuality('no_face');
      setTimer(next);
      return;
    }
    const centerX = (face.bounds.x + face.bounds.width / 2) / face.frameWidth - 0.5;
    const centerY = (face.bounds.y + face.bounds.height / 2) / face.frameHeight - 0.5;
    const previous = previousRef.current;
    const yaw = face.yawAngle * EXPO_YAW_SIGN;
    const stable = Boolean(previous && now - previous.at < 500
      && Math.abs(centerX - previous.centerOffsetX) < 0.025
      && Math.abs(centerY - previous.centerOffsetY) < 0.025
      && Math.abs(yaw - previous.yaw) < 3
      && Math.abs(face.pitchAngle - previous.pitch) < 3);
    const observation: FaceObservation & { at: number } = {
      faceCount: faces.length, confidence: 1, brightness: light.brightness, clippedRatio: light.clippedRatio,
      faceHeightRatio: face.bounds.height / face.frameHeight, centerOffsetX: centerX, centerOffsetY: centerY,
      yaw, pitch: face.pitchAngle, roll: face.rollAngle, smile: face.smilingProbability ?? 0,
      stable, at: now,
    };
    previousRef.current = observation;
    const nextQuality = evaluateCapture(SCAN_VIEWS[viewIndexRef.current], observation);
    const nextTimer = advanceCaptureTimer(timerRef.current, nextQuality, now);
    timerRef.current = nextTimer;
    setQuality(nextQuality);
    setTimer(nextTimer);
    if (nextTimer.shouldCapture) captureRef.current();
  };

  useEffect(() => {
    if (!captureStarted || reviewing) return;
    const next = startCaptureTimer(Date.now());
    timerRef.current = next;
    previousRef.current = null;
    setTimer(next);
    setQuality('no_face');
    const fallback = setTimeout(() => {
      const available = { ...timerRef.current, fallbackAvailable: true };
      timerRef.current = available;
      setTimer(available);
    }, 10_000);
    return () => clearTimeout(fallback);
  }, [captureStarted, reviewing, viewIndex]);
  useEffect(() => {
    if (resizerState.state === 'error') setGuidanceError('วัดแสงอัตโนมัติไม่ได้ คุณยังใช้ปุ่มถ่ายเองได้หลัง 10 วินาที');
  }, [resizerState.state]);

  const beginCapture = async () => {
    setError('');
    if (!consented) return setError('กรุณายืนยันความยินยอมก่อนเปิดกล้อง');
    const allowed = hasPermission || (canRequestPermission && await requestPermission());
    if (!allowed) return setError('กรุณาอนุญาตกล้องใน Settings แล้วกลับมาลองใหม่');
    setCaptureStarted(true);
  };
  const retake = (view: ScanView) => {
    const index = SCAN_VIEWS.indexOf(view);
    viewIndexRef.current = index;
    setViewIndex(index);
    setReviewing(false);
    setStatus(null);
    setError('');
  };
  const handleFailedScan = async (scan: any) => {
    const failedView = SCAN_VIEWS.find((view) => scan.error_code?.includes(view));
    try { await api.deleteScan(scan.id); } catch {}
    const nextPhotos = failedView
      ? Object.fromEntries(Object.entries(photosRef.current).filter(([view]) => view !== failedView))
      : {};
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);
    const nextIndex = failedView ? SCAN_VIEWS.indexOf(failedView) : 0;
    viewIndexRef.current = nextIndex;
    setViewIndex(nextIndex);
    setReviewing(false);
    setStatus(null);
    setError(scan.error_message || 'ภาพไม่ผ่านการตรวจ กรุณาถ่ายมุมนั้นใหม่');
  };
  const upload = async () => {
    setError('');
    const body = new FormData();
    for (const key of SCAN_VIEWS) {
      const uri = photosRef.current[key];
      if (!uri) return setError(`ขาดภาพ ${LABELS[key]}`);
      body.append(key, { uri, name: `${key}.jpg`, type: 'image/jpeg' } as any);
    }
    body.append('age_band', ageRange === 'under_18' ? 'minor' : 'adult');
    body.append('reference_age_band', ageRange);
    body.append('reference_profile', referenceProfile);
    body.append('analysis_consent_version', '2026.3');
    // SCAN_VIEWS here is all seven angles, so the mode has to say so — left absent the server
    // defaults to `full` and happened to agree, which is not the same as being told.
    body.append('scan_mode', 'full');
    body.append('capture_method', 'mobile_camera');
    try {
      const created = await api.uploadScan(body);
      setStatus(created);
      // Backed-off and bounded. This was `while (!settled)` at a flat 1.5 s, which polled faster
      // than the analysis could finish and never stopped at all if the worker died.
      const scan = await pollUntilSettled(created, () => api.getScan(created.id), { onUpdate: setStatus });
      if (scan.status === 'failed') await handleFailedScan(scan);
    } catch (cause: any) {
      setError(cause.message);
    }
  };
  if (!signedIn) return <View style={styles.center}><Text style={styles.title}>DOODEE</Text><Text>เข้าสู่ระบบก่อนสแกน</Text><Button title="Continue with Google" disabled={!request} onPress={() => promptAsync()} />{error && <Text style={styles.error}>{error}</Text>}</View>;
  if (!captureStarted) return <ScrollView contentContainerStyle={styles.center}><Text style={styles.title}>สแกนใบหน้า 7 มุม</Text><Text style={styles.note}>ระบบตรวจแสง ระยะ และท่าทางบนอุปกรณ์ แล้วถ่ายให้อัตโนมัติ รูปผู้ใหญ่ลบใน 30 วัน ผู้เยาว์ลบใน 24 ชั่วโมง</Text><Text style={styles.bold}>ช่วงอายุ</Text><View style={styles.choiceRow}>{([['under_18','ต่ำกว่า 18'],['18_35','18–35'],['36_plus','36+']] as const).map(([value,label]) => <Text key={value} onPress={() => setAgeRange(value)} style={[styles.choice, ageRange === value && styles.choiceActive]}>{label}</Text>)}</View>{ageRange !== 'under_18' && <><Text style={styles.bold}>ฐานอ้างอิงที่คุณเลือกเอง</Text><View style={styles.choiceRow}>{([['neutral','เป็นกลาง'],['masculine','ลักษณะชาย'],['feminine','ลักษณะหญิง']] as const).map(([value,label]) => <Text key={value} onPress={() => setReferenceProfile(value)} style={[styles.choice, referenceProfile === value && styles.choiceActive]}>{label}</Text>)}</View></>}<View style={styles.row}><Text style={styles.consent}>ยินยอมให้วิเคราะห์ข้อมูลชีวมิติและเก็บภาพตามระยะเวลาที่แจ้ง</Text><Switch value={consented} onValueChange={setConsented} /></View><Button title="ยินยอมและเปิดกล้อง" disabled={!consented} onPress={beginCapture} />{error && <Text style={styles.error}>{error}</Text>}</ScrollView>;

  const currentView = SCAN_VIEWS[viewIndex];
  const isProcessing = status && !['completed', 'failed'].includes(status.status);
  return <ScrollView contentContainerStyle={styles.container}>
    {!reviewing && !status?.analysis_data && <>
      <Text style={styles.title}>สแกนใบหน้า 7 มุม</Text>
      <Text>{viewIndex + 1}/7 · {LABELS[currentView]}</Text>
      {device && hasPermission ? <View style={styles.cameraBox}>
        <Camera style={styles.camera} device={device} isActive={!reviewing && !isProcessing} outputs={[faceOutput, lightOutput, photoOutput]} />
        <View pointerEvents="none" style={[styles.guide, { borderColor: quality === 'ready' ? colors.success : colors.warning }]} />
        <View pointerEvents="none" style={styles.guidance}><Text style={styles.guidanceText}>{brightnessRef.current ? QUALITY_TEXT[quality] : 'กำลังวัดแสง…'}{quality === 'ready' ? ` ${Math.round(timer.progress * 100)}%` : ''}</Text></View>
      </View> : <Text style={styles.error}>ไม่พบกล้องหน้า หรือยังไม่ได้อนุญาตกล้อง</Text>}
      {timer.fallbackAvailable && <Button title="ถ่ายเอง" onPress={capture} />}
      {guidanceError && <Text style={styles.error}>{guidanceError}</Text>}
    </>}
    {reviewing && <View style={styles.metric}><Text style={styles.title}>ตรวจรูปก่อนวิเคราะห์</Text><Text>แตะ “ถ่ายใหม่” เฉพาะมุมที่ต้องการแก้</Text><View style={styles.grid}>{SCAN_VIEWS.map((view) => <View key={view} style={styles.thumbCard}><Image source={{ uri: photos[view] }} style={styles.thumb} /><Text>{LABELS[view]}</Text><Button title="ถ่ายใหม่" onPress={() => retake(view)} /></View>)}</View><Button title="อัปโหลดและวิเคราะห์" disabled={Boolean(isProcessing)} onPress={upload} /></View>}
    {status && <Text>สถานะ: {status.status} · {status.progress}%</Text>}
    {isProcessing && <ActivityIndicator />}
    {status?.status === 'completed' && status.analysis_data.metrics.map((metric: any) => <View key={metric.key} style={styles.metric}><Text>{metric.key.replaceAll('_', ' ')}</Text><Text>{metric.value} · confidence {metric.confidence}</Text></View>)}
    {status?.status === 'completed' && status.analysis_data.reference_scores?.overall_score != null && <View style={styles.scoreCard}><Text>ดัชนีความใกล้ค่าอ้างอิงคนไทย</Text><Text style={styles.score}>{status.analysis_data.reference_scores.overall_score}<Text style={styles.scoreUnit}>/100</Text></Text><Text style={styles.note}>ไม่ใช่คะแนนความสวย · ฐานข้อมูลอายุ 18–35 ปี</Text>{status.analysis_data.reference_scores.categories.map((item: any) => <View key={item.key} style={styles.row}><Text>{item.key}</Text><Text style={styles.bold}>{item.score}</Text></View>)}</View>}
    {status?.status === 'completed' && ageRange !== 'under_18' && <View style={styles.metric}><Text style={styles.bold}>การจำลองอยู่ในหน้าฟังก์ชันแยก</Text><Text>เลือกได้ 6 หมวด หมวดละ 4 รูปทรง พร้อม Before / After / Compare</Text><Button title="เปิดหน้าจำลองใบหน้า" onPress={() => router.push({ pathname: '/simulation', params: { scan_id: status.id } })} /></View>}
    {error && <Text style={styles.error}>{error}</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14, backgroundColor: colors.ice }, center: { flex: 1, alignItems: 'stretch', justifyContent: 'center', gap: 16, padding: 24 },
  title: { fontSize: 28, fontWeight: '700' }, note: { color: colors.muted, lineHeight: 21 }, cameraBox: { height: 500, overflow: 'hidden', borderRadius: 24, backgroundColor: colors.text }, camera: { flex: 1 },
  guide: { position: 'absolute', top: 55, bottom: 55, left: 48, right: 48, borderWidth: 4, borderRadius: 150 }, guidance: { position: 'absolute', left: 16, right: 16, bottom: 18, alignItems: 'center' },
  guidanceText: { color: colors.canvas, backgroundColor: 'rgba(0,0,0,.72)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, overflow: 'hidden', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, consent: { flex: 1 }, metric: { padding: 14, borderRadius: 12, backgroundColor: colors.canvas, gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, thumbCard: { width: '48%', gap: 6 }, thumb: { width: '100%', aspectRatio: 0.8, borderRadius: 10, backgroundColor: colors.line },
  resultImage: { width: '48%', aspectRatio: 1, borderRadius: 12 }, bold: { fontWeight: '700' }, error: { color: colors.danger },
  choiceRow: { flexDirection: 'row', gap: 8 }, choice: { flex: 1, padding: 11, borderRadius: 12, backgroundColor: colors.iceStrong, textAlign: 'center', overflow: 'hidden' }, choiceActive: { backgroundColor: colors.blueStrong, color: colors.canvas, fontWeight: '700' },
  scoreCard: { padding: 18, borderRadius: 18, backgroundColor: colors.ink, gap: 10 }, score: { fontSize: 42, fontWeight: '800', color: colors.canvas }, scoreUnit: { fontSize: 18, color: colors.blueSoft },
});
