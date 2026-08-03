import React, { useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  Eye,
  Gauge,
  Info,
  Ruler,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Target
} from 'lucide-react';

const SCORE_CATEGORIES = [
  {
    id: 'harmony',
    labelTh: 'ความกลมกลืน',
    labelEn: 'Facial harmony',
    score: 82
  },
  {
    id: 'structure',
    labelTh: 'โครงสร้างใบหน้า',
    labelEn: 'Face structure',
    score: 78
  },
  {
    id: 'symmetry',
    labelTh: 'ความสมมาตร',
    labelEn: 'Symmetry',
    score: 79
  },
  {
    id: 'eyes',
    labelTh: 'สัดส่วนดวงตา',
    labelEn: 'Eye proportions',
    score: 80
  },
  {
    id: 'features',
    labelTh: 'จมูกและริมฝีปาก',
    labelEn: 'Nose and lips',
    score: 77
  },
  {
    id: 'skin',
    labelTh: 'สภาพผิวที่มองเห็น',
    labelEn: 'Visible skin',
    score: 72
  }
];

const FACE_MEASUREMENTS = [
  {
    id: 'face-ratio',
    groupTh: 'โครงสร้างรวม',
    groupEn: 'Overall structure',
    labelTh: 'อัตราส่วนความกว้างต่อความยาวใบหน้า',
    labelEn: 'Face width-to-height ratio',
    value: '0.74',
    targetTh: 'ช่วงอ้างอิง 0.70–0.78',
    targetEn: 'Reference range 0.70–0.78',
    position: 54,
    idealStart: 38,
    idealEnd: 66,
    status: 'ideal',
    noteTh: 'อยู่ในช่วงสมดุลของรูปหน้าวงรี',
    noteEn: 'Within the balanced range for an oval face.'
  },
  {
    id: 'face-thirds',
    groupTh: 'โครงสร้างรวม',
    groupEn: 'Overall structure',
    labelTh: 'สัดส่วนสามส่วนแนวตั้ง',
    labelEn: 'Vertical facial thirds',
    value: '1 : 0.97 : 1.02',
    targetTh: 'เป้าหมายใกล้เคียง 1 : 1 : 1',
    targetEn: 'Target close to 1 : 1 : 1',
    position: 58,
    idealStart: 42,
    idealEnd: 64,
    status: 'ideal',
    noteTh: 'ช่วงกลางใบหน้าสั้นกว่าส่วนอื่นเล็กน้อย',
    noteEn: 'The mid-face is slightly shorter than the other thirds.'
  },
  {
    id: 'eye-spacing',
    groupTh: 'ดวงตาและคิ้ว',
    groupEn: 'Eyes and brows',
    labelTh: 'ระยะห่างระหว่างดวงตา',
    labelEn: 'Inter-eye spacing',
    value: '0.98× ความกว้างตา',
    targetTh: 'ช่วงอ้างอิง 0.90–1.10×',
    targetEn: 'Reference range 0.90–1.10×',
    position: 49,
    idealStart: 35,
    idealEnd: 66,
    status: 'ideal',
    noteTh: 'ระยะห่างดวงตากลมกลืนกับความกว้างใบหน้า',
    noteEn: 'Eye spacing is harmonious with the face width.'
  },
  {
    id: 'eye-tilt',
    groupTh: 'ดวงตาและคิ้ว',
    groupEn: 'Eyes and brows',
    labelTh: 'แนวระดับหัวตา–หางตา',
    labelEn: 'Eye-line inclination',
    value: '+3.1°',
    targetTh: 'ช่วงอ้างอิง +1° ถึง +5°',
    targetEn: 'Reference range +1° to +5°',
    position: 56,
    idealStart: 40,
    idealEnd: 65,
    status: 'ideal',
    noteTh: 'แนวหางตายกเล็กน้อยและใกล้เคียงกันทั้งสองข้าง',
    noteEn: 'A mild upward tilt appears similar on both sides.'
  },
  {
    id: 'nose-width',
    groupTh: 'ช่วงกลางใบหน้า',
    groupEn: 'Mid-face',
    labelTh: 'ความกว้างฐานจมูกต่อระยะหัวตา',
    labelEn: 'Nose base to inner-eye width',
    value: '1.06×',
    targetTh: 'ช่วงอ้างอิง 0.90–1.05×',
    targetEn: 'Reference range 0.90–1.05×',
    position: 69,
    idealStart: 37,
    idealEnd: 62,
    status: 'watch',
    noteTh: 'กว้างกว่าช่วงอ้างอิงเล็กน้อย แต่ยังดูกลมกลืนโดยรวม',
    noteEn: 'Slightly above the reference range while remaining harmonious overall.'
  },
  {
    id: 'mouth-width',
    groupTh: 'ช่วงล่างใบหน้า',
    groupEn: 'Lower face',
    labelTh: 'ความกว้างริมฝีปากต่อระยะรูม่านตา',
    labelEn: 'Mouth width to pupil distance',
    value: '0.96×',
    targetTh: 'ช่วงอ้างอิง 0.90–1.10×',
    targetEn: 'Reference range 0.90–1.10×',
    position: 48,
    idealStart: 34,
    idealEnd: 68,
    status: 'ideal',
    noteTh: 'ความกว้างริมฝีปากสมดุลกับดวงตาและช่วงกลางหน้า',
    noteEn: 'Mouth width balances well with the eyes and mid-face.'
  },
  {
    id: 'jaw-width',
    groupTh: 'ช่วงล่างใบหน้า',
    groupEn: 'Lower face',
    labelTh: 'ความกว้างกรามต่อความกว้างโหนกแก้ม',
    labelEn: 'Jaw-to-cheekbone width',
    value: '0.81×',
    targetTh: 'ช่วงอ้างอิง 0.76–0.84×',
    targetEn: 'Reference range 0.76–0.84×',
    position: 55,
    idealStart: 38,
    idealEnd: 64,
    status: 'ideal',
    noteTh: 'แนวกรามต่อเนื่องกับรูปหน้าวงรีอย่างเป็นธรรมชาติ',
    noteEn: 'The jawline transitions naturally into the oval facial outline.'
  },
  {
    id: 'jaw-balance',
    groupTh: 'ช่วงล่างใบหน้า',
    groupEn: 'Lower face',
    labelTh: 'ความต่างของแนวกรามซ้าย–ขวา',
    labelEn: 'Left-to-right jaw difference',
    value: '2.8%',
    targetTh: 'ช่วงอ้างอิงไม่เกิน 5%',
    targetEn: 'Reference range ≤ 5%',
    position: 43,
    idealStart: 22,
    idealEnd: 58,
    status: 'ideal',
    noteTh: 'มีความต่างเล็กน้อยตามธรรมชาติและไม่เด่นชัด',
    noteEn: 'A small natural difference is present but not visually prominent.'
  }
];

