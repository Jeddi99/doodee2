import React, { useMemo, useRef, useState } from 'react';
import { TRY_ON_OPTIONS, PRESET_MODELS } from '../data/mockData';
import {
  Palette, Sparkles, Sliders, Eye, EyeOff, RefreshCw, Layers, Check,
  Scissors, Wand2, GitCompare, Bookmark, MoveHorizontal
} from 'lucide-react';

const BEAUTY_CATEGORIES = [
  { id: 'hair', label: 'สีผม', helper: 'Hair tone', icon: Scissors, accent: '#9B765F' },
  { id: 'eyes', label: 'ดวงตา', helper: 'Eye color', icon: Eye, accent: '#778C86' },
  { id: 'blush', label: 'แก้ม', helper: 'Blush glow', icon: Sparkles, accent: '#D58C8C' },
  { id: 'lips', label: 'ริมฝีปาก', helper: 'Lip finish', icon: Palette, accent: '#B96572' },
];

const LOOK_PRESETS = [
  { id: 'clean', label: 'Clean Glow', colors: ['#EBC6A8', '#D99A92', '#A77967'] },
  { id: 'peach', label: 'Peach Mood', colors: ['#F5B29B', '#D97871', '#9D6250'] },
  { id: 'rose', label: 'Rosy Night', colors: ['#D98A9E', '#A8526A', '#6D4148'] },
];

