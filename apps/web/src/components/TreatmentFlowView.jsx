import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bookmark,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Gauge,
  Droplets,
  MapPin,
  Moon,
  RefreshCw,
  ScanFace,
  Shapes,
  ShieldCheck,
  Smile,
  Sparkles,
  Sun,
  Upload
} from 'lucide-react';
import { PRESET_MODELS } from '../data/mockData';
import { FaceDetailReport, FaceScanSummary } from './FaceScanReport';

const SKIN_FINDINGS = [
  {
    id: 'acne',
    labelTh: 'สิวอักเสบ',
    labelEn: 'Active acne',
    countTh: '3 จุด',
    countEn: '3 spots',
    areaTh: 'แก้มซ้ายและหน้าผาก',
    areaEn: 'Left cheek and forehead',
    severityTh: 'ปานกลาง',
    severityEn: 'Moderate',
    color: '#D86C6C',
    tint: '#FFF1EF',
    score: 68,
    detailTh: 'พบตุ่มแดงและสิวอุดตันขนาดเล็ก ควรลดการระคายเคืองและหลีกเลี่ยงการบีบสิว',
    detailEn: 'Small inflamed and clogged pores detected. Reduce irritation and avoid picking.',
    careTh: 'ใช้ Salicylic Acid 0.5–2% สลับวัน และแต้ม Benzoyl Peroxide เฉพาะจุด',
    careEn: 'Use 0.5–2% salicylic acid on alternate days and spot-treat with benzoyl peroxide.'
  },
  {
    id: 'marks',
    labelTh: 'รอยสิวและรอยแดง',
    labelEn: 'Acne marks',
    countTh: '5 จุด',
    countEn: '5 spots',
    areaTh: 'แก้มทั้งสองข้าง',
    areaEn: 'Both cheeks',
    severityTh: 'เล็กน้อย',
    severityEn: 'Mild',
    color: '#D49B62',
    tint: '#FFF7EA',
    score: 78,
    detailTh: 'พบรอยแดงหลังสิวตื้น ๆ สีผิวยังไม่สม่ำเสมอบางตำแหน่ง',
    detailEn: 'Light post-acne redness and slightly uneven tone detected.',
    careTh: 'เสริม Niacinamide 4–5% และทากันแดด SPF 50 ทุกเช้า',
    careEn: 'Add 4–5% niacinamide and wear SPF 50 every morning.'
  },
  {
    id: 'pores',
    labelTh: 'รูขุมขนกว้าง',
    labelEn: 'Visible pores',
    countTh: 'บริเวณ T-zone',
    countEn: 'T-zone',
    areaTh: 'จมูกและแก้มชิดจมูก',
    areaEn: 'Nose and inner cheeks',
    severityTh: 'ปานกลาง',
    severityEn: 'Moderate',
    color: '#6D9C91',
    tint: '#EEF7F2',
    score: 72,
    detailTh: 'รูขุมขนเห็นชัดจากความมันสะสมบริเวณช่วงกลางใบหน้า',
    detailEn: 'Pores are more visible where oil accumulates through the center of the face.',
    careTh: 'ล้างหน้าอย่างอ่อนโยน เพิ่ม BHA สัปดาห์ละ 2–3 ครั้ง และใช้มอยส์เจอไรเซอร์เนื้อเจล',
    careEn: 'Cleanse gently, use BHA 2–3 times weekly, and apply a light gel moisturizer.'
  },
  {
    id: 'dehydration',
    labelTh: 'ผิวขาดน้ำ',
    labelEn: 'Dehydration',
    countTh: 'ภาพรวม',
    countEn: 'Overall',
    areaTh: 'แก้มและรอบปาก',
    areaEn: 'Cheeks and mouth area',
    severityTh: 'เล็กน้อย',
    severityEn: 'Mild',
    color: '#7195B5',
    tint: '#EFF6FB',
    score: 81,
    detailTh: 'ผิวบางส่วนดูแห้งและความชุ่มชื้นไม่สม่ำเสมอ โดยเฉพาะรอบปาก',
    detailEn: 'Some areas appear dry with uneven hydration, especially around the mouth.',
    careTh: 'เพิ่ม Hyaluronic Acid บนผิวหมาดและปิดด้วยมอยส์เจอไรเซอร์ที่มี Ceramide',
    careEn: 'Apply hyaluronic acid to damp skin and seal with a ceramide moisturizer.'
  }
];

