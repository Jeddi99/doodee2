import React from 'react';
import { ArrowRight, ShieldCheck, ScanLine } from 'lucide-react';

export default function HeroSection({ lang, onStartScan }) {
  const isTh = lang === 'th';

  const scrollToPreview = () => {
    const el = document.getElementById('preview');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="landing-hero glass-hero" style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '84px', overflow: 'hidden', background: '#f5f5f7' }}>
      
      {/* Background Video Shell with Vignette Overlays */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <video 
          autoPlay 
          loop 
          muted 
          playsInline 
          preload="metadata"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '58% 50%', opacity: 0.22 }}
        >
          <source src="/videos/landing-hero.mp4" type="video/mp4" />
        </video>
        <div className="glass-hero-wash" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(245,245,247,0.92) 0%, rgba(245,245,247,0.72) 44%, rgba(245,245,247,0.98) 100%)' }}></div>
      </div>

      {/* Hero Core Content Container */}
      <div className="landing-hero-container" style={{ position: 'relative', zIndex: 10, maxWidth: '1280px', margin: '0 auto', width: '100%', padding: '0 24px' }}>
        
        <div className="landing-hero-content" style={{ maxWidth: '860px', margin: '0 auto', textAlign: 'center' }}>
          <div className="landing-hero-eyebrow" style={{ fontSize: '14px', fontWeight: 400, letterSpacing: '-0.224px', color: '#6e6e73', marginBottom: '10px' }}>
            {isTh ? 'DooDee AI Pre-Consultation' : 'DooDee AI Pre-Consultation'}
          </div>

          {/* Main Headline */}
          <h1 className="landing-hero-title glass-hero-title" style={{ fontSize: 'clamp(44px, 7vw, 72px)', fontWeight: 600, lineHeight: 1.04, color: '#1d1d1f', letterSpacing: '-0.28px', marginBottom: '14px' }}>
            {isTh ? (
              <>
                เช็กก่อนตัดสินใจเรื่องหน้า
              </>
            ) : (
              <>
                Check before deciding on your face.
              </>
            )}
          </h1>

          {/* Subtitle Body */}
          <p className="landing-hero-description" style={{ fontSize: 'clamp(21px, 2.4vw, 28px)', lineHeight: 1.14, color: '#1d1d1f', fontWeight: 400, margin: '0 auto 24px', maxWidth: '720px', letterSpacing: '0.196px' }}>
            {isTh 
              ? 'DOODEE วิเคราะห์ใบหน้าด้วย AI — อ่านโครงหน้า สัดส่วน ผิว และภาพรวม เพื่อช่วยจัดลำดับสิ่งที่ควรถามก่อนจองคลินิกหรือซื้อแพ็กเกจ'
              : 'DOODEE reads facial structure, proportion, skin signal, and overall balance to show which questions are worth discussing before you book a clinic or buy a package.'
            }
          </p>

          {/* Call to Action Buttons */}
          <div className="landing-hero-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '34px' }}>
            <button className="btn-brand-primary landing-hero-action" onClick={onStartScan} style={{ padding: '14px 32px', fontSize: '1rem' }}>
              <ScanLine size={18} />
              <span>{isTh ? 'เริ่มต้นกับ DOODEE' : 'Get started with DooDee'}</span>
            </button>

            <button className="btn-brand-secondary landing-hero-action" onClick={scrollToPreview} style={{ padding: '14px 28px', fontSize: '1rem' }}>
              <span>{isTh ? 'ดูภาพอ้างอิง' : 'View the preview'}</span>
              <ArrowRight size={17} />
            </button>
          </div>

          <div className="landing-hero-product glass-hero-product" style={{ width: 'min(720px, 86vw)', aspectRatio: '16 / 8.5', margin: '0 auto', borderRadius: '0', overflow: 'hidden' }}>
            <img src="/upgrade-assets/hero-portrait.webp" alt="DOODEE facial assessment preview" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(3px 5px 30px rgba(0,0,0,0.22))' }} />
          </div>

        </div>

      </div>

      {/* Proof Marquee Banner at Bottom */}
      <div className="landing-hero-proof" style={{ position: 'relative', zIndex: 10, marginTop: '40px', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(18px)', borderTop: '1px solid #d2d2d7', borderBottom: '1px solid #d2d2d7', padding: '14px 24px' }}>
        <div className="landing-hero-proof-inner" style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', fontSize: '0.85rem' }}>
          <div className="landing-hero-proof-primary" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#1d1d1f', fontWeight: 600 }}>
            <ShieldCheck size={18} color="#0066cc" />
            <span>{isTh ? '60+ ตัวชี้วัด จากจุดอ้างอิงบนใบหน้า 478 จุด' : '60+ measurements across 478 facial landmarks'}</span>
          </div>
          <div className="landing-hero-proof-secondary" style={{ color: '#6e6e73', fontWeight: 500 }}>
            {isTh ? 'อธิบายวิธีวัด ขอบเขต และข้อจำกัดอย่างตรงไปตรงมา' : 'Methods, scope, and limits are explained directly'}
          </div>
        </div>
      </div>

    </section>
  );
}
