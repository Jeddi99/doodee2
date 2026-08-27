import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, ArrowLeft, Check, Lock, Maximize2, MoveHorizontal, Save, ScanFace, ShieldCheck, Ticket, Unlock, X, ZoomIn } from 'lucide-react';
import { focusTransform, NO_ZOOM, SIMULATION_CONSENT_VERSION } from '@doodee/shared';
import { createSimulation, getProcedures, getScan, getScans, getSession, getSimulation, previewSimulation } from '../lib/api';
import { statusPollInterval } from '../lib/pollInterval.js';
import { daysRemaining } from '../lib/promoCode';
import { describeSimulationError } from '../lib/simulationError';
import { emptyQueue, request as queueRequest, settle } from '../lib/previewQueue';
import {
  MAX_ITEMS, clearAll, clearUnlocked, count, emptyStack, isLocked, itemFor, remove as removeFromStack, select as selectInStack,
  toRequest, toggleLock, total, unlock,
} from '../lib/simulationStack';

const REGIONS = [
  ['eyes', 'ดวงตา', 'Eyes'], ['nose', 'จมูก', 'Nose'], ['lips', 'ริมฝีปาก', 'Lips'],
  ['cheeks', 'แก้ม', 'Cheeks'], ['jaw', 'กราม', 'Jaw'], ['chin', 'คาง', 'Chin'],
];

// Only these regions have published Thai means behind them; the rest stay on the preset tab
// until a source with comparable soft-tissue measurements is added to the backend.
const REFERENCE_REGIONS = ['nose', 'lips', 'chin'];

const CONSENT_VERSION = SIMULATION_CONSENT_VERSION;
const noPreviews = () => ({ front: null, profile: null });
const regionName = (id, isTh) => REGIONS.find(([key]) => key === id)?.[isTh ? 1 : 2] ?? id;

const BLINK_MS = 600;

