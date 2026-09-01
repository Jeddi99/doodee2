import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, ArrowLeft, Check, Lock, Maximize2, MoveHorizontal, Save, ScanFace, ShieldCheck, Ticket, Unlock, X, ZoomIn } from 'lucide-react';
import { describeVisibility, focusTransform, NO_ZOOM, pollUntilSettled, SIMULATION_CONSENT_VERSION } from '@doodee/shared';
import { createSimulation, getProcedureCategories, getProcedures, getScan, getScans, getSession, getSimulation, previewSimulation } from '../lib/api';
import { statusPollInterval } from '../lib/pollInterval.js';
import { daysRemaining } from '../lib/promoCode';
import { describeSimulationError } from '../lib/simulationError';
import { emptyQueue, request as queueRequest, settle } from '../lib/previewQueue';
import {
  MAX_PROCEDURES, clearUnlockedProcedures, emptyProcedureStack,
  isProcedureLocked, procedureCount, procedureItem, removeProcedure, setProcedureIntensity,
  toProcedureRequest, toggleProcedure, toggleProcedureLock, unlockProcedure,
} from '../lib/procedureStack';
import { latestCraniofacialScan } from '../lib/latestScan';
import '../simulation.css';


const REGIONS = [
  ['eyes', 'ดวงตา', 'Eyes'], ['nose', 'จมูก', 'Nose'], ['lips', 'ริมฝีปาก', 'Lips'],
  ['cheeks', 'แก้ม', 'Cheeks'], ['jaw', 'กราม', 'Jaw'], ['chin', 'คาง', 'Chin'],
];

// Only these regions have published Thai means behind them; the rest stay on the preset tab
// until a source with comparable soft-tissue measurements is added to the backend.
const REFERENCE_REGIONS = ['nose', 'lips', 'chin'];

// The three photographs the fused model is built from, which are also the three it renders.
// Named separately from the images themselves because the user picks one to look at, and both
// profiles are real renders rather than one "side" — the face is not symmetric.
const ANGLES = [
  ['front', 'มุมหน้าตรง', 'Front'],
  ['left_profile', 'ด้านซ้าย', 'Left'],
  ['right_profile', 'ด้านขวา', 'Right'],
];

