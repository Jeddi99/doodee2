import React from 'react';
import { ShieldCheck, TrendingUp, TrendingDown, ArrowRight, FileText, ScanLine, ClipboardCheck, Sparkles } from 'lucide-react';

export default function SampleReportSection({ lang, onStartScan }) {
  const isTh = lang === 'th';

  const axes = [
    { th: "ความสมดุล", en: "Harmony", value: 7.5, angle: -90 },
    { th: "ความคม", en: "Definition", value: 8.2, angle: -30 },
    { th: "ลักษณะเฉพาะเพศ", en: "Dimorphism", value: 8.2, angle: 30 },
    { th: "บริเวณดวงตา", en: "Eye area", value: 6.8, angle: 90 },
    { th: "ลักษณะใบหน้า", en: "Features", value: 7.7, angle: 150 },
    { th: "ความสมมาตร", en: "Symmetry", value: 7.9, angle: 210 },
  ];

  const reportCards = [
    {
      icon: <ScanLine className="h-6 w-6 text-[#0066cc]" />,
      title: isTh ? "Face baseline" : "Face baseline",
      body: isTh 
        ? "ตั้งค่าพื้นฐานจากโครงหน้า สัดส่วน สัญญาณผิว และคุณภาพรูป ก่อนตีความว่าควรเริ่มจากตรงไหน"
        : "Build a baseline from structure, proportion, skin signal, and photo quality before deciding where to start."
    },
    {
      icon: <ClipboardCheck className="h-6 w-6 text-[#0066cc]" />,
      title: isTh ? "ลำดับคำถามก่อนตัดสินใจ" : "Decision priorities",
      body: isTh
        ? "แยกเรื่องที่อยากสำรวจ สิ่งที่ควรรอดู และคำถามที่ควรถามแพทย์ก่อนเลือกหัตถการ"
        : "Separate areas to explore, items to monitor, and questions to ask a clinician before choosing a procedure."
    },
    {
      icon: <Sparkles className="h-6 w-6 text-[#0066cc]" />,
      title: isTh ? "Directional reference" : "Directional reference",
      body: isTh
        ? "ภาพอ้างอิงช่วยอ่านทิศทางเชิงภาพเท่านั้น ไม่ใช่การพยากรณ์ผลลัพธ์หรือคำแนะนำทางการแพทย์"
        : "Visual references help frame a direction. They are not outcome predictions or medical recommendations."
    }
  ];

  const strengths = [
    { th: "ความสมมาตรของมุมตา", en: "Eye-angle symmetry", value: "8.2" },
    { th: "ความเอียงของแนวปาก", en: "Lip-line tilt", value: "8.2" },
    { th: "องศาตาเฉียง", en: "Canthal tilt", value: "8.2" },
  ];

  const improve = [
    { th: "ความเอียงมุมปาก", en: "Mouth-corner tilt", value: "0.4" },
    { th: "สามส่วนของใบหน้า", en: "Facial thirds", value: "3.0" },
    { th: "ความสมมาตรของกราม", en: "Jaw symmetry", value: "4.1" },
  ];

  // SVG Polar calculation
  const CX = 180;
  const CY = 160;
  const R = 90;

  const polar = (deg, radius) => {
    const rad = (deg * Math.PI) / 180;
    return [CX + Math.cos(rad) * radius, CY + Math.sin(rad) * radius];
  };

  const radarPolygonPath = axes.map((axis, i) => {
    const [x, y] = polar(axis.angle, R * (axis.value / 10));
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ') + ' Z';

  return (
    <section id="report" className="landing-report" style={{ background: '#f5f5f7', color: '#1d1d1f', padding: '100px 24px' }}>
      <div className="landing-report-container" style={{ maxWidth: '1280px', margin: '0 auto' }}>
        
        {/* Header */}
        <div className="landing-report-header" style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 60px auto' }}>
          <span className="landing-section-label" style={{ background: '#f5f5f7', color: '#0066cc', borderColor: '#d2d2d7' }}>
            {isTh ? 'โครงสร้างรายงาน · ข้อมูลตัวอย่าง' : 'Report direction · sample data'}
          </span>

          <h2 className="landing-report-title" style={{ fontSize: '2.75rem', fontWeight: 700, color: '#1d1d1f', lineHeight: 1.05, marginTop: '20px', marginBottom: '16px', letterSpacing: '-0.02em' }}>
            {isTh ? 'รายงานที่เปลี่ยนการสแกนใบหน้าให้เป็นคำถามที่ชัดขึ้น' : 'A report that turns a face scan into better questions'}
          </h2>

          <p className="landing-report-description" style={{ fontSize: '1.1rem', color: '#1d1d1f', lineHeight: 1.6 }}>
            {isTh 
              ? 'อ่านภาพรวมก่อน แล้วค่อยลงรายละเอียดว่าอะไรโดดเด่น อะไรควรสำรวจก่อน และควรถามอะไรเมื่อไปคลินิก'
              : 'Start with the whole face, then see what stands out, what to explore first, and what to ask at a clinic.'
            }
          </p>
        </div>

        {/* 3 Report Cards Feature Section */}
        <div className="landing-report-feature-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px', marginBottom: '60px', borderTop: '1px solid #d2d2d7', borderBottom: '1px solid #d2d2d7', padding: '40px 0' }}>
          {reportCards.map((item, index) => (
            <article className="landing-report-feature" key={index} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <span style={{ fontSize: '2rem', fontWeight: 700, color: '#0066cc' }}>0{index + 1}</span>
                {item.icon}
              </div>
              <h3 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '12px' }}>{item.title}</h3>
              <p style={{ fontSize: '0.95rem', color: '#1d1d1f', lineHeight: 1.6 }}>{item.body}</p>
            </article>
          ))}
        </div>

        {/* Interactive SVG Radar Dashboard */}
        <div className="landing-report-dashboard" style={{ background: '#ffffff', border: '1px solid #d2d2d7', padding: '40px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(47, 62, 70, 0.04)' }}>
          <div className="landing-report-dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '32px', alignItems: 'center' }}>
            
            {/* SVG Radar Chart */}
            <div className="landing-report-radar-panel" style={{ background: '#f5f5f7', padding: '24px', borderRadius: '24px', border: '1px solid #d2d2d7', textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0066cc', marginBottom: '12px' }}>
                60+ Metrics Geometric Radar
              </div>

              <svg className="landing-report-radar" viewBox="0 0 360 320" style={{ width: '100%', height: '260px' }}>
                {[0.25, 0.5, 0.75, 1].map((scale, rIdx) => {
                  const ringPoints = axes.map((axis) => polar(axis.angle, R * scale).join(',')).join(' ');
                  return <polygon key={rIdx} points={ringPoints} fill="none" stroke="rgba(28, 46, 36, 0.12)" strokeWidth="1" />;
                })}

                {axes.map((axis) => {
                  const [x, y] = polar(axis.angle, R);
                  return <line key={axis.en} x1={CX} y1={CY} x2={x} y2={y} stroke="rgba(28, 46, 36, 0.12)" strokeWidth="1" />;
                })}

                <path d={radarPolygonPath} fill="rgba(0, 102, 204, 0.2)" stroke="#0066cc" strokeWidth="2.5" />

                {axes.map((axis, i) => {
                  const [x, y] = polar(axis.angle, R * (axis.value / 10));
                  return <circle key={i} cx={x} cy={y} r="4" fill="#0066cc" stroke="#ffffff" strokeWidth="1.5" />;
                })}

                {axes.map((axis, i) => {
                  const [lx, ly] = polar(axis.angle, R + 26);
                  return (
                    <text key={i} x={lx} y={ly} fill="#1d1d1f" fontSize="11" fontWeight="600" textAnchor="middle" dominantBaseline="middle">
                      {isTh ? axis.th : axis.en} ({axis.value})
                    </text>
                  );
                })}
              </svg>
            </div>

            {/* Strengths */}
            <div className="landing-report-metric-group landing-report-metric-group--strengths">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#0066cc', fontWeight: 700, fontSize: '0.95rem' }}>
                <TrendingUp size={18} />
                <span>{isTh ? 'จุดแข็ง' : 'Strengths'}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {strengths.map((item, idx) => (
                  <div className="landing-report-metric" key={idx} style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', padding: '14px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#1d1d1f', fontWeight: 600 }}>{isTh ? item.th : item.en}</span>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0066cc' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Worth Checking First */}
            <div className="landing-report-metric-group landing-report-metric-group--opportunities">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#D97706', fontWeight: 700, fontSize: '0.95rem' }}>
                <TrendingDown size={18} />
                <span>{isTh ? 'จุดที่คุ้มถ้าถามก่อน' : 'Worth checking first'}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {improve.map((item, idx) => (
                  <div className="landing-report-metric" key={idx} style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', padding: '14px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#1d1d1f', fontWeight: 600 }}>{isTh ? item.th : item.en}</span>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#D97706' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          <div className="landing-report-footer" style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #d2d2d7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div className="landing-report-privacy" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#6e6e73' }}>
              <ShieldCheck size={16} color="#0066cc" />
              <span>{isTh ? 'ข้อมูลของคุณปลอดภัย เราไม่เก็บภาพโดยไม่ได้รับอนุญาต' : 'Your data is private — we never store photos without consent.'}</span>
            </div>

            <button className="btn-brand-primary landing-report-action" onClick={onStartScan} style={{ padding: '10px 24px', fontSize: '0.85rem' }}>
              <FileText size={16} />
              <span>{isTh ? 'เปิดรายงานของฉัน' : 'Open my report'}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

      </div>
    </section>
  );
}