// Reading the query rather than trusting a one-off check: a user can change the setting while
// the page is open, and this one flips an animation that flashes a face at them.
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = (event) => setReduced(event.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function FixedImageCompare({ beforeUrl, afterUrl, focusBox, zoom, mode, isTh }) {
  const [position, setPosition] = useState(50);
  const [imageAspect, setImageAspect] = useState(0);
  const [viewerAspect, setViewerAspect] = useState(4 / 3);
  const [blinkShowsAfter, setBlinkShowsAfter] = useState(false);
  const figureRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const blinking = mode === 'blink';

  // The zoom is expressed against the viewer box, and that box changes shape between the
  // desktop and mobile stylesheets, so it is measured rather than assumed.
  useEffect(() => {
    const node = figureRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setViewerAspect(width / height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Reduced motion gets press-and-hold instead: the comparison still works, nothing flashes.
  useEffect(() => {
    setBlinkShowsAfter(false);
    if (!blinking || reducedMotion) return;
    const timer = setInterval(() => setBlinkShowsAfter((showing) => !showing), BLINK_MS);
    return () => clearInterval(timer);
  }, [blinking, reducedMotion]);

  const transform = zoom ? focusTransform(focusBox, imageAspect, viewerAspect) : NO_ZOOM;
  const imageStyle = { transform: `scale(${transform.scale})`, transformOrigin: `${transform.originX}% ${transform.originY}%` };
  // The clip runs in the image's own coordinates, which the zoom has moved; without this the
  // split line and the edge it is supposed to mark drift apart as soon as the zoom is on.
  const splitClip = transform.originX + (position - transform.originX) / transform.scale;

  const showBefore = mode !== 'after';
  const showAfter = mode !== 'before';
  const hideAfter = blinking && !blinkShowsAfter;
  const hold = blinking && reducedMotion
    ? {
      onPointerDown: () => setBlinkShowsAfter(true),
      onPointerUp: () => setBlinkShowsAfter(false),
      onPointerLeave: () => setBlinkShowsAfter(false),
    }
    : {};

  return (
    <figure ref={figureRef} className={`simulation-compare is-${mode}`} style={{ '--split': `${position}%`, '--split-clip': `${splitClip}%` }} {...hold}>
      {showBefore && <img className="simulation-image-before" style={imageStyle} src={beforeUrl} alt={isTh ? 'ภาพก่อนปรับ' : 'Before'} onLoad={(event) => setImageAspect(event.target.naturalWidth / event.target.naturalHeight)} />}
      {showAfter && <img className="simulation-image-after" style={{ ...imageStyle, opacity: hideAfter ? 0 : 1 }} src={afterUrl} alt={isTh ? 'ภาพหลังปรับ' : 'After'} />}
      {mode === 'compare' && <>
        <input aria-label={isTh ? 'เลื่อนเปรียบเทียบภาพก่อนและหลัง' : 'Compare before and after'} type="range" min="0" max="100" value={position} onChange={(event) => setPosition(Number(event.target.value))} />
        <span className="simulation-divider" aria-hidden="true"><b><MoveHorizontal /></b></span>
      </>}
      {blinking
        ? <figcaption className="is-single" aria-live="off"><span>{hideAfter ? (isTh ? 'ก่อนปรับ' : 'Before') : (isTh ? 'หลังปรับ' : 'After')}</span></figcaption>
        : <figcaption><span>{isTh ? 'ก่อนปรับ' : 'Before'}</span><span>{isTh ? 'หลังปรับ' : 'After'}</span></figcaption>}
      {blinking && reducedMotion && <p className="simulation-hold-hint">{isTh ? 'กดค้างบนภาพเพื่อดูภาพหลังปรับ' : 'Press and hold the image to see the after'}</p>}
    </figure>
  );
}

export default function SimulationView({ lang = 'th', onNavigate }) {
  const isTh = lang === 'th';
  const requestedScanId = new URLSearchParams(window.location.search).get('scan_id');
  const scans = useQuery({ queryKey: ['scans'], queryFn: getScans, enabled: !requestedScanId });
  const scanId = requestedScanId || scans.data?.[0]?.id;
  const scan = useQuery({ queryKey: ['scan', scanId], queryFn: () => getScan(scanId), enabled: Boolean(scanId) });
  const session = useQuery({ queryKey: ['session'], queryFn: getSession });
  const [targetMode, setTargetMode] = useState('preset'); // 'preset' | 'reference'
  const [region, setRegion] = useState('eyes');
  // The whole catalog, not one region: the list of what is being simulated has to name shapes
  // and procedures for regions whose tab is not open.
  const procedures = useQuery({ queryKey: ['procedures'], queryFn: () => getProcedures() });
  const catalog = useMemo(() => procedures.data || [], [procedures.data]);
  const presetsById = useMemo(() => new Map(catalog.map((preset) => [preset.id, preset])), [catalog]);
  const presets = useMemo(() => catalog.filter((preset) => preset.region === region), [catalog, region]);
  const [consented, setConsented] = useState(false);
  const [mode, setMode] = useState('compare');
  // On by default: with no preview yet there is no region to aim at, so this reads as off until
  // one arrives, and no reset is needed when the region changes.
  const [zoom, setZoom] = useState(true);
  const [simulationId, setSimulationId] = useState(null);

  // One stack and one rendered image per camera angle: a width change is only visible from the
  // front and a projection change only from the side, so they are separate source photos.
  const [stack, setStack] = useState(emptyStack);
  const [previews, setPreviews] = useState(noPreviews);
  const [viewAngle, setViewAngle] = useState('front');
  const [renderingView, setRenderingView] = useState(null);
  const [previewError, setPreviewError] = useState('');
  // Which region to point the zoom at. The union of every selected region would frame the whole
  // face once a few are chosen, which is the opposite of zooming.
  const [lastTouched, setLastTouched] = useState(null);
  const queueRef = useRef(emptyQueue());

  const isReference = targetMode === 'reference';
  const regionHasReference = REFERENCE_REGIONS.includes(region);
  // Gate on the photos the scan actually holds, not on its mode name: `standard` and `full`
  // both capture both profiles, and the backend checks the stored images the same way.
  const hasProfiles = Boolean(scan.data?.has_profile_images);
  const simulationOff = session.data?.simulation_enabled === false;
  const simulationLocked = session.data?.simulation_locked === true;

  const frontPresets = presets.filter((preset) => preset.source_view !== 'profile');
  const profilePresets = presets.filter((preset) => preset.source_view === 'profile');
  // Also available when the side stack holds something, or locking a nose projection and then
  // opening the eyes tab would leave no way back to look at it.
  const sideAvailable = !isReference && hasProfiles && (profilePresets.length > 0 || count(stack, 'profile') > 0);
  const activeView = sideAvailable || viewAngle === 'front' ? viewAngle : 'front';
  const preview = previews[activeView];
  const target = isReference ? previews.front?.measurements?.[0] : null;

  const clearPreviews = () => {
    queueRef.current = emptyQueue();
    setPreviews(noPreviews());
    setRenderingView(null);
    setPreviewError('');
    setSimulationId(null);
  };

  // Selections arrive faster than the server answers, so requests are queued rather than
  // fired in parallel: the backend holds a per-user lock and 409s a second one.
  const runPreview = ({ selection: pick, sequence }) => {
    setRenderingView(pick.view);
    previewSimulation(scanId, pick.selections, CONSENT_VERSION)
      .then((result) => ({ result, error: null }))
      .catch((error) => ({ result: null, error }))
      .then(({ result, error }) => {
        const outcome = settle(queueRef.current, sequence);
        queueRef.current = outcome.state;
        if (outcome.accept) {
          if (error) setPreviewError(error.message);
          else { setPreviewError(''); setPreviews((current) => ({ ...current, [pick.view]: result })); }
        }
        if (outcome.start) runPreview(outcome.start);
        else setRenderingView(null);
      });
  };

  const requestPreview = (pick) => {
    if (simulationOff || simulationLocked || !scanId) return;
    const { state, start } = queueRequest(queueRef.current, pick);
    queueRef.current = state;
    if (start) runPreview(start);
  };

  /** Render one angle's stack, or clear its image when nothing is left in it. */
  const renderStack = (next, view) => {
    setStack(next);
    setSimulationId(null);
    if (!consented) return;
    if (count(next, view) === 0) {
      setPreviews((current) => ({ ...current, [view]: null }));
      setPreviewError('');
      return;
    }
    requestPreview({ view, selections: toRequest(next, view) });
  };

  const choosePreset = (preset) => {
    const view = preset.source_view === 'profile' ? 'profile' : 'front';
    const next = selectInStack(stack, view, preset.region, preset.id);
    // Unchanged means the region is locked or the stack is full — no flicker, no request.
    if (next === stack) return;
    setViewAngle(view);
    setLastTouched(preset.region);
    renderStack(next, view);
  };

  const chooseReferenceTarget = () => {
    setViewAngle('front');
    setLastTouched(region);
    setSimulationId(null);
    if (consented) requestPreview({ view: 'front', selections: [{ region, preset_id: `reference:${region}` }] });
  };

  const changeStack = (next, view, focusRegion) => {
    if (next === stack) return;
    if (focusRegion) setLastTouched(focusRegion);
    renderStack(next, view);
  };

  // Consent is separate from analysis consent by design, so nothing renders before it is
  // ticked. Withdrawing it stops the rendering and drops the images, but keeps the stack: the
  // point is to stop processing the face, not to punish the user by wiping their work.
  const acceptConsent = (checked) => {
    setConsented(checked);
    if (!checked) {
      clearPreviews();
      return;
    }
    for (const view of ['front', 'profile']) {
      if (count(stack, view) > 0 && !previews[view]) requestPreview({ view, selections: toRequest(stack, view) });
    }
  };

  // Changing region keeps the stack. That is the feature: a jaw shape has to survive a trip to
  // the chin tab, or nothing can ever be simulated in two places at once.
  //
  // Reference mode is the exception. It holds one region and states "your value → the published
  // mean", so keeping the previous region's image and numbers under the new region's heading
  // would put a specific, wrong claim on screen.
  const changeRegion = (next) => {
    setRegion(next);
    if (isReference) {
      setLastTouched(null);
      clearPreviews();
    }
  };

  const switchMode = (next) => {
    if (next === targetMode) return;
    const stacked = total(stack);
    // Reference mode claims the face reaches a published mean, which stops being true the
    // moment another region moves a point it shares. So that mode holds one region only.
    if (stacked > 0 && !window.confirm(isTh
      ? `การสลับโหมดจะล้างการจำลอง ${stacked} รายการที่เลือกไว้ ต้องการสลับหรือไม่`
      : `Switching modes clears the ${stacked} selection(s) you have made. Switch anyway?`)) return;
    setTargetMode(next);
    setStack(clearAll());
    setLastTouched(null);
    clearPreviews();
    setViewAngle('front');
    if (next === 'reference' && !REFERENCE_REGIONS.includes(region)) setRegion('nose');
  };

  const saveMutation = useMutation({
    mutationFn: () => createSimulation(scanId, isReference
      ? [{ region, preset_id: `reference:${region}` }]
      : toRequest(stack, activeView), CONSENT_VERSION),
    onSuccess: (result) => setSimulationId(result.id),
  });
  const saved = useQuery({
    queryKey: ['simulation', simulationId], queryFn: () => getSimulation(simulationId), enabled: Boolean(simulationId),
    // Same backoff as the scan poll. This view is always on screen while a save runs, so it
    // polls unconditionally — the ramp is what keeps a queued job from flooding the API.
    refetchInterval: statusPollInterval,
  });
  const finalResult = saved.data?.status === 'completed' ? saved.data : null;
  const beforeUrl = finalResult?.before_url || preview?.before_url || (activeView === 'front' ? scan.data?.front_url : null);
  const afterUrl = finalResult?.after_url || preview?.after_data_url;
  // A saved image is the same framing as the preview it came from, so its box still applies.
  // Aim at whichever region was touched last; it is the one the user is looking for.
  const focusBox = preview?.focus_boxes?.[lastTouched] || preview?.focus_box || null;
  const vipDaysLeft = daysRemaining(session.data?.vip_expires_at);

  // A stack is tied to one scan's landmarks, so it means nothing against a different scan.
  useEffect(() => {
    setStack(clearAll());
    setLastTouched(null);
    clearPreviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  const items = stack[activeView].map((item) => {
    const preset = presetsById.get(item.presetId);
    return { ...item, preset, procedure: preset?.related_procedures?.[0] };
  });
  const cappedRegions = (preview?.measurements || []).filter((item) => item.capped).map((item) => item.region);
  // Preview, save and the worker all fail with the same codes, so they read the same way.
  const failure = describeSimulationError(
    previewError || saveMutation.error?.message || (saved.data?.status === 'failed' ? saved.data.error_code || saved.data.error_message : ''),
    isTh,
    (id) => regionName(id, isTh),
  );

  if (!scanId && !scans.isPending) return <div className="simulation-empty"><ScanFace /><h1>{isTh ? 'ยังไม่มีผลสแกนสำหรับจำลอง' : 'No scan available'}</h1><button onClick={() => onNavigate('onboarding')}>{isTh ? 'เริ่มสแกนใบหน้า' : 'Start a scan'}</button></div>;
  if (scan.isPending || scans.isPending || session.isPending) return <div className="simulation-empty"><Activity className="capture-spin" />{isTh ? 'กำลังเปิดผลสแกน…' : 'Opening scan…'}</div>;
  if (scan.data?.age_band !== 'adult') return <div className="simulation-empty"><Lock /><h1>{isTh ? 'การจำลองสำหรับผู้มีอายุ 18 ปีขึ้นไป' : 'Simulation is for adults 18+'}</h1></div>;
  if (simulationLocked) return (
    <div className="simulation-empty">
      <Lock />
      <h1>{isTh ? 'การจำลองใบหน้าใช้ได้เมื่อมีสิทธิ์' : 'Simulation needs an entitlement'}</h1>
      <p>{isTh
        ? 'คะแนนวิเคราะห์และประวัติของคุณยังดูได้ตามปกติ ส่วนการสร้างภาพจำลองต้องมีสิทธิ์ก่อน'
        : 'Your analysis scores and history stay available. Generating simulated images needs an entitlement first.'}</p>
      <button onClick={() => onNavigate('settings')}><Ticket size={16} />{isTh ? 'กรอกโค้ดรับสิทธิ์' : 'Redeem a code'}</button>
      <button className="is-secondary" onClick={() => onNavigate('pricing')}>{isTh ? 'ดูแพ็กเกจ' : 'See plans'}</button>
    </div>
  );

  return (
    <div className="simulation-page">
      <header className="simulation-header">
        <button className="simulation-back" onClick={() => onNavigate('analysis')} aria-label={isTh ? 'กลับหน้าวิเคราะห์' : 'Back to analysis'}><ArrowLeft /></button>
        <div><span>LOCAL FACIAL SIMULATION</span><h1>{isTh ? 'ทดลองสัดส่วน ก่อนคุยกับแพทย์' : 'Explore proportions before a consultation'}</h1><p>{isTh ? 'ภาพเพื่อการศึกษา ไม่ใช่ผลลัพธ์ที่ทำนายได้' : 'Educational imagery, not a predicted outcome.'}</p></div>
        <div className="simulation-quota">
          <strong>∞</strong>
          <span>{isTh ? 'Preview คงเหลือ' : 'Previews left'}</span>
          {/* Answers "why is my quota back to 3?" before it happens. */}
          {vipDaysLeft !== null && <small>{isTh ? `สิทธิ์โค้ดเหลือ ${vipDaysLeft} วัน` : `Code access: ${vipDaysLeft}d left`}</small>}
        </div>
      </header>

      <nav className="simulation-mode-switch" aria-label={isTh ? 'วิธีกำหนดเป้าหมาย' : 'How the target is chosen'}>
        <button className={!isReference ? 'is-active' : ''} onClick={() => switchMode('preset')}>{isTh ? 'รูปทรง' : 'Shapes'}</button>
        <button className={isReference ? 'is-active' : ''} onClick={() => switchMode('reference')}>{isTh ? 'เทียบค่าอ้างอิง' : 'Compare to reference'}</button>
      </nav>

      <nav className="simulation-region-tabs" aria-label={isTh ? 'บริเวณใบหน้า' : 'Facial regions'}>
        {REGIONS.map(([id, th, en]) => {
          const unavailable = isReference && !REFERENCE_REGIONS.includes(id);
          // Which regions hold something, and which are locked, without opening every tab.
          // Said in the label as well as shown, so it does not depend on seeing a colour.
          const held = !isReference && Boolean(itemFor(stack, activeView, id));
          const locked = held && isLocked(stack, activeView, id);
          const state = locked ? (isTh ? ' — มีการจำลองและถูกล็อกไว้' : ' — simulated and locked')
            : held ? (isTh ? ' — มีการจำลองอยู่' : ' — simulated') : '';
          return (
            <button
              key={id}
              disabled={unavailable}
              title={unavailable ? (isTh ? 'ยังไม่มีค่าอ้างอิงสำหรับบริเวณนี้' : 'No reference data for this region yet') : undefined}
              className={`${region === id ? 'is-active' : ''}${held ? ' is-marked' : ''}`}
              aria-label={`${isTh ? th : en}${state}`}
              onClick={() => changeRegion(id)}
            >{isTh ? th : en}{locked ? <Lock size={12} aria-hidden="true" /> : held ? <b aria-hidden="true" /> : null}</button>
          );
        })}
      </nav>

      {simulationOff && (
        <p className="simulation-warning" role="status">{isTh
          ? 'ฟังก์ชันจำลองใบหน้าถูกปิดใช้งานอยู่ในขณะนี้ คุณยังดูผลวิเคราะห์ได้ตามปกติ'
          : 'Face simulation is switched off right now. Your analysis results are still available.'}</p>
      )}

      {isReference && !regionHasReference && (
        <p className="simulation-warning">{isTh ? 'บริเวณนี้ยังไม่มีค่าอ้างอิงจากงานวิจัย จึงคำนวณเป้าหมายให้ไม่ได้' : 'No published reference exists for this region, so no target can be computed.'}</p>
      )}

      <main className="simulation-layout">
        <section className="simulation-viewer-card">
          <div className="simulation-viewer-controls">
            <div className="simulation-angle-tabs" role="group" aria-label={isTh ? 'มุมกล้อง' : 'Camera angle'}>
              <button className={activeView === 'front' ? 'is-active' : ''} onClick={() => setViewAngle('front')}>{isTh ? 'มุมหน้าตรง' : 'Front'}</button>
              <button
                className={activeView === 'profile' ? 'is-active' : ''}
                disabled={!sideAvailable}
                title={sideAvailable ? undefined : (isTh ? 'การเปลี่ยนแปลงในบริเวณนี้ไม่ปรากฏในมุมด้านข้าง' : 'Changes in this region are not visible from the side')}
                onClick={() => setViewAngle('profile')}
              >{isTh ? 'มุมด้านข้าง' : 'Side'}</button>
            </div>
            <div className="simulation-viewer-actions">
              {/* Two axes, not one control: which image you are looking at, and how close. */}
              <button
                className={`simulation-zoom-toggle${zoom ? ' is-active' : ''}`}
                disabled={!focusBox}
                title={focusBox ? undefined : (isTh ? 'เลือกแบบก่อน แล้วจึงซูมไปที่บริเวณที่ปรับได้' : 'Choose a shape first, then the zoom has a region to aim at')}
                aria-pressed={zoom}
                onClick={() => setZoom((current) => !current)}
              >{zoom ? <ZoomIn /> : <Maximize2 />}{zoom ? (isTh ? 'ซูมบริเวณที่ปรับ' : 'Zoomed') : (isTh ? 'ดูทั้งใบหน้า' : 'Whole face')}</button>
              <div className="simulation-mode-tabs">
                {[['before', 'ก่อนปรับ', 'Before'], ['after', 'หลังปรับ', 'After'], ['compare', 'เปรียบเทียบ', 'Compare'], ['blink', 'สลับภาพ', 'Blink']].map(([id, th, en]) => <button key={id} className={mode === id ? 'is-active' : ''} onClick={() => setMode(id)}>{isTh ? th : en}</button>)}
              </div>
            </div>
          </div>
          {beforeUrl && afterUrl ? <FixedImageCompare beforeUrl={beforeUrl} afterUrl={afterUrl} focusBox={focusBox} zoom={zoom} mode={mode} isTh={isTh} />
            : beforeUrl ? <figure className="simulation-compare is-before"><img className="simulation-image-before" src={beforeUrl} alt={isTh ? 'ภาพก่อนปรับ' : 'Before'} /><figcaption><span>{isTh ? 'ภาพสแกนจริง' : 'Real scan'}</span></figcaption></figure>
              : <div className="simulation-placeholder">
                  {renderingView ? <Activity className="capture-spin" /> : <ScanFace />}
                  <strong>{renderingView ? (isTh ? 'กำลังสร้างภาพ…' : 'Rendering…')
                    : activeView === 'profile' ? (isTh ? 'เลือกแบบที่เห็นจากมุมด้านข้าง' : 'Choose a shape visible from the side')
                      : (isTh ? 'เลือกแบบแล้วเห็นผลทันที' : 'Pick a shape and see it immediately')}</strong>
                  <span>{isTh ? 'ไม่ต้องกดปุ่มสร้างอีกต่อไป' : 'No generate button needed.'}</span>
                </div>}
          {renderingView && beforeUrl && <p className="simulation-note" role="status">{isTh ? 'กำลังสร้างภาพ…' : 'Rendering…'}</p>}
          {!isReference && preview?.measurements?.map((item) => <div className="simulation-measurement" key={item.region || item.key}><span>{regionName(item.region, isTh)} · {item.key.replaceAll('_', ' ')}</span><strong>{item.before_ratio} → {item.target_ratio}</strong><b>{item.change_percent > 0 ? '+' : ''}{item.change_percent}%</b></div>)}
          {!isReference && cappedRegions.length > 0 && (
            <p className="simulation-note">{isTh
              ? `${cappedRegions.map((id) => regionName(id, isTh)).join(' และ ')} ขยับจุดร่วมกัน ภาพนี้จึงแสดงการปรับเท่าที่เพดานความปลอดภัยอนุญาต`
              : `${cappedRegions.map((id) => regionName(id, isTh)).join(' and ')} move points in common, so this image shows only as much change as the safety ceiling allows.`}</p>
          )}
          {target && <div className="simulation-measurement"><span>{isTh ? 'ค่าของคุณ → ค่าเฉลี่ยกลุ่มอ้างอิง' : 'Yours → reference mean'}</span><strong>{target.observed_ratio} → {target.reference_ratio}</strong><b>{target.change_percent > 0 ? '+' : ''}{target.change_percent}%</b></div>}
          {target?.capped && <p className="simulation-note">{isTh ? `ภาพนี้แสดงการปรับเท่าที่เพดานความปลอดภัยอนุญาต ไม่ใช่ทั้ง ${Math.abs(target.change_percent)}%` : `This image shows only as much change as the safety ceiling allows, not the full ${Math.abs(target.change_percent)}%.`}</p>}
        </section>

        <aside className="simulation-controls-card">
          <div><span className="simulation-step">01 · {isReference ? (isTh ? 'เป้าหมายจากงานวิจัย' : 'Research-derived target') : (isTh ? 'เลือกรูปทรง' : 'Choose shape')}</span><h2>{REGIONS.find(([id]) => id === region)?.[isTh ? 1 : 2]}</h2></div>

          <div className="simulation-consent"><ShieldCheck /><label><input type="checkbox" checked={consented} onChange={(event) => acceptConsent(event.target.checked)} />{isTh ? 'ยินยอมให้ประมวลผลภาพเพื่อสร้างภาพจำลองนี้' : 'I consent to processing for this simulation.'}</label></div>
          {!consented && <p className="simulation-note">{isTh ? 'ติ๊กยินยอมก่อน แล้วการกดเลือกแบบจะสร้างภาพให้ทันที' : 'Tick consent first; after that, choosing a shape renders it immediately.'}</p>}

          {/* Locking guards a selection; it does not change the image, so it never re-renders. */}
          {!isReference && items.length > 0 && (
            <StackPanel
              items={items}
              isTh={isTh}
              onToggleLock={(item) => setStack(toggleLock(stack, activeView, item.region))}
              onRemove={(item) => changeStack(removeFromStack(stack, activeView, item.region), activeView, null)}
              onClearUnlocked={() => changeStack(clearUnlocked(stack, activeView), activeView, null)}
            />
          )}

          {isReference ? (
            <div className="simulation-reference-card">
              <p>{isTh
                ? 'ระบบคำนวณจากสัดส่วนที่วัดได้จากใบหน้าของคุณ เทียบกับค่าเฉลี่ยที่ตีพิมพ์ของคนไทย 240 คน อายุ 18–35 ปี'
                : 'Computed from your own measured proportions against the published means of 240 Thai adults aged 18–35.'}</p>
              <button className="simulation-primary" disabled={!consented || !regionHasReference || Boolean(renderingView)} onClick={chooseReferenceTarget}>
                {renderingView ? <Activity className="capture-spin" /> : <ScanFace />}{isTh ? 'คำนวณและแสดงภาพ' : 'Compute and show'}
              </button>
              {target && (
                <dl className="simulation-reference-numbers">
                  {target.per_key_deviation.map((item) => (
                    <div key={item.key}>
                      <dt>{item.key.replaceAll('_', ' ')}</dt>
                      <dd><b>{item.observed}</b> {isTh ? 'เทียบกับ' : 'vs'} {item.reference} · z = {item.normalized_deviation > 0 ? '+' : ''}{item.normalized_deviation}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {previews.front?.already_near_reference && (
                <p className="simulation-note">{isTh
                  ? 'บริเวณนี้อยู่ใกล้ค่าเฉลี่ยมากจนการปรับภาพจะมองไม่เห็นความต่าง จึงไม่สร้างภาพ'
                  : 'This region already sits so close to the mean that a warp would be invisible, so no image was made.'}</p>
              )}
              {previews.front?.cohort_match === 'outside_reference_age_range' && (
                <p className="simulation-warning">{isTh ? 'คุณอยู่นอกช่วงอายุ 18–35 ปีของกลุ่มอ้างอิง' : 'You are outside the 18–35 reference age range.'}</p>
              )}
              {previews.front?.population_match === 'outside_reference_population' && (
                <p className="simulation-warning">{isTh ? 'ค่าอ้างอิงมาจากประชากรไทย ไม่ได้ปรับตามประเทศที่คุณเลือก' : 'The reference values are Thai and are not adjusted for the country you selected.'}</p>
              )}
            </div>
          ) : (
            <>
              <PresetGroup
                title={isTh ? 'เห็นจากมุมหน้าตรง' : 'Visible from the front'}
                presets={frontPresets} selectedId={itemFor(stack, 'front', region)?.presetId}
                locked={isLocked(stack, 'front', region)} full={count(stack, 'front') >= MAX_ITEMS && !itemFor(stack, 'front', region)}
                regionLabel={regionName(region, isTh)} isTh={isTh} onChoose={choosePreset}
              />
              {profilePresets.length > 0 && (
                <PresetGroup
                  title={isTh ? 'เห็นจากมุมด้านข้าง' : 'Visible from the side'}
                  note={hasProfiles ? '' : (isTh ? 'สแกนนี้ไม่มีภาพด้านข้าง' : 'This scan has no side photos')}
                  presets={profilePresets} selectedId={itemFor(stack, 'profile', region)?.presetId}
                  locked={isLocked(stack, 'profile', region)} full={count(stack, 'profile') >= MAX_ITEMS && !itemFor(stack, 'profile', region)}
                  regionLabel={regionName(region, isTh)} disabled={!hasProfiles} isTh={isTh} onChoose={choosePreset}
                />
              )}
              {profilePresets.length === 0 && (
                <p className="simulation-note">{isTh
                  ? 'การเปลี่ยนแปลงของบริเวณนี้เป็นความกว้างและตำแหน่ง ซึ่งมองไม่เห็นจากมุมด้านข้าง จึงมีเฉพาะมุมหน้าตรง'
                  : 'Changes here are widths and positions, which a side view cannot show, so only the front angle is offered.'}</p>
              )}
            </>
          )}

          {/* The angle is named, because one save stores the image of one angle. */}
          <button
            className="simulation-save"
            disabled={simulationOff || !preview || preview.already_near_reference || saveMutation.isPending || (saved.data && !['completed', 'failed'].includes(saved.data.status))}
            title={preview ? undefined : (isTh ? 'ยังไม่มีภาพให้บันทึกในมุมนี้' : 'There is no image to save for this angle yet')}
            onClick={() => saveMutation.mutate()}
          ><Save />{isReference ? (isTh ? 'บันทึกภาพเต็ม · เก็บ 30 วัน' : 'Save full image · 30 days')
            : activeView === 'profile' ? (isTh ? 'บันทึกภาพมุมด้านข้าง · เก็บ 30 วัน' : 'Save the side image · 30 days')
              : (isTh ? 'บันทึกภาพมุมหน้าตรง · เก็บ 30 วัน' : 'Save the front image · 30 days')}</button>
          {failure.text && (
            <p className="simulation-error" role="alert">
              {failure.text}
              {/* Offer to drop exactly the region the server named, unlocking it on the way out
                  so a locked one is not stuck in a stack that can never render. */}
              {failure.region && itemFor(stack, activeView, failure.region) && (
                <button onClick={() => changeStack(removeFromStack(unlock(stack, activeView, failure.region), activeView, failure.region), activeView, null)}>
                  {isTh ? `เอา ${regionName(failure.region, isTh)} ออก` : `Remove ${regionName(failure.region, isTh)}`}
                </button>
              )}
            </p>
          )}
          {preview?.related_procedures?.length > 0 && <div className="simulation-related"><span>{isTh ? 'หัตถการที่อาจเกี่ยวข้อง' : 'Related procedures'}</span><p>{preview.related_procedures.join(' · ')}</p><small>{isTh ? 'ไม่ใช่คำแนะนำการรักษาหรือการทำนายผลลัพธ์' : 'Not treatment advice or an outcome prediction.'}</small></div>}
        </aside>
      </main>
    </div>
  );
}

/**
 * What is in the image right now, and the lock that keeps it there.
 *
 * At the top of the panel rather than the bottom: this is the current state of the picture, not
 * a footnote about it. Announced politely so a screen reader hears rows being added and locked.
 */
function StackPanel({ items, isTh, onToggleLock, onRemove, onClearUnlocked }) {
  const unlockedCount = items.filter((item) => !item.locked).length;
  return (
    <div className="simulation-stack">
      <span className="simulation-group-title">{isTh ? 'กำลังจำลอง' : 'Currently simulating'}</span>
      <ul aria-live="polite">
        {items.map((item) => {
          const name = regionName(item.region, isTh);
          const shape = item.preset ? (isTh ? item.preset.name_th : item.preset.name_en) : item.presetId;
          return (
            <li key={item.region} className={`simulation-stack-row${item.locked ? ' is-locked' : ''}`}>
              <span>{name} · <strong>{shape}</strong></span>
              {item.procedure && <em className="simulation-procedure-chip">{item.procedure}</em>}
              <button
                className="simulation-lock"
                aria-pressed={item.locked}
                aria-label={item.locked ? (isTh ? `ปลดล็อก ${name}` : `Unlock ${name}`) : (isTh ? `ล็อกไม่ให้แก้ ${name}` : `Lock ${name} so it cannot be changed`)}
                onClick={() => onToggleLock(item)}
              >{item.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
              <button
                disabled={item.locked}
                title={item.locked ? (isTh ? `ปลดล็อก ${name} ก่อนจึงจะเอาออกได้` : `Unlock ${name} before removing it`) : undefined}
                aria-label={isTh ? `เอา ${name} ออก` : `Remove ${name}`}
                onClick={() => onRemove(item)}
              ><X size={14} /></button>
            </li>
          );
        })}
      </ul>
      {unlockedCount > 0 && items.length > unlockedCount && (
        <button className="simulation-stack-clear" onClick={onClearUnlocked}>{isTh ? 'ล้างที่ยังไม่ล็อก' : 'Clear the unlocked ones'}</button>
      )}
      <small>{isTh ? 'ไม่ใช่คำแนะนำการรักษาหรือการทำนายผลลัพธ์' : 'Not treatment advice or an outcome prediction.'}</small>
    </div>
  );
}

function PresetGroup({ title, note, presets, selectedId, locked, full, regionLabel, disabled, isTh, onChoose }) {
  const blockedReason = locked
    ? (isTh ? `ปลดล็อก ${regionLabel} ก่อนจึงจะเปลี่ยนแบบได้` : `Unlock ${regionLabel} before changing its shape`)
    : full ? (isTh ? `เลือกได้สูงสุด ${MAX_ITEMS} บริเวณต่อภาพ` : `Up to ${MAX_ITEMS} regions per image`) : '';
  return (
    <div className="simulation-preset-group">
      <span className="simulation-group-title">{title}{note && <small>{note}</small>}</span>
      <div className="simulation-preset-grid">
        {presets.map((preset, index) => (
          <button
            key={preset.id}
            disabled={disabled || Boolean(blockedReason)}
            title={blockedReason || undefined}
            className={selectedId === preset.id ? 'is-active' : ''}
            onClick={() => onChoose(preset)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{isTh ? preset.name_th : preset.name_en}</strong>
            {/* Names the treatment this shape belongs to, on the card where it is chosen. */}
            {preset.related_procedures?.[0] && <em className="simulation-procedure-chip">{preset.related_procedures[0]}</em>}
            {selectedId === preset.id && !disabled && <Check />}
          </button>
        ))}
      </div>
    </div>
  );
}