export default function TryOnView({ selectedModel = PRESET_MODELS[0], lang = 'th' }) {
  const [activeTab, setActiveTab] = useState('hair');
  const [hairColor, setHairColor] = useState(TRY_ON_OPTIONS.hairColors[1]);
  const [eyeColor, setEyeColor] = useState(TRY_ON_OPTIONS.eyeColors[1]);
  const [blushColor, setBlushColor] = useState(TRY_ON_OPTIONS.blushColors[1]);
  const [lipstick, setLipstick] = useState(TRY_ON_OPTIONS.lipsticks[1]);
  const [intensity, setIntensity] = useState(75);
  const [splitPos, setSplitPos] = useState(54);
  const [activePreset, setActivePreset] = useState('peach');
  const [isCleanView, setIsCleanView] = useState(false);
  const [isMobileComposerOpen, setIsMobileComposerOpen] = useState(false);
  const [isDraggingComparison, setIsDraggingComparison] = useState(false);
  const comparisonStageRef = useRef(null);
  const comparisonDraggingRef = useRef(false);
  const isTh = lang === 'th';

  const modelImage = selectedModel?.id === 'custom'
    ? selectedModel.avatar
    : '/upgrade-assets/doodee-supplied-female-before.png';

  const categoryConfig = {
    hair: {
      title: 'เลือกเฉดสีผม',
      subtitle: 'เปลี่ยนโทนผมให้เข้ากับลุคโดยรวม',
      options: TRY_ON_OPTIONS.hairColors,
      selected: hairColor,
      onSelect: setHairColor,
    },
    eyes: {
      title: 'เลือกสีคอนแทคเลนส์',
      subtitle: 'ลองโทนดวงตาที่ดูเป็นธรรมชาติ',
      options: TRY_ON_OPTIONS.eyeColors,
      selected: eyeColor,
      onSelect: setEyeColor,
    },
    blush: {
      title: 'เลือกสีปัดแก้ม',
      subtitle: 'เพิ่มสีระเรื่อและมิติให้กลางใบหน้า',
      options: TRY_ON_OPTIONS.blushColors,
      selected: blushColor,
      onSelect: setBlushColor,
    },
    lips: {
      title: 'เลือกเฉดสีลิปสติก',
      subtitle: 'เลือกสีและฟินิชที่เข้ากับลุค',
      options: TRY_ON_OPTIONS.lipsticks,
      selected: lipstick,
      onSelect: setLipstick,
    },
  };

  const activeConfig = categoryConfig[activeTab];
  const activeCategory = BEAUTY_CATEGORIES.find((category) => category.id === activeTab);

  const selectedSwatches = useMemo(() => ([
    hairColor.preview || hairColor.hex,
    eyeColor.hex,
    blushColor.hex,
    lipstick.hex,
  ]), [hairColor, eyeColor, blushColor, lipstick]);

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
    setHairColor(TRY_ON_OPTIONS.hairColors[0]);
    setEyeColor(TRY_ON_OPTIONS.eyeColors[0]);
    setBlushColor(TRY_ON_OPTIONS.blushColors[0]);
    setLipstick(TRY_ON_OPTIONS.lipsticks[0]);
    setIntensity(60);
    setSplitPos(50);
    setActivePreset('clean');
    setIsCleanView(false);
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
      // The rotate gate remains visible until the user turns the device.
    }
  };

  const applyPreset = (presetId) => {
    setActivePreset(presetId);
    if (presetId === 'clean') {
      setHairColor(TRY_ON_OPTIONS.hairColors[0]);
      setEyeColor(TRY_ON_OPTIONS.eyeColors[0]);
      setBlushColor(TRY_ON_OPTIONS.blushColors[1]);
      setLipstick(TRY_ON_OPTIONS.lipsticks[0]);
      setIntensity(48);
    } else if (presetId === 'peach') {
      setHairColor(TRY_ON_OPTIONS.hairColors[1]);
      setEyeColor(TRY_ON_OPTIONS.eyeColors[1]);
      setBlushColor(TRY_ON_OPTIONS.blushColors[1]);
      setLipstick(TRY_ON_OPTIONS.lipsticks[1]);
      setIntensity(72);
    } else {
      setHairColor(TRY_ON_OPTIONS.hairColors[2]);
      setEyeColor(TRY_ON_OPTIONS.eyeColors[2]);
      setBlushColor(TRY_ON_OPTIONS.blushColors[2]);
      setLipstick(TRY_ON_OPTIONS.lipsticks[2]);
      setIntensity(84);
    }
  };

  const targetPosition = {
    hair: { top: '14%', left: '50%' },
    eyes: { top: '39%', left: '50%' },
    blush: { top: '51%', left: '29%' },
    lips: { top: '59%', left: '50%' },
  }[activeTab];

  return (
    <div className={`tryon-workspace tryon-view${isMobileComposerOpen ? ' is-composer-open' : ''}`} style={{
      width: '100%',
      height: '100%',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      overflow: 'hidden'
    }}>
      <div className="tryon-rotate-gate" role="status" aria-live="polite">
        <div className="tryon-rotate-device" aria-hidden="true"><span /></div>
        <div>
          <span>{isTh ? 'BEAUTY LOOK STUDIO' : 'BEAUTY LOOK STUDIO'}</span>
          <h2>{isTh ? 'หมุนโทรศัพท์เป็นแนวนอน' : 'Rotate your phone to landscape'}</h2>
          <p>{isTh ? 'Try‑On ใช้พื้นที่แนวนอนเพื่อให้เห็นภาพและเครื่องมือปรับแต่งพร้อมกันโดยไม่แน่นหน้าจอ' : 'Try-On uses landscape so the preview and editing tools stay visible without crowding the screen.'}</p>
          <button type="button" onClick={requestLandscapeMode}>
            <MoveHorizontal size={18} />
            {isTh ? 'เปิดเต็มจอแนวนอน' : 'Open landscape fullscreen'}
          </button>
        </div>
      </div>
      <div className="tryon-workspace-header tryon-header" style={{
        minHeight: '58px',
        borderRadius: '18px',
        padding: '9px 14px',
        background: '#ffffff',
        border: '1px solid #e8e8ed',
        boxShadow: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '12px',
            background: '#0066cc',
            color: '#FFFFFF',
            display: 'grid',
            placeItems: 'center',
            boxShadow: 'none'
          }}>
            <Wand2 size={19} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, color: '#1d1d1f', fontSize: '1rem', fontWeight: 600 }}>
              Beauty Look Studio · ลองเครื่องสำอางแบบเรียลไทม์
            </h1>
            <p style={{ margin: '2px 0 0', color: '#6e6e73', fontSize: '0.68rem' }}>
              ทดลองสีผม ดวงตา บลัช และลิป พร้อมเปรียบเทียบกับภาพเดิมได้ทันที
            </p>
          </div>
        </div>
        <button
          className="tryon-reset"
          type="button"
          onClick={resetStyles}
          style={{
            height: '34px',
            border: '1px solid #d2d2d7',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.72)',
            color: '#0066cc',
            padding: '0 12px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.72rem',
            fontWeight: 400,
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          <RefreshCw size={14} /> รีเซ็ตลุค
        </button>
      </div>

      <div className="tryon-workspace-layout tryon-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(126px, 0.36fr) minmax(0, 1.15fr) minmax(310px, 1fr)',
        gap: '8px',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden'
      }}>
        <aside className="tryon-category-panel tryon-categories" style={{
          borderRadius: '18px',
          padding: '11px',
          background: '#ffffff',
          border: '1px solid #e8e8ed',
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden'
        }}>
          <div style={{ padding: '2px 4px 9px', borderBottom: '1px solid #e8e8ed' }}>
            <div style={{ color: '#1d1d1f', fontSize: '0.78rem', fontWeight: 600 }}>Beauty steps</div>
            <div style={{ color: '#6e6e73', fontSize: '0.62rem', marginTop: '2px' }}>เลือกส่วนที่อยากลองแต่ง</div>
          </div>

          <nav className="tryon-category-list" aria-label="หมวดเครื่องสำอาง" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '7px',
            marginTop: '9px',
            flex: 1
          }}>
            {BEAUTY_CATEGORIES.map((category, index) => {
              const Icon = category.icon;
              const isActive = activeTab === category.id;
              const selected = categoryConfig[category.id].selected;
              const selectedColor = selected.preview || selected.hex;
              return (
                <button
                  className={`tryon-category-button${isActive ? ' is-active' : ''}`}
                  key={category.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    setActiveTab(category.id);
                    setIsMobileComposerOpen(true);
                  }}
                  style={{
                    minHeight: '65px',
                    borderRadius: '17px',
                    border: isActive ? `1px solid ${category.accent}66` : '1px solid transparent',
                    background: isActive
                      ? `linear-gradient(135deg, ${category.accent}18, #FFFFFF)`
                      : 'rgba(255,255,255,0.45)',
                    color: isActive ? '#514D47' : '#82776F',
                    padding: '8px 9px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    boxShadow: isActive ? `0 5px 14px ${category.accent}18` : 'none'
                  }}
                >
                  <span style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '12px',
                    background: isActive ? category.accent : '#F3EFEB',
                    color: isActive ? '#FFFFFF' : '#9A8E86',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0
                  }}>
                    <Icon size={16} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800 }}>
                      {index + 1}. {category.label}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.58rem', color: '#A0958D', marginTop: '2px' }}>
                      {category.helper}
                    </span>
                  </span>
                  <span style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: selectedColor === 'transparent' ? '#DDD8D3' : selectedColor,
                    border: '2px solid #FFFFFF',
                    boxShadow: '0 0 0 1px rgba(80,70,65,0.12)',
                    flexShrink: 0
                  }} />
                </button>
              );
            })}
          </nav>

          <div className="tryon-palette" style={{
            borderRadius: '17px',
            padding: '10px',
            background: 'linear-gradient(135deg, #F7E9E7, #F3EEE5)',
            border: '1px solid #ECDCD7',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#765E5F', fontSize: '0.67rem', fontWeight: 800 }}>
              <Sparkles size={13} /> Your palette
            </div>
            <div style={{ display: 'flex', marginTop: '8px' }}>
              {selectedSwatches.map((color, index) => (
                <span
                  key={`${color}-${index}`}
                  style={{
                    width: '25px',
                    height: '25px',
                    borderRadius: '50%',
                    background: color === 'transparent' ? '#DDD8D3' : color,
                    border: '2px solid #ffffff',
                    marginLeft: index === 0 ? 0 : '-5px',
                    boxShadow: '0 2px 5px rgba(80,60,60,0.12)'
                  }}
                />
              ))}
            </div>
          </div>
        </aside>

        <section className="tryon-preview-panel tryon-preview" style={{
          minHeight: 0,
          borderRadius: '22px',
          padding: '10px',
          background: '#ffffff',
          border: '1px solid #E9E1DA',
          boxShadow: '0 4px 18px rgba(88, 72, 65, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          overflow: 'hidden'
        }}>
          <div className="tryon-preview-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#57534D', fontSize: '0.8rem', fontWeight: 800 }}>
              <Palette size={16} color="#B46F7D" /> ภาพทดลองลุคเครื่องสำอาง
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
              {!isCleanView && (
                <>
                  <button type="button" onClick={() => setSplitPos(0)} style={{
                    border: '1px solid #E5DDD6', borderRadius: '999px', background: '#FFFFFF',
                    color: '#80756E', fontSize: '0.61rem', fontWeight: 700, padding: '5px 9px', cursor: 'pointer'
                  }}>ภาพเดิม</button>
                  <button type="button" onClick={() => setSplitPos(100)} style={{
                    border: '1px solid #E5CDD3', borderRadius: '999px', background: '#FFF4F6',
                    color: '#A35F6D', fontSize: '0.61rem', fontWeight: 700, padding: '5px 9px', cursor: 'pointer'
                  }}>ดูลุคเต็ม</button>
                </>
              )}
              <button
                type="button"
                aria-pressed={isCleanView}
                onClick={() => setIsCleanView((value) => !value)}
                style={{
                  border: isCleanView ? '1px solid #B76F7D' : '1px solid #E5CDD3',
                  borderRadius: '999px',
                  background: isCleanView ? '#B76F7D' : '#FFF4F6',
                  color: isCleanView ? '#FFFFFF' : '#A35F6D',
                  fontSize: '0.61rem',
                  fontWeight: 800,
                  padding: '5px 9px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {isCleanView ? <Eye size={12} /> : <EyeOff size={12} />}
                {isCleanView ? 'แสดงเครื่องมือ' : 'เคลียร์หน้าจอ'}
              </button>
            </div>
          </div>

          <div ref={comparisonStageRef} className="tryon-image-stage" style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            borderRadius: '20px',
            background: 'linear-gradient(145deg, #EEE9E7, #E4E9E5)',
            border: '1px solid #E5DDD8'
          }}>
            <img
              src={modelImage}
              alt="ภาพต้นฉบับสำหรับทดลองเครื่องสำอาง"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />

            <div style={{
              position: 'absolute',
              inset: 0,
              clipPath: isCleanView ? 'inset(0 0 0 0)' : `inset(0 ${100 - splitPos}% 0 0)`,
              transition: 'clip-path 60ms linear',
              overflow: 'hidden'
            }}>
              <img
                src={modelImage}
                alt="ภาพทดลองเครื่องสำอาง"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: `saturate(${1 + intensity * 0.0018}) brightness(${1 + intensity * 0.0005})`
                }}
              />

              {hairColor.hex !== 'transparent' && (
                <div style={{
                  position: 'absolute',
                  inset: '0 0 57% 0',
                  background: `linear-gradient(180deg, ${hairColor.hex} 0%, ${hairColor.hex}CC 55%, transparent 100%)`,
                  mixBlendMode: 'color',
                  opacity: (intensity / 100) * 0.82,
                  pointerEvents: 'none'
                }} />
              )}

              {eyeColor.hex !== 'transparent' && (
                <>
                  <span style={{
                    position: 'absolute', top: '39.5%', left: '42.2%', width: '2.8%', aspectRatio: '1',
                    borderRadius: '50%', background: eyeColor.hex, opacity: (intensity / 100) * 0.62,
                    mixBlendMode: 'color', filter: 'blur(0.6px)', pointerEvents: 'none'
                  }} />
                  <span style={{
                    position: 'absolute', top: '39.5%', left: '55%', width: '2.8%', aspectRatio: '1',
                    borderRadius: '50%', background: eyeColor.hex, opacity: (intensity / 100) * 0.62,
                    mixBlendMode: 'color', filter: 'blur(0.6px)', pointerEvents: 'none'
                  }} />
                </>
              )}

              {blushColor.hex !== 'transparent' && (
                <>
                  <span style={{
                    position: 'absolute', top: '46%', left: '24%', width: '25%', height: '15%',
                    borderRadius: '50%', background: `radial-gradient(ellipse, ${blushColor.hex} 0%, transparent 70%)`,
                    opacity: (intensity / 100) * 0.42, mixBlendMode: 'multiply', filter: 'blur(5px)', pointerEvents: 'none'
                  }} />
                  <span style={{
                    position: 'absolute', top: '46%', right: '24%', width: '25%', height: '15%',
                    borderRadius: '50%', background: `radial-gradient(ellipse, ${blushColor.hex} 0%, transparent 70%)`,
                    opacity: (intensity / 100) * 0.42, mixBlendMode: 'multiply', filter: 'blur(5px)', pointerEvents: 'none'
                  }} />
                </>
              )}

              {lipstick.hex !== 'transparent' && (
                <span style={{
                  position: 'absolute',
                  top: '59.8%',
                  left: '43.4%',
                  width: '13.5%',
                  height: '4.3%',
                  borderRadius: '50% 50% 44% 44%',
                  background: lipstick.hex,
                  opacity: (intensity / 100) * 0.76,
                  mixBlendMode: lipstick.finish === 'gloss' ? 'hard-light' : 'multiply',
                  filter: lipstick.finish === 'gloss' ? 'blur(1px)' : 'blur(1.5px)',
                  pointerEvents: 'none'
                }} />
              )}
            </div>

            {!isCleanView && (
              <>
                <div
                  className={`tryon-comparison-dragger${isDraggingComparison ? ' is-dragging' : ''}`}
                  role="slider"
                  tabIndex={0}
                  aria-label="เลื่อนเส้นเพื่อเปรียบเทียบภาพก่อนและหลังแต่งหน้า"
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
                  onPointerMove={(event) => {
                    if (comparisonDraggingRef.current) updateComparisonFromPointer(event);
                  }}
                  onPointerUp={stopComparisonDrag}
                  onPointerCancel={stopComparisonDrag}
                  onKeyDown={handleComparisonKeyDown}
                >
                  <span className="tryon-comparison-line" />
                  <span className="tryon-comparison-handle">
                    <GitCompare size={14} />
                  </span>
                </div>

                <div style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  borderRadius: '999px',
                  padding: '5px 10px',
                  background: 'rgba(181, 102, 119, 0.88)',
                  color: '#FFFFFF',
                  backdropFilter: 'blur(8px)',
                  fontSize: '0.64rem',
                  fontWeight: 800
                }}>MAKEUP LOOK</div>

                <div style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  borderRadius: '999px',
                  padding: '5px 10px',
                  background: 'rgba(61, 69, 64, 0.72)',
                  color: '#FFFFFF',
                  backdropFilter: 'blur(8px)',
                  fontSize: '0.64rem',
                  fontWeight: 800
                }}>ORIGINAL</div>

                <div style={{
                  position: 'absolute',
                  ...targetPosition,
                  transform: 'translate(-50%, -50%)',
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: `${activeCategory.accent}22`,
                  border: `1.5px solid ${activeCategory.accent}`,
                  boxShadow: `0 0 0 6px ${activeCategory.accent}18`,
                  color: activeCategory.accent,
                  display: 'grid',
                  placeItems: 'center',
                  pointerEvents: 'none'
                }}>
                  <activeCategory.icon size={14} />
                </div>

              </>
            )}

            <div className="tryon-preview-intensity">
              <div className="tryon-preview-intensity-heading">
                <span><Sliders size={14} /> ความเข้มของเมคอัพ</span>
                <strong>{intensity}%</strong>
              </div>
              <input
                aria-label="ความเข้มของเมคอัพ"
                type="range"
                min="10"
                max="100"
                value={intensity}
                onChange={(event) => setIntensity(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="tryon-look-summary" style={{
            minHeight: '48px',
            borderRadius: '16px',
            padding: '7px 10px',
            background: 'linear-gradient(90deg, #FFF7F5, #F6F3EC)',
            border: '1px solid #EDE2DC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <Layers size={15} color="#B46F7D" />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#94877F', fontSize: '0.57rem' }}>ลุคที่เลือก</div>
                <div style={{
                  color: '#5C554F',
                  fontSize: '0.67rem',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>{hairColor.name} · {lipstick.name}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexShrink: 0 }}>
              {selectedSwatches.map((color, index) => (
                <span key={`${index}-${color}`} style={{
                  width: '20px', height: '20px', borderRadius: '50%',
                  background: color === 'transparent' ? '#DDD8D3' : color,
                  border: '2px solid #ffffff', marginLeft: index === 0 ? 0 : '-4px'
                }} />
              ))}
            </div>
          </div>
        </section>

        <section className="tryon-controls-panel tryon-composer" style={{
          minHeight: 0,
          borderRadius: '22px',
          padding: '11px',
          background: '#ffffff',
          border: '1px solid #E9E1DA',
          boxShadow: '0 4px 18px rgba(88, 72, 65, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexShrink: 0 }}>
            <div>
              <div style={{ color: '#574F4B', fontSize: '0.82rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Wand2 size={15} color="#B46F7D" /> Beauty composer
              </div>
              <div style={{ color: '#9A8E87', fontSize: '0.59rem', marginTop: '2px' }}>จัดลุคทีละสเต็ป หรือเลือก mood สำเร็จรูป</div>
            </div>
            <span style={{
              borderRadius: '999px',
              padding: '4px 8px',
              background: '#F5E6E8',
              color: '#9F5E6A',
              fontSize: '0.58rem',
              fontWeight: 800
            }}>BEAUTY LAB</span>
          </div>

          <div className="tryon-preset-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '5px', flexShrink: 0 }}>
            {LOOK_PRESETS.map((preset) => {
              const isActive = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => applyPreset(preset.id)}
                  style={{
                    border: isActive ? '1px solid #CF8795' : '1px solid #EAE1DB',
                    borderRadius: '14px',
                    background: isActive ? '#FFF2F4' : '#FBF9F6',
                    padding: '7px 5px',
                    cursor: 'pointer',
                    color: isActive ? '#925462' : '#796F69',
                    boxShadow: isActive ? '0 4px 12px rgba(181,102,119,0.1)' : 'none'
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
                    {preset.colors.map((color, index) => (
                      <span key={color} style={{
                        width: '14px', height: '14px', borderRadius: '50%', background: color,
                        border: '1.5px solid #FFFFFF', marginLeft: index === 0 ? 0 : '-3px'
                      }} />
                    ))}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.58rem', fontWeight: 800 }}>{preset.label}</span>
                </button>
              );
            })}
          </div>

          <div className="tryon-option-panel" style={{
            borderRadius: '17px',
            padding: '9px',
            background: 'linear-gradient(145deg, #FCF8F5, #F9F5F1)',
            border: '1px solid #ECE3DC',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{
                width: '30px', height: '30px', borderRadius: '11px',
                background: activeCategory.accent, color: '#FFFFFF',
                display: 'grid', placeItems: 'center', flexShrink: 0
              }}>
                <activeCategory.icon size={15} />
              </span>
              <div>
                <div style={{ color: '#564F49', fontSize: '0.73rem', fontWeight: 800 }}>{activeConfig.title}</div>
                <div style={{ color: '#9A8E86', fontSize: '0.56rem', marginTop: '1px' }}>{activeConfig.subtitle}</div>
              </div>
            </div>

            <div className="tryon-option-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
              {activeConfig.options.map((option) => {
                const isSelected = activeConfig.selected.id === option.id;
                const color = option.preview || option.hex;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => activeConfig.onSelect(option)}
                    style={{
                      minHeight: '58px',
                      borderRadius: '14px',
                      border: isSelected ? `1px solid ${activeCategory.accent}` : '1px solid #E7DFD8',
                      background: isSelected ? `${activeCategory.accent}12` : '#FFFDFB',
                      color: '#5A534E',
                      padding: '7px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      boxShadow: isSelected ? `0 4px 12px ${activeCategory.accent}14` : 'none'
                    }}
                  >
                    <span style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '10px',
                      background: color === 'transparent'
                        ? 'linear-gradient(135deg, #E8E5E1 0 46%, #C7C1BB 47% 53%, #F8F5F1 54%)'
                        : color,
                      border: '2px solid #FFFFFF',
                      boxShadow: '0 0 0 1px rgba(80,65,60,0.12)',
                      flexShrink: 0
                    }} />
                    <span style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: '0.59rem',
                      lineHeight: 1.3,
                      fontWeight: isSelected ? 800 : 600
                    }}>{option.name}</span>
                    {isSelected && <Check size={13} color={activeCategory.accent} />}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            className="tryon-save"
            type="button"
            onClick={() => setIsMobileComposerOpen(false)}
            style={{
              minHeight: '43px',
              border: 'none',
              borderRadius: '15px',
              background: 'linear-gradient(110deg, #B76F7D, #CF8993 54%, #B98579)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              fontSize: '0.72rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 8px 18px rgba(183,111,125,0.2)',
              flexShrink: 0
            }}
          >
            <Bookmark size={15} /> บันทึกลุคนี้เพื่อใช้เป็นภาพอ้างอิง
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
        {isMobileComposerOpen ? 'ซ่อนเครื่องมือ' : 'ปรับแต่งลุค'}
      </button>
    </div>
  );
}