const DISTRIBUTION_BARS = [12, 18, 27, 41, 58, 76, 91, 100, 92, 78, 61, 43, 29, 18, 10];

function ScoreBreakdown({ isTh, compact = false }) {
  return (
    <div className={`face-report-score-list${compact ? ' is-compact' : ''}`}>
      {SCORE_CATEGORIES.map((item) => (
        <article key={item.id}>
          <div>
            <span>{isTh ? item.labelTh : item.labelEn}</span>
            <strong>{(item.score / 10).toFixed(1)}</strong>
          </div>
          <div className="face-report-score-track">
            <i style={{ width: `${item.score}%` }} />
          </div>
        </article>
      ))}
    </div>
  );
}

export function FaceScanSummary({ isTh, imageSrc, onOpenDetails }) {
  return (
    <section className="face-scan-summary" aria-labelledby="face-summary-title">
      <div className="face-summary-portrait">
        <img src={imageSrc} alt={isTh ? 'ภาพใบหน้าหลังสแกน' : 'Scanned face'} />
        <span className="face-summary-complete">
          <CheckCircle2 size={14} />
          {isTh ? 'สแกนสำเร็จ' : 'Scan complete'}
        </span>
        <div className="face-summary-score-orb" aria-label={isTh ? 'คะแนน 7.8 จาก 10' : 'Score 7.8 out of 10'}>
          <strong>7.8</strong>
          <span>/10</span>
        </div>
      </div>

      <div className="face-summary-content">
        <div className="face-summary-heading">
          <span><Sparkles size={14} />{isTh ? 'ผลเบื้องต้นจากภาพหน้าตรง' : 'Front-photo preliminary result'}</span>
          <h2 id="face-summary-title">{isTh ? 'รูปหน้าวงรี · ความสมดุลดี' : 'Oval face · Well balanced'}</h2>
          <p>
            {isTh
              ? 'โครงหน้าและสัดส่วนหลักอยู่ในช่วงกลมกลืน จุดเด่นคือระยะห่างดวงตา แนวกราม และสัดส่วนช่วงกลางใบหน้า'
              : 'Core facial proportions appear harmonious, with strengths in eye spacing, jaw balance, and mid-face proportion.'}
          </p>
        </div>

        <div className="face-summary-kpis">
          <article><Gauge size={17} /><span>{isTh ? 'ความกลมกลืน' : 'Harmony'}</span><strong>8.2</strong></article>
          <article><ScanFace size={17} /><span>{isTh ? 'ความสมมาตร' : 'Symmetry'}</span><strong>7.9</strong></article>
          <article><Eye size={17} /><span>{isTh ? 'สัดส่วนดวงตา' : 'Eye ratios'}</span><strong>8.0</strong></article>
        </div>

        <ScoreBreakdown isTh={isTh} compact />

        <button className="face-detail-trigger" type="button" onClick={onOpenDetails}>
          <span className="face-detail-trigger-icon"><BarChart3 size={20} /></span>
          <span>
            <strong>{isTh ? 'ดูรายละเอียดการวัดทั้งหมด' : 'View all measurement details'}</strong>
            <small>{isTh ? 'ช่วงอ้างอิง · ค่าอัตราส่วน · จุดผิว · แนวทางดูแล' : 'Ranges · ratios · skin points · care guidance'}</small>
          </span>
          <ChevronRight size={20} />
        </button>

        <p className="face-summary-note">
          <ShieldCheck size={14} />
          {isTh
            ? 'ผลนี้เป็นการประเมินเบื้องต้นจากภาพหน้าตรงหนึ่งภาพ ไม่ใช่การวินิจฉัยทางการแพทย์'
            : 'This is a preliminary assessment from one front-facing photo, not a medical diagnosis.'}
        </p>
      </div>
    </section>
  );
}