const CONSENT_VERSION = SIMULATION_CONSENT_VERSION;
const noPreviews = () => ({ front: null, left_profile: null, right_profile: null });
const regionName = (id, isTh) => REGIONS.find(([key]) => key === id)?.[isTh ? 1 : 2] ?? id;
const angleName = (id, isTh) => ANGLES.find(([key]) => key === id)?.[isTh ? 1 : 2] ?? id;

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
  const scanId = requestedScanId || latestCraniofacialScan(scans.data)?.id;
  const scan = useQuery({ queryKey: ['scan', scanId], queryFn: () => getScan(scanId), enabled: Boolean(scanId) });
  const session = useQuery({ queryKey: ['session'], queryFn: getSession });
  const [targetMode, setTargetMode] = useState('procedure'); // 'procedure' | 'reference'
  // Reference mode still works in the six coarse regions: it compares one measured ratio against
  // a published mean, and the means are published for regions, not for procedures.
  const [region, setRegion] = useState('nose');
  const [category, setCategory] = useState(null);
  // The whole catalog, not one category: the list of what is being simulated has to name
  // procedures from categories whose tab is not open.
  const procedures = useQuery({ queryKey: ['procedures'], queryFn: () => getProcedures() });
  const categories = useQuery({ queryKey: ['procedure-categories'], queryFn: getProcedureCategories });
  const catalog = useMemo(() => procedures.data || [], [procedures.data]);
  const proceduresById = useMemo(() => new Map(catalog.map((row) => [row.id, row])), [catalog]);
  const headings = useMemo(() => categories.data || [], [categories.data]);
  const activeCategory = category ?? headings[0]?.id ?? null;
  const visible = useMemo(
    () => catalog.filter((row) => row.category_id === activeCategory),
    [catalog, activeCategory],
  );
  const [consented, setConsented] = useState(false);
  const [mode, setMode] = useState('compare');
  // On by default: with no preview yet there is no region to aim at, so this reads as off until
  // one arrives, and no reset is needed when the selection changes.
  const [zoom, setZoom] = useState(true);
  const [simulationId, setSimulationId] = useState(null);

  // One stack, unlike the shape catalog's one-per-angle. A catalog procedure is a pipeline the
  // fused engine runs across all three views from a single model, so the angle chooses which
  // render comes back — it does not change what is being simulated.
  const [stack, setStack] = useState(emptyProcedureStack);
  const [previews, setPreviews] = useState(noPreviews);
  const [viewAngle, setViewAngle] = useState('front');
  const [renderingView, setRenderingView] = useState(null);
  const [previewError, setPreviewError] = useState('');
  // Which region to point the zoom at. The union of every touched region would frame the whole
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

  // A catalog procedure needs all three photographs — the model is built by fusing them, so a
  // missing one is not a degraded render but no render, and the backend refuses the stack with
  // `canonical_required`. Said here rather than discovered by clicking.
  const catalogAvailable = hasProfiles;
  const items = useMemo(
    () => stack.map((item) => ({ ...item, procedure: proceduresById.get(item.id) })),
    [stack, proceduresById],
  );
  // Which angles this stack actually shows something in. The catalog records it per procedure:
  // a chin projection is the whole point of the side view and nearly invisible from the front.
  const angleShowsStack = (view) => items.length === 0
    || items.some((item) => item.procedure?.views?.includes(view));
  const availableAngles = ANGLES.filter(([id]) => id === 'front' || hasProfiles);
  const activeView = availableAngles.some(([id]) => id === viewAngle) ? viewAngle : 'front';
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
    previewSimulation(scanId, pick.selections, CONSENT_VERSION, pick.requestView)
      .then((created) => created.already_near_reference
        ? created
        : pollUntilSettled(created, () => getSimulation(created.id)))
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

  /** Render the stack into one angle, or clear that angle's image when nothing is left. */
  const renderStack = (next, view) => {
    setStack(next);
    setSimulationId(null);
    if (!consented) return;
    if (procedureCount(next) === 0) {
      setPreviews(noPreviews());
      setPreviewError('');
      return;
    }
    requestPreview({ view, requestView: view, selections: toProcedureRequest(next) });
  };

  const chooseProcedure = (row) => {
    const next = toggleProcedure(stack, row.id);
    // Unchanged means the procedure is locked or the stack is full — no flicker, no request.
    if (next === stack) return;
    setLastTouched(row.regions?.[0] || null);
    renderStack(next, activeView);
  };

  const changeIntensity = (id, level) => {
    const next = setProcedureIntensity(stack, id, level);
    if (next === stack) return;
    setLastTouched(proceduresById.get(id)?.regions?.[0] || null);
    renderStack(next, activeView);
  };

  const chooseReferenceTarget = () => {
    setViewAngle('front');
    setLastTouched(region);
    setSimulationId(null);
    if (consented) requestPreview({ view: 'front', selections: [{ region, preset_id: `reference:${region}` }] });
  };

  const changeStack = (next) => {
    if (next === stack) return;
    renderStack(next, activeView);
  };

  /**
   * Look at the same stack from another angle.
   *
   * A render per angle, not one render reused: the fused model draws all three, but a preview
   * hands back only the one that was asked for. Angles already rendered are not asked for twice.
   */
  const changeAngle = (view) => {
    setViewAngle(view);
    if (isReference || !consented || previews[view] || procedureCount(stack) === 0) return;
    requestPreview({ view, requestView: view, selections: toProcedureRequest(stack) });
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
    if (!isReference && procedureCount(stack) > 0 && !previews[activeView]) {
      requestPreview({ view: activeView, requestView: activeView, selections: toProcedureRequest(stack) });
    }
  };

  // Changing category keeps the stack. That is the feature: a jaw procedure has to survive a
  // trip to the filler tab, or nothing can ever be simulated in two places at once.
  const changeCategory = (next) => setCategory(next);

  // Reference mode is the exception: it holds one region and states "your value → the published
  // mean", so keeping the previous region's image and numbers under the new region's heading
  // would put a specific, wrong claim on screen.
  const changeRegion = (next) => {
    setRegion(next);
    setLastTouched(null);
    clearPreviews();
  };

  const switchMode = (next) => {
    if (next === targetMode) return;
    const stacked = procedureCount(stack);
    // Reference mode claims the face reaches a published mean, which stops being true the
    // moment another region moves a point it shares. So that mode holds one region only.
    if (stacked > 0 && !window.confirm(isTh
      ? `การสลับโหมดจะล้างการจำลอง ${stacked} รายการที่เลือกไว้ ต้องการสลับหรือไม่`
      : `Switching modes clears the ${stacked} selection(s) you have made. Switch anyway?`)) return;
    setTargetMode(next);
    setStack(emptyProcedureStack());
    setLastTouched(null);
    clearPreviews();
    setViewAngle('front');
    if (next === 'reference' && !REFERENCE_REGIONS.includes(region)) setRegion('nose');
  };

  const saveMutation = useMutation({
    mutationFn: () => (isReference
      ? createSimulation(scanId, [{ region, preset_id: `reference:${region}` }], CONSENT_VERSION)
      : createSimulation(scanId, toProcedureRequest(stack), CONSENT_VERSION, activeView)),
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
  const afterUrl = finalResult?.after_url || preview?.after_url || preview?.after_data_url;
  // A saved image is the same framing as the preview it came from, so its box still applies.
  // Aim at whichever region was touched last; it is the one the user is looking for.
  const focusBox = preview?.focus_boxes?.[lastTouched] || preview?.focus_box || null;
  // How much of this angle actually moved. A procedure applied exactly as the catalog describes
  // it can still change almost nothing on a particular face, and that is indistinguishable from
  // a broken render unless the screen says which one it is.
  const visibility = describeVisibility(preview?.visibility, activeView);
  // Offered only when there is one thing in the picture and it has somewhere left to go: with a
  // stack, there is no telling which row is the faint one, and at level 5 there is no answer.
  const raisable = items.length === 1 && items[0].procedure?.intensity_levels && items[0].level < 5
    ? items[0] : null;
  const vipDaysLeft = daysRemaining(session.data?.vip_expires_at);

  // A stack is tied to one scan's landmarks, so it means nothing against a different scan.
  useEffect(() => {
    setStack(emptyProcedureStack());
    setLastTouched(null);
    clearPreviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  // Preview, save and the worker all fail with the same codes, so they read the same way.
  const failure = describeSimulationError(
    previewError || saveMutation.error?.message || (saved.data?.status === 'failed' ? saved.data.error_code || saved.data.error_message : ''),
    isTh,
    (id) => proceduresById.get(id)?.[isTh ? 'name_th' : 'name_en'] || regionName(id, isTh),
  );
  // The code's suffix is a procedure ref on this path, so it names a row in the stack directly.
  const failedItem = failure.region ? procedureItem(stack, failure.region) : null;

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
        <button className={!isReference ? 'is-active' : ''} onClick={() => switchMode('procedure')}>{isTh ? 'หัตถการ' : 'Procedures'}</button>
        <button className={isReference ? 'is-active' : ''} onClick={() => switchMode('reference')}>{isTh ? 'เทียบค่าอ้างอิง' : 'Compare to reference'}</button>
      </nav>

      {isReference ? (
        <nav className="simulation-region-tabs" aria-label={isTh ? 'บริเวณใบหน้า' : 'Facial regions'}>
          {REGIONS.map(([id, th, en]) => {
            const unavailable = !REFERENCE_REGIONS.includes(id);
            return (
              <button
                key={id}
                disabled={unavailable}
                title={unavailable ? (isTh ? 'ยังไม่มีค่าอ้างอิงสำหรับบริเวณนี้' : 'No reference data for this region yet') : undefined}
                className={region === id ? 'is-active' : ''}
                onClick={() => changeRegion(id)}
              >{isTh ? th : en}</button>
            );
          })}
        </nav>
      ) : (
        <nav className="simulation-region-tabs" aria-label={isTh ? 'หมวดหัตถการ' : 'Procedure categories'}>
          {headings.map((heading) => {
            // Which categories hold something, and which are locked, without opening every tab.
            // Said in the label as well as shown, so it does not depend on seeing a colour.
            const held = items.filter((item) => item.procedure?.category_id === heading.id);
            const locked = held.length > 0 && held.every((item) => item.locked);
            const state = locked ? (isTh ? ' — เลือกไว้และล็อกแล้ว' : ' — chosen and locked')
              : held.length > 0 ? (isTh ? ` — เลือกไว้ ${held.length} รายการ` : ` — ${held.length} chosen`) : '';
            return (
              <button
                key={heading.id}
                className={`${activeCategory === heading.id ? 'is-active' : ''}${held.length > 0 ? ' is-marked' : ''}`}
                aria-label={`${isTh ? heading.name_th : heading.name_en}${state}`}
                onClick={() => changeCategory(heading.id)}
              >{isTh ? heading.name_th : heading.name_en}{locked ? <Lock size={12} aria-hidden="true" /> : held.length > 0 ? <b aria-hidden="true" /> : null}</button>
            );
          })}
        </nav>
      )}

      {simulationOff && (
        <p className="simulation-warning" role="status">{isTh
          ? 'ฟังก์ชันจำลองใบหน้าถูกปิดใช้งานอยู่ในขณะนี้ คุณยังดูผลวิเคราะห์ได้ตามปกติ'
          : 'Face simulation is switched off right now. Your analysis results are still available.'}</p>
      )}

      {!isReference && !catalogAvailable && (
        <p className="simulation-warning">{isTh
          ? 'การจำลองหัตถการสร้างจากภาพทั้งสามมุมรวมกัน สแกนนี้ไม่มีภาพด้านข้าง จึงจำลองไม่ได้ ต้องสแกนแบบมาตรฐานใหม่'
          : 'Procedure simulation is built by fusing all three photographs. This scan has no side photos, so it cannot be simulated — a new standard scan is needed.'}</p>
      )}

      {isReference && !regionHasReference && (
        <p className="simulation-warning">{isTh ? 'บริเวณนี้ยังไม่มีค่าอ้างอิงจากงานวิจัย จึงคำนวณเป้าหมายให้ไม่ได้' : 'No published reference exists for this region, so no target can be computed.'}</p>
      )}

      <main className="simulation-layout">
        <section className="simulation-viewer-card">
          <div className="simulation-viewer-controls">
            <div className="simulation-angle-tabs" role="group" aria-label={isTh ? 'มุมกล้อง' : 'Camera angle'}>
              {availableAngles.map(([id, th, en]) => {
                const empty = !isReference && !angleShowsStack(id);
                return (
                  <button
                    key={id}
                    className={activeView === id ? 'is-active' : ''}
                    disabled={isReference && id !== 'front'}
                    title={empty ? (isTh ? 'สิ่งที่เลือกไว้ไม่ปรากฏในมุมนี้' : 'What you have chosen does not show in this view') : undefined}
                    onClick={() => changeAngle(id)}
                  >{isTh ? th : en}</button>
                );
              })}
            </div>
            <div className="simulation-viewer-actions">
              {/* Two axes, not one control: which image you are looking at, and how close. */}
              <button
                className={`simulation-zoom-toggle${zoom ? ' is-active' : ''}`}
                disabled={!focusBox}
                title={focusBox ? undefined : (isTh ? 'เลือกหัตถการก่อน แล้วจึงซูมไปที่บริเวณที่ปรับได้' : 'Choose a procedure first, then the zoom has a region to aim at')}
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
                    : (isTh ? 'เลือกหัตถการแล้วเห็นผลทันที' : 'Pick a procedure and see it immediately')}</strong>
                  <span>{isTh ? 'ไม่ต้องกดปุ่มสร้างอีกต่อไป' : 'No generate button needed.'}</span>
                </div>}
          {renderingView && beforeUrl && <p className="simulation-note" role="status">{isTh ? 'กำลังสร้างภาพ…' : 'Rendering…'}</p>}
          {!isReference && preview && (
            <VisibilityNote
              visibility={visibility}
              raisable={raisable}
              isTh={isTh}
              onRaise={() => changeIntensity(raisable.id, 5)}
            />
          )}
          {!isReference && <EvidenceList measurements={preview?.measurements} isTh={isTh} />}
          {/* A picture with no numbers beside it looks like numbers that failed to load. */}
          {!isReference && preview && preview.measurements?.length === 0 && (
            <p className="simulation-note">{isTh
              ? 'หัตถการนี้ทำงานกับพื้นผิวและสีผิว ยังไม่มีงานวิจัยที่ระบุปริมาณหรือระยะเป็นมิลลิเมตรไว้ จึงไม่มีบรรทัดตัวเลขกำกับภาพนี้'
              : 'This procedure works on skin surface and tone. No published study gives it a dose or a millimetre figure, so there are no numbers beside this image.'}</p>
          )}
          {target && <div className="simulation-measurement"><span>{isTh ? 'ค่าของคุณ → ค่าเฉลี่ยกลุ่มอ้างอิง' : 'Yours → reference mean'}</span><strong>{target.observed_ratio} → {target.reference_ratio}</strong><b>{target.change_percent > 0 ? '+' : ''}{target.change_percent}%</b></div>}
          {target?.capped && <p className="simulation-note">{isTh ? `ภาพนี้แสดงการปรับเท่าที่เพดานความปลอดภัยอนุญาต ไม่ใช่ทั้ง ${Math.abs(target.change_percent)}%` : `This image shows only as much change as the safety ceiling allows, not the full ${Math.abs(target.change_percent)}%.`}</p>}
        </section>

        <aside className="simulation-controls-card">
          <div>
            <span className="simulation-step">01 · {isReference ? (isTh ? 'เป้าหมายจากงานวิจัย' : 'Research-derived target') : (isTh ? 'เลือกหัตถการ' : 'Choose a procedure')}</span>
            <h2>{isReference
              ? REGIONS.find(([id]) => id === region)?.[isTh ? 1 : 2]
              : headings.find((heading) => heading.id === activeCategory)?.[isTh ? 'name_th' : 'name_en'] || ''}</h2>
          </div>

          <div className="simulation-consent"><ShieldCheck /><label><input type="checkbox" checked={consented} onChange={(event) => acceptConsent(event.target.checked)} />{isTh ? 'ยินยอมให้ประมวลผลภาพเพื่อสร้างภาพจำลองนี้' : 'I consent to processing for this simulation.'}</label></div>
          {!consented && <p className="simulation-note">{isTh ? 'ติ๊กยินยอมก่อน แล้วการกดเลือกหัตถการจะสร้างภาพให้ทันที' : 'Tick consent first; after that, choosing a procedure renders it immediately.'}</p>}

          {/* Locking guards a selection; it does not change the image, so it never re-renders. */}
          {!isReference && items.length > 0 && (
            <ProcedureStackPanel
              items={items}
              isTh={isTh}
              onIntensity={changeIntensity}
              onToggleLock={(item) => setStack(toggleProcedureLock(stack, item.id))}
              onRemove={(item) => changeStack(removeProcedure(stack, item.id))}
              onClearUnlocked={() => changeStack(clearUnlockedProcedures(stack))}
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
            <ProcedureGrid
              procedures={visible}
              stack={stack}
              disabled={!catalogAvailable}
              isTh={isTh}
              onChoose={chooseProcedure}
            />
          )}

          {/* The angle is named, because one save stores the image of one angle. */}
          <button
            className="simulation-save"
            disabled={simulationOff || !preview || preview.already_near_reference || saveMutation.isPending || (saved.data && !['completed', 'failed'].includes(saved.data.status))}
            title={preview ? undefined : (isTh ? 'ยังไม่มีภาพให้บันทึกในมุมนี้' : 'There is no image to save for this angle yet')}
            onClick={() => saveMutation.mutate()}
          ><Save />{isReference ? (isTh ? 'บันทึกภาพเต็ม · เก็บ 30 วัน' : 'Save full image · 30 days')
            : (isTh ? `บันทึกภาพ${angleName(activeView, true)} · เก็บ 30 วัน` : `Save the ${angleName(activeView, false).toLowerCase()} image · 30 days`)}</button>
          {failure.text && (
            <p className="simulation-error" role="alert">
              {failure.text}
              {/* Offer to drop exactly the procedure the server named, unlocking it on the way out
                  so a locked one is not stuck in a stack that can never render. */}
              {failedItem && (
                <button onClick={() => changeStack(removeProcedure(unlockProcedure(stack, failure.region), failure.region))}>
                  {isTh ? `เอา ${proceduresById.get(failure.region)?.name_th || failure.region} ออก` : `Remove ${proceduresById.get(failure.region)?.name_en || failure.region}`}
                </button>
              )}
            </p>
          )}
          {preview?.related_procedures?.length > 0 && <div className="simulation-related"><span>{isTh ? 'หัตถการที่อยู่ในภาพนี้' : 'In this image'}</span><p>{preview.related_procedures.join(' · ')}</p><small>{isTh ? 'ไม่ใช่คำแนะนำการรักษาหรือการทำนายผลลัพธ์' : 'Not treatment advice or an outcome prediction.'}</small></div>}
        </aside>
      </main>
    </div>
  );
}

