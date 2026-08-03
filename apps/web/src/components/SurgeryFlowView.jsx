import React, { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  ArrowLeft, BookOpen, Check, ChevronDown, ChevronRight, Crown, FileText, GripHorizontal,
  Globe2, History, ImageDown, LayoutGrid, Lock, Menu, MoveHorizontal, Palette, Printer,
  RotateCcw, ScanFace, Settings, SlidersHorizontal, Sparkles, X,
} from 'lucide-react';
import { PRESET_MODELS, PROFILE_DEMO_ASSETS } from '../data/mockData';
import {
  applyStudioPreset,
  buildDemoAnalysis,
  getMobileCategoryIds,
  getProfilePresetBlend,
  lockStudioPreset,
  nextSheetSnap,
  orderRecommendationsForAngle,
  rankStudioRecommendations,
  resetStudioCategory,
  setStudioAdjustment,
  snapSheetAfterDrag,
  STUDIO_CATEGORIES,
  STUDIO_SOURCES,
  ZERO_ADJUSTMENTS,
} from '../data/studio';

const layerStyle = (maskImage, transform = 'none', extra = {}) => ({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: '50% 50%',
  pointerEvents: 'none',
  userSelect: 'none',
  transform,
  transition: 'transform 180ms ease-out, filter 180ms ease-out, opacity 180ms ease-out',
  WebkitMaskImage: maskImage,
  maskImage,
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  ...extra,
});

const PROFILE_MASKS = {
  left: {
    jaw: 'radial-gradient(ellipse 27% 22% at 37% 63%, #000 43%, transparent 76%)',
    chin: 'radial-gradient(ellipse 17% 14% at 29% 62%, #000 42%, transparent 75%)',
    nose: 'radial-gradient(ellipse 14% 18% at 28% 50%, #000 43%, transparent 76%)',
  },
  right: {
    jaw: 'radial-gradient(ellipse 27% 22% at 63% 63%, #000 43%, transparent 76%)',
    chin: 'radial-gradient(ellipse 17% 14% at 71% 62%, #000 42%, transparent 75%)',
    nose: 'radial-gradient(ellipse 14% 18% at 72% 50%, #000 43%, transparent 76%)',
  },
};