const FACE_MARKERS = [
  { id: 'acne', top: '28%', left: '51%', size: 44 },
  { id: 'acne', top: '46%', left: '37%', size: 36 },
  { id: 'acne', top: '53%', left: '42%', size: 30 },
  { id: 'marks', top: '43%', left: '64%', size: 34 },
  { id: 'marks', top: '56%', left: '35%', size: 31 },
  { id: 'pores', top: '50%', left: '52%', size: 42 },
  { id: 'dehydration', top: '66%', left: '52%', size: 35 }
];

const FACE_METRICS = [
  {
    id: 'balance',
    labelTh: 'ความสมดุลโดยรวม',
    labelEn: 'Overall balance',
    score: 82,
    icon: Gauge,
    noteTh: 'องค์ประกอบซ้าย–ขวาดูกลมกลืนเมื่อมองหน้าตรง',
    noteEn: 'The left and right sides look visually balanced from the front.'
  },
  {
    id: 'structure',
    labelTh: 'โครงสร้างใบหน้า',
    labelEn: 'Face structure',
    score: 78,
    icon: Shapes,
    noteTh: 'รูปหน้าวงรี ช่วงหน้าผากและกรามต่อเนื่องเป็นธรรมชาติ',
    noteEn: 'Oval face shape with a natural transition from forehead to jaw.'
  },
  {
    id: 'symmetry',
    labelTh: 'ความสมมาตร',
    labelEn: 'Facial symmetry',
    score: 79,
    icon: ScanFace,
    noteTh: 'มีความต่างเล็กน้อยบริเวณคิ้วและแนวกราม ซึ่งพบได้ตามธรรมชาติ',
    noteEn: 'Minor natural differences appear around the brows and jawline.'
  },
  {
    id: 'eyes',
    labelTh: 'บริเวณดวงตา',
    labelEn: 'Eye area',
    score: 80,
    icon: Eye,
    noteTh: 'ระยะห่างและแนวระดับดวงตาดูสมดุล',
    noteEn: 'Eye spacing and horizontal alignment appear balanced.'
  },
  {
    id: 'features',
    labelTh: 'จมูกและริมฝีปาก',
    labelEn: 'Nose and lips',
    score: 77,
    icon: Smile,
    noteTh: 'สัดส่วนช่วงกลางใบหน้าเข้ากับรูปหน้าโดยรวม',
    noteEn: 'Mid-face features sit proportionally within the overall face shape.'
  },
  {
    id: 'skin',
    labelTh: 'สภาพผิวที่มองเห็น',
    labelEn: 'Visible skin condition',
    score: 72,
    icon: Sparkles,
    noteTh: 'พบสิวและรอยแดงเล็กน้อย โดยเน้นบริเวณแก้มและ T-zone',
    noteEn: 'Mild acne and redness are visible around the cheeks and T-zone.'
  }
];

