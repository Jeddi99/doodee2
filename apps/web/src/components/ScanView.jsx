import React, { useState } from 'react';
import { MULTI_ANGLE_SCAN_STEPS, PRESET_MODELS, PROFILE_DEMO_ASSETS, SIDE_PROFILE_ANALYSIS } from '../data/mockData';
import {
  Camera, Sparkles, CheckCircle2, Sun,
  Smile, Download, X, RefreshCw, ChevronRight, Sliders, Share2, Palette,
  Brain, Activity, Star, TrendingUp, Layers, Eye, EyeOff, Lock, MoveHorizontal
} from 'lucide-react';

// Custom SVG Radar Chart component for 5-axis facial metrics (Matching User Screenshot)
function RadarChart({ data, size = 250 }) {
  const center = size / 2;
  const radius = size * 0.35;
  const numAxes = data.length;

  const getCoordinates = (index, valuePercent) => {
    const angle = (Math.PI * 2 / numAxes) * index - Math.PI / 2;
    const r = (radius * valuePercent) / 100;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  const levels = [0.2, 0.4, 0.6, 0.8, 1.0];
  const pointsPolygon = data.map((d, i) => {
    const { x, y } = getCoordinates(i, d.score);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      {/* Background Web Polygons */}
      {levels.map((lvl, idx) => {
        const pts = data.map((_, i) => {
          const { x, y } = getCoordinates(i, lvl * 100);
          return `${x},${y}`;
        }).join(' ');
        return (
          <polygon
            key={idx}
            points={pts}
            fill="none"
            stroke="#E3DDD5"
            strokeWidth="1"
          />
        );
      })}

      {/* Radial Axis Lines */}
      {data.map((_, i) => {
        const { x, y } = getCoordinates(i, 100);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            stroke="#D8D2C9"
            strokeWidth="1"
          />
        );
      })}

      {/* Filled Score Polygon */}
      <polygon
        points={pointsPolygon}
        fill="rgba(0, 102, 204, 0.2)"
        stroke="#0066cc"
        strokeWidth="2.5"
      />

      {/* Axis Dots and Labels */}
      {data.map((d, i) => {
        const { x, y } = getCoordinates(i, d.score);
        const labelPos = getCoordinates(i, 122);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="4" fill="#0066cc" stroke="#ffffff" strokeWidth="1.5" />
            <text
              x={labelPos.x}
              y={labelPos.y}
              fill="#5F5851"
              fontSize="10"
              fontWeight="600"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {d.label}
            </text>
            <text
              x={labelPos.x}
              y={labelPos.y + 11}
              fill="#0066cc"
              fontSize="9"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {d.score / 10}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SideProfileOverlay({ direction = 'left' }) {
  const flip = direction === 'right' ? 'scaleX(-1)' : 'none';
  return (
    <svg className="side-profile-overlay" viewBox="0 0 220 280" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', transform: flip }}>
      <path d="M116 34 C88 42 70 71 72 110 C74 145 92 165 92 187 C92 216 112 236 139 241" fill="none" stroke="rgba(139,111,246,0.82)" strokeWidth="2" strokeLinecap="round" />
      <path d="M96 112 C124 110 136 120 119 132 C107 139 105 149 118 154 C127 158 125 170 107 178" fill="none" stroke="rgba(23,21,28,0.55)" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="58" y1="152" x2="150" y2="152" stroke="rgba(139,111,246,0.42)" strokeWidth="1" strokeDasharray="4 5" />
      <line x1="84" y1="86" x2="146" y2="206" stroke="rgba(139,111,246,0.32)" strokeWidth="1" strokeDasharray="5 5" />
      {[96, 119, 107, 139].map((cy, idx) => (
        <circle key={idx} cx={[72, 119, 107, 139][idx]} cy={cy} r="4" fill="rgba(139,111,246,0.9)" stroke="#fff" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

function ScanStepper({ steps, activeIndex, captures, isTh }) {
  return (
    <div className="multi-angle-stepper">
      {steps.map((step, index) => {
        const complete = captures[step.id]?.status === 'complete';
        const active = index === activeIndex;
        return (
          <div className={`multi-angle-step ${active ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`} key={step.id}>
            <span>{complete ? <CheckCircle2 size={14} /> : index + 1}</span>
            <strong>{isTh ? step.labelTh : step.labelEn}</strong>
            <small>{step.angle}</small>
          </div>
        );
      })}
    </div>
  );
}

function ProfileComparison({
  currentSrc,
  simulationSrc,
  direction,
  position,
  onPositionChange,
  overlayVisible,
  frame,
  isTh
}) {
  return (
    <div
      className="profile-comparison"
      style={{
        '--comparison-position': `${position}%`,
        '--profile-frame-scale': frame.scale,
        '--profile-frame-x': frame.x,
        '--profile-frame-y': frame.y
      }}
    >
      <img className="profile-comparison-image" src={currentSrc} alt={isTh ? 'ภาพปัจจุบัน' : 'Current profile'} />
      <div className="profile-comparison-simulation">
        <img className="profile-comparison-image" src={simulationSrc} alt={isTh ? 'ภาพจำลอง' : 'Simulated profile'} />
      </div>

      {overlayVisible && (
        <div className="profile-comparison-overlay-frame">
          <SideProfileOverlay direction={direction} />
        </div>
      )}

      <span className="profile-comparison-label is-current">{isTh ? 'ปัจจุบัน' : 'Current'}</span>
      <span className="profile-comparison-label is-simulation">{isTh ? 'ภาพจำลอง' : 'Simulation'}</span>
      <div className="profile-comparison-divider" aria-hidden="true">
        <span><MoveHorizontal size={17} /></span>
      </div>
      <input
        className="profile-comparison-range"
        type="range"
        min="0"
        max="100"
        value={position}
        onChange={(event) => onPositionChange(Number(event.target.value))}
        aria-label={isTh ? 'เลื่อนเพื่อเปรียบเทียบภาพปัจจุบันและภาพจำลอง' : 'Compare current and simulated profile'}
      />
    </div>
  );
}

export default function ScanView({ onTryOnSelect, onScanComplete, lang }) {
  const isTh = lang === 'th';
  const [selectedModel, setSelectedModel] = useState(PRESET_MODELS[1]);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [showPwaBanner, setShowPwaBanner] = useState(true);
  const [showCameraView, setShowCameraView] = useState(false);
  const [gender, setGender] = useState('male');
  const [genderLocked, setGenderLocked] = useState(false);
  const [consent1, setConsent1] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [qualityGateState, setQualityGateState] = useState('idle'); // idle | checking | passed
  const [analysisTab, setAnalysisTab] = useState('overview');
  const [sideReportAngle, setSideReportAngle] = useState('left');
  const [comparisonPosition, setComparisonPosition] = useState(50);
  const [showProfileOverlay, setShowProfileOverlay] = useState(true);
  const [angleCaptures, setAngleCaptures] = useState({
    front: { status: 'pending', quality: null },
    left: { status: 'pending', quality: null },
    right: { status: 'pending', quality: null }
  });

  // Deep Analysis Modal state
  const [showDeepModal, setShowDeepModal] = useState(false);

  const activeScanStep = MULTI_ANGLE_SCAN_STEPS[activeStepIndex];
  const profileAssets = PROFILE_DEMO_ASSETS[gender];
  const activeCameraImage = profileAssets[activeScanStep.id].current;
  const resultImage = hasScanned ? profileAssets.front.current : activeCameraImage;
  const activeProfileFrame = profileAssets[activeScanStep.id].frame;
  const activeProfileFrameStyle = activeProfileFrame ? {
    '--profile-frame-scale': activeProfileFrame.scale,
    '--profile-frame-x': activeProfileFrame.x,
    '--profile-frame-y': activeProfileFrame.y
  } : undefined;
  const sideReportData = SIDE_PROFILE_ANALYSIS[sideReportAngle];
  const sideReportAssets = profileAssets[sideReportAngle];

  const selectGender = (nextGender) => {
    if (genderLocked) return;
    setGender(nextGender);
    setSelectedModel(PRESET_MODELS.find((model) => model.gender === nextGender));
  };

  const resetMultiAngleScan = () => {
    setIsScanning(false);
    setHasScanned(false);
    setScanProgress(0);
    setShowCameraView(false);
    setQualityGateState('idle');
    setAnalysisTab('overview');
    setSideReportAngle('left');
    setComparisonPosition(50);
    setShowProfileOverlay(true);
    setGenderLocked(false);
    setActiveStepIndex(0);
    setAngleCaptures({
      front: { status: 'pending', quality: null },
      left: { status: 'pending', quality: null },
      right: { status: 'pending', quality: null }
    });
  };

  const finishCurrentAngle = () => {
    setQualityGateState('checking');
    window.setTimeout(() => {
      setAngleCaptures((prev) => ({
        ...prev,
        [activeScanStep.id]: {
          status: 'complete',
          quality: activeScanStep.id === 'front' ? 98 : activeScanStep.id === 'left' ? 97 : 95
        }
      }));
      setQualityGateState('passed');
      window.setTimeout(() => {
        setQualityGateState('idle');
        if (activeStepIndex < MULTI_ANGLE_SCAN_STEPS.length - 1) {
          setActiveStepIndex((idx) => idx + 1);
          setShowCameraView(true);
          setScanProgress(0);
        } else {
          setHasScanned(true);
          onScanComplete(selectedModel);
          setShowCameraView(false);
          setAnalysisTab('overview');
        }
      }, 650);
    }, 1100);
  };

  const startLiveCameraScan = () => {
    setGenderLocked(true);
    setIsScanning(true);
    setScanProgress(0);
    let progress = 0;
    const interval = setInterval(() => {
      progress = Math.min(progress + 20, 100);
      setScanProgress(progress);
      if (progress === 100) {
        clearInterval(interval);
        setIsScanning(false);
        finishCurrentAngle();
      }
    }, 300);
  };

  // Radar metric data matching User Screenshot
  const radarMetricsData = [
    { label: 'ความสมดุล', score: 80 },
    { label: 'ความคม', score: 95 },
    { label: 'ลักษณะเฉพาะเพศ', score: 91 },
    { label: 'บริเวณดวงตา', score: 60 },
    { label: 'ลักษณะใบหน้า', score: 89 }
  ];

  return (
    <div className="scan-workspace scan-view" style={{ width: '100%', maxWidth: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Title Header Card */}
      <div className="scan-workspace-header scan-view-header" style={{
        background: '#ffffff',
        border: '1px solid #d2d2d7',
        borderLeft: '4px solid #0066cc',
        borderRadius: '20px',
        padding: '10px 18px',
        marginBottom: '8px',
        boxShadow: '0 4px 20px rgba(47, 62, 70, 0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        flexShrink: 0
      }}>
        <div>
          <h1 style={{ fontSize: '1.18rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={20} color="#0066cc" />
            {isTh ? 'วิเคราะห์โครงหน้า (AI Facial Assessment)' : 'AI Face Analysis'}
          </h1>
          <p style={{ fontSize: '0.74rem', color: '#6e6e73', lineHeight: 1.35, margin: 0 }}>
            {isTh
              ? 'สแกนครบ 3 มุม: หน้าตรง ด้านซ้าย และด้านขวา ก่อนเปิดรายงานวิเคราะห์รวม'
              : 'Complete a 3-angle scan: front, left profile, and right profile before analysis.'
            }
          </p>
        </div>

        {hasScanned && (
          <div className="scan-view-header-actions" style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn-brand-primary"
              onClick={() => setShowDeepModal(true)}
              style={{
                background: 'linear-gradient(135deg, #1d1d1f 0%, #0066cc 100%)',
                boxShadow: '0 4px 14px rgba(28, 58, 39, 0.2)',
                padding: '10px 18px',
                fontSize: '0.85rem',
                borderRadius: '16px'
              }}
            >
              <Brain size={16} color="#6e6e73" />
              <span>{isTh ? 'วิเคราะห์เชิงลึก' : 'Deep Analysis'}</span>
            </button>

            <button
              className="btn-brand-secondary"
              onClick={resetMultiAngleScan}
              style={{ padding: '10px 14px', fontSize: '0.82rem', borderRadius: '16px' }}
            >
              <RefreshCw size={14} /> {isTh ? 'สแกนใหม่' : 'Re-Scan'}
            </button>
          </div>
        )}
      </div>

      <ScanStepper steps={MULTI_ANGLE_SCAN_STEPS} activeIndex={activeStepIndex} captures={angleCaptures} isTh={isTh} />

      {/* Main Dashboard Layout */}
      <div className="scan-workspace-grid scan-view-grid" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '8px', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* Left Column: Viewfinder & Camera Scanner Intake */}
        <div className="scan-workspace-primary scan-view-primary" style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', minHeight: 0, overflow: 'hidden' }}>

          <div className="scan-view-card" style={{
            background: '#ffffff',
            border: '1px solid #d2d2d7',
            borderRadius: '24px',
            padding: '12px',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(47, 62, 70, 0.03)',
            flex: 1,
            display: 'flex',
            flexDirection: 'column'
          }}>

            {/* INITIAL STATE: Ready to scan */}
            {!hasScanned && !isScanning && !showCameraView && (
              <div className="scan-view-ready" style={{
                background: '#f5f5f7',
                border: '1px solid #d2d2d7',
                borderRadius: '20px',
                padding: '18px 20px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'linear-gradient(145deg, #f5f5f7 0%, #ffffff 100%)',
                  border: '1px solid #d2d2d7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px'
                }}>
                  <Camera size={22} color="#0066cc" />
                </div>

                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '6px' }}>
                  {isTh ? 'เริ่มสแกนใบหน้า 3 มุม' : 'Start a 3-angle face scan'}
                </h3>

                <p style={{ fontSize: '0.78rem', color: '#1d1d1f', maxWidth: '400px', margin: '0 auto 14px auto', lineHeight: 1.45 }}>
                  {isTh
                    ? 'เริ่มจากหน้าตรง แล้วต่อด้วยด้านซ้าย 90° และด้านขวา 90° เพื่อสร้างรายงานเดียวที่ครบมุม'
                    : 'Start with front view, then left 90° and right 90° to create one complete report.'
                  }
                </p>

                <button
                  className="btn-brand-primary"
                  onClick={() => setShowCameraView(true)}
                  style={{ padding: '10px 24px', fontSize: '0.84rem', borderRadius: '16px' }}
                >
                  <Camera size={18} />
                  <span>{isTh ? 'เปิดกล้องเพื่อเริ่มสแกน' : 'Open camera to start scan'}</span>
                </button>
              </div>
            )}

            {/* CAMERA PREVIEW & SETUP */}
            {!hasScanned && !isScanning && showCameraView && qualityGateState === 'idle' && (
              <div className="scan-camera-view" style={{
                background: 'rgba(255,255,255,0.42)',
                borderRadius: '20px',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.6)', flexShrink: 0, gap: '10px' }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: '#1d1d1f' }}>{isTh ? activeScanStep.labelTh : activeScanStep.labelEn}</strong>
                    <p style={{ fontSize: '0.72rem', color: '#686371', margin: '2px 0 0', lineHeight: 1.35 }}>{isTh ? activeScanStep.instructionTh : activeScanStep.instructionEn}</p>
                  </div>
                  <div className="scan-gender-segment" style={{ display: 'flex', alignItems: 'center', gap: '0', background: 'rgba(255,255,255,0.58)', borderRadius: '16px', padding: '3px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => selectGender('male')}
                      disabled={genderLocked}
                      aria-pressed={gender === 'male'}
                      style={{
                        padding: '6px 18px',
                        borderRadius: '14px',
                        border: 'none',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: genderLocked ? 'default' : 'pointer',
                        background: gender === 'male' ? '#0066cc' : 'transparent',
                        color: gender === 'male' ? '#ffffff' : '#686371',
                        opacity: genderLocked && gender !== 'male' ? 0.45 : 1,
                        transition: 'all 0.2s'
                      }}
                    >
                      {isTh ? 'ชาย' : 'Male'}
                    </button>
                    <button
                      type="button"
                      onClick={() => selectGender('female')}
                      disabled={genderLocked}
                      aria-pressed={gender === 'female'}
                      style={{
                        padding: '6px 18px',
                        borderRadius: '14px',
                        border: 'none',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: genderLocked ? 'default' : 'pointer',
                        background: gender === 'female' ? '#0066cc' : 'transparent',
                        color: gender === 'female' ? '#ffffff' : '#686371',
                        opacity: genderLocked && gender !== 'female' ? 0.45 : 1,
                        transition: 'all 0.2s'
                      }}
                    >
                      {isTh ? 'หญิง' : 'Female'}
                    </button>
                    {genderLocked && <Lock className="scan-gender-lock" size={13} aria-label={isTh ? 'ล็อกหลังเริ่มสแกน' : 'Locked after scanning starts'} />}
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 16px' }}>
                  <div className="scan-camera-stage" style={{
                    position: 'relative',
                    width: 'min(300px, 72%)',
                    height: '100%',
                    maxHeight: '390px',
                    minHeight: '250px',
                    borderRadius: '18px',
                    overflow: 'hidden',
                    border: '2px solid rgba(139, 111, 246, 0.36)',
                    boxShadow: '0 18px 42px rgba(84,72,122,0.13)'
                  }}>
                    {activeScanStep.id === 'front' ? (
                      <>
                        <img
                          src={activeCameraImage}
                          alt={isTh ? `ตัวอย่าง${activeScanStep.labelTh}` : `${activeScanStep.labelEn} preview`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
                        />
                        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 220 280">
                          <ellipse cx="110" cy="130" rx="65" ry="85" fill="none" stroke="rgba(139, 111, 246, 0.72)" strokeWidth="1.5" strokeDasharray="6 4" />
                          <line x1="110" y1="30" x2="110" y2="240" stroke="rgba(139, 111, 246, 0.28)" strokeWidth="1" strokeDasharray="4 4" />
                          <line x1="30" y1="130" x2="190" y2="130" stroke="rgba(139, 111, 246, 0.28)" strokeWidth="1" strokeDasharray="4 4" />
                        </svg>
                      </>
                    ) : (
                      <div className="profile-frame-layer" style={activeProfileFrameStyle}>
                        <img
                          src={activeCameraImage}
                          alt={isTh ? `ตัวอย่าง${activeScanStep.labelTh}` : `${activeScanStep.labelEn} preview`}
                        />
                        <SideProfileOverlay direction={activeScanStep.id} />
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ padding: '8px 14px 10px', borderTop: '1px solid rgba(255,255,255,0.58)', flexShrink: 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
                    {(isTh ? activeScanStep.checksTh : activeScanStep.checksEn).map((check) => (
                      <div key={check} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.56)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '14px', padding: '8px', fontSize: '0.7rem', color: '#17151c', fontWeight: 650 }}>
                        <CheckCircle2 size={13} color="#8b6ff6" />
                        <span>{check}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={consent1}
                        onChange={(e) => setConsent1(e.target.checked)}
                        style={{ accentColor: '#0066cc', marginTop: '2px', width: '16px', height: '16px', flexShrink: 0 }}
                      />
                      <span style={{ fontSize: '0.78rem', color: '#1d1d1f', fontWeight: 600, lineHeight: 1.4 }}>
                        {isTh ? 'ฉันยินยอมให้ DOODEE วิเคราะห์ใบหน้าเพื่อสร้างรายงานส่วนตัว' : 'I consent to DOODEE analyzing my face for a personal report'}
                      </span>
                    </label>
                  </div>

                  <button
                    className="btn-brand-primary"
                    onClick={() => { setShowCameraView(false); startLiveCameraScan(); }}
                    disabled={!consent1}
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '0.84rem',
                      borderRadius: '16px',
                      justifyContent: 'center',
                      opacity: consent1 ? 1 : 0.4,
                      cursor: consent1 ? 'pointer' : 'not-allowed'
                    }}
                  >
                    <Camera size={18} />
                    <span>{isTh ? `สแกน${activeScanStep.labelTh}` : `Scan ${activeScanStep.labelEn}`}</span>
                  </button>
                </div>
              </div>
            )}

            {!hasScanned && qualityGateState !== 'idle' && (
              <div className="scan-quality-gate" style={{ flex: 1, minHeight: '360px', borderRadius: '20px', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.48)', textAlign: 'center', padding: '24px' }}>
                <div style={{ maxWidth: '360px' }}>
                  <div style={{ width: '72px', height: '72px', borderRadius: '50%', margin: '0 auto 14px', display: 'grid', placeItems: 'center', background: qualityGateState === 'checking' ? 'rgba(139,111,246,0.16)' : '#17151c', color: qualityGateState === 'checking' ? '#8b6ff6' : '#fff' }}>
                    {qualityGateState === 'checking' ? <RefreshCw className="scan-spin" size={28} /> : <CheckCircle2 size={28} />}
                  </div>
                  <h3 style={{ fontSize: '1.08rem', color: '#17151c', marginBottom: '6px' }}>
                    {qualityGateState === 'checking'
                      ? (isTh ? 'กำลังตรวจมุมและความคมชัด' : 'Checking angle and clarity')
                      : (isTh ? 'มุมนี้ผ่านเกณฑ์แล้ว' : 'This angle passed')}
                  </h3>
                  <p style={{ color: '#686371', fontSize: '0.82rem', lineHeight: 1.5 }}>
                    {qualityGateState === 'checking'
                      ? (isTh ? 'ระบบกำลังตรวจว่าเห็นปลายจมูก ริมฝีปาก คาง และแนวคอชัดเจน' : 'Checking visibility of the nose tip, lips, chin, and neck line.')
                      : (isTh ? 'กำลังพาไปขั้นตอนถัดไป' : 'Moving to the next step.')}
                  </p>
                </div>
              </div>
            )}

            {/* SCANNING / SCANNED VIEWFINDER */}
            {(isScanning || hasScanned) && (
              <div className="scan-viewfinder" style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden', flex: 1, minHeight: '360px', background: 'rgba(255,255,255,0.5)' }}>
                {(hasScanned || activeScanStep.id === 'front') ? (
                  <>
                    <img
                      src={resultImage}
                      alt="Scan Face View"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 38%' }}
                    />
                    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 400 440">
                      <circle cx="145" cy="180" r="14" fill="none" stroke="#0066cc" strokeWidth="1.5" strokeDasharray="3 2" />
                      <circle cx="255" cy="180" r="14" fill="none" stroke="#0066cc" strokeWidth="1.5" strokeDasharray="3 2" />
                      <circle cx="145" cy="180" r="3" fill="#0066cc" />
                      <circle cx="255" cy="180" r="3" fill="#0066cc" />
                      <path d="M 200,80 Q 300,100 310,220 Q 300,340 200,380 Q 100,340 90,220 Q 100,100 200,80 Z" fill="none" stroke="rgba(0, 102, 204, 0.5)" strokeWidth="1.5" strokeDasharray="4 4" className="pulsing-mesh" />
                      {[[200, 100], [200, 140], [200, 210], [200, 275], [200, 340], [140, 140], [260, 140], [115, 230], [285, 230]].map(([cx, cy], idx) => (
                        <circle key={idx} cx={cx} cy={cy} r="2.5" fill="#2997ff" opacity="0.9" />
                      ))}
                    </svg>
                  </>
                ) : (
                  <div className="profile-frame-layer" style={activeProfileFrameStyle}>
                    <img src={resultImage} alt="Scan Face View" />
                    <SideProfileOverlay direction={activeScanStep.id} />
                  </div>
                )}

                {isScanning && <div className="scanner-beam"></div>}

                {/* Status Badge */}
                <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(28, 46, 36, 0.85)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: '16px', fontSize: '0.72rem', color: '#ffffff', fontWeight: 600 }}>
                  {hasScanned || activeScanStep.id === 'front' ? 'Front Face Mesh 478 Points' : `${activeScanStep.labelEn} Profile Mesh`}
                </div>

                {isScanning && (
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(28, 46, 36, 0.9)', backdropFilter: 'blur(12px)', padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>
                      {isTh ? `กำลังสแกน${activeScanStep.labelTh}` : `Scanning ${activeScanStep.labelEn}`} ({scanProgress}%)
                    </div>
                    <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.2)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${scanProgress}%`, height: '100%', background: 'linear-gradient(90deg, #0066cc, #2997ff)', transition: 'width 0.2s' }}></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {hasScanned && (
              <button
                className="btn-brand-secondary"
                onClick={resetMultiAngleScan}
                style={{ width: '100%', marginTop: '12px', justifyContent: 'center', padding: '8px 16px', fontSize: '0.82rem', flexShrink: 0 }}
              >
                <RefreshCw size={14} /> สแกนซ้ำใหม่ (Re-Scan AI)
              </button>
            )}

          </div>

        </div>

        {/* Right Column: Dynamic Widgets */}
        <div className="scan-workspace-aside scan-view-details" style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0, overflowY: hasScanned ? 'auto' : 'hidden', paddingRight: hasScanned ? '2px' : 0 }}>

          {/* WHEN NOT SCANNED */}
          {!hasScanned && (
            <>
              <div style={{
                background: '#ffffff',
                border: '1px solid #d2d2d7',
                borderTop: '3px solid #0066cc',
                borderRadius: '24px',
                padding: '12px 14px',
                boxShadow: '0 4px 20px rgba(47, 62, 70, 0.03)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1d1d1f' }}>
                    {isTh ? 'ประวัติรายงาน' : 'Report History'}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#0066cc', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}>
                    {isTh ? 'ดูทั้งหมด' : 'View all'} <ChevronRight size={12} />
                  </span>
                </div>
                <div style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '14px', padding: '11px', textAlign: 'center', fontSize: '0.75rem', color: '#6e6e73' }}>
                  {isTh ? 'ยังไม่มีประวัติ - เริ่มรายงานแรกของคุณ' : 'No history yet - start your first report'}
                </div>
              </div>

              <div style={{
                background: '#ffffff',
                border: '1px solid #d2d2d7',
                borderTop: '3px solid #0066cc',
                borderRadius: '24px',
                padding: '12px 14px',
                boxShadow: '0 4px 20px rgba(47, 62, 70, 0.03)',
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column'
              }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '8px' }}>
                  {isTh ? 'เคล็ดลับการประเมิน' : 'Assessment Tips'}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minHeight: 0 }}>
                  {[
                    { icon: Sun, text: isTh ? 'อยู่ในที่มีแสงเพียงพอ' : 'Use sufficient lighting' },
                    { icon: Smile, text: isTh ? 'มองตรง ไม่เอียงหน้า' : 'Look straight, keep face un-tilted' },
                    { icon: Camera, text: isTh ? 'ไม่สวมแว่น / หมวก / แมสก์' : 'No glasses / hat / mask' },
                    { icon: Sparkles, text: isTh ? 'รักษาระยะห่างประมาณ 30 ซม.' : 'Keep ~30cm distance' }
                  ].map((tip, idx) => {
                    const TipIcon = tip.icon;
                    return (
                      <div key={idx} style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '16px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#1d1d1f', fontWeight: 600, flex: 1, minHeight: 0 }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#f5f5f7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <TipIcon size={14} color="#0066cc" />
                        </div>
                        <span>{tip.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* WHEN SCANNED: RICH RESULTS */}
          {hasScanned && (
            <>
              <div className="scan-analysis-tabs" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', background: 'rgba(255,255,255,0.46)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '18px', padding: '5px' }}>
                {[
                  { id: 'overview', th: 'ภาพรวม', en: 'Overview' },
                  { id: 'front', th: 'หน้าตรง', en: 'Front' },
                  { id: 'side', th: 'ด้านข้าง', en: 'Side Profile' },
                  { id: 'quality', th: 'คุณภาพ', en: 'Quality' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAnalysisTab(tab.id)}
                    style={{
                      minHeight: '34px',
                      border: '0',
                      borderRadius: '14px',
                      background: analysisTab === tab.id ? '#ffffff' : 'transparent',
                      color: analysisTab === tab.id ? '#8b6ff6' : '#686371',
                      fontSize: '0.72rem',
                      fontWeight: 750,
                      cursor: 'pointer',
                      boxShadow: analysisTab === tab.id ? '0 8px 20px rgba(84,72,122,0.1)' : 'none'
                    }}
                  >
                    {isTh ? tab.th : tab.en}
                  </button>
                ))}
              </div>

              {analysisTab === 'side' && (
                <div className="side-profile-report" style={{
                  background: 'rgba(255,255,255,0.58)',
                  border: '1px solid rgba(255,255,255,0.78)',
                  borderRadius: '24px',
                  padding: '16px',
                  boxShadow: '0 8px 26px rgba(84,72,122,0.09)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#17151c', marginBottom: '3px' }}>
                        {isTh ? 'วิเคราะห์ด้านข้างซ้าย-ขวา' : 'Left-right side profile'}
                      </h3>
                      <p style={{ margin: 0, color: '#686371', fontSize: '0.72rem', lineHeight: 1.4 }}>
                        {isTh ? 'อ่านจมูก ริมฝีปาก คาง กราม และแนวคอจากมุม 90°' : 'Reads nose, lips, chin, jaw, and neck transition from 90° views.'}
                      </p>
                    </div>
                    <div className="side-profile-report-actions">
                      <button
                        className="side-profile-overlay-toggle"
                        type="button"
                        onClick={() => setShowProfileOverlay((visible) => !visible)}
                        aria-pressed={showProfileOverlay}
                        aria-label={isTh ? 'เปิดหรือปิดเส้นวิเคราะห์' : 'Toggle analysis overlay'}
                        title={isTh ? 'เส้นวิเคราะห์' : 'Analysis overlay'}
                      >
                        {showProfileOverlay ? <Eye size={17} /> : <EyeOff size={17} />}
                      </button>
                      <div className="side-profile-score">
                        {SIDE_PROFILE_ANALYSIS.balanceScore}
                      </div>
                    </div>
                  </div>

                  <div className="side-profile-angle-tabs" role="tablist" aria-label={isTh ? 'เลือกมุมด้านข้าง' : 'Choose profile angle'}>
                    {['left', 'right'].map((side) => (
                      <button
                        key={side}
                        type="button"
                        role="tab"
                        aria-selected={sideReportAngle === side}
                        className={sideReportAngle === side ? 'is-active' : ''}
                        onClick={() => {
                          setSideReportAngle(side);
                          setComparisonPosition(50);
                        }}
                      >
                        {isTh ? SIDE_PROFILE_ANALYSIS[side].labelTh : SIDE_PROFILE_ANALYSIS[side].labelEn}
                      </button>
                    ))}
                  </div>

                  <ProfileComparison
                    currentSrc={sideReportAssets.current}
                    simulationSrc={sideReportAssets.simulation}
                    direction={sideReportAngle}
                    position={comparisonPosition}
                    onPositionChange={setComparisonPosition}
                    overlayVisible={showProfileOverlay}
                    frame={sideReportAssets.frame}
                    isTh={isTh}
                  />

                  <div className="side-profile-metrics">
                    {sideReportData.metrics.map((metric) => (
                      <div className="side-profile-metric" key={metric.id}>
                        <span>{isTh ? metric.labelTh : metric.labelEn}</span>
                        <strong>{metric.score}/10</strong>
                      </div>
                    ))}
                  </div>

                  <p className="side-profile-disclaimer">
                    {isTh
                      ? 'ภาพจำลองใช้เพื่อประกอบการประเมินเบื้องต้น ผลลัพธ์จริงอาจแตกต่างกัน'
                      : 'Simulation is for preliminary assessment only. Actual results may vary.'}
                  </p>
                </div>
              )}

              {analysisTab === 'quality' && (
                <div style={{ background: 'rgba(255,255,255,0.58)', border: '1px solid rgba(255,255,255,0.78)', borderRadius: '24px', padding: '16px' }}>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#17151c', marginBottom: '10px' }}>
                    {isTh ? 'คุณภาพภาพครบ 3 มุม' : '3-angle quality gate'}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {SIDE_PROFILE_ANALYSIS.qualityByAngle.map((row) => (
                      <div key={row.id} style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '16px', padding: '10px 12px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                        <div>
                          <strong style={{ color: '#17151c', fontSize: '0.82rem' }}>{isTh ? row.labelTh : row.labelEn}</strong>
                          <p style={{ margin: '3px 0 0', color: '#686371', fontSize: '0.68rem' }}>
                            {isTh ? `มุม ${row.angleAccuracy} · ความคม ${row.clarity}% · แสง ${row.lighting}%` : `Angle ${row.angleAccuracy} · Clarity ${row.clarity}% · Lighting ${row.lighting}%`}
                          </p>
                        </div>
                        <CheckCircle2 size={18} color="#8b6ff6" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overall Score Hero Card with Deep Analysis CTA */}
              {analysisTab === 'overview' && <div style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #f5f5f7 100%)',
                border: '1px solid #d2d2d7',
                borderRadius: '24px',
                padding: '20px',
                boxShadow: '0 6px 22px rgba(78, 92, 80, 0.08)',
                color: '#1d1d1f'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Overall Score
                    </span>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1d1d1f', marginTop: '2px' }}>{selectedModel.name}</h2>
                  </div>
                  <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #0066cc, #2997ff)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.4rem',
                    fontWeight: 800,
                    color: '#ffffff',
                    boxShadow: '0 4px 16px rgba(0, 102, 204, 0.24)'
                  }}>
                    77.7
                  </div>
                </div>

                <div style={{ fontSize: '0.75rem', color: '#6F756E', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                  <CheckCircle2 size={12} color="#0066cc" />
                  <span>{selectedModel.tier}</span>
                </div>

                {/* Primary Button to Open Deep Analysis Modal */}
                <button
                  onClick={() => setShowDeepModal(true)}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #0066cc 0%, #0066cc 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '16px',
                    padding: '12px 16px',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 16px rgba(0, 102, 204, 0.22)',
                    transition: 'transform 0.2s'
                  }}
                >
                  <Brain size={18} />
                  <span>{isTh ? 'คลิกเปิด วิเคราะห์เชิงลึก' : 'Open Deep Analysis'}</span>
                </button>
              </div>}

              {/* Metric Scores with Visual Bars */}
              {(analysisTab === 'overview' || analysisTab === 'front') && <div style={{
                background: '#ffffff',
                border: '1px solid #d2d2d7',
                borderTop: '3px solid #0066cc',
                borderRadius: '24px',
                padding: '18px 20px',
                boxShadow: '0 4px 20px rgba(47, 62, 70, 0.03)'
              }}>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sliders size={14} color="#0066cc" />
                  {isTh ? 'คะแนนสัดส่วนรายหมวด' : 'Category Scores'}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedModel.metrics.map((cat, idx) => {
                    const pct = (cat.score / 10) * 100;
                    const barColor = cat.score >= 8 ? '#0066cc' : cat.score >= 6 ? '#D4A03E' : '#C75D5D';
                    return (
                      <div key={idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.78rem', color: '#1d1d1f', fontWeight: 600 }}>{cat.category}</span>
                          <strong style={{ color: barColor, fontSize: '0.82rem' }}>{cat.score}/10</strong>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: '#F0F4F1', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width 0.5s ease' }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>}

              {/* Quality Gate Card */}
              {(analysisTab === 'overview' || analysisTab === 'front') && <div style={{
                background: '#ffffff',
                border: '1px solid #d2d2d7',
                borderRadius: '24px',
                padding: '18px 20px',
                boxShadow: '0 4px 20px rgba(47, 62, 70, 0.03)'
              }}>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={14} color="#0066cc" />
                  {isTh ? 'คุณภาพภาพถ่าย' : 'Photo Quality'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { label: isTh ? 'แสงสว่าง' : 'Lighting', value: `${selectedModel.qualityGate?.lighting || 95}%`, good: true },
                    { label: isTh ? 'ความเบลอ' : 'Blur', value: selectedModel.qualityGate?.blur || 'Low', good: true },
                    { label: isTh ? 'ท่าทาง' : 'Pose', value: selectedModel.qualityGate?.pose || 'Centered', good: true },
                    { label: isTh ? 'ขนาดหน้า' : 'Face Size', value: selectedModel.qualityGate?.faceSize || 'Optimal', good: true }
                  ].map((item, idx) => (
                    <div key={idx} style={{ background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: '16px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '0.68rem', color: '#6e6e73', fontWeight: 600, marginBottom: '2px' }}>{item.label}</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: item.good ? '#0066cc' : '#D97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} />
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>}

              {/* Quick Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button className="btn-brand-primary" onClick={() => onTryOnSelect(selectedModel)} style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '0.85rem', borderRadius: '16px' }}>
                  <Palette size={15} />
                  <span>{isTh ? 'ลองแต่งสไตล์ (Try-On)' : 'Try virtual styling'}</span>
                </button>
                <button className="btn-brand-secondary" onClick={() => { }} style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: '0.82rem', borderRadius: '16px' }}>
                  <Share2 size={14} />
                  <span>{isTh ? 'แชร์ / บันทึกรายงาน' : 'Share / Save report'}</span>
                </button>
              </div>
            </>
          )}

        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* DEEP ANALYSIS POPUP MODAL (หน้าเด้งขึ้นมา - MATCHING USER SCREENSHOTS) */}
      {/* ------------------------------------------------------------- */}
      {showDeepModal && (
        <div className="deep-report-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
          background: 'rgba(62, 81, 69, 0.42)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="deep-report-dialog" style={{
            background: '#f5f5f7',
            border: '1px solid #E4DED6',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '1080px',
            maxHeight: '94vh',
            overflowY: 'auto',
            boxShadow: '0 24px 70px rgba(65, 55, 48, 0.2)',
            padding: '18px 20px',
            color: '#1d1d1f',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>

            {/* Modal Header Bar */}
            <div className="deep-report-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E4DED6', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '16px', background: 'linear-gradient(135deg, #0066cc, #2997ff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Brain size={24} color="#ffffff" />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1d1d1f', margin: 0 }}>
                    {isTh ? 'รายงานวิเคราะห์โครงหน้าเชิงลึก' : 'Deep Facial Report'}
                  </h2>
                  <p style={{ fontSize: '0.78rem', color: '#6e6e73', margin: '2px 0 0 0' }}>
                    {isTh ? 'รายงานฉบับสมบูรณ์ ล่าสุดเมื่อ 27 ก.ค. 2026' : 'Full facial assessment completed on Jul 27, 2026'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowDeepModal(false)}
                style={{ background: '#F0EBE4', border: 'none', color: '#1d1d1f', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* ROW 1: TOP 4 KPI CARDS (MATCHING USER SCREENSHOT 1) */}
            <div className="deep-report-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>

              {/* Card 1: คะแนนสูงสุด */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #d2d2d7',
                borderRadius: '20px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f5f5f7', border: '1px solid #E1DBD4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Star size={16} color="#0066cc" />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6e6e73', fontWeight: 600 }}>คะแนนสูงสุด</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1d1d1f' }}>
                  77.7 <span style={{ fontSize: '0.85rem', color: '#948B83' }}>/100</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#A99F96' }}>27 ก.ค. 2026</div>
              </div>

              {/* Card 2: คะแนนล่าสุด */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #d2d2d7',
                borderRadius: '20px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f5f5f7', border: '1px solid #E1DBD4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={16} color="#0066cc" />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6e6e73', fontWeight: 600 }}>คะแนนล่าสุด</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1d1d1f' }}>
                  77.7 <span style={{ fontSize: '0.85rem', color: '#948B83' }}>/100</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#A99F96' }}>27 ก.ค. 2026</div>
              </div>

              {/* Card 3: คะแนนเฉลี่ย */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #d2d2d7',
                borderRadius: '20px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f5f5f7', border: '1px solid #E1DBD4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Activity size={16} color="#0066cc" />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6e6e73', fontWeight: 600 }}>คะแนนเฉลี่ย</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1d1d1f' }}>
                  77.7 <span style={{ fontSize: '0.85rem', color: '#948B83' }}>/100</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#A99F96' }}>เทียบครั้งแรก —</div>
              </div>

              {/* Card 4: รายงานทั้งหมด */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #d2d2d7',
                borderRadius: '20px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f5f5f7', border: '1px solid #E1DBD4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layers size={16} color="#0066cc" />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6e6e73', fontWeight: 600 }}>รายงานทั้งหมด</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1d1d1f' }}>
                  1 <span style={{ fontSize: '0.85rem', color: '#948B83' }}>ครั้ง</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#A99F96' }}>เก็บในเครื่องนี้</div>
              </div>

            </div>

            {/* ROW 2: MAIN CONTENT GRID (LEFT RADAR CARD + RIGHT AI SUMMARY CARD) */}
            <div className="deep-report-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>

              {/* LEFT CARD: ข้อมูลเชิงลึก & RADAR CHART (MATCHING USER SCREENSHOT 2) */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #d2d2d7',
                borderRadius: '24px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#f5f5f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Activity size={20} color="#0066cc" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1d1d1f', margin: 0 }}>ข้อมูลเชิงลึก</h3>
                    <div style={{ fontSize: '0.75rem', color: '#948B83' }}>รายงานล่าสุดของใบหน้า</div>
                  </div>
                </div>

                {/* 5-Axis Radar Polygon Chart Container */}
                <div style={{
                  background: '#F7F3ED',
                  border: '1px solid #d2d2d7',
                  borderRadius: '20px',
                  padding: '20px 10px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}>
                  <RadarChart data={radarMetricsData} size={250} />
                </div>

                {/* Score Breakdown List (Matching User Screenshot 2) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                  {[
                    { name: 'ความสมดุล', val: 80 },
                    { name: 'ความคม', val: 95 },
                    { name: 'ลักษณะเฉพาะเพศ', val: 91 },
                    { name: 'บริเวณดวงตา', val: 60 },
                    { name: 'ลักษณะใบหน้า', val: 89 }
                  ].map((row, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#F7F3ED', borderRadius: '14px' }}>
                      <span style={{ fontSize: '0.82rem', color: '#5F5851', fontWeight: 500 }}>{row.name}</span>
                      <strong style={{ fontSize: '0.92rem', color: '#1d1d1f', fontWeight: 800 }}>{row.val}</strong>
                    </div>
                  ))}
                </div>

              </div>

              {/* RIGHT CARD: การสรุปด้วย AI (AI EXECUTIVE REPORT & GUIDANCE) */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #d2d2d7',
                borderRadius: '24px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1d1d1f', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={18} color="#6e6e73" />
                    การสรุปด้วย AI (AI Intelligence Synthesis)
                  </h3>
                  <span style={{ fontSize: '0.68rem', background: '#f5f5f7', color: '#0066cc', padding: '3px 8px', borderRadius: '12px', fontWeight: 700 }}>
                    AI Clinical Synthesis
                  </span>
                </div>

                {/* AI Detailed Paragraph Summary */}
                <div style={{
                  background: '#F7F3ED',
                  border: '1px solid #d2d2d7',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  fontSize: '0.82rem',
                  color: '#1d1d1f',
                  lineHeight: 1.6
                }}>
                  <p style={{ margin: '0 0 10px 0' }}>
                    จากการประมวลผล 478 Mesh Points ร่วมกับ 60 Structural Metrics พบว่า ใบหน้าของคุณมีจุดเด่นระดับสูงสุดที่ <strong>ความคมของกรอบหน้า (95/100)</strong> และ <strong>อัตลักษณ์ทางเพศ (91/100)</strong> ซึ่งสะท้อนโครงสร้างขากรรไกรกรามที่สวยงาม ได้มุม 124.5° สไตล์ V-Shape สมส่วน
                  </p>
                  <p style={{ margin: 0 }}>
                    บริเวณ <strong>ดวงตาได้คะแนน 60/100</strong> มีองศา Canthal Tilt ยกสวย (+4.2°) แต่แนะนำการเพิ่มความสดใสบริบทใต้ตา ส่วนสัดส่วน 3 ส่วนแนวตั้ง (Golden Trisection 1:1:1) มีความสมดุลสูงถึง 80/100 อยู่ในเกณฑ์อุดมคติของใบหน้าเอเชีย
                  </p>
                </div>

                {/* Priority Action Checklist */}
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#6e6e73', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    คำแนะนำลำดับหัตถการจาก AI:
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { num: '1', title: 'ดูแลความกระชับรอบดวงตา (Eye Contour & Brightening)', desc: 'ปรับสภาพผิวใต้ตาเพื่อดันคะแนนบริเวณดวงตาจาก 60 เป็น 85+' },
                      { num: '2', title: 'คงมิติกรอบหน้า V-Shape (Jawline Maintenance)', desc: 'ใช้ HIFU / Ultraformer รักษามุมกราม 124.5° ให้คมกริบยาวนาน' },
                      { num: '3', title: 'สมดุลความชุ่มชื้นผิว (Skin Texture Balance)', desc: 'ดูแลเกราะป้องกันผิวเพื่อส่งเสริมความสมมาตรภาพรวม' }
                    ].map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#F7F3ED', padding: '10px 12px', borderRadius: '16px' }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#0066cc', color: '#fff', fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                          {item.num}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1d1d1f' }}>{item.title}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6e6e73', marginTop: '2px' }}>{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons inside Modal */}
                <div className="deep-report-actions" style={{ display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '10px' }}>
                  <button
                    onClick={() => { setShowDeepModal(false); onTryOnSelect(selectedModel); }}
                    style={{ flex: 1, background: 'linear-gradient(135deg, #0066cc, #2997ff)', color: '#fff', border: 'none', borderRadius: '16px', padding: '10px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Palette size={15} />
                    <span>ลองแต่งสไตล์ 3D (Try-On)</span>
                  </button>

                  <button
                    onClick={() => setShowDeepModal(false)}
                    style={{ background: '#F0EBE4', color: '#1d1d1f', border: '1px solid #DED7CF', borderRadius: '16px', padding: '10px 16px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    ปิดหน้าต่าง
                  </button>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* PWA Banner */}
      {showPwaBanner && (
        <div className="scan-pwa-banner" style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 90,
          background: '#455C4C',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 253, 249, 0.2)',
          borderRadius: '20px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 10px 30px rgba(69, 92, 76, 0.18)'
        }}>
          <button style={{
            background: '#F7F1E6',
            color: '#1d1d1f',
            border: 'none',
            borderRadius: '16px',
            padding: '8px 14px',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <Download size={14} />
            <span>ติดตั้งแอป DOODEE</span>
          </button>
          <button onClick={() => setShowPwaBanner(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

    </div>
  );
}
