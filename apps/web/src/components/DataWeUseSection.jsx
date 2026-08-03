import React from 'react';
import { Database, Eye, ShieldCheck, Lock, Cpu, FileCheck } from 'lucide-react';

export default function DataWeUseSection({ lang }) {
  const isTh = lang === 'th';

  const dataItems = [
    {
      icon: Eye,
      title: isTh ? 'โครงสร้างสัดส่วน 3D Mesh' : '3D Geometry & Facial Mesh',
      desc: isTh 
        ? 'วิเคราะห์จุดตัดอ้างอิงบนใบหน้า (Facial Landmarks) เพื่อวัดความสมมาตรและสัดส่วน Golden Ratio'
        : 'Measures 3D landmark points and structural balance across Asian facial ratios.'
    },
    {
      icon: Cpu,
      title: isTh ? 'สัญญาณคุณภาพผิวระดับไมโคร' : 'Skin Texture & Tone Signals',
      desc: isTh 
        ? 'ประเมินความสม่ำเสมอของสีผิว รอยแดง จุดด่างดำ และสภาพความชุ่มชื้นจากค่าการสะท้อนของแสง'
        : 'Evaluates tone distribution, redness, pigmentation, and surface moisture reflection.'
    },
    {
      icon: Database,
      title: isTh ? 'ฐานข้อมูลกายวิภาคคนเอเชีย' : 'Asian Aesthetic Benchmarks',
      desc: isTh 
        ? 'เปรียบเทียบเชิงสถิติกับเกณฑ์สัดส่วนกายวิภาคมาตรฐานเพื่อความเป็นธรรมชาติ ไม่ใช้มาตรฐานที่ขัดกับโครงสร้างเดิม'
        : 'Statistically references Asian aesthetic parameters to keep recommendations natural.'
    },
    {
      icon: Lock,
      title: isTh ? 'การเข้ารหัสข้อมูล 256-bit' : '256-bit End-to-End Encryption',
      desc: isTh 
        ? 'ข้อมูลภาพสแกนทั้งหมดจะถูกบีบอัดและเข้ารหัสความปลอดภัยระดับธนาคารก่อนการประมวลผล'
        : 'All scan uploads are encrypted and processed through secure banking-grade protocols.'
    }
  ];

  const privacyGuarantees = [
    isTh ? 'ไม่มีการขายหรือแชร์รูปภาพใบหน้าของคุณแก่บุคคลที่สาม' : 'Zero biometric data sales to third parties',
    isTh ? 'ประมวลผลเฉพาะสำหรับรายงานสรุปของคุณเท่านั้น' : 'Data is processed strictly for generating your report',
    isTh ? 'สามารถลบประวัติการสแกนได้ตลอดเวลาตามต้องการ' : 'Full right to delete scan history anytime'
  ];

  return (
    <section id="data-we-use" className="landing-section-data" style={{ padding: '70px 20px', background: '#f5f5f7', borderTop: '1px solid #d2d2d7', borderBottom: '1px solid #d2d2d7' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#d2d2d7', padding: '6px 14px', borderRadius: '20px', color: '#59534B', fontSize: '0.8rem', fontWeight: 700, marginBottom: '14px' }}>
            <Database size={14} />
            <span>{isTh ? 'ข้อมูลที่เราใช้' : 'DATA WE USE'}</span>
          </div>
          <h2 style={{ fontSize: '2.1rem', fontWeight: 800, color: '#1d1d1f', letterSpacing: '-0.02em', marginBottom: '14px' }}>
            {isTh ? 'โปร่งใส ปลอดภัย คำนึงถึงสิทธิของคุณ' : 'Transparent, Safe & Privacy-Centered'}
          </h2>
          <p style={{ fontSize: '1rem', color: '#6e6e73', maxWidth: '640px', margin: '0 auto', lineHeight: 1.6, fontWeight: 500 }}>
            {isTh 
              ? 'DOODEE ประมวลผลเฉพาะข้อมูลองค์ประกอบใบหน้าเพื่อสร้างรายงานเชิงลึกอย่างแม่นยำ โดยยึดหลักความปลอดภัยระดับสูงสุด'
              : 'DOODEE processes facial geometry signals solely to construct clear, objective assessment reports with maximum data protection.'
            }
          </p>
        </div>

        {/* Data Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px', marginBottom: '36px' }}>
          {dataItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div 
                key={idx}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #d2d2d7',
                  borderRadius: '18px',
                  padding: '24px 20px',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#f5f5f7', color: '#0066cc', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                  <Icon size={20} />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '8px' }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: '0.88rem', color: '#6e6e73', lineHeight: 1.5, margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Security & Guarantee Box */}
        <div style={{ background: '#FFFFFF', border: '1px stroke #d2d2d7', borderRadius: '20px', padding: '24px 28px', borderLeft: '4px solid #0066cc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <ShieldCheck size={22} color="#0066cc" />
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1d1d1f', margin: 0 }}>
              {isTh ? 'ข้อตกลงและคำมั่นสัญญาด้านความเป็นส่วนตัว' : 'Our Privacy & Data Guarantee'}
            </h4>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
            {privacyGuarantees.map((text, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.88rem', color: '#1d1d1f' }}>
                <FileCheck size={16} color="#0066cc" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