export default function TreatmentFlowView({ lang, onSaveReport }) {
  const isTh = lang === 'th';
  const uploadRef = useRef(null);
  const workspaceRef = useRef(null);
  const [selectedId, setSelectedId] = useState('acne');
  const [resultTab, setResultTab] = useState('overview');
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [resultView, setResultView] = useState('summary');
  const [isClearView, setIsClearView] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [imageSrc, setImageSrc] = useState(PRESET_MODELS[0].avatar);
  const selected = useMemo(
    () => SKIN_FINDINGS.find((item) => item.id === selectedId) || SKIN_FINDINGS[0],
    [selectedId]
  );

  useEffect(() => {
    if (!isScanning) return undefined;

    const timer = window.setInterval(() => {
      setScanProgress((current) => {
        const next = Math.min(current + 4, 100);
        if (next === 100) {
          window.clearInterval(timer);
          setIsScanning(false);
          setResultView('summary');
          setHasScanned(true);
        }
        return next;
      });
    }, 55);

    return () => window.clearInterval(timer);
  }, [isScanning]);

  useEffect(() => {
    if (!hasScanned) return undefined;

    const frame = window.requestAnimationFrame(() => {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      workspace.scrollTop = 0;
      const main = workspace.closest('.dashboard-main');
      if (main) main.scrollTop = 0;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hasScanned, resultView]);

  const startScan = () => {
    setIsClearView(false);
    setResultView('summary');
    setHasScanned(false);
    setScanProgress(0);
    setIsScanning(true);
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        setImageSrc(reader.result);
        setResultView('summary');
        setHasScanned(false);
        setScanProgress(0);
      }
    });
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <div ref={workspaceRef} className={`skin-scan-workspace face-score-workspace${hasScanned ? ` has-results is-${resultView}` : ' is-entry'}`}>
      <header className="skin-scan-header">
        <div className="skin-scan-title">
          <div className="skin-scan-kicker">
            <Sparkles size={14} />
            {isTh ? 'AI FACE SCAN' : 'AI FACE SCAN'}
          </div>
          <div>
            <h1>
              {hasScanned
                ? (resultView === 'details'
                  ? (isTh ? 'รายละเอียดการวัดใบหน้า' : 'Facial measurement details')
                  : (isTh ? 'ผลวิเคราะห์และคะแนนใบหน้าของคุณ' : 'Your face analysis and scores'))
                : (isTh ? 'สแกนใบหน้า วิเคราะห์รูปทรงและสภาพผิว' : 'Scan your face shape and visible skin')}
            </h1>
            <p>
              {hasScanned
                ? (resultView === 'details'
                  ? (isTh
                    ? 'เทียบค่าอัตราส่วนกับช่วงอ้างอิง แล้วเปิดดูจุดผิวและแนวทางดูแล'
                    : 'Compare facial ratios with reference ranges, skin points, and care guidance.')
                  : (isTh
                    ? 'ดูคะแนนภาพรวมก่อน แล้วกดเปิดรายละเอียดการวัดทั้งหมด'
                    : 'Review the overall score, then open the complete measurement details.'))
                : (isTh
                  ? 'จัดใบหน้าให้อยู่กลางกรอบ แสงเพียงพอ และมองตรงก่อนเริ่มสแกน'
                  : 'Center your face, use even lighting, and look straight ahead before scanning.')}
            </p>
          </div>
        </div>

        {hasScanned && (
          <>
            <div className="skin-health-score" aria-label={isTh ? 'คะแนนภาพรวม 78 จาก 100' : 'Overall score 78 out of 100'}>
              <div className="skin-health-ring"><strong>78</strong><span>/100</span></div>
              <div><span>{isTh ? 'คะแนนภาพรวม' : 'Overall score'}</span><strong>{isTh ? 'สมดุลดี' : 'Well balanced'}</strong></div>
            </div>

            <button className="skin-rescan-button" type="button" onClick={startScan}>
              <RefreshCw size={18} />
              {isTh ? 'สแกนใหม่' : 'Scan again'}
            </button>
          </>
        )}
      </header>

      {!hasScanned ? (
        <section className="skin-scan-entry">
          <div className="skin-entry-intro">
            <span className="skin-entry-step">{isTh ? 'ฟังก์ชันที่ 1 · FACE SCAN' : 'FUNCTION 1 · FACE SCAN'}</span>
            <h2>{isTh ? 'ถ่ายหน้าตรงเพียงครั้งเดียว' : 'One front-facing scan'}</h2>
            <p>
              {isTh
                ? 'ระบบจะประเมินรูปหน้า ความสมดุล สัดส่วน และสิ่งที่มองเห็นบนผิว เช่น สิว รอยแดง รอยสิว และรูขุมขน'
                : 'We will assess face shape, balance, proportions, and visible concerns such as acne, redness, marks, and pores.'}
            </p>
            <div className="skin-entry-checks">
              <span><CheckCircle2 size={15} />{isTh ? 'มองตรง ไม่เอียงหน้า' : 'Look straight ahead'}</span>
              <span><CheckCircle2 size={15} />{isTh ? 'อยู่ในที่แสงสว่างเพียงพอ' : 'Use even lighting'}</span>
              <span><CheckCircle2 size={15} />{isTh ? 'ไม่สวมแว่นหรือหน้ากาก' : 'Remove glasses and mask'}</span>
            </div>
          </div>

          <div className="skin-entry-stage">
            <img src={imageSrc} alt={isTh ? 'ใบหน้าที่เตรียมสแกนและวิเคราะห์' : 'Face ready for analysis'} />
            <div className="skin-entry-face-guide" aria-hidden="true">
              <span className="corner top-left" />
              <span className="corner top-right" />
              <span className="corner bottom-left" />
              <span className="corner bottom-right" />
            </div>

            {isScanning && (
              <>
                <div className="skin-scan-beam" />
                <div className="skin-entry-scanning">
                  <Activity size={24} />
                  <strong>{scanProgress}%</strong>
                  <span>{isTh ? 'กำลังอ่านโครงหน้า สัดส่วน และสภาพผิว' : 'Reading face shape, proportions, and visible skin'}</span>
                </div>
              </>
            )}

            <span className="skin-entry-status">
              <span />
              {isScanning
                ? (isTh ? 'กำลังสแกน โปรดอยู่นิ่ง' : 'Scanning — please stay still')
                : (isTh ? 'ตรวจพบใบหน้า พร้อมเริ่มสแกน' : 'Face detected — ready to scan')}
            </span>
          </div>

          <div className="skin-entry-action">
            <div className="skin-entry-privacy">
              <ShieldCheck size={18} />
              <div>
                <strong>{isTh ? 'ภาพของคุณได้รับการปกป้อง' : 'Your image is protected'}</strong>
                <span>{isTh ? 'ใช้เพื่อสร้างผลวิเคราะห์เบื้องต้น และไม่ใช่การวินิจฉัยทางการแพทย์' : 'Used for preliminary analysis and not as a medical diagnosis'}</span>
              </div>
            </div>
            <button type="button" onClick={startScan} disabled={isScanning}>
              {isScanning ? <Activity size={19} /> : <Camera size={19} />}
              {isScanning
                ? (isTh ? `กำลังสแกน ${scanProgress}%` : `Scanning ${scanProgress}%`)
                : (isTh ? 'เริ่มสแกนใบหน้า' : 'Start face scan')}
            </button>
            <button className="skin-upload-button" type="button" onClick={() => uploadRef.current?.click()} disabled={isScanning}>
              <Upload size={18} />
              {isTh ? 'เลือกรูปจากเครื่อง' : 'Choose a photo'}
            </button>
            <input ref={uploadRef} type="file" accept="image/*" hidden onChange={handleImageUpload} />
            <small>{isTh ? 'ใช้เวลาประมาณ 2–3 วินาที' : 'Takes about 2–3 seconds'}</small>
          </div>
        </section>
      ) : resultView === 'summary' ? (
        <FaceScanSummary
          isTh={isTh}
          imageSrc={imageSrc}
          onOpenDetails={() => setResultView('details')}
        />
      ) : (
      <FaceDetailReport
        isTh={isTh}
        imageSrc={imageSrc}
        onBack={() => setResultView('summary')}
        onSaveReport={onSaveReport}
      >
      <div className="skin-scan-grid skin-results-layout">
        <section className="skin-panel skin-camera-panel">
          <div className="skin-panel-heading">
            <div>
              <span className="skin-step">01</span>
              <h2>{isTh ? 'แผนที่ใบหน้าและจุดที่ตรวจพบ' : 'Face map and detected points'}</h2>
            </div>
            <div className="skin-panel-heading-actions">
              <button
                type="button"
                className={`skin-clear-mode${isClearView ? ' is-active' : ''}`}
                aria-pressed={isClearView}
                onClick={() => setIsClearView((current) => !current)}
              >
                {isClearView ? <Eye size={14} /> : <EyeOff size={14} />}
                {isClearView
                  ? (isTh ? 'แสดงผลวิเคราะห์' : 'Show analysis')
                  : (isTh ? 'โหมดเคลียร์' : 'Clear view')}
              </button>
              <span className="skin-live-badge"><span />{isTh ? 'วิเคราะห์แล้ว' : 'Analysed'}</span>
            </div>
          </div>

          <div className={`skin-face-stage${isClearView ? ' is-clear-view' : ''}`}>
            <img src={imageSrc} alt={isTh ? 'ภาพใบหน้าสำหรับวิเคราะห์รูปทรงและผิว' : 'Face used for shape and skin analysis'} />
            {!isClearView && <div className="skin-face-guide" aria-hidden="true" />}

            {!isScanning && !isClearView && FACE_MARKERS.map((marker, index) => {
              const finding = SKIN_FINDINGS.find((item) => item.id === marker.id);
              const active = selectedId === marker.id;
              return (
                <button
                  type="button"
                  key={`${marker.id}-${index}`}
                  className={`skin-marker${active ? ' is-active' : ''}`}
                  aria-label={`${isTh ? finding.labelTh : finding.labelEn} ${index + 1}`}
                  title={isTh ? finding.labelTh : finding.labelEn}
                  onClick={() => setSelectedId(marker.id)}
                  style={{
                    top: marker.top,
                    left: marker.left,
                    width: `var(--marker-responsive-size, ${marker.size}px)`,
                    height: `var(--marker-responsive-size, ${marker.size}px)`,
                    '--marker-scale': marker.size / 4,
                    '--marker-color': finding.color
                  }}
                >
                  <span />
                </button>
              );
            })}

            {isScanning && (
              <>
                <div className="skin-scan-beam" />
                <div className="skin-scan-progress">
                  <Camera size={22} />
                  <strong>{scanProgress}%</strong>
                  <span>{isTh ? 'กำลังอ่านค่าผิวทั่วใบหน้า' : 'Reading your skin map'}</span>
                </div>
              </>
            )}

            {!isClearView && (
              <div className="skin-image-caption">
                <ShieldCheck size={15} />
                {isTh ? 'ภาพใช้เพื่อการประเมินเบื้องต้นเท่านั้น' : 'For preliminary assessment only'}
              </div>
            )}
          </div>

          <div className="skin-map-legend">
            {SKIN_FINDINGS.map((item) => (
              <button
                type="button"
                key={item.id}
                className={selectedId === item.id ? 'is-active' : ''}
                onClick={() => setSelectedId(item.id)}
              >
                <span style={{ background: item.color }} />
                <div>
                  <strong>{isTh ? item.labelTh : item.labelEn}</strong>
                  <small>{isTh ? item.countTh : item.countEn}</small>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="skin-panel skin-findings-panel">
          <div className="skin-panel-heading">
            <div>
              <span className="skin-step">02</span>
              <h2>{isTh ? 'คะแนนและคำวิจารณ์' : 'Scores and review'}</h2>
            </div>
            <span className="skin-count-badge">{isTh ? 'รูปหน้าวงรี' : 'Oval face'}</span>
          </div>

          <div className="face-result-tabs" role="tablist" aria-label={isTh ? 'เลือกประเภทผลวิเคราะห์' : 'Choose analysis result'}>
            <button type="button" role="tab" aria-selected={resultTab === 'overview'} className={resultTab === 'overview' ? 'is-active' : ''} onClick={() => setResultTab('overview')}>
              {isTh ? 'ภาพรวม' : 'Overview'}
            </button>
            <button type="button" role="tab" aria-selected={resultTab === 'skin'} className={resultTab === 'skin' ? 'is-active' : ''} onClick={() => setResultTab('skin')}>
              {isTh ? 'สภาพผิว' : 'Visible skin'}
            </button>
          </div>

          {resultTab === 'overview' ? (
            <>
              <article className="face-overall-card">
                <div>
                  <span>{isTh ? 'คะแนนภาพรวม' : 'Overall score'}</span>
                  <strong>7.8<small>/10</small></strong>
                </div>
                <p>
                  <b>{isTh ? 'รูปหน้าวงรี · สมดุลดี' : 'Oval shape · Well balanced'}</b>
                  {isTh
                    ? 'โครงหน้ามีเส้นต่อเนื่องนุ่มนวล จุดเด่นคือความสมดุลช่วงดวงตาและสัดส่วนโดยรวม'
                    : 'The facial outline flows naturally, with strong eye-area balance and overall proportion.'}
                </p>
              </article>

              <div className="face-metric-list">
                {FACE_METRICS.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <article key={metric.id}>
                      <Icon size={15} />
                      <div>
                        <span><strong>{isTh ? metric.labelTh : metric.labelEn}</strong><b>{(metric.score / 10).toFixed(1)}</b></span>
                        <div className="face-metric-track"><i style={{ width: `${metric.score}%` }} /></div>
                        <small>{isTh ? metric.noteTh : metric.noteEn}</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="skin-finding-list">
                {SKIN_FINDINGS.map((item) => {
                  const active = selectedId === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={active ? 'is-active' : ''}
                      onClick={() => setSelectedId(item.id)}
                      style={{ '--finding-color': item.color, '--finding-tint': item.tint }}
                    >
                      <span className="skin-finding-dot" />
                      <div className="skin-finding-copy">
                        <strong>{isTh ? item.labelTh : item.labelEn}</strong>
                        <span><MapPin size={12} />{isTh ? item.areaTh : item.areaEn}</span>
                      </div>
                      <div className="skin-finding-level">
                        <strong>{item.score}</strong>
                        <small>{isTh ? item.severityTh : item.severityEn}</small>
                      </div>
                    </button>
                  );
                })}
              </div>

              <article className="skin-selected-detail" style={{ '--detail-color': selected.color, '--detail-tint': selected.tint }}>
                <div className="skin-detail-topline">
                  <span>{isTh ? 'รายละเอียดที่เลือก' : 'Selected detail'}</span>
                  <strong>{isTh ? selected.labelTh : selected.labelEn}</strong>
                </div>
                <p>{isTh ? selected.detailTh : selected.detailEn}</p>
                <div className="skin-care-tip">
                  <Sparkles size={16} />
                  <div><span>{isTh ? 'คำแนะนำเบื้องต้น' : 'First care step'}</span><strong>{isTh ? selected.careTh : selected.careEn}</strong></div>
                </div>
              </article>
            </>
          )}
        </section>

        <section className="skin-panel skin-plan-panel">
          <div className="skin-panel-heading">
            <div>
              <span className="skin-step">03</span>
              <h2>{isTh ? 'สรุปและแนวทางดูแล' : 'Summary and care guidance'}</h2>
            </div>
            <span className="skin-plan-badge">{isTh ? 'เฉพาะคุณ' : 'Personal'}</span>
          </div>

          <div className="face-review-stack">
            <article>
              <span>{isTh ? 'จุดเด่นของใบหน้า' : 'Facial strengths'}</span>
              <strong>{isTh ? 'ดวงตาสมดุล · รูปหน้าวงรี · สัดส่วนกลมกลืน' : 'Balanced eyes · Oval shape · Harmonious proportions'}</strong>
            </article>
            <article>
              <span>{isTh ? 'จุดที่ควรสังเกต' : 'Points to watch'}</span>
              <strong>{isTh ? 'แนวคิ้วและกรามต่างกันเล็กน้อยตามธรรมชาติ ไม่จำเป็นต้องแก้ไข' : 'Minor natural brow and jaw differences; correction is not necessary.'}</strong>
            </article>
            <article>
              <span>{isTh ? 'ลำดับดูแลที่แนะนำ' : 'Suggested priority'}</span>
              <strong>{isTh ? 'ลดสิวอักเสบ → ลดรอยแดง → รักษาความชุ่มชื้น' : 'Calm active acne → reduce redness → maintain hydration'}</strong>
            </article>
          </div>

          <div className="skin-routine">
            <div className="skin-routine-card morning">
              <div className="skin-routine-icon"><Sun size={19} /></div>
              <div>
                <span>{isTh ? 'ตอนเช้า' : 'Morning'}</span>
                <ol>
                  <li>{isTh ? 'เจลล้างหน้าอ่อนโยน' : 'Gentle cleanser'}</li>
                  <li>{isTh ? 'Niacinamide + มอยส์เจอไรเซอร์' : 'Niacinamide + moisturizer'}</li>
                  <li>{isTh ? 'กันแดด SPF 50+' : 'SPF 50+ sunscreen'}</li>
                </ol>
              </div>
            </div>

            <div className="skin-routine-card evening">
              <div className="skin-routine-icon"><Moon size={19} /></div>
              <div>
                <span>{isTh ? 'ตอนเย็น' : 'Evening'}</span>
                <ol>
                  <li>{isTh ? 'ล้างเครื่องสำอาง' : 'Remove makeup and cleanse'}</li>
                  <li>{isTh ? 'BHA สลับวัน / แต้มสิว' : 'Alternate-day BHA / spot care'}</li>
                  <li>{isTh ? 'มอยส์เจอไรเซอร์ Ceramide' : 'Ceramide moisturizer'}</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="skin-week-goal">
            <div className="skin-goal-heading">
              <div><Droplets size={17} /><strong>{isTh ? 'เป้าหมาย 4 สัปดาห์' : '4-week goal'}</strong></div>
              <span>62%</span>
            </div>
            <div className="skin-goal-track"><span /></div>
            <p>{isTh ? 'ลดการอักเสบ · เติมความชุ่มชื้น · ป้องกันรอยใหม่' : 'Calm inflammation · restore moisture · prevent new marks'}</p>
          </div>

          <div className="skin-doctor-note">
            <AlertCircle size={18} />
            <p>
              <strong>{isTh ? 'เมื่อไหร่ควรพบผู้เชี่ยวชาญ?' : 'When should you see a specialist?'}</strong>
              <span>{isTh ? 'หากสิวอักเสบเจ็บ ลุกลาม หรือไม่ดีขึ้นภายใน 6–8 สัปดาห์ ควรปรึกษาแพทย์ผิวหนัง' : 'Consult a dermatologist if painful acne spreads or does not improve within 6–8 weeks.'}</span>
            </p>
          </div>

          <button className="skin-save-plan" type="button" onClick={onSaveReport}>
            <Bookmark size={17} />
            {isTh ? 'บันทึกผลวิเคราะห์และคำแนะนำ' : 'Save analysis and guidance'}
          </button>

          <p className="skin-disclaimer">
            <CheckCircle2 size={13} />
            {isTh ? 'ผลวิเคราะห์นี้ไม่ใช่การวินิจฉัยทางการแพทย์' : 'This analysis is not a medical diagnosis.'}
          </p>
        </section>
      </div>
      </FaceDetailReport>
      )}
    </div>
  );
}