function PopulationDistribution({ isTh }) {
  return (
    <div className="face-population-card">
      <div className="face-population-heading">
        <div>
          <span>{isTh ? 'ตำแหน่งคะแนนโดยประมาณ' : 'Approximate score position'}</span>
          <strong>{isTh ? 'สูงกว่าค่ากลางของข้อมูลตัวอย่าง 72%' : 'Above 72% of the sample reference'}</strong>
        </div>
        <span className="face-population-percentile">P72</span>
      </div>
      <div className="face-population-chart" aria-label={isTh ? 'กราฟการกระจายคะแนน ตัวชี้อยู่ที่เปอร์เซ็นไทล์ 72' : 'Score distribution chart with marker at the 72nd percentile'}>
        <div className="face-population-bars" aria-hidden="true">
          {DISTRIBUTION_BARS.map((height, index) => <i key={`${height}-${index}`} style={{ height: `${height}%` }} />)}
        </div>
        <span className="face-population-marker"><b>7.8</b></span>
      </div>
      <div className="face-population-axis"><span>4.0</span><span>6.0</span><span>8.0</span><span>10</span></div>
    </div>
  );
}

function OverviewTab({ isTh, imageSrc }) {
  const strengths = isTh
    ? ['ระยะห่างดวงตาอยู่ในช่วงกลมกลืน', 'แนวกรามซ้าย–ขวาใกล้เคียงกัน', 'สัดส่วนสามส่วนแนวตั้งสมดุล']
    : ['Eye spacing sits in a harmonious range', 'Left and right jawlines are closely balanced', 'Vertical facial thirds are well balanced'];
  const watchItems = isTh
    ? ['ฐานจมูกกว้างกว่าช่วงอ้างอิงเล็กน้อย', 'พบรอยแดงและสิวเล็กน้อยบริเวณแก้ม', 'ควรรักษาความชุ่มชื้นบริเวณรอบปาก']
    : ['Nose base is slightly above the reference range', 'Mild redness and acne appear around the cheeks', 'Hydration should be maintained around the mouth'];

  return (
    <div className="face-detail-overview">
      <div className="face-detail-overview-grid">
        <article className="face-overview-desktop-portrait-card">
          <div className="face-overview-desktop-portrait">
            <img
              src={imageSrc}
              alt={isTh ? 'ภาพใบหน้าที่ใช้ประเมินภาพรวม' : 'Face used for the overview assessment'}
            />
            <span><CheckCircle2 size={14} />{isTh ? 'ภาพที่ใช้ประเมิน' : 'Assessment image'}</span>
            <div><strong>7.8</strong><small>/10</small></div>
          </div>
          <p>
            <ScanFace size={15} />
            {isTh ? 'ภาพหน้าตรง · เห็นใบหน้าเต็ม · พร้อมอ่านผล' : 'Front view · Full face · Ready to review'}
          </p>
        </article>

        <article className="face-harmony-card">
          <div className="face-harmony-score">
            <div><strong>7.8</strong><span>/10</span></div>
            <p><b>{isTh ? 'ความกลมกลืนดี' : 'Good harmony'}</b>{isTh ? 'คะแนนรวมจาก 8 กลุ่มอัตราส่วน' : 'Combined from 8 ratio groups'}</p>
          </div>
          <PopulationDistribution isTh={isTh} />
        </article>

        <article className="face-traits-card">
          <div className="face-traits-column is-positive">
            <div className="face-traits-title"><CheckCircle2 size={17} /><span>{isTh ? 'จุดที่อยู่ในเกณฑ์ดี' : 'Within a good range'}</span></div>
            {strengths.map((item) => <p key={item}>{item}</p>)}
          </div>
          <div className="face-traits-column is-watch">
            <div className="face-traits-title"><Target size={17} /><span>{isTh ? 'จุดที่ควรสังเกต' : 'Points to review'}</span></div>
            {watchItems.map((item) => <p key={item}>{item}</p>)}
          </div>
        </article>
      </div>

      <section className="face-detail-breakdown">
        <div className="face-detail-section-heading">
          <div><BarChart3 size={18} /><span><strong>{isTh ? 'คะแนนรายหมวด' : 'Category breakdown'}</strong><small>{isTh ? 'ใช้เพื่ออธิบายองค์ประกอบของคะแนนรวม' : 'How the overall score is composed'}</small></span></div>
          <span>{isTh ? '6 หมวด' : '6 areas'}</span>
        </div>
        <ScoreBreakdown isTh={isTh} />
      </section>

      <div className="face-quality-strip">
        <article><span>{isTh ? 'ท่าทาง' : 'Pose'}</span><strong>{isTh ? 'หน้าตรง' : 'Centered'}</strong><small>0.4°</small></article>
        <article><span>{isTh ? 'แสง' : 'Lighting'}</span><strong>{isTh ? 'เพียงพอ' : 'Good'}</strong><small>94%</small></article>
        <article><span>{isTh ? 'ความคมชัด' : 'Clarity'}</span><strong>{isTh ? 'คมชัด' : 'Clear'}</strong><small>96%</small></article>
        <article><span>{isTh ? 'ใบหน้าถูกบัง' : 'Occlusion'}</span><strong>{isTh ? 'ไม่พบ' : 'None'}</strong><small>0%</small></article>
      </div>
    </div>
  );
}

