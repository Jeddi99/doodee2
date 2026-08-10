import React from 'react';
import { Database, Eye, ShieldCheck, Lock, Cpu, FileCheck } from 'lucide-react';

export default function DataWeUseSection({ lang }) {
  const isTh = lang === 'th';

  const dataItems = [
    {
      icon: Eye,
      title: isTh ? 'สัดส่วนจาก Landmark ภาพ 2D' : '2D Landmark Ratios',
      desc: isTh 
        ? 'วัดอัตราส่วนภายในภาพเดียวกันด้วย Facial Landmarks โดยไม่แปลงเป็นมิลลิเมตรหรือใช้ Golden Ratio เป็นคะแนนความงาม'
        : 'Measures ratios within one image using facial landmarks, without millimetre calibration or a Golden Ratio beauty score.'
    },
    {
      icon: Cpu,
      title: isTh ? 'สัญญาณคุณภาพผิวระดับไมโคร' : 'Skin Texture & Tone Signals',
      desc: isTh 
        ? 'สังเกตความสม่ำเสมอของโทนสี รอยแดง และพื้นผิวที่มองเห็นได้จากภาพภายใต้ข้อจำกัดของแสง'
        : 'Observes visible tone evenness, redness, and texture with lighting limitations.'
    },
    {
      icon: Database,
      title: isTh ? 'ค่าอ้างอิงภาพถ่ายคนไทย' : 'Thai Photo Reference',
      desc: isTh 
        ? 'เปรียบเทียบแบบทดลองกับ mean และ SD จากคนไทย 240 คน อายุ 18–35 ปี ไม่ใช่เกณฑ์ความสวยหรือคำแนะนำการรักษา'
        : 'Experimental comparison with mean and SD from 240 Thai adults age 18–35; not a beauty standard or treatment advice.'
    },
    {
      icon: Lock,
      title: isTh ? 'พื้นที่จัดเก็บส่วนตัว' : 'Private Storage',
      desc: isTh 
        ? 'ไฟล์ถูกเก็บใน bucket ส่วนตัวและเปิดด้วยลิงก์ชั่วคราว ภาพผู้ใหญ่หมดอายุภายใน 30 วัน'
        : 'Files use a private bucket and expiring signed links. Adult images expire within 30 days.'
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
