import React from 'react';
import { ArrowRight } from 'lucide-react';

export default function FooterSection({ lang, onStartScan }) {
  const isTh = lang === 'th';

  const topics = [
    "เช็กฟิลเลอร์ร่องแก้ม", "ฉีดโบท็อกซ์กราม", "ลิฟต์กรอบหน้า", "แก้ใต้ตาคล้ำ", "ดูสัดส่วนคาง"
  ];

  return (
    <footer className="landing-footer" style={{ background: '#f5f5f7', color: '#1d1d1f', paddingBottom: '60px' }}>
      
      {/* Final Call to Action Box */}
      <div className="landing-footer-cta-wrap" style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 60px 24px' }}>
        <div className="landing-footer-cta-card" style={{ background: '#1d1d1f', borderRadius: '24px', padding: '60px 48px', color: '#ffffff', boxShadow: '0 16px 40px rgba(28, 46, 36, 0.15)' }}>
          
          <div className="landing-footer-cta-main" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '32px', alignItems: 'flex-end', marginBottom: '40px' }}>
            <div className="landing-footer-cta-copy">
              <div className="landing-footer-brand-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255, 255, 255, 0.12)', borderRadius: '24px', padding: '4px 14px', marginBottom: '20px', fontSize: '0.8rem', color: '#ffffff' }}>
                <img src="/doodee-logo.webp" alt="Logo" style={{ width: '20px', height: '20px', borderRadius: '4px' }} />
                <span className="font-wordmark">DOODEE</span>
              </div>

              <h2 className="landing-footer-title" style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1.02, color: '#ffffff', letterSpacing: '-0.02em' }}>
                {isTh ? 'ก่อนจองคลินิก ดูว่าอะไรควรสำรวจก่อน' : 'Before booking a clinic, see what may be worth exploring first'}
              </h2>

              <p className="landing-footer-description" style={{ fontSize: '1.1rem', color: 'rgba(255, 255, 255, 0.8)', marginTop: '20px', maxWidth: '640px', lineHeight: 1.6 }}>
                {isTh
                  ? 'ใช้รายงานส่วนตัวเป็น baseline เพื่อจัดลำดับคำถาม เปรียบเทียบทิศทาง และคุยกับแพทย์ให้ชัดก่อนตัดสินใจจ่าย'
                  : 'Use your private report as a baseline to organize questions, compare directions, and have a clearer clinician conversation before spending.'
                }
              </p>
            </div>

            <button 
              className="landing-footer-action"
              onClick={onStartScan}
              style={{
                background: '#f5f5f7',
                color: '#1d1d1f',
                border: 'none',
                borderRadius: '9999px',
                padding: '16px 36px',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                whiteSpace: 'nowrap',
                transition: 'transform 0.2s'
              }}
            >
              <span>{isTh ? 'เริ่มต้นกับ DOODEE' : 'Get started with DooDee'}</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* Popular Guides Topics */}
          <div className="landing-footer-guides" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.15)', paddingTop: '24px' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#d2d2d7', marginBottom: '16px' }}>
              {isTh ? "คู่มือยอดนิยม" : "Popular guides"}
            </p>
            <div className="landing-footer-guide-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
              {topics.map((t, idx) => (
                <span className="landing-footer-guide" key={idx} style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.85)', borderBottom: '1px solid rgba(255, 255, 255, 0.2)', paddingBottom: '2px', cursor: 'pointer' }}>
                  {t}
                </span>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Copyright Strip */}
      <div className="landing-footer-bottom" style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', fontSize: '0.85rem', color: '#6e6e73' }}>
        <div className="landing-footer-copyright" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/doodee-logo.webp" alt="Logo" style={{ width: '24px', height: '24px', borderRadius: '12px' }} />
          <span className="font-wordmark" style={{ color: '#1d1d1f', fontWeight: 700 }}>DOODEE</span>
          <span>© 2026 DOODEE (ดูดี) AI Facial Assessment.</span>
        </div>

        <div className="landing-footer-legal" style={{ display: 'flex', gap: '20px' }}>
          <span>Privacy Policy</span>
          <span>Methodology</span>
          <span>Terms</span>
        </div>
      </div>

    </footer>
  );
}
