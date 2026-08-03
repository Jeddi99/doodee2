import React, { useState, useRef } from 'react';
import { ArrowLeftRight, Check, User, UserCheck } from 'lucide-react';

export default function ProcedurePreview({ lang }) {
  const isTh = lang === 'th';
  const [splitPos, setSplitPos] = useState(50);
  const [gender, setGender] = useState('male');
  const frameRef = useRef(null);

  const maleBefore = "/upgrade-assets/doodee-user-male-before.webp";
  const maleAfter = "/upgrade-assets/doodee-user-male-after-v3.webp";

  const femaleBefore = "/upgrade-assets/doodee-supplied-female-before.png";
  const femaleAfter = "/upgrade-assets/doodee-user-female-after.png";

  const currentBefore = gender === 'male' ? maleBefore : femaleBefore;
  const currentAfter = gender === 'male' ? maleAfter : femaleAfter;

  const updateSplit = (clientX) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setSplitPos(Math.max(0, Math.min(100, next)));
  };

  const points = [
    isTh ? "เริ่มจากบริเวณที่คุณเลือก" : "Start from the area you select",
    isTh ? "เปรียบเทียบความชัด 4 ระดับ" : "Compare four ordered strengths",
    isTh ? "เก็บภาพต้นฉบับไว้อ้างอิง" : "Keep the original as the reference"
  ];

  return (
    <section id="preview" className="landing-procedure" style={{ background: '#f5f5f7', color: '#1d1d1f', padding: '100px 24px' }}>
      <div className="landing-procedure-layout" style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '48px', alignItems: 'center' }}>
        
        {/* Left Text */}
        <div className="landing-procedure-copy">
          <p className="landing-section-label" style={{ background: '#f5f5f7', color: '#0066cc', borderColor: '#d2d2d7' }}>
            {isTh ? 'ภาพอ้างอิงหัตถการ' : 'Procedure preview'}
          </p>

          <h2 className="landing-procedure-title" style={{ fontSize: '2.75rem', fontWeight: 700, color: '#1d1d1f', lineHeight: 1.05, marginTop: '20px', marginBottom: '24px', letterSpacing: '-0.02em' }}>
            {isTh ? 'เห็นทิศทางก่อน แล้วค่อยตัดสินใจ' : 'See the direction before you decide.'}
          </h2>

          <p className="landing-procedure-description" style={{ fontSize: '1.1rem', color: '#1d1d1f', lineHeight: 1.6, marginBottom: '32px' }}>
            {isTh 
              ? 'เลื่อนเพื่อเทียบภาพต้นฉบับกับภาพอ้างอิง ขั้นตอนจริงเริ่มจากบริเวณที่ผู้ใช้เลือก แล้วเก็บภาพต้นฉบับไว้เป็นจุดอ้างอิงตลอดการเปรียบเทียบ'
              : 'Drag to compare the original with a directional reference. The live workflow begins with the area you select and keeps the original image visible as the comparison baseline.'
            }
          </p>

          {/* Model Gender Toggle Switcher */}
          <div className="landing-procedure-toggle" style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
            <button
              onClick={() => setGender('male')}
              className="landing-procedure-toggle-button"
              style={{
                padding: '8px 16px',
                borderRadius: '24px',
                border: gender === 'male' ? '1px solid #0066cc' : '1px solid #d2d2d7',
                background: gender === 'male' ? '#f5f5f7' : '#ffffff',
                color: gender === 'male' ? '#1d1d1f' : '#6e6e73',
                fontSize: '0.85rem',
                fontWeight: 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <User size={14} color="#0066cc" /> {isTh ? 'ตัวอย่างผู้ชาย (Male)' : 'Male Sample'}
            </button>

            <button
              onClick={() => setGender('female')}
              className="landing-procedure-toggle-button"
              style={{
                padding: '8px 16px',
                borderRadius: '24px',
                border: gender === 'female' ? '1px solid #0066cc' : '1px solid #d2d2d7',
                background: gender === 'female' ? '#f5f5f7' : '#ffffff',
                color: gender === 'female' ? '#1d1d1f' : '#6e6e73',
                fontSize: '0.85rem',
                fontWeight: 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <UserCheck size={14} color="#0066cc" /> {isTh ? 'ตัวอย่างผู้หญิง (Female)' : 'Female Sample'}
            </button>
          </div>

          <ul className="landing-procedure-points" style={{ borderTop: '1px solid #d2d2d7', listStyle: 'none' }}>
            {points.map((point) => (
              <li className="landing-procedure-point" key={point} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 0', borderBottom: '1px solid #d2d2d7', fontSize: '0.95rem', fontWeight: 600, color: '#1d1d1f' }}>
                <Check size={18} color="#0066cc" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right Slider Container */}
        <div className="landing-procedure-demo">
          <div className="landing-procedure-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', fontWeight: 500, color: '#6e6e73', marginBottom: '12px' }}>
            <span>{isTh ? 'ตัวอย่างภาพอ้างอิง · ไม่ใช่ผลลัพธ์รับประกัน' : 'Sample visual reference · not a predicted result'}</span>
            <span className="landing-procedure-drag-hint" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#0066cc', fontWeight: 700 }}>
              <ArrowLeftRight size={14} />
              {isTh ? 'ลากเพื่อเปรียบเทียบ' : 'Drag to compare'}
            </span>
          </div>

          <div
            className="landing-procedure-frame"
            ref={frameRef}
            onMouseDown={(e) => updateSplit(e.clientX)}
            onMouseMove={(e) => { if (e.buttons === 1) updateSplit(e.clientX); }}
            onTouchMove={(e) => updateSplit(e.touches[0].clientX)}
            style={{
              position: 'relative',
              width: '100%',
              height: '460px',
              borderRadius: '18px',
              overflow: 'hidden',
              background: '#d2d2d7',
              cursor: 'ew-resize',
              userSelect: 'none',
              boxShadow: '3px 5px 30px rgba(0, 0, 0, 0.22)'
            }}
          >
            {/* Visual Reference Image */}
            <img 
              src={currentAfter} 
              alt="Visual reference" 
              draggable={false}
              className="landing-procedure-image landing-procedure-image--after"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div className="landing-procedure-image-label landing-procedure-image-label--after" style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(0, 0, 0, 0.62)', backdropFilter: 'blur(12px)', color: '#ffffff', padding: '6px 14px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 400 }}>
              {isTh ? 'ภาพอ้างอิง' : 'Directional reference'}
            </div>

            {/* Original Image (Clipped) */}
            <div className="landing-procedure-before-clip" style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              clipPath: `inset(0 ${100 - splitPos}% 0 0)`
            }}>
              <img 
                src={currentBefore} 
                alt="Original" 
                draggable={false}
                className="landing-procedure-image landing-procedure-image--before"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div className="landing-procedure-image-label landing-procedure-image-label--before" style={{ position: 'absolute', top: '16px', left: '16px', background: 'rgba(0, 0, 0, 0.62)', backdropFilter: 'blur(12px)', color: '#ffffff', padding: '6px 14px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 400 }}>
                {isTh ? 'ภาพต้นฉบับ' : 'Original'}
              </div>
            </div>

            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${splitPos}%`,
                width: '3px',
                background: '#0066cc',
                transform: 'translateX(-50%)',
                pointerEvents: 'none',
                zIndex: 20
              }}
            />

            {/* Handle Icon */}
            <div className="landing-procedure-handle" style={{
              position: 'absolute',
              top: '50%',
              left: `${splitPos}%`,
              transform: 'translate(-50%, -50%)',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: '#0066cc',
              boxShadow: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 30
            }}>
              <ArrowLeftRight size={18} color="#ffffff" />
            </div>

          </div>

          <p className="landing-procedure-disclaimer" style={{ fontSize: '0.75rem', color: '#6e6e73', marginTop: '12px', textAlign: 'center' }}>
            {isTh
              ? 'ภาพนี้ใช้เพื่อสำรวจทิศทางและเตรียมคำถามก่อนปรึกษาแพทย์ ไม่ใช่คำแนะนำทางการแพทย์หรือการรับประกันผลลัพธ์'
              : 'Use this image to explore a direction and prepare consultation questions. It is not medical advice or a guaranteed outcome.'
            }
          </p>
        </div>

      </div>
    </section>
  );
}
