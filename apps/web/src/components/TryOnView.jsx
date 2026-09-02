import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, Palette, Sparkles, Sliders, Eye, EyeOff, RefreshCw, Layers, Check, Lock,
  Wand2, GitCompare, Download, MoveHorizontal, ScanFace,
} from 'lucide-react';
import { getScan, getScans } from '../lib/api';
import {
  BLUSH_SHADES, DEFAULT_INTENSITY, IRIS_SHADES, LIP_SHADES, LOOK_PRESETS,
  presetSwatches, shadeById,
} from '../data/makeup';
import { paintLook } from '../lib/makeupPaint';
import { exportSize } from '../lib/imageExport';
import { latestCraniofacialScan } from '../lib/latestScan';

// Makeup order rather than the old top-to-bottom one: lips carry the look, blush shapes it, eye
// colour is the finishing touch. Hair tone is gone — tinting hair needs image segmentation, and the
// old version faked it by washing colour over the top 43% of the frame, background included.
const BEAUTY_CATEGORIES = [
  { id: 'lips', label: 'ริมฝีปาก', labelEn: 'Lips', helper: 'Lip finish', icon: Palette, accent: '#B96572', shades: LIP_SHADES },
  { id: 'blush', label: 'แก้ม', labelEn: 'Cheeks', helper: 'Blush glow', icon: Sparkles, accent: '#D58C8C', shades: BLUSH_SHADES },
  { id: 'eyes', label: 'ดวงตา', labelEn: 'Eyes', helper: 'Eye colour', icon: Eye, accent: '#778C86', shades: IRIS_SHADES },
];

