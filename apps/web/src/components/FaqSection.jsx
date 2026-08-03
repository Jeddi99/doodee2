import React, { useState } from 'react';
import { LockKeyhole, ShieldCheck, Stethoscope } from 'lucide-react';

export default function FaqSection({ lang }) {
  const isTh = lang === 'th';

  const trustCards = [
    { icon: <LockKeyhole className="h-5 w-5 text-[#0066cc]" />, title: isTh ? "ลดการเก็บข้อมูลที่ไม่จำเป็น" : "Minimize unnecessary data" },
    { icon: <ShieldCheck className="h-5 w-5 text-[#0066cc]" />, title: isTh ? "ไม่แทนคำปรึกษาแพทย์" : "Does not replace a clinician" },
    { icon: <Stethoscope className="h-5 w-5 text-[#0066cc]" />, title: isTh ? "ช่วยเตรียมคำถามก่อนปรึกษา" : "Helps prepare consultation questions" },
  ];

  const faqItems = [
    {
      q: isTh ? "DOODEE เป็นคำแนะนำทางการแพทย์ไหม?" : "Is DOODEE medical advice?",
      a: isTh 
        ? "ไม่ใช่ เป็นเครื่องมือช่วยตัดสินใจก่อนปรึกษาผู้เชี่ยวชาญ การทำหัตถการหรือศัลยกรรมต้องคุยกับแพทย์ที่มีใบประกอบวิชาชีพ"
        : "No. It is decision support before a professional consultation. Procedures or surgery require a licensed clinician."
    },
    {
      q: isTh ? "ควรตีความภาพอ้างอิงอย่างไร?" : "How should I read the visual reference?",
      a: isTh
        ? "ภาพนี้เป็นภาพอ้างอิงเชิงทิศทางสำหรับตั้งคำถามก่อนตัดสินใจ ไม่ใช่ผลลัพธ์จริงหรือคำแนะนำให้ทำหัตถการ"
        : "It is a directional reference for better questions before deciding, not a predicted outcome or a recommendation to proceed."
    },
    {
      q: isTh ? "ข้อมูลรูปหน้าปลอดภัยแค่ไหน?" : "How private is the face photo?",
      a: isTh
        ? "ระบบออกแบบให้ลดการเก็บข้อมูลที่ไม่จำเป็น และสื่อสารข้อจำกัดอย่างตรงไปตรงมา"
        : "The product is designed to minimize unnecessary storage and communicate limitations clearly."
    },
    {
      q: isTh ? "ทำไมต้องเน้นบริบทไทย/เอเชีย?" : "Why Thai/Asian context?",
      a: isTh
        ? "เพราะมาตรฐานความงามและสัดส่วนใบหน้าที่คนใช้ตัดสินใจควรสัมพันธ์กับบริบทของผู้ใช้ ไม่ใช่ยืมกรอบเดียวจากทุกตลาด"
        : "Because appearance decisions should reflect the user's context instead of applying one broad standard to every market."
    }
  ];

  return (
    <section id="faq" className="landing-faq" style={{ background: '#f5f5f7', color: '#1d1d1f', padding: '100px 24px' }}>
      <div className="landing-faq-layout" style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '48px' }}>
        
        {/* Left Column */}
        <div className="landing-faq-intro">
          <span className="landing-section-label" style={{ background: '#f5f5f7', color: '#0066cc', borderColor: '#d2d2d7' }}>
            {isTh ? 'ความเป็นส่วนตัวและขอบเขต' : 'Privacy and boundaries'}
          </span>

          <h2 className="landing-faq-title" style={{ fontSize: '2.5rem', fontWeight: 700, color: '#1d1d1f', lineHeight: 1.05, marginTop: '20px', marginBottom: '24px' }}>
            {isTh ? 'ชัดเจนเรื่องข้อมูล ข้อจำกัด และความคาดหวัง' : 'Clear about privacy, limits, and expectations'}
          </h2>

          <div className="landing-faq-trust-list" style={{ borderTop: '1px solid #d2d2d7', marginTop: '32px' }}>
            {trustCards.map((item, idx) => (
              <div className="landing-faq-trust-item" key={idx} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 0', borderBottom: '1px solid #d2d2d7', fontSize: '1rem', fontWeight: 600, color: '#1d1d1f' }}>
                <span className="landing-faq-trust-icon" style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.icon}
                </span>
                <span>{item.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: FAQ Accordion */}
        <div className="landing-faq-accordion" style={{ borderTop: '1px solid #d2d2d7' }}>
          {faqItems.map((item, idx) => (
            <FaqAccordionItem key={idx} item={item} />
          ))}
        </div>

      </div>
    </section>
  );
}

function FaqAccordionItem({ item }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="landing-faq-item" style={{ borderBottom: '1px solid #d2d2d7' }}>
      <button
        className="landing-faq-question"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '24px 0',
          background: 'transparent',
          border: 'none',
          textAlign: 'left',
          fontSize: '1.2rem',
          fontWeight: 700,
          color: '#1d1d1f',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <span className="landing-faq-question-text">{item.q}</span>
        <span className="landing-faq-indicator" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0066cc', marginLeft: '16px' }}>
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="landing-faq-answer" style={{ paddingBottom: '24px', fontSize: '1rem', color: '#1d1d1f', lineHeight: 1.6 }}>
          {item.a}
        </div>
      )}
    </div>
  );
}
