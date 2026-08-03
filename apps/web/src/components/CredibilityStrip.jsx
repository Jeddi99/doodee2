import React from 'react';
import { Lock, Cpu, Globe } from 'lucide-react';

export default function CredibilityStrip({ lang }) {
  const isTh = lang === 'th';

  const items = [
    {
      icon: Lock,
      title: isTh ? 'ความเป็นส่วนตัว 100%' : 'Privacy Invariants',
      desc: isTh ? 'ประมวลผลบนเบราว์เซอร์ผ่าน WASM ไม่เก็บภาพถ่ายต้นฉบับขึ้นเซิร์ฟเวอร์โดยไม่ได้รับอนุญาต' : 'In-browser WASM processing. Original photos are never saved to servers without consent.'
    },
    {
      icon: Cpu,
      title: isTh ? 'Asian-First Baseline' : 'Asian Baseline Calibration',
      desc: isTh ? 'ปรับเทียบจุดอ้างอิงและสัดส่วนเรขาคณิตโดยเฉพาะสำหรับคนไทยและเอเชีย' : 'Calibrated for Thai/Asian facial geometry and proportion benchmarks.'
    },
    {
      icon: Globe,
      title: isTh ? 'แชร์รหัสปลอดภัย' : 'URL-Encoded Sharing',
      desc: isTh ? 'ลิงก์การแชร์ถอดรหัสเฉพาะตัวเลขสัดส่วน ไม่มีไฟล์ภาพหรือข้อมูลอัตลักษณ์ส่วนบุคคล' : 'Shared links encode geometric values only, with no raw images or bio data.'
    }
  ];

  return (
    <section className="landing-credibility" style={{ padding: '60px 24px', maxWidth: '1280px', margin: '0 auto' }}>
      <div className="glass-panel landing-credibility-panel" style={{ padding: '40px', borderRadius: '24px', background: '#ffffff', border: '1px solid #d2d2d7' }}>
        <div className="landing-credibility-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px' }}>
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div className="landing-credibility-item" key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="landing-credibility-icon" style={{ width: '42px', height: '42px', borderRadius: '16px', background: '#f5f5f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={22} color="#0066cc" />
                </div>
                <h4 className="landing-credibility-title" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1d1d1f' }}>{item.title}</h4>
                <p className="landing-credibility-description" style={{ fontSize: '0.85rem', color: '#1d1d1f', lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