/**
 * What is in the image right now, its intensity, and the lock that keeps it there.
 *
 * At the top of the panel rather than the bottom: this is the current state of the picture, not
 * a footnote about it. Announced politely so a screen reader hears rows being added and locked.
 *
 * The intensity lives here rather than on the catalog card because it only means something once
 * a procedure is in the picture — a level on a card nobody chose is a number with no effect.
 */
function ProcedureStackPanel({ items, isTh, onIntensity, onToggleLock, onRemove, onClearUnlocked }) {
  const unlockedCount = items.filter((item) => !item.locked).length;
  return (
    <div className="simulation-stack">
      <span className="simulation-group-title">{isTh ? 'กำลังจำลอง' : 'Currently simulating'}</span>
      <ul aria-live="polite">
        {items.map((item) => {
          const name = item.procedure ? (isTh ? item.procedure.name_th : item.procedure.name_en) : item.id;
          const levels = item.procedure?.intensity_levels;
          return (
            <li key={item.id} className={`simulation-stack-row${item.locked ? ' is-locked' : ''}`}>
              <span><strong>{name}</strong></span>
              {item.procedure?.technique && <em className="simulation-procedure-chip">{item.procedure.technique}</em>}
              {/* Only the rows the catalog says have a dose to vary. A fixed procedure showing a
                  slider would be offering a choice that changes nothing. */}
              {levels && (
                <span className="simulation-intensity" role="group" aria-label={isTh ? `ระดับของ ${name}` : `Intensity for ${name}`}>
                  {levels.map((level) => (
                    <button
                      key={level.level}
                      disabled={item.locked}
                      aria-pressed={item.level === level.level}
                      className={item.level === level.level ? 'is-active' : ''}
                      title={level.quantity_note_th || (isTh ? level.label_th : level.label_en)}
                      onClick={() => onIntensity(item.id, level.level)}
                    >{level.level}</button>
                  ))}
                </span>
              )}
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

/** One category's procedures. A card is a toggle: unlike a region's shape, two coexist. */
function ProcedureGrid({ procedures, stack, disabled, isTh, onChoose }) {
  const full = procedureCount(stack) >= MAX_PROCEDURES;
  if (procedures.length === 0) {
    return <p className="simulation-note">{isTh ? 'กำลังโหลดรายการหัตถการ…' : 'Loading procedures…'}</p>;
  }
  return (
    <div className="simulation-preset-group">
      <span className="simulation-group-title">
        {isTh ? 'หัตถการในหมวดนี้' : 'Procedures in this category'}
        <small>{isTh ? `เลือกได้สูงสุด ${MAX_PROCEDURES} รายการต่อภาพ` : `Up to ${MAX_PROCEDURES} per image`}</small>
      </span>
      <div className="simulation-preset-grid">
        {procedures.map((row, index) => {
          const chosen = Boolean(procedureItem(stack, row.id));
          const locked = isProcedureLocked(stack, row.id);
          const blockedReason = locked
            ? (isTh ? 'ปลดล็อกก่อนจึงจะเอาออกได้' : 'Unlock it before taking it out')
            : (!chosen && full)
              ? (isTh ? `เลือกได้สูงสุด ${MAX_PROCEDURES} รายการต่อภาพ` : `Up to ${MAX_PROCEDURES} per image`)
              : '';
          return (
            <button
              key={row.id}
              disabled={disabled || Boolean(blockedReason)}
              title={blockedReason || undefined}
              aria-pressed={chosen}
              className={chosen ? 'is-active' : ''}
              onClick={() => onChoose(row)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{isTh ? row.name_th : row.name_en}</strong>
              {/* Names the technique this row belongs to, on the card where it is chosen. */}
              {row.technique && <em className="simulation-procedure-chip">{row.technique}</em>}
              {chosen && !disabled && <Check />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Says out loud when a correct render is one the user cannot see.
 *
 * Of the 72 renderable procedures, 19 change under half a percent of the frame at the strongest
 * setting — flattening a fold on a face whose fold is shallow is close to a no-op. Silence there
 * reads as a broken feature, and the alternative fix is to raise the catalog's strengths until
 * every row looks like it did something, which is claiming a result the sources do not support.
 *
 * The percentage is shown rather than only a verdict: it is the evidence for the sentence, and a
 * person comparing two procedures can see that 0.1% and 3% are not the same kind of nothing.
 */
function VisibilityNote({ visibility, raisable, isTh, onRaise }) {
  if (visibility.level === 'clear' || visibility.level === 'unmeasured') return null;
  const amount = visibility.percent < 0.01
    ? (isTh ? 'แทบไม่ต่างเลย' : 'almost nothing')
    : (isTh ? `ต่างจากเดิม ${visibility.percent}% ของพื้นที่ภาพ` : `${visibility.percent}% of the frame`);
  if (visibility.level === 'elsewhere') {
    const other = angleName(visibility.elsewhere, isTh);
    return (
      <p className="simulation-note" role="status">{isTh
        ? `มุมนี้${amount} — หัตถการนี้เห็นได้ที่มุม${other} ลองสลับไปดู`
        : `This angle shows ${amount}. The change is visible in the ${other.toLowerCase()} view — switch to it.`}</p>
    );
  }
  return (
    <p className="simulation-note" role="status">{isTh
      ? `ภาพนี้${amount} ซึ่งน้อยจนแทบมองไม่ออก — ไม่ใช่ข้อผิดพลาด แต่แปลว่าบนใบหน้าของคุณ หัตถการนี้ทำให้เปลี่ยนไปน้อยมาก`
      : `This render differs by ${amount}, too little to see. Not an error: on your face, this procedure changes very little.`}
      {raisable && (
        <button onClick={onRaise}>{isTh ? 'ลองระดับแรงสุด' : 'Try the strongest setting'}</button>
      )}</p>
  );
}

/**
 * What the render actually did, in the units a clinic uses.
 *
 * The fused engine answers with a treatment record rather than a ratio: the procedure, the dose
 * and its unit, how far it moves tissue in millimetres, and whether a published study measured
 * that or it was derived from one. The status is shown for every line, including the ones that
 * say no study backs this — hiding those would leave a number on screen that looks as solid as
 * the measured ones. Where a source exists it is linked, because the claim is checkable.
 */
function EvidenceList({ measurements, isTh }) {
  if (!measurements?.length) return null;
  return (
    <div className="simulation-evidence">
      {measurements.map((item) => (
        <div className="simulation-measurement" key={item.key}>
          <span>{item.procedure || item.key}</span>
          <strong>{item.dose} {item.unit} · {item.mmShown ?? item.mm} {isTh ? 'มม.' : 'mm'}</strong>
          <b style={item.statusColour ? { color: item.statusColour } : undefined}>{item.statusLabel}</b>
          {item.extrapolated && item.extrapolatedNote && <small>{item.extrapolatedNote}</small>}
          {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">{item.sourceTitle}</a>}
        </div>
      ))}
    </div>
  );
}