export default function TryOnView({ lang = 'th' }) {
  const isTh = lang === 'th';
  const requestedScanId = new URLSearchParams(window.location.search).get('scan_id');
  const scans = useQuery({ queryKey: ['scans'], queryFn: getScans, enabled: !requestedScanId });
  const scanId = requestedScanId || latestCraniofacialScan(scans.data)?.id;
  const scan = useQuery({ queryKey: ['scan', scanId], queryFn: () => getScan(scanId), enabled: Boolean(scanId) });

  const [activeTab, setActiveTab] = useState('lips');
  const [lip, setLip] = useState(() => LIP_SHADES[2]);
  const [blush, setBlush] = useState(() => BLUSH_SHADES[1]);
  const [iris, setIris] = useState(() => IRIS_SHADES[0]);
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);
  const [splitPos, setSplitPos] = useState(54);
  const [activePreset, setActivePreset] = useState(null);
  const [isCleanView, setIsCleanView] = useState(false);
  const [isMobileComposerOpen, setIsMobileComposerOpen] = useState(false);
  const [isDraggingComparison, setIsDraggingComparison] = useState(false);

  // 'loading' until the landmark model has run: the colours cannot be placed before then, so they
  // stay disabled and say why rather than doing nothing when tapped.
  const [status, setStatus] = useState('loading');
  const [downloadError, setDownloadError] = useState('');
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  const comparisonStageRef = useRef(null);
  const comparisonDraggingRef = useRef(false);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const landmarksRef = useRef(null);
  const setsRef = useRef(null);

  const frontUrl = scan.data?.front_url || null;
  const look = useMemo(() => ({ lip, blush, iris }), [lip, blush, iris]);
  const activeCategory = BEAUTY_CATEGORIES.find((category) => category.id === activeTab);
  const selectedFor = { lips: lip, blush, eyes: iris };
  const setterFor = { lips: setLip, blush: setBlush, eyes: setIris };
  const swatches = useMemo(() => [lip.hex, blush.hex, iris.hex].filter(Boolean), [lip, blush, iris]);

  /**
   * Track the stage box so the canvas is sized in real pixels; a CSS-stretched canvas would put the
   * makeup back out of register with the face.
   *
   * A callback ref rather than a mount effect, and that is the whole of a bug this screen shipped
   * with: the stage lives past several early returns — the loading spinner, "no scan", "expired",
   * "no face" — so on a cold load the first render has no stage element at all. A `useEffect` with
   * an empty dependency list ran exactly then, found `comparisonStageRef.current` null, returned,
   * and never ran again. `stageSize` therefore stayed {0, 0} for the life of the page, `repaint`
   * returned at its first guard every time, and the canvas was left at its default 300x150 and
   * fully transparent.
   *
   * What that looked like is the reason it belongs in an honesty audit rather than a bug list: the
   * studio rendered a grey rectangle labelled MAKEUP LOOK on one side and ORIGINAL on the other,
   * with a working comparison slider, an intensity readout and every shade button live over a
   * photograph that had never been drawn. A callback ref cannot miss the element, because React
   * calls it with the node the moment the node exists — and with null when it goes, which is where
   * the observer is disconnected.
   */
  const stageObserverRef = useRef(null);
  const attachStage = useCallback((node) => {
    comparisonStageRef.current = node;
    stageObserverRef.current?.disconnect();
    if (!node) {
      stageObserverRef.current = null;
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStageSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(node);
    stageObserverRef.current = observer;
    // The observer fires on its own for the first box, but only on the next frame; setting it here
    // means the first paint does not have to wait for one.
    const { width, height } = node.getBoundingClientRect();
    setStageSize({ width: Math.round(width), height: Math.round(height) });
  }, []);

  // Load the photo and find the face once per scan. Landmarks stay in memory only — never written to
  // storage, for the same reason the simulation stack is not persisted.
  useEffect(() => {
    if (!frontUrl) return;
    let cancelled = false;
    setStatus('loading');
    landmarksRef.current = null;
    imageRef.current = null;

    const image = new Image();
    // Required for `toBlob` later: a cross-origin photo drawn without this taints the canvas and the
    // download throws. Supabase serves the header; the download handler reports it if it does not.
    image.crossOrigin = 'anonymous';
    image.src = frontUrl;

    (async () => {
      try {
        await image.decode();
        if (cancelled) return;
        imageRef.current = image;
        const liveFace = await import('../lib/liveFace');
        if (cancelled) return;
        setsRef.current = liveFace.LANDMARK_SETS;
        const landmarks = await liveFace.detectStillAnyDelegate(image);
        if (cancelled) return;
        landmarksRef.current = landmarks;
        setStatus(landmarks ? 'ready' : 'no-face');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();

    return () => { cancelled = true; };
  }, [frontUrl]);

  // Released on unmount only. Doing it whenever the scan changes would race the next run: the close
  // resolves asynchronously and could land after the replacement task had already been handed out.
  useEffect(() => () => {
    import('../lib/liveFace').then((liveFace) => liveFace.closeStillFaceLandmarker()).catch(() => {});
  }, []);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !stageSize.width || !stageSize.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(stageSize.width * ratio);
    canvas.height = Math.round(stageSize.height * ratio);
    const size = { width: canvas.width, height: canvas.height };
    const context = canvas.getContext('2d');
    const fit = paintLook(context, size, image, landmarksRef.current, look, intensity, setsRef.current);

    // The comparison line: the original photo redrawn over everything right of the divider, on the
    // same canvas, so the export and the screen cannot disagree.
    if (!isCleanView && splitPos < 100) {
      const edge = (size.width * splitPos) / 100;
      context.save();
      context.beginPath();
      context.rect(edge, 0, size.width - edge, size.height);
      context.clip();
      context.drawImage(image, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, size.width, size.height);
      context.restore();
    }
    // `status` is a dependency because it is the signal that `landmarksRef` has been filled in;
    // a ref changing cannot trigger this on its own.
  }, [look, intensity, splitPos, isCleanView, stageSize, status]);

  useEffect(() => { repaint(); }, [repaint]);

  const updateComparisonFromPointer = (event) => {
    const stageBounds = comparisonStageRef.current?.getBoundingClientRect();
    if (!stageBounds?.width) return;
    const nextPosition = ((event.clientX - stageBounds.left) / stageBounds.width) * 100;
    setSplitPos(Math.max(0, Math.min(100, Math.round(nextPosition))));
  };

  const stopComparisonDrag = (event) => {
    comparisonDraggingRef.current = false;
    setIsDraggingComparison(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleComparisonKeyDown = (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? -2 : 2;
      setSplitPos((current) => Math.max(0, Math.min(100, current + direction)));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setSplitPos(event.key === 'Home' ? 0 : 100);
    }
  };

  const resetStyles = () => {
    setLip(LIP_SHADES[0]);
    setBlush(BLUSH_SHADES[0]);
    setIris(IRIS_SHADES[0]);
    setIntensity(DEFAULT_INTENSITY);
    setSplitPos(54);
    setActivePreset(null);
    setIsCleanView(false);
    setDownloadError('');
  };

  const applyPreset = (preset) => {
    setActivePreset(preset.id);
    setLip(shadeById(LIP_SHADES, preset.lip));
    setBlush(shadeById(BLUSH_SHADES, preset.blush));
    setIris(shadeById(IRIS_SHADES, preset.iris));
    setIntensity(preset.intensity);
  };

  const chooseShade = (shade) => {
    setterFor[activeTab](shade);
    // The look no longer matches the preset that was clicked, so stop claiming it does.
    setActivePreset(null);
  };

  /** Download the full look at the photo's own resolution, not the size of the on-screen canvas. */
  const downloadLook = () => {
    const image = imageRef.current;
    if (!image) return;
    setDownloadError('');
    // Shared with the simulation screen's download rather than kept as a second copy of the same
    // ceiling: two files deciding independently how large an export may be is how they diverge.
    const { width, height } = exportSize(image.naturalWidth, image.naturalHeight);
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    paintLook(
      exportCanvas.getContext('2d'),
      { width: exportCanvas.width, height: exportCanvas.height },
      image, landmarksRef.current, look, intensity, setsRef.current,
    );
    try {
      exportCanvas.toBlob((blob) => {
        if (!blob) {
          setDownloadError(isTh ? 'บันทึกภาพไม่สำเร็จ ลองอีกครั้ง' : 'The image could not be saved. Try again.');
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'doodee-beauty-look.png';
        link.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch {
      // A tainted canvas: the photo host did not allow cross-origin reads. Naming the cause because
      // it is a storage setting somebody can fix, not something the user did wrong.
      setDownloadError(isTh
        ? 'ดาวน์โหลดไม่ได้เพราะที่เก็บภาพไม่อนุญาตให้อ่านภาพข้ามโดเมน (CORS) — ภาพบนหน้าจอยังใช้ดูได้ปกติ'
        : 'Download blocked: the image host does not allow cross-origin reads (CORS). The on-screen preview still works.');
    }
  };

  const requestLandscapeMode = async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      if (screen.orientation?.lock) await screen.orientation.lock('landscape');
    } catch {
      // The rotate gate remains visible until the user turns the device.
    }
  };

  const emptyState = (icon, title, body, action) => (
    <div className="simulation-empty">
      {icon}
      <h1>{title}</h1>
      {body && <p>{body}</p>}
      {action}
    </div>
  );

  if (!scanId && !scans.isPending) {
    return emptyState(<ScanFace />, isTh ? 'ยังไม่มีผลสแกนสำหรับลองเครื่องสำอาง' : 'No scan to try makeup on',
      isTh ? 'หน้านี้แต่งหน้าบนภาพสแกนของคุณเอง จึงต้องสแกนใบหน้าก่อนหนึ่งครั้ง' : 'This page works on your own scan, so one face scan is needed first.',
      <button onClick={() => { window.location.href = '/onboarding'; }}>{isTh ? 'เริ่มสแกนใบหน้า' : 'Start a scan'}</button>);
  }
  if (scan.isPending || scans.isPending) {
    return <div className="simulation-empty"><Activity className="capture-spin" />{isTh ? 'กำลังเปิดผลสแกน…' : 'Opening scan…'}</div>;
  }
  if (scan.data?.age_band !== 'adult') {
    return emptyState(<Lock />, isTh ? 'ฟังก์ชันนี้สำหรับผู้มีอายุ 18 ปีขึ้นไป' : 'This feature is for adults 18+');
  }
  if (!frontUrl) {
    return emptyState(<ScanFace />, isTh ? 'ภาพสแกนหมดอายุแล้ว' : 'The scan image has expired',
      isTh ? 'ภาพถูกลบตามกำหนดการเก็บข้อมูล สแกนใหม่เพื่อลองเครื่องสำอางอีกครั้ง' : 'The photo was removed on schedule. Scan again to keep trying looks.',
      <button onClick={() => { window.location.href = '/onboarding'; }}>{isTh ? 'สแกนใหม่' : 'Scan again'}</button>);
  }
  if (status === 'no-face' || status === 'failed') {
    return emptyState(<ScanFace />,
      isTh ? 'ใช้ภาพสแกนนี้แต่งหน้าไม่ได้' : 'This scan cannot be used',
      status === 'no-face'
        ? (isTh ? 'ตรวจไม่พบใบหน้าที่ชัดเจนพอในภาพหน้าตรง เครื่องสำอางจึงวางตำแหน่งไม่ได้' : 'No clear face was found in the front photo, so makeup cannot be placed.')
        : (isTh ? 'เบราว์เซอร์นี้เรียกใช้ตัวตรวจจับใบหน้าไม่ได้ (ต้องรองรับ WebGL) ลองเบราว์เซอร์อื่นหรือเปิดการเร่งความเร็วกราฟิก' : 'This browser cannot run the face detector — it needs WebGL. Try another browser, or switch on graphics acceleration.'),
      <button onClick={() => { window.location.href = '/onboarding'; }}>{isTh ? 'สแกนใหม่' : 'Scan again'}</button>);
  }

  const isReady = status === 'ready';

  return (
    <div className={`tryon-workspace tryon-view${isMobileComposerOpen ? ' is-composer-open' : ''}`} style={{
      width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden',
    }}>
      <div className="tryon-rotate-gate" role="status" aria-live="polite">
        <div className="tryon-rotate-device" aria-hidden="true"><span /></div>
        <div>
          <span>BEAUTY LOOK STUDIO</span>
          <h2>{isTh ? 'หมุนโทรศัพท์เป็นแนวนอน' : 'Rotate your phone to landscape'}</h2>
          <p>{isTh
            ? 'Try‑On ใช้พื้นที่แนวนอนเพื่อให้เห็นภาพและเครื่องมือปรับแต่งพร้อมกันโดยไม่แน่นหน้าจอ'
            : 'Try-On uses landscape so the preview and editing tools stay visible without crowding the screen.'}</p>
          <button type="button" onClick={requestLandscapeMode}>
            <MoveHorizontal size={18} />
            {isTh ? 'เปิดเต็มจอแนวนอน' : 'Open landscape fullscreen'}
          </button>
        </div>
      </div>

      <div className="tryon-workspace-header tryon-header" style={{
        minHeight: '58px', borderRadius: '18px', padding: '9px 14px', background: '#ffffff',
        border: '1px solid #e8e8ed', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '14px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: '#0066cc', color: '#FFFFFF', display: 'grid', placeItems: 'center' }}>
            <Wand2 size={19} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, color: '#1d1d1f', fontSize: '1rem', fontWeight: 600 }}>
              {isTh ? 'Beauty Look Studio · ลองเครื่องสำอางบนภาพสแกนของคุณ' : 'Beauty Look Studio · makeup on your own scan'}
            </h1>
            <p style={{ margin: '2px 0 0', color: '#6e6e73', fontSize: '0.68rem' }}>
              {isTh ? 'ทดลองลิป บลัช และสีดวงตา พร้อมเทียบกับภาพเดิมได้ทันที' : 'Try lip, blush and eye colour, and compare against the original.'}
            </p>
          </div>
        </div>
        <button className="tryon-reset" type="button" onClick={resetStyles} style={{
          height: '34px', border: '1px solid #d2d2d7', borderRadius: '999px', background: 'rgba(255,255,255,0.72)',
          color: '#0066cc', padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          <RefreshCw size={14} /> {isTh ? 'รีเซ็ตลุค' : 'Reset look'}
        </button>
      </div>

      <div className="tryon-workspace-layout tryon-grid" style={{
        display: 'grid', gridTemplateColumns: 'minmax(126px, 0.36fr) minmax(0, 1.15fr) minmax(310px, 1fr)',
        gap: '8px', flex: 1, minHeight: 0, overflow: 'hidden',
      }}>
        <aside className="tryon-category-panel tryon-categories" style={{
          borderRadius: '18px', padding: '11px', background: '#ffffff', border: '1px solid #e8e8ed',
          display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
        }}>
          <div style={{ padding: '2px 4px 9px', borderBottom: '1px solid #e8e8ed' }}>
            <div style={{ color: '#1d1d1f', fontSize: '0.78rem', fontWeight: 600 }}>Beauty steps</div>
            <div style={{ color: '#6e6e73', fontSize: '0.62rem', marginTop: '2px' }}>{isTh ? 'เลือกส่วนที่อยากลองแต่ง' : 'Pick what to try'}</div>
          </div>

          <nav className="tryon-category-list" aria-label={isTh ? 'หมวดเครื่องสำอาง' : 'Makeup categories'} style={{
            display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '9px', flex: 1,
          }}>
            {BEAUTY_CATEGORIES.map((category, index) => {
              const Icon = category.icon;
              const isActive = activeTab === category.id;
              const selectedColor = selectedFor[category.id].hex;
              return (
                <button
                  className={`tryon-category-button${isActive ? ' is-active' : ''}`}
                  key={category.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => { setActiveTab(category.id); setIsMobileComposerOpen(true); }}
                  style={{
                    minHeight: '65px', borderRadius: '17px',
                    border: isActive ? `1px solid ${category.accent}66` : '1px solid transparent',
                    background: isActive ? `linear-gradient(135deg, ${category.accent}18, #FFFFFF)` : 'rgba(255,255,255,0.45)',
                    color: isActive ? '#514D47' : '#82776F', padding: '8px 9px', display: 'flex',
                    alignItems: 'center', gap: '8px', textAlign: 'left', cursor: 'pointer',
                    boxShadow: isActive ? `0 5px 14px ${category.accent}18` : 'none',
                  }}
                >
                  <span style={{
                    width: '32px', height: '32px', borderRadius: '12px',
                    background: isActive ? category.accent : '#F3EFEB', color: isActive ? '#FFFFFF' : '#9A8E86',
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}>
                    <Icon size={16} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800 }}>
                      {index + 1}. {isTh ? category.label : category.labelEn}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.58rem', color: '#A0958D', marginTop: '2px' }}>
                      {category.helper}
                    </span>
                  </span>
                  <span style={{
                    width: '14px', height: '14px', borderRadius: '50%',
                    background: selectedColor || '#DDD8D3', border: '2px solid #FFFFFF',
                    boxShadow: '0 0 0 1px rgba(80,70,65,0.12)', flexShrink: 0,
                  }} />
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="tryon-preview-panel tryon-preview" style={{
          minHeight: 0, borderRadius: '22px', padding: '10px', background: '#ffffff',
          border: '1px solid #E9E1DA', boxShadow: '0 4px 18px rgba(88, 72, 65, 0.05)',
          display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden',
        }}>
          <div className="tryon-preview-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#57534D', fontSize: '0.8rem', fontWeight: 800 }}>
              <Palette size={16} color="#B46F7D" /> {isTh ? 'ภาพสแกนของคุณ' : 'Your scan'}
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
              {!isCleanView && (
                <>
                  <button type="button" onClick={() => setSplitPos(0)} style={{
                    border: '1px solid #E5DDD6', borderRadius: '999px', background: '#FFFFFF',
                    color: '#80756E', fontSize: '0.61rem', fontWeight: 700, padding: '5px 9px', cursor: 'pointer',
                  }}>{isTh ? 'ภาพเดิม' : 'Original'}</button>
                  <button type="button" onClick={() => setSplitPos(100)} style={{
                    border: '1px solid #E5CDD3', borderRadius: '999px', background: '#FFF4F6',
                    color: '#A35F6D', fontSize: '0.61rem', fontWeight: 700, padding: '5px 9px', cursor: 'pointer',
                  }}>{isTh ? 'ดูลุคเต็ม' : 'Full look'}</button>
                </>
              )}
              <button type="button" aria-pressed={isCleanView} onClick={() => setIsCleanView((value) => !value)} style={{
                border: isCleanView ? '1px solid #B76F7D' : '1px solid #E5CDD3', borderRadius: '999px',
                background: isCleanView ? '#B76F7D' : '#FFF4F6', color: isCleanView ? '#FFFFFF' : '#A35F6D',
                fontSize: '0.61rem', fontWeight: 800, padding: '5px 9px', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '4px',
              }}>
                {isCleanView ? <Eye size={12} /> : <EyeOff size={12} />}
                {isCleanView ? (isTh ? 'แสดงเครื่องมือ' : 'Show tools') : (isTh ? 'เคลียร์หน้าจอ' : 'Clear screen')}
              </button>
            </div>
          </div>

          <div ref={attachStage} className="tryon-image-stage" style={{
            position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: '20px',
            background: 'linear-gradient(145deg, #EEE9E7, #E4E9E5)', border: '1px solid #E5DDD8',
          }}>
            <canvas
              ref={canvasRef}
              aria-label={isTh ? 'ภาพสแกนของคุณพร้อมเครื่องสำอางที่เลือก' : 'Your scan with the selected makeup'}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
            />

            {!isReady && (
              <div style={{
                position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                background: 'rgba(255,255,255,.55)', backdropFilter: 'blur(2px)',
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#6b5f63', fontSize: '.72rem', fontWeight: 700 }}>
                  <Activity className="capture-spin" size={16} />
                  {isTh ? 'กำลังหาตำแหน่งใบหน้า…' : 'Locating the face…'}
                </span>
              </div>
            )}

            {!isCleanView && isReady && (
              <>
                <div
                  className={`tryon-comparison-dragger${isDraggingComparison ? ' is-dragging' : ''}`}
                  role="slider"
                  tabIndex={0}
                  aria-label={isTh ? 'เลื่อนเส้นเพื่อเปรียบเทียบภาพก่อนและหลังแต่งหน้า' : 'Drag to compare before and after'}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={splitPos}
                  style={{ left: `${splitPos}%` }}
                  onPointerDown={(event) => {
                    comparisonDraggingRef.current = true;
                    setIsDraggingComparison(true);
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    updateComparisonFromPointer(event);
                  }}
                  onPointerMove={(event) => { if (comparisonDraggingRef.current) updateComparisonFromPointer(event); }}
                  onPointerUp={stopComparisonDrag}
                  onPointerCancel={stopComparisonDrag}
                  onKeyDown={handleComparisonKeyDown}
                >
                  <span className="tryon-comparison-line" />
                  <span className="tryon-comparison-handle"><GitCompare size={14} /></span>
                </div>

                <div style={{
                  position: 'absolute', top: '12px', left: '12px', borderRadius: '999px', padding: '5px 10px',
                  background: 'rgba(181, 102, 119, 0.88)', color: '#FFFFFF', backdropFilter: 'blur(8px)',
                  fontSize: '0.64rem', fontWeight: 800,
                }}>MAKEUP LOOK</div>

                <div style={{
                  position: 'absolute', top: '12px', right: '12px', borderRadius: '999px', padding: '5px 10px',
                  background: 'rgba(61, 69, 64, 0.72)', color: '#FFFFFF', backdropFilter: 'blur(8px)',
                  fontSize: '0.64rem', fontWeight: 800,
                }}>ORIGINAL</div>
              </>
            )}

            <div className="tryon-preview-intensity">
              <div className="tryon-preview-intensity-heading">
                <span><Sliders size={14} /> {isTh ? 'ความเข้มของเมคอัพ' : 'Makeup intensity'}</span>
                <strong>{intensity}%</strong>
              </div>
              <input
                aria-label={isTh ? 'ความเข้มของเมคอัพ' : 'Makeup intensity'}
                type="range"
                min="10"
                max="100"
                value={intensity}
                disabled={!isReady}
                onChange={(event) => setIntensity(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="tryon-look-summary" style={{
            minHeight: '48px', borderRadius: '16px', padding: '7px 10px',
            background: 'linear-gradient(90deg, #FFF7F5, #F6F3EC)', border: '1px solid #EDE2DC',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <Layers size={15} color="#B46F7D" />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#94877F', fontSize: '0.57rem' }}>{isTh ? 'ลุคที่เลือก' : 'Selected look'}</div>
                <div style={{ color: '#5C554F', fontSize: '0.67rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[lip, blush, iris].filter((shade) => shade.hex).map((shade) => (isTh ? shade.name_th : shade.name_en)).join(' · ')
                    || (isTh ? 'ยังไม่ได้เลือกสี' : 'Nothing selected yet')}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexShrink: 0 }}>
              {swatches.map((color, index) => (
                <span key={color} style={{
                  width: '20px', height: '20px', borderRadius: '50%', background: color,
                  border: '2px solid #ffffff', marginLeft: index === 0 ? 0 : '-4px',
                }} />
              ))}
            </div>
          </div>
        </section>

        <section className="tryon-controls-panel tryon-composer" style={{
          minHeight: 0, borderRadius: '22px', padding: '11px', background: '#ffffff',
          border: '1px solid #E9E1DA', boxShadow: '0 4px 18px rgba(88, 72, 65, 0.05)',
          display: 'flex', flexDirection: 'column', gap: '9px', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexShrink: 0 }}>
            <div>
              <div style={{ color: '#574F4B', fontSize: '0.82rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Wand2 size={15} color="#B46F7D" /> Beauty composer
              </div>
              <div style={{ color: '#9A8E87', fontSize: '0.59rem', marginTop: '2px' }}>
                {isTh ? 'จัดลุคทีละสเต็ป หรือเลือก mood สำเร็จรูป' : 'Build it step by step, or start from a mood'}
              </div>
            </div>
            <span style={{ borderRadius: '999px', padding: '4px 8px', background: '#F5E6E8', color: '#9F5E6A', fontSize: '0.58rem', fontWeight: 800 }}>BEAUTY LAB</span>
          </div>

          <div className="tryon-preset-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '5px', flexShrink: 0 }}>
            {LOOK_PRESETS.map((preset) => {
              const isActive = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={isActive}
                  disabled={!isReady}
                  onClick={() => applyPreset(preset)}
                  style={{
                    border: isActive ? '1px solid #CF8795' : '1px solid #EAE1DB', borderRadius: '14px',
                    background: isActive ? '#FFF2F4' : '#FBF9F6', padding: '7px 5px',
                    cursor: isReady ? 'pointer' : 'not-allowed', color: isActive ? '#925462' : '#796F69',
                    opacity: isReady ? 1 : .55,
                    boxShadow: isActive ? '0 4px 12px rgba(181,102,119,0.1)' : 'none',
                  }}
                >
                  {/* The dots are the shades this look really applies — the old ones were decorative. */}
                  <span style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
                    {presetSwatches(preset).map((color, index) => (
                      <span key={color} style={{
                        width: '14px', height: '14px', borderRadius: '50%', background: color,
                        border: '1.5px solid #FFFFFF', marginLeft: index === 0 ? 0 : '-3px',
                      }} />
                    ))}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.58rem', fontWeight: 800 }}>{isTh ? preset.name_th : preset.name_en}</span>
                </button>
              );
            })}
          </div>

          <div className="tryon-option-panel" style={{
            borderRadius: '17px', padding: '9px', background: 'linear-gradient(145deg, #FCF8F5, #F9F5F1)',
            border: '1px solid #ECE3DC', flex: 1, minHeight: 0, overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{
                width: '30px', height: '30px', borderRadius: '11px', background: activeCategory.accent,
                color: '#FFFFFF', display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                <activeCategory.icon size={15} />
              </span>
              <div>
                <div style={{ color: '#564F49', fontSize: '0.73rem', fontWeight: 800 }}>
                  {isTh ? `เลือกเฉด${activeCategory.label}` : `Choose a ${activeCategory.labelEn.toLowerCase()} shade`}
                </div>
                <div style={{ color: '#9A8E86', fontSize: '0.56rem', marginTop: '1px' }}>
                  {isReady
                    ? (isTh ? 'แตะเพื่อทาลงบนภาพของคุณทันที' : 'Tap to paint it onto your photo')
                    : (isTh ? 'กำลังเตรียม… รอให้ระบบหาตำแหน่งใบหน้าก่อน' : 'Preparing… waiting for the face to be located')}
                </div>
              </div>
            </div>

            <div className="tryon-option-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
              {activeCategory.shades.map((shade) => {
                const isSelected = selectedFor[activeTab].id === shade.id;
                return (
                  <button
                    key={shade.id}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={!isReady}
                    title={isReady ? undefined : (isTh ? 'กำลังเตรียมตัวตรวจจับใบหน้า' : 'The face detector is still loading')}
                    onClick={() => chooseShade(shade)}
                    style={{
                      minHeight: '58px', borderRadius: '14px',
                      border: isSelected ? `1px solid ${activeCategory.accent}` : '1px solid #E7DFD8',
                      background: isSelected ? `${activeCategory.accent}12` : '#FFFDFB', color: '#5A534E',
                      padding: '7px', display: 'flex', alignItems: 'center', gap: '7px', textAlign: 'left',
                      cursor: isReady ? 'pointer' : 'not-allowed', opacity: isReady ? 1 : .55,
                      boxShadow: isSelected ? `0 4px 12px ${activeCategory.accent}14` : 'none',
                    }}
                  >
                    <span style={{
                      width: '28px', height: '28px', borderRadius: '10px',
                      background: shade.hex || 'linear-gradient(135deg, #E8E5E1 0 46%, #C7C1BB 47% 53%, #F8F5F1 54%)',
                      border: '2px solid #FFFFFF', boxShadow: '0 0 0 1px rgba(80,65,60,0.12)', flexShrink: 0,
                    }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: '0.59rem', lineHeight: 1.3, fontWeight: isSelected ? 800 : 600 }}>
                      {isTh ? shade.name_th : shade.name_en}
                      {shade.finish && shade.hex && (
                        <span style={{ display: 'block', color: '#A0958D', fontWeight: 600 }}>
                          {shade.finish === 'gloss' ? (isTh ? 'ฟินิชวาว' : 'Gloss') : (isTh ? 'ฟินิชด้าน' : 'Matte')}
                        </span>
                      )}
                    </span>
                    {isSelected && <Check size={13} color={activeCategory.accent} />}
                  </button>
                );
              })}
            </div>
          </div>

          {downloadError && <p className="simulation-error" role="alert" style={{ margin: 0 }}>{downloadError}</p>}

          <button
            className="tryon-save"
            type="button"
            disabled={!isReady || swatches.length === 0}
            onClick={downloadLook}
            title={swatches.length === 0 ? (isTh ? 'เลือกสีอย่างน้อยหนึ่งอย่างก่อน' : 'Choose at least one shade first') : undefined}
            style={{
              minHeight: '43px', border: 'none', borderRadius: '15px',
              background: 'linear-gradient(110deg, #B76F7D, #CF8993 54%, #B98579)', color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              fontSize: '0.72rem', fontWeight: 800, cursor: isReady && swatches.length ? 'pointer' : 'not-allowed',
              opacity: isReady && swatches.length ? 1 : .55,
              boxShadow: '0 8px 18px rgba(183,111,125,0.2)', flexShrink: 0,
            }}
          >
            <Download size={15} /> {isTh ? 'ดาวน์โหลดภาพลุคนี้' : 'Download this look'}
          </button>
        </section>
      </div>

      <button
        className="tryon-mobile-composer-toggle"
        type="button"
        aria-expanded={isMobileComposerOpen}
        onClick={() => setIsMobileComposerOpen((value) => !value)}
      >
        <Wand2 size={17} />
        {isMobileComposerOpen ? (isTh ? 'ซ่อนเครื่องมือ' : 'Hide tools') : (isTh ? 'ปรับแต่งลุค' : 'Edit look')}
      </button>
    </div>
  );
}