function RatiosTab({ isTh, imageSrc }) {
  const grouped = FACE_MEASUREMENTS.reduce((groups, metric) => {
    const key = isTh ? metric.groupTh : metric.groupEn;
    if (!groups[key]) groups[key] = [];
    groups[key].push(metric);
    return groups;
  }, {});

  return (
    <div className="face-ratio-layout">
      <aside className="face-ratio-portrait-card">
        <div className="face-ratio-portrait">
          <img src={imageSrc} alt={isTh ? 'ภาพหน้าตรงพร้อมเส้นอ้างอิงสัดส่วน' : 'Front-facing portrait with proportion guides'} />
          <div className="face-ratio-guide" aria-hidden="true"><i /><i /><i /><span /><span /></div>
          <span>{isTh ? 'ภาพหน้าตรง' : 'Front view'}</span>
        </div>
        <div className="face-ratio-explainer">
          <Ruler size={18} />
          <div><strong>{isTh ? 'เราอ่านค่าอย่างไร' : 'How to read the values'}</strong><p>{isTh ? 'แถบสีม่วงคือช่วงอ้างอิง จุดสีดำคือค่าตัวอย่างของผู้ใช้' : 'The purple band is the reference range; the black marker is the sample user value.'}</p></div>
        </div>
      </aside>

      <div className="face-ratio-groups">
        {Object.entries(grouped).map(([group, metrics]) => (
          <section key={group}>
            <div className="face-ratio-group-heading"><span>{group}</span><small>{metrics.length} {isTh ? 'รายการ' : 'measurements'}</small></div>
            <div className="face-ratio-list">
              {metrics.map((metric) => (
                <article key={metric.id} className={`face-ratio-row is-${metric.status}`}>
                  <div className="face-ratio-row-heading">
                    <div><strong>{isTh ? metric.labelTh : metric.labelEn}</strong><small>{isTh ? metric.noteTh : metric.noteEn}</small></div>
                    <div><strong>{metric.value}</strong><span>{metric.status === 'ideal' ? (isTh ? 'อยู่ในช่วง' : 'In range') : (isTh ? 'สังเกตได้' : 'Review')}</span></div>
                  </div>
                  <div
                    className="face-ratio-track"
                    style={{
                      '--metric-position': `${metric.position}%`,
                      '--ideal-start': `${metric.idealStart}%`,
                      '--ideal-width': `${metric.idealEnd - metric.idealStart}%`
                    }}
                  >
                    <span /><i />
                  </div>
                  <p>{isTh ? metric.targetTh : metric.targetEn}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function FaceDetailReport({ isTh, imageSrc, onBack, onSaveReport, children }) {
  const [activeTab, setActiveTab] = useState('overview');
  const tabs = [
    { id: 'overview', labelTh: 'ภาพรวมเชิงลึก', labelEn: 'Deep overview', icon: Gauge },
    { id: 'ratios', labelTh: 'อัตราส่วนหน้าตรง', labelEn: 'Front ratios', icon: Ruler },
    { id: 'analysis', labelTh: 'จุดผิวและคำแนะนำ', labelEn: 'Skin and guidance', icon: Sparkles }
  ];

  return (
    <section className="face-detail-report">
      <div className="face-detail-toolbar">
        <button type="button" onClick={onBack} className="face-detail-back">
          <ArrowLeft size={18} />
          {isTh ? 'กลับไปหน้าสรุป' : 'Back to summary'}
        </button>
        <div>
          <span><ScanFace size={14} />{isTh ? 'รายงานจากภาพหน้าตรง 1 ภาพ' : 'Report from one front-facing photo'}</span>
          <strong>{isTh ? 'รายละเอียดการวัดใบหน้า' : 'Facial measurement details'}</strong>
        </div>
        <span className="face-detail-status"><CheckCircle2 size={14} />{isTh ? 'ประมวลผลแล้ว' : 'Processed'}</span>
      </div>

      <div className="face-detail-tabs" role="tablist" aria-label={isTh ? 'เลือกส่วนของรายงาน' : 'Choose report section'}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'is-active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              {isTh ? tab.labelTh : tab.labelEn}
            </button>
          );
        })}
      </div>

      <div className={`face-detail-content is-${activeTab}`} role="tabpanel">
        {activeTab === 'overview' && <OverviewTab isTh={isTh} imageSrc={imageSrc} />}
        {activeTab === 'ratios' && <RatiosTab isTh={isTh} imageSrc={imageSrc} />}
        {activeTab === 'analysis' && children}
      </div>

      {activeTab !== 'analysis' && (
        <div className="face-detail-footer">
          <p><Info size={15} />{isTh ? 'ค่าทั้งหมดเป็นข้อมูลตัวอย่างสำหรับสาธิตโครงสร้างรายงานจากภาพหน้าตรง ไม่ใช่ผลตรวจทางการแพทย์' : 'All values are sample data demonstrating a front-photo report structure, not a medical assessment.'}</p>
          <button type="button" onClick={onSaveReport}><Bookmark size={16} />{isTh ? 'บันทึกรายงาน' : 'Save report'}</button>
        </div>
      )}
    </section>
  );
}