function FaceVisual({
  image,
  adjustments,
  angle = 'front',
  profileAssets,
  profilePresetOrigins = {},
  compact = false,
  comparePosition = 50,
  setComparePosition,
  beforeLabel = 'BEFORE',
  afterLabel = 'AFTER',
  compareLabel = 'Compare original and adjusted face',
  mobileLite = false,
  mobileCompareMode = 'after',
  pressingBefore = false,
  onPreviewPointerDown,
  onPreviewPointerUp,
  stageRef,
}) {
  const value = (key) => adjustments[key] || 0;
  const eyeTilt = value('canthalTiltLift') * 0.035;
  const smileLift = value('lipCornerLift') + value('smileLift') * 0.65;
  const mouthWidth = value('cupidBowSharpness') + value('smileWidth') * 0.75;
  const frontContent = (
    <>
      <img
        src={image}
        alt={compact ? '' : 'Adjusted face preview'}
        draggable="false"
        style={layerStyle('none', 'none', {
          filter: `brightness(${1 + value('glassSkinGlow') * 0.001}) contrast(${1 - value('skinSmoothness') * 0.0007})`,
          WebkitMaskImage: 'none',
          maskImage: 'none',
        })}
      />

      <img src={image} alt="" aria-hidden="true" draggable="false" style={layerStyle(
        'radial-gradient(ellipse 31% 23% at 50% 61%, #000 48%, transparent 76%)',
        `scaleX(${1 - value('jawBotox') * 0.0009 - value('cheekboneReduction') * 0.00025 - value('chinTaper') * 0.00025 + value('jawDefinition') * 0.00015}) scaleY(${1 + value('chinLength') * 0.00075}) translateY(${-value('hifuLifting') * 0.012}px)`,
        { transformOrigin: '50% 54%', filter: `contrast(${1 + (value('jawDefinition') + value('chinProjection')) * 0.0008})` },
      )} />

      {[36, 64].map((x) => (
        <img key={`cheek-${x}`} src={image} alt="" aria-hidden="true" draggable="false" style={layerStyle(
          `radial-gradient(ellipse 15% 13% at ${x}% 51%, #000 42%, transparent 75%)`,
          `scale(${1 + value('cheekFiller') * 0.0008 - value('cheekboneReduction') * 0.00025}) translateY(${-value('nasolabialLift') * 0.012}px)`,
          { transformOrigin: `${x}% 51%` },
        )} />
      ))}

      {[39, 61].map((x, index) => (
        <img key={`brow-${x}`} src={image} alt="" aria-hidden="true" draggable="false" style={layerStyle(
          `radial-gradient(ellipse 14% 4% at ${x}% 36%, #000 38%, transparent 76%)`,
          `rotate(${index ? -value('browArch') * 0.018 : value('browArch') * 0.018}deg) scaleY(${1 + value('browThickness') * 0.0014}) translateY(${-value('browTailLift') * 0.006}px)`,
          { transformOrigin: `${x}% 36%`, filter: `contrast(${1 + value('browThickness') * 0.0015})` },
        )} />
      ))}

      {[42, 58].map((x, index) => (
        <img key={`eye-${x}`} src={image} alt="" aria-hidden="true" draggable="false" style={layerStyle(
          `radial-gradient(ellipse 13% 8% at ${x}% 41%, #000 42%, transparent 76%)`,
          `rotate(${index ? eyeTilt : -eyeTilt}deg) translateY(${-value('underEyeFiller') * 0.004}px)`,
          {
            transformOrigin: `${x}% 41%`,
            filter: `contrast(${1 + value('eyelidDepth') * 0.0012}) brightness(${1 + value('underEyeFiller') * 0.00035})`,
          },
        )} />
      ))}

      <img src={image} alt="" aria-hidden="true" draggable="false" style={layerStyle(
        'radial-gradient(ellipse 12% 14% at 50% 50%, #000 44%, transparent 77%)',
        `scaleX(${1 - value('noseWingSlim') * 0.00115}) scaleY(${1 + value('noseBridgeHeight') * 0.0004 + value('noseTipDrop') * 0.00065}) translateY(${value('noseTipDrop') * 0.012}px)`,
        { transformOrigin: '50% 46%', filter: `contrast(${1 + value('noseBridgeHeight') * 0.0008})` },
      )} />

      <img src={image} alt="" aria-hidden="true" draggable="false" style={layerStyle(
        'radial-gradient(ellipse 18% 8% at 50% 58%, #000 43%, transparent 77%)',
        `scaleX(${1 + mouthWidth * 0.00055}) scaleY(${1 + value('lipVolume') * 0.00115 + value('smileArc') * 0.00025}) translateY(${-smileLift * 0.007}px)`,
        {
          transformOrigin: '50% 58%',
          filter: `saturate(${1 + value('lipVolume') * 0.002}) contrast(${1 + value('cupidBowSharpness') * 0.001})`,
        },
      )} />
      <div className="studio-skin-glow" style={{ opacity: value('glassSkinGlow') / 125 }} />
    </>
  );
  const content = angle === 'front' ? frontContent : (
    <>
      <img
        src={image}
        alt={compact ? '' : 'Adjusted side profile preview'}
        draggable="false"
        loading={compact ? 'lazy' : undefined}
        style={layerStyle('none', 'none', { WebkitMaskImage: 'none', maskImage: 'none' })}
      />
      {['jaw', 'chin', 'nose'].map((categoryId) => {
        const presetId = profilePresetOrigins[categoryId];
        const src = profileAssets?.presets?.[categoryId]?.[presetId];
        if (!src) return null;
        return (
          <img
            key={categoryId}
            src={src}
            alt=""
            aria-hidden="true"
            draggable="false"
            loading="lazy"
            style={layerStyle(PROFILE_MASKS[angle][categoryId], 'none', {
              opacity: getProfilePresetBlend(categoryId, adjustments, presetId),
            })}
          />
        );
      })}
    </>
  );

  if (compact && mobileLite && angle === 'front') {
    const widthChange = (value('cheekFiller') - value('jawBotox') - value('noseWingSlim') * 0.35) * 0.00045;
    const heightChange = (value('chinLength') + value('noseTipDrop') * 0.35) * 0.0005;
    return (
      <div className="studio-mini-face studio-mini-face-lite">
        <img
          src={image}
          alt=""
          draggable="false"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scaleX(${1 + widthChange}) scaleY(${1 + heightChange})`,
            filter: `contrast(${1 + value('jawDefinition') * 0.0008}) saturate(${1 + value('lipVolume') * 0.001})`,
          }}
        />
      </div>
    );
  }

  if (compact) return <div className="studio-mini-face">{content}</div>;

  return (
    <div
      ref={stageRef}
      className={`studio-preview-stage mobile-show-${pressingBefore ? 'before' : mobileCompareMode}`}
      style={{ '--compare-position': `${comparePosition}%` }}
      onPointerDown={onPreviewPointerDown}
      onPointerUp={onPreviewPointerUp}
      onPointerCancel={onPreviewPointerUp}
      onPointerLeave={onPreviewPointerUp}
    >
      {content}
      <img className="studio-before-layer" src={image} alt="Original face" draggable="false" />
      <span className="studio-preview-label studio-preview-label-before">{beforeLabel}</span>
      <span className="studio-preview-label studio-preview-label-after">{afterLabel}</span>
      <div className="studio-compare-divider" aria-hidden="true"><MoveHorizontal size={17} /></div>
      <input
        className="studio-compare-range"
        type="range"
        min="0"
        max="100"
        value={comparePosition}
        onChange={(event) => setComparePosition(Number(event.target.value))}
        aria-label={compareLabel}
      />
    </div>
  );
}

function Drawer({ title, onClose, children, footer }) {
  return (
    <div className="studio-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="studio-drawer" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></header>
        <div className="studio-drawer-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}

export default function SurgeryFlowView({ lang, setLang, session, setSession, onNavigate }) {
  const isTh = lang === 'th';
  const t = (th, en) => isTh ? th : en;
  const [activeCategoryId, setActiveCategoryId] = useState('general');
  const [previewPresetId, setPreviewPresetId] = useState(null);
  const [comparePosition, setComparePosition] = useState(50);
  const [showSources, setShowSources] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [mobileIntakeStep, setMobileIntakeStep] = useState(0);
  const [sheetSnap, setSheetSnap] = useState('peek');
  const [sheetDragOffset, setSheetDragOffset] = useState(0);
  const [mobileCompareMode, setMobileCompareMode] = useState('after');
  const [viewAngle, setViewAngle] = useState('front');
  const [pressingBefore, setPressingBefore] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [showFunctionMenu, setShowFunctionMenu] = useState(false);
  const sheetDrag = useRef(null);
  const previewStageRef = useRef(null);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const activeCategory = STUDIO_CATEGORIES.find(({ id }) => id === activeCategoryId);
  const previewPreset = activeCategory.presets.find(([id]) => id === previewPresetId);
  const displayAdjustments = previewPreset
    ? applyStudioPreset(session.adjustments, activeCategory, previewPreset[2])
    : session.adjustments;
  const gender = session.model?.gender || PRESET_MODELS[0].gender;
  const profileAssets = PROFILE_DEMO_ASSETS[gender][viewAngle];
  const image = viewAngle === 'front'
    ? session.model?.avatar || PRESET_MODELS[0].avatar
    : profileAssets.current;
  const displayProfilePresetOrigins = previewPreset && ['nose', 'jaw', 'chin'].includes(activeCategory.id)
    ? { ...session.profilePresetOrigins, [activeCategory.id]: previewPreset[0] }
    : session.profilePresetOrigins;

  const patchSession = (patch) => setSession((current) => ({ ...current, ...patch }));
  const setIntake = (key, value) => setSession((current) => ({
    ...current,
    intake: { ...current.intake, [key]: value },
  }));

  const startScan = () => {
    const model = session.intake.demographic.endsWith('-male') ? PRESET_MODELS[1] : PRESET_MODELS[0];
    patchSession({ phase: 'scan', model, scanStep: 0 });
  };

  const captureAngle = async () => {
    if (session.scanStep < 2) {
      patchSession({ scanStep: session.scanStep + 1 });
      return;
    }
    await requestLandscapeMode();
    patchSession({
      phase: 'studio',
      analysis: buildDemoAnalysis(session.intake.goal),
      recommendations: rankStudioRecommendations(session.intake),
    });
  };

  const selectCategory = (id) => {
    setActiveCategoryId(id);
    setPreviewPresetId(null);
    setShowAllCategories(false);
  };

  const lockPreview = () => {
    if (!previewPreset) return;
    patchSession(lockStudioPreset({ ...session, adjustments: displayAdjustments }, activeCategory, previewPreset));
    setPreviewPresetId(null);
  };

  const changeSlider = (key, nextValue) => {
    const profilePresetOrigins = previewPreset && ['nose', 'jaw', 'chin'].includes(activeCategory.id)
      ? { ...session.profilePresetOrigins, [activeCategory.id]: previewPreset[0] }
      : session.profilePresetOrigins;
    setPreviewPresetId(null);
    patchSession(setStudioAdjustment({
      ...session,
      adjustments: displayAdjustments,
      profilePresetOrigins,
    }, activeCategory, key, nextValue));
  };

  const resetCategory = () => {
    const lockedPresets = { ...session.lockedPresets };
    const profilePresetOrigins = { ...session.profilePresetOrigins };
    delete lockedPresets[activeCategory.id];
    delete profilePresetOrigins[activeCategory.id];
    if (activeCategory.composite) {
      delete lockedPresets.cheeks;
      delete lockedPresets.jaw;
      delete lockedPresets.chin;
      delete profilePresetOrigins.jaw;
      delete profilePresetOrigins.chin;
    }
    patchSession({
      adjustments: resetStudioCategory(session.adjustments, activeCategory),
      lockedPresets,
      profilePresetOrigins,
      compositeOrigin: activeCategory.composite ? null : session.compositeOrigin,
    });
    setPreviewPresetId(null);
  };

  const resetAll = () => {
    patchSession({
      adjustments: { ...ZERO_ADJUSTMENTS },
      lockedPresets: {},
      profilePresetOrigins: {},
      compositeOrigin: null,
    });
    setPreviewPresetId(null);
  };

  const showSaveNotice = (message) => {
    setSaveNotice(message);
    window.setTimeout(() => setSaveNotice(''), 2400);
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const savePreviewImage = async () => {
    if (!previewStageRef.current || isSavingImage) return;
    setIsSavingImage(true);
    try {
      const dataUrl = await toPng(previewStageRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#eeeaf7',
      });
      const response = await fetch(dataUrl);
      downloadBlob(await response.blob(), `doodee-preview-${Date.now()}.png`);
      showSaveNotice(t('บันทึกรูป PNG แล้ว', 'PNG image saved'));
    } catch {
      showSaveNotice(t('บันทึกรูปไม่สำเร็จ กรุณาลองอีกครั้ง', 'Could not save the image. Please try again.'));
    } finally {
      setIsSavingImage(false);
    }
  };

  const printAdjustmentReport = async () => {
    const reportWindow = window.open('', '_blank', 'width=900,height=720');
    if (!reportWindow) {
      showSaveNotice(t('กรุณาอนุญาตหน้าต่างใหม่เพื่อสร้าง PDF', 'Please allow pop-ups to create the PDF.'));
      return;
    }
    reportWindow.opener = null;
    reportWindow.document.write(`<p style="font-family:sans-serif;padding:32px">${t('กำลังสร้างรายงาน…', 'Generating report…')}</p>`);

    const escapeHtml = (value) => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

    let previewDataUrl = '';
    try {
      previewDataUrl = await toPng(previewStageRef.current, {
        cacheBust: true,
        pixelRatio: 1.5,
        backgroundColor: '#eeeaf7',
      });
    } catch {
      // The report remains useful if a browser cannot rasterize the preview.
    }

    const lockedRows = Object.entries(session.lockedPresets).map(([categoryId, presetId]) => {
      const category = STUDIO_CATEGORIES.find((item) => item.id === categoryId);
      const preset = category?.presets.find(([id]) => id === presetId);
      return `<tr><td>${escapeHtml(isTh ? category?.label : category?.labelEn || categoryId)}</td><td>${escapeHtml(preset ? (isTh ? preset[1] : preset[3]) : t('ปรับเอง', 'Custom'))}</td></tr>`;
    }).join('');

    const adjustmentRows = Object.entries(session.adjustments)
      .filter(([, value]) => Number(value) !== 0)
      .map(([key, value]) => {
        const category = STUDIO_CATEGORIES.find((item) => item.sliders.some(([sliderKey]) => sliderKey === key));
        const slider = category?.sliders.find(([sliderKey]) => sliderKey === key);
        return `<tr><td>${escapeHtml(slider ? (isTh ? slider[1] : slider[2]) : key)}</td><td>${escapeHtml(value)}%</td></tr>`;
      }).join('');

    const recommendationRows = session.recommendations.slice(0, 3).map((item, index) => `
      <li><b>${index + 1}. ${escapeHtml(isTh ? item.th : item.en)}</b><span>${escapeHtml(isTh ? item.whyTh : item.whyEn)}</span></li>
    `).join('');
    const angleLabel = { front: t('หน้าตรง', 'Front'), left: t('ด้านซ้าย', 'Left profile'), right: t('ด้านขวา', 'Right profile') }[viewAngle];
    const generatedAt = new Intl.DateTimeFormat(isTh ? 'th-TH' : 'en', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());

    reportWindow.document.open();
    reportWindow.document.write(`<!doctype html>
      <html lang="${isTh ? 'th' : 'en'}"><head><meta charset="utf-8"><title>DOODEE Customization Report</title>
      <style>
        *{box-sizing:border-box}body{margin:0;background:#f4f0fa;color:#2a2038;font-family:"Noto Sans Thai","Segoe UI",Tahoma,sans-serif}
        main{width:210mm;min-height:297mm;margin:0 auto;padding:18mm;background:#fff}
        header{display:flex;justify-content:space-between;gap:24px;padding-bottom:14px;border-bottom:2px solid #7457d7}
        h1{margin:3px 0 0;font-size:24px}header p{margin:4px 0 0;color:#756a82;font-size:12px}
        .brand{color:#7457d7;font-size:11px;font-weight:800;letter-spacing:.12em}.meta{text-align:right;font-size:11px;color:#766c82}
        .preview{margin:18px 0;padding:10px;border:1px solid #e5dcf4;border-radius:16px;background:#f7f3ff}
        .preview img{display:block;width:100%;max-height:112mm;object-fit:contain;border-radius:11px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{padding:14px;border:1px solid #e8e0f3;border-radius:14px}
        h2{margin:0 0 10px;color:#4d369c;font-size:15px}table{width:100%;border-collapse:collapse;font-size:11px}
        td{padding:7px 4px;border-bottom:1px solid #eee8f5}td:last-child{text-align:right;font-weight:700;color:#5d46a8}
        ul{margin:0;padding:0;list-style:none}li{padding:8px 0;border-bottom:1px solid #eee8f5;font-size:11px}li b,li span{display:block}li span{margin-top:3px;color:#786d84}
        footer{margin-top:16px;padding-top:10px;border-top:1px solid #e8e0f3;color:#84798f;font-size:9px;line-height:1.6}
        @media print{body{background:#fff}main{margin:0;padding:14mm} @page{size:A4;margin:0}}
      </style></head><body><main>
        <header><div><span class="brand">DOODEE · FACE CUSTOMIZER</span><h1>${escapeHtml(t('รายงานรายละเอียดการปรับแต่ง', 'Customization detail report'))}</h1><p>${escapeHtml(t('สรุปภาพ ทรงที่เลือก และค่าการปรับสำหรับใช้อ้างอิง', 'Preview, selected shapes, and adjustment values for reference'))}</p></div>
        <div class="meta">${escapeHtml(generatedAt)}<br>${escapeHtml(t('มุมมอง', 'View'))}: ${escapeHtml(angleLabel)}</div></header>
        ${previewDataUrl ? `<div class="preview"><img src="${previewDataUrl}" alt=""></div>` : ''}
        <div class="grid"><section class="card"><h2>${escapeHtml(t('ทรงที่ล็อก', 'Locked shapes'))}</h2><table>${lockedRows || `<tr><td>${escapeHtml(t('ยังไม่มีทรงที่ล็อก', 'No locked shapes'))}</td><td>—</td></tr>`}</table></section>
        <section class="card"><h2>${escapeHtml(t('ค่าที่ปรับ', 'Adjustment values'))}</h2><table>${adjustmentRows || `<tr><td>${escapeHtml(t('ยังไม่มีค่าที่ปรับ', 'No adjustments'))}</td><td>0%</td></tr>`}</table></section></div>
        <section class="card" style="margin-top:14px"><h2>${escapeHtml(t('คำแนะนำที่ควรเริ่มก่อน', 'Top guidance'))}</h2><ul>${recommendationRows}</ul></section>
        <footer>${escapeHtml(t('เอกสารนี้เป็นภาพจำลองและสรุปความต้องการเพื่อใช้ประกอบการปรึกษา ไม่ใช่คำวินิจฉัยหรือการรับประกันผลลัพธ์ทางการแพทย์', 'This document is a visualization and preference summary for consultation. It is not a diagnosis or a guarantee of medical outcomes.'))}</footer>
      </main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));</script></body></html>`);
    reportWindow.document.close();
    showSaveNotice(t('เปิดรายงานแล้ว เลือก “บันทึกเป็น PDF” ได้เลย', 'Report opened. Choose “Save as PDF”.'));
  };

  const phaseIndex = { intake: 0, scan: 1, studio: 2 }[session.phase];
  const phases = [
    [t('เป้าหมาย', 'Goals'), t('6 คำถาม', '6 questions')],
    [t('สแกน', 'Scan'), t('3 มุม', '3 angles')],
    [t('วิเคราะห์และปรับ', 'Analyze & refine'), t('13 หมวด', '13 categories')],
  ];
  const mobileCategoryIds = getMobileCategoryIds(
    activeCategoryId,
    session.recommendations,
    session.lockedPresets,
    5,
    viewAngle,
  );
  const visibleRecommendations = orderRecommendationsForAngle(session.recommendations, viewAngle);
  const beginSheetDrag = (event) => {
    sheetDrag.current = { startY: event.clientY, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveSheet = (event) => {
    if (!sheetDrag.current) return;
    setSheetDragOffset(Math.max(-180, Math.min(180, event.clientY - sheetDrag.current.startY)));
  };
  const endSheetDrag = (event) => {
    if (!sheetDrag.current) return;
    const deltaY = event.clientY - sheetDrag.current.startY;
    setSheetSnap(Math.abs(deltaY) < 8
      ? nextSheetSnap(sheetSnap)
      : snapSheetAfterDrag(sheetSnap, deltaY, window.innerHeight));
    setSheetDragOffset(0);
    sheetDrag.current = null;
  };

  const requestLandscapeMode = async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      if (screen.orientation?.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch {
      // Orientation locking is optional; the rotate gate remains visible until
      // the user physically turns the device.
    }
  };

  const landscapeGate = (
    <div className="studio-rotate-gate" role="status" aria-live="polite">
      <div className="studio-rotate-device" aria-hidden="true"><span /></div>
      <div>
        <span className="studio-rotate-eyebrow">{t('โหมดวิเคราะห์และปรับใบหน้า', 'FACE ANALYSIS STUDIO')}</span>
        <h2>{t('หมุนโทรศัพท์เป็นแนวนอน', 'Rotate your phone')}</h2>
        <p>{t('หลังเริ่มสแกน ระบบต้องใช้พื้นที่แนวนอนเพื่อให้เห็นใบหน้าและเครื่องมือพร้อมกัน', 'After scanning starts, landscape space keeps the face and tools visible together.')}</p>
        <button type="button" onClick={requestLandscapeMode}>
          <MoveHorizontal size={18} />
          {t('เปิดแบบเต็มจอแนวนอน', 'Open landscape fullscreen')}
        </button>
        <small>{t('หรือปิดล็อกการหมุนหน้าจอ แล้วหมุนโทรศัพท์ด้วยตนเอง', 'Or disable rotation lock, then turn your phone manually.')}</small>
      </div>
    </div>
  );

  const leaveStudio = async (route) => {
    try {
      if (screen.orientation?.lock) {
        await screen.orientation.lock(route === 'tryon' ? 'landscape' : 'portrait-primary');
      } else {
        screen.orientation?.unlock?.();
      }
    } catch {
      // The portrait gate guides users on browsers without orientation locking.
    }
    onNavigate?.(route);
  };

  if (session.phase === 'intake') {
    const fields = [
      ['age', t('ช่วงอายุ', 'Age range'), [['under18', t('ต่ำกว่า 18 ปี', 'Under 18')], ['18-24', '18–24'], ['25-34', '25–34'], ['35plus', '35+']]],
      ['demographic', t('บริบทและโมเดลตัวอย่าง', 'Context and demo model'), [['thai-female', t('ไทย / โมเดลหญิง', 'Thai / female model')], ['thai-male', t('ไทย / โมเดลชาย', 'Thai / male model')], ['global-female', t('สากล / โมเดลหญิง', 'Global / female model')], ['global-male', t('สากล / โมเดลชาย', 'Global / male model')]]],
      ['goal', t('เป้าหมายสไตล์', 'Style goal'), [['natural', t('ธรรมชาติ', 'Natural')], ['soft', t('ละมุน', 'Soft')], ['defined', t('คมชัด', 'Defined')], ['balanced', t('สมดุล', 'Balanced')]]],
      ['budget', t('งบประมาณ', 'Budget'), [['low', t('ประหยัด', 'Low')], ['medium', t('ปานกลาง', 'Medium')], ['high', t('ยืดหยุ่น', 'Flexible')]]],
      ['downtime', t('เวลาพักฟื้น', 'Downtime'), [['none', t('ไม่มี', 'None')], ['short', t('1–3 วัน', '1–3 days')], ['long', t('มากกว่า 3 วัน', 'More than 3 days')]]],
      ['treatment', t('ระดับที่ยอมรับ', 'Treatment openness'), [['self-care', t('ดูแลตนเองเท่านั้น', 'Self-care only')], ['non-invasive', t('ไม่ผ่าตัด', 'Non-surgical')], ['surgery', t('ศัลยกรรม', 'Surgery')], ['all', t('ดูทุกทางเลือก', 'All options')]]],
    ];
    const [mobileKey, mobileLabel, mobileOptions] = fields[mobileIntakeStep];
    return (
      <div className="studio-workspace studio-onboarding">
        <header className="studio-header">
          <div><span><Sparkles size={17} /> FACE STUDIO · DEMO</span><h1>{t('วิเคราะห์และออกแบบใบหน้าในหน้าเดียว', 'Analyze and design your face in one workspace')}</h1><p>{t('เลือกเป้าหมายก่อน เพื่อให้คำแนะนำสัมพันธ์กับสิ่งที่คุณต้องการ', 'Choose your goals first so recommendations reflect your preferences.')}</p></div>
        </header>
        <div className="studio-phase-bar">{phases.map(([name, sub], index) => <div key={name} className={index === phaseIndex ? 'is-active' : ''}><b>{index + 1}</b><span><strong>{name}</strong><small>{sub}</small></span></div>)}</div>
        <section className="studio-intake-card">
          <div className="studio-intake-copy"><span>{t('เริ่มจากคุณ ไม่ใช่มาตรฐานเดียว', 'Start with you, not one ideal')}</span><h2>{t('คำแนะนำแบบมีบริบท', 'Context-aware recommendations')}</h2><p>{t('ข้อมูลนี้ใช้เฉพาะ session เพื่อจัดลำดับตัวเลือกใน prototype และจะหายเมื่อรีเฟรช', 'These answers stay in this session and only rank options in the prototype.')}</p></div>
          <div className="studio-intake-grid studio-intake-desktop">
            {fields.map(([key, label, options]) => (
              <label key={key}><span>{label}</span><select value={session.intake[key]} onChange={(event) => setIntake(key, event.target.value)}>{options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
            ))}
          </div>
          <div className="studio-intake-mobile">
            <div className="studio-intake-progress"><span>{mobileIntakeStep + 1} / {fields.length}</span><i style={{ '--intake-progress': `${((mobileIntakeStep + 1) / fields.length) * 100}%` }} /></div>
            <h3>{mobileLabel}</h3>
            <div className="studio-intake-options">
              {mobileOptions.map(([value, name]) => (
                <button key={value} type="button" className={session.intake[mobileKey] === value ? 'is-selected' : ''} onClick={() => setIntake(mobileKey, value)}>
                  <span>{name}</span>{session.intake[mobileKey] === value && <Check size={17} />}
                </button>
              ))}
            </div>
            <div className="studio-intake-mobile-actions">
              <button type="button" disabled={mobileIntakeStep === 0} onClick={() => setMobileIntakeStep((step) => Math.max(0, step - 1))}><ArrowLeft size={17} /> {t('ย้อนกลับ', 'Back')}</button>
              <button className="btn-brand-primary" type="button" onClick={() => mobileIntakeStep === fields.length - 1 ? startScan() : setMobileIntakeStep((step) => step + 1)}>
                {mobileIntakeStep === fields.length - 1 ? t('เริ่มสแกน', 'Start scan') : t('ถัดไป', 'Continue')} <ChevronRight size={17} />
              </button>
            </div>
          </div>
          {session.intake.age === 'under18' && <p className="studio-minor-note">{t('ผู้ใช้อายุต่ำกว่า 18 ปีจะได้รับเฉพาะคำแนะนำดูแลตนเอง เมกอัป และภาพรวมเท่านั้น', 'Users under 18 only receive self-care, makeup, and general guidance.')}</p>}
          <button className="btn-brand-primary studio-next studio-intake-desktop" type="button" onClick={startScan}>{t('เริ่มสแกนตัวอย่าง', 'Start demo scan')} <ChevronRight size={18} /></button>
        </section>
      </div>
    );
  }

  if (session.phase === 'scan') {
    const scanSteps = [
      ['front', t('หน้าตรง', 'Front')],
      ['left', t('ด้านซ้าย', 'Left profile')],
      ['right', t('ด้านขวา', 'Right profile')],
    ];
    const [angleId, angleLabel] = scanSteps[session.scanStep];
    const assets = PROFILE_DEMO_ASSETS[session.model.gender];
    return (
      <div className="studio-workspace studio-scan">
        <header className="studio-header"><div><span><ScanFace size={17} /> {t('สแกนตัวอย่าง 3 มุม', '3-angle demo scan')}</span><h1>{t('จัดเก็บภาพสำหรับวิเคราะห์', 'Capture the analysis views')}</h1><p>{t('เป็นการจำลองด้วยโมเดลตัวอย่าง ไม่ได้วิเคราะห์ภาพจริง', 'This uses an aligned demo model and does not analyze a real photo.')}</p></div></header>
        <section className="studio-scan-card studio-scan-card-unified">
          <div className="studio-phase-bar studio-scan-phase-bar">{phases.map(([name, sub], index) => <div key={name} className={index === phaseIndex ? 'is-active' : index < phaseIndex ? 'is-complete' : ''}><b>{index < phaseIndex ? <Check size={14} /> : index + 1}</b><span><strong>{name}</strong><small>{sub}</small></span></div>)}</div>
          <div className="studio-scan-steps">{scanSteps.map(([id, label], index) => <div key={id} className={index === session.scanStep ? 'is-active' : index < session.scanStep ? 'is-complete' : ''}><b>{index < session.scanStep ? <Check size={14} /> : index + 1}</b><span>{label}</span></div>)}</div>
          <div className="studio-scan-frame">
            <img className="studio-scan-frame-backdrop" src={assets[angleId].current} alt="" aria-hidden="true" />
            <img className="studio-scan-frame-subject" src={assets[angleId].current} alt={angleLabel} />
            <span>{angleLabel}</span>
            <i />
            <button className="studio-scan-capture-button" type="button" onClick={captureAngle}>
              <span>{session.scanStep === 2 ? t('วิเคราะห์และเปิด Studio', 'Analyze and open Studio') : t('บันทึกมุมนี้', 'Capture this angle')}</span>
              <ChevronRight size={18} />
            </button>
          </div>
        </section>
      </div>
    );
  }

  const analysis = session.analysis[activeCategory.id] || [];
  const visiblePresets = session.intake.age === 'under18'
    ? activeCategory.presets.filter((item) => item[4] === 'self-care')
    : activeCategory.presets;
  const lockedId = session.lockedPresets[activeCategory.id];
  const lockedLabel = lockedId === 'custom'
    ? t('ปรับเอง', 'Custom')
    : lockedId === 'faceShape'
      ? t(`จาก ${session.compositeOrigin?.base || 'ทรงหน้า'}`, `From ${session.compositeOrigin?.base || 'face shape'}`)
      : activeCategory.presets.find(([id]) => id === lockedId)?.[isTh ? 1 : 3];
  const viewAngles = [
    ['front', t('หน้าตรง', 'Front')],
    ['left', t('ด้านซ้าย', 'Left')],
    ['right', t('ด้านขวา', 'Right')],
  ];
  const studioNavItems = [
    ['tryon', t('แต่งหน้า', 'Try-On'), Palette],
    ['history', t('ประวัติ', 'History'), History],
    ['pricing', t('แพ็กเกจ', 'Plans'), Crown],
    ['settings', t('ตั้งค่า', 'Settings'), Settings],
  ];
  const functionMenuItems = [
    ['surgery', t('ปรับแต่งใบหน้า', 'Face Customizer'), SlidersHorizontal],
    ...studioNavItems,
  ];

  const selectAppFunction = (route) => {
    setShowFunctionMenu(false);
    if (route !== 'surgery') leaveStudio(route);
  };

  return (
    <div className="studio-workspace studio-editor">
      {landscapeGate}

      <nav
        className="studio-editor-nav"
        aria-label={t('เมนูฟังก์ชันของแอป', 'App function menu')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setShowFunctionMenu(false);
        }}
      >
        <div className="studio-function-menu-shell">
          <button
            className="studio-editor-back studio-function-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={showFunctionMenu}
            onClick={() => setShowFunctionMenu((value) => !value)}
          >
            <Menu size={16} />
            <span>{t('เมนูฟังก์ชัน', 'Functions')}</span>
            <ChevronDown className={showFunctionMenu ? 'is-open' : ''} size={14} />
          </button>
          {showFunctionMenu && (
            <div className="studio-function-menu" role="menu">
              <span className="studio-function-menu-label">{t('เลือกฟังก์ชันของแอป', 'Choose an app function')}</span>
              {functionMenuItems.map(([route, label, Icon]) => (
                <button
                  key={route}
                  type="button"
                  role="menuitem"
                  className={route === 'surgery' ? 'is-active' : ''}
                  onClick={() => selectAppFunction(route)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  {route === 'surgery' && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <strong>{t('ปรับแต่งใบหน้า', 'Face Customizer')}</strong>
        <div className="studio-inline-language" role="group" aria-label={t('เปลี่ยนภาษา', 'Change language')}>
          <Globe2 size={15} />
          <button type="button" className={lang === 'th' ? 'is-active' : ''} aria-pressed={lang === 'th'} onClick={() => setLang?.('th')}>TH</button>
          <span>/</span>
          <button type="button" className={lang === 'en' ? 'is-active' : ''} aria-pressed={lang === 'en'} onClick={() => setLang?.('en')}>EN</button>
        </div>
      </nav>

      <header className="studio-header">
        <div><span><Sparkles size={17} /> {t('คำแนะนำอัจฉริยะ · DEMO', 'SMART GUIDANCE · DEMO')}</span><h1>{t('วิเคราะห์และปรับใบหน้า', 'Face analysis and refinement')}</h1><p>{t('ไม่มีคะแนนความสวย และไม่ใช่คำวินิจฉัยหรือผลลัพธ์ทางการแพทย์', 'No beauty score. This is not a diagnosis or a medical outcome.')}</p></div>
        <div className="studio-header-actions"><button className="studio-global-reset" type="button" onClick={resetAll}><RotateCcw size={16} /> {t('รีเซ็ตทั้งหมด', 'Reset all')}</button><button type="button" onClick={() => setShowSources(true)}><BookOpen size={16} /> {t('แหล่งข้อมูล', 'Sources')}</button><button type="button" onClick={() => setShowSummary(true)}><Printer size={16} /> {t('สรุปผล', 'Summary')}</button></div>
      </header>

      <div className="studio-phase-bar studio-phase-bar-compact">{phases.map(([name, sub], index) => <div key={name} className={index === phaseIndex ? 'is-active' : 'is-complete'}><b>{index < phaseIndex ? <Check size={14} /> : index + 1}</b><span><strong>{name}</strong><small>{sub}</small></span></div>)}</div>

      <div className="studio-layout">
        <aside className="studio-categories">
          <strong>{t('13 หมวดวิเคราะห์', '13 analysis areas')}</strong>
          <nav aria-label={t('หมวดวิเคราะห์', 'Analysis categories')}>
            {STUDIO_CATEGORIES.map((category) => (
              <button key={category.id} type="button" className={category.id === activeCategoryId ? 'is-active' : ''} onClick={() => selectCategory(category.id)}>
                <span aria-hidden="true">{category.icon}</span>
                <span>{isTh ? category.label : category.labelEn}<small>{category.availableCount} TESTS</small></span>
                {session.lockedPresets[category.id] && <i />}
              </button>
            ))}
          </nav>
        </aside>

        <section className="studio-preview">
          <div className="studio-preview-heading">
            <strong>{t('ภาพรวมทุกทรงที่ล็อก', 'Combined locked preview')}</strong>
            <div className="studio-preview-tools">
              <nav className="studio-angle-switcher" aria-label={t('เลือกมุมมองใบหน้า', 'Choose face angle')}>
                {viewAngles.map(([id, label]) => (
                  <button key={id} className={viewAngle === id ? 'is-active' : ''} type="button" onClick={() => setViewAngle(id)}>{label}</button>
                ))}
              </nav>
              <div className="studio-mobile-compare"><button className={mobileCompareMode === 'before' ? 'is-active' : ''} type="button" onClick={() => { setComparePosition(100); setMobileCompareMode('before'); }}>{t('ภาพเดิม', 'Before')}</button><button className={mobileCompareMode === 'after' ? 'is-active' : ''} type="button" onClick={() => { setComparePosition(0); setMobileCompareMode('after'); }}>{t('หลังปรับ', 'After')}</button></div>
            </div>
          </div>
          <FaceVisual
            image={image}
            adjustments={displayAdjustments}
            angle={viewAngle}
            profileAssets={profileAssets}
            profilePresetOrigins={displayProfilePresetOrigins}
            comparePosition={comparePosition}
            setComparePosition={setComparePosition}
            beforeLabel={t('ภาพเดิม', 'BEFORE')}
            afterLabel={t('หลังปรับ', 'AFTER')}
            compareLabel={t('เลื่อนเปรียบเทียบภาพเดิมและภาพหลังปรับ', 'Compare original and adjusted face')}
            mobileCompareMode={mobileCompareMode}
            pressingBefore={pressingBefore}
            onPreviewPointerDown={isMobile ? () => setPressingBefore(true) : undefined}
            onPreviewPointerUp={isMobile ? () => setPressingBefore(false) : undefined}
            stageRef={previewStageRef}
          />
          <div className="studio-lock-strip"><span><Lock size={14} /> {Object.keys(session.lockedPresets).filter((id) => !['faceShape'].includes(session.lockedPresets[id])).length} {t('หมวดที่ล็อก', 'locked areas')}</span>{session.compositeOrigin && <b>{t(`ปรับเองจาก ${session.compositeOrigin.base}`, `Customized from ${session.compositeOrigin.base}`)}</b>}<small>{t('ภาพจำลองจากโมเดลตัวอย่าง ผลจริงอาจแตกต่าง', 'Demo-model visualization; real outcomes vary.')}</small></div>
        </section>

        <section className={`studio-controls studio-sheet is-${sheetSnap}`} style={{ '--sheet-drag-y': `${sheetDragOffset}px` }}>
          <div className="studio-sheet-peek">
            <button
              className="studio-sheet-handle"
              type="button"
              aria-label={t('ลากหรือแตะเพื่อปรับระดับแผง', 'Drag or tap to resize controls')}
              onPointerDown={beginSheetDrag}
              onPointerMove={moveSheet}
              onPointerUp={endSheetDrag}
              onPointerCancel={endSheetDrag}
              onClick={(event) => event.detail === 0 && setSheetSnap(nextSheetSnap(sheetSnap))}
            >
              <GripHorizontal size={22} />
              <span><strong>{activeCategory.icon} {isTh ? activeCategory.label : activeCategory.labelEn}</strong><small>{previewPreset ? t('กำลังทดลองทรง', 'Previewing shape') : lockedLabel ? `${t('ล็อก', 'Locked')}: ${lockedLabel}` : t('ยังไม่ล็อกทรง', 'No locked shape')}</small></span>
            </button>
            <button className="studio-sheet-reset-all" type="button" onClick={resetAll} aria-label={t('รีเซ็ตการปรับทั้งหมด', 'Reset all adjustments')} title={t('รีเซ็ตการปรับทั้งหมด', 'Reset all adjustments')}><RotateCcw size={15} /><span>{t('รีเซ็ต', 'Reset')}</span></button>
            {previewPreset
              ? <button className="studio-sheet-primary-action" type="button" onClick={lockPreview}><Lock size={15} /> {t('ล็อก', 'Lock')}</button>
              : <button className="studio-sheet-primary-action" type="button" onClick={() => setSheetSnap('half')}>{t('ปรับ', 'Adjust')} <ChevronRight size={15} /></button>}
          </div>

          <nav className="studio-sheet-categories" aria-label={t('หมวดด่วน', 'Quick categories')}>
            {mobileCategoryIds.map((id) => {
              const category = STUDIO_CATEGORIES.find((item) => item.id === id);
              return <button key={id} type="button" className={id === activeCategoryId ? 'is-active' : ''} onClick={() => selectCategory(id)}><span>{category.icon}</span><small>{isTh ? category.label : category.labelEn}</small>{session.lockedPresets[id] && <i />}</button>;
            })}
            <button type="button" onClick={() => setShowAllCategories(true)}><LayoutGrid size={17} /><small>{t('ทั้งหมด', 'All')}</small></button>
          </nav>

          <div className="studio-sheet-scroll">
          <div className="studio-recommendations">
            <div><span>{t('ควรเริ่มจากอะไร', 'Where to start')}</span><strong>TOP 3</strong></div>
            {visibleRecommendations.map((item, index) => (
              <button key={item.id} type="button" onClick={() => selectCategory(item.categoryId)}>
                <b>{index + 1}</b><span><strong>{isTh ? item.th : item.en}</strong><small>{isTh ? item.whyTh : item.whyEn}</small></span><ChevronRight size={15} />
              </button>
            ))}
          </div>

          <div className="studio-controls-heading">
            <div><span><SlidersHorizontal size={15} /> {t('กำลังดู', 'Viewing')}</span><h2>{activeCategory.icon} {isTh ? activeCategory.label : activeCategory.labelEn}</h2>{lockedLabel && <small><Lock size={12} /> {lockedLabel}</small>}</div>
            {(activeCategory.sliders.length > 0 || activeCategory.composite) && <button type="button" onClick={resetCategory}><RotateCcw size={13} /> {t('รีเซ็ตหมวด', 'Reset')}</button>}
          </div>

          <div className="studio-analysis-tests">
            {analysis.map((test) => (
              <div key={test.id}><span><strong>{isTh ? test.th : test.en}</strong><small>{test.confidence === 'high' ? t('ความมั่นใจสูง', 'High confidence') : t('ความมั่นใจปานกลาง', 'Medium confidence')}</small></span><b className={`is-${test.status}`}>{test.status === 'balanced' ? t('สมดุล', 'Balanced') : test.status === 'strong' ? t('จุดเด่น', 'Strength') : t('พัฒนาได้', 'Can refine')}</b></div>
            ))}
          </div>

          {visiblePresets.length > 0 && (
            <div className="studio-presets">
              <strong>{t('ทดลองทรง', 'Try a shape')}</strong>
              <p>{t('เลือกเพื่อดูตัวอย่าง แล้วกดล็อกเพื่อคงไว้ขณะไปหมวดอื่น', 'Preview a shape, then lock it before moving to another area.')}</p>
              <div>
                {visiblePresets.map((item) => (
                  <button key={item[0]} type="button" className={previewPresetId === item[0] || lockedId === item[0] ? 'is-active' : ''} onClick={() => setPreviewPresetId(item[0])}>
                    <FaceVisual
                      compact
                      mobileLite={isMobile}
                      image={image}
                      adjustments={applyStudioPreset(ZERO_ADJUSTMENTS, activeCategory, item[2])}
                      angle={viewAngle}
                      profileAssets={profileAssets}
                      profilePresetOrigins={['nose', 'jaw', 'chin'].includes(activeCategory.id) ? { [activeCategory.id]: item[0] } : {}}
                    />
                    <span>{isTh ? item[1] : item[3]}</span>
                    <small>{item[4] === 'self-care' ? t('ไม่ใช้หัตถการ', 'Self-care') : item[4] === 'surgery' ? t('ศัลยกรรม', 'Surgery') : t('ไม่ผ่าตัด', 'Non-surgical')}</small>
                  </button>
                ))}
              </div>
              {previewPreset && <button className="studio-lock-button" type="button" onClick={lockPreview}><Lock size={16} /> {t('ล็อกทรงนี้', 'Lock this shape')}</button>}
            </div>
          )}

          {activeCategory.sliders.length > 0 && (
            <div className="studio-sliders">
              {activeCategory.sliders.map(([key, th, en]) => (
                <label key={key}><span>{isTh ? th : en}<b>{displayAdjustments[key] || 0}%</b></span><input type="range" min="0" max="100" value={displayAdjustments[key] || 0} onChange={(event) => changeSlider(key, event.target.value)} /></label>
              ))}
            </div>
          )}
          {visiblePresets.length === 0 && <div className="studio-analysis-only"><BookOpen size={20} /><strong>{session.intake.age === 'under18' && activeCategory.presets.length ? t('ซ่อนตัวเลือกหัตถการสำหรับผู้เยาว์', 'Procedure options hidden for minors') : t('หมวดวิเคราะห์เท่านั้น', 'Analysis-only area')}</strong><p>{session.intake.age === 'under18' && activeCategory.presets.length ? t('หมวดนี้ไม่มีตัวเลือกดูแลตนเองใน prototype', 'This area has no self-care preset in the prototype.') : t('ไม่สร้าง morph ที่อาจทำให้เข้าใจว่าเป็นผลลัพธ์จริง', 'No visual morph is shown where the prototype cannot represent a credible change.')}</p></div>}
          </div>

          <div className="studio-export-bar">
            <button className="studio-export-image" type="button" onClick={savePreviewImage} disabled={isSavingImage}>
              <ImageDown size={18} />
              <span><strong>{isSavingImage ? t('กำลังบันทึก…', 'Saving…') : t('บันทึกรูป', 'Save image')}</strong><small>PNG</small></span>
            </button>
            <button type="button" onClick={printAdjustmentReport}>
              <FileText size={18} />
              <span><strong>{t('รายงานการปรับ', 'Customization report')}</strong><small>PDF</small></span>
            </button>
            {saveNotice && <p className="studio-save-notice" role="status">{saveNotice}</p>}
          </div>
        </section>
      </div>

      {showAllCategories && (
        <Drawer title={t('เลือกหมวดวิเคราะห์', 'Choose an analysis area')} onClose={() => setShowAllCategories(false)}>
          <div className="studio-category-grid">
            {STUDIO_CATEGORIES.map((category) => (
              <button key={category.id} type="button" className={category.id === activeCategoryId ? 'is-active' : ''} onClick={() => { selectCategory(category.id); setSheetSnap('half'); }}>
                <span>{category.icon}</span>
                <strong>{isTh ? category.label : category.labelEn}</strong>
                <small>{category.availableCount} TESTS</small>
                {session.lockedPresets[category.id] && <i><Lock size={11} /></i>}
              </button>
            ))}
          </div>
        </Drawer>
      )}

      {showSources && (
        <Drawer title={t('แหล่งข้อมูลและข้อจำกัด', 'Sources and limitations')} onClose={() => setShowSources(false)}>
          <p className="studio-drawer-intro">{t('QOVES ใช้เป็นแรงบันดาลใจด้านโครงประสบการณ์เท่านั้น เนื้อหา prototype นี้อ้างอิงแหล่งข้อมูลสาธารณะด้าน anthropometry และความปลอดภัย', 'QOVES only inspired the experience structure. This prototype uses public anthropometry and safety references.')}</p>
          {STUDIO_SOURCES.map((source) => <a className="studio-source-card" key={source.id} href={source.url} target="_blank" rel="noreferrer"><BookOpen size={18} /><span><strong>{source.title}</strong><small>{source.categories.map((id) => STUDIO_CATEGORIES.find((category) => category.id === id)?.[isTh ? 'label' : 'labelEn']).join(' · ')}</small></span><ChevronRight size={16} /></a>)}
        </Drawer>
      )}

      {showSummary && (
        <Drawer
          title={t('สรุปเพื่อเตรียมปรึกษาผู้เชี่ยวชาญ', 'Consultation preparation summary')}
          onClose={() => setShowSummary(false)}
          footer={<button className="btn-brand-primary" type="button" onClick={() => window.print()}><Printer size={16} /> {t('พิมพ์สรุป', 'Print summary')}</button>}
        >
          <div className="studio-summary-views">
            {viewAngles.map(([angleId, angleLabel]) => {
              const assets = PROFILE_DEMO_ASSETS[gender][angleId];
              const angleImage = angleId === 'front' ? session.model?.avatar || PRESET_MODELS[0].avatar : assets.current;
              return (
                <section key={angleId}>
                  <h3>{angleLabel}</h3>
                  <div className="studio-summary-images">
                    <div><FaceVisual compact image={angleImage} angle={angleId} profileAssets={assets} adjustments={ZERO_ADJUSTMENTS} /><span>{t('ภาพเดิม', 'Before')}</span></div>
                    <div><FaceVisual compact image={angleImage} angle={angleId} profileAssets={assets} profilePresetOrigins={session.profilePresetOrigins} adjustments={session.adjustments} /><span>{t('หลังปรับ', 'After')}</span></div>
                  </div>
                </section>
              );
            })}
          </div>
          <section className="studio-summary-section"><h3>{t('คำแนะนำ 3 อันดับ', 'Top 3 guidance')}</h3>{session.recommendations.map((item, index) => <div key={item.id}><b>{index + 1}</b><span><strong>{isTh ? item.th : item.en}</strong><small>{isTh ? item.whyTh : item.whyEn}</small></span></div>)}</section>
          <section className="studio-summary-section"><h3>{t('ทรงที่ล็อก', 'Locked shapes')}</h3>{Object.entries(session.lockedPresets).filter(([, id]) => id !== 'faceShape').map(([categoryId, id]) => { const category = STUDIO_CATEGORIES.find((item) => item.id === categoryId); const item = category?.presets.find(([presetId]) => presetId === id); return <div key={categoryId}><Lock size={14} /><span><strong>{isTh ? category?.label : category?.labelEn}</strong><small>{item ? (isTh ? item[1] : item[3]) : t('ปรับเอง', 'Custom')}</small></span></div>; })}</section>
          <p className="studio-summary-disclaimer">{t('เอกสารนี้เป็น prototype สำหรับจัดระเบียบความต้องการ ไม่ใช่คำวินิจฉัย ใบเสนอราคา หรือการรับประกันผลลัพธ์', 'This prototype organizes preferences. It is not a diagnosis, quote, or outcome guarantee.')}</p>
        </Drawer>
      )}
    </div>
  );
}
