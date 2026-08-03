import React from 'react';
import { Sparkles, Target, ShieldCheck, Heart } from 'lucide-react';

export default function AboutUsSection({ lang }) {
  const isTh = lang === 'th';

  const values = [
    {
      icon: Target,
      title: isTh ? 'ประเมินอย่างเป็นกลาง' : 'Objective Assessment',
      desc: isTh 
        ? 'ใช้อัลกอริทึม AI อ่านสัดส่วนและโครงหน้าด้วยมาตรฐานวิเคราะห์เชิงลึก ไม่เชียร์ขายคอร์สเกินจำเป็น' 
        : 'AI-driven structure and proportion assessment based on anatomical benchmarks without sales pressure.'
    },
    {
      icon: ShieldCheck,
      title: isTh ? 'เน้นความปลอดภัยและส่วนตัว' : 'Privacy & Safety First',
      desc: isTh 
        ? 'ข้อมูลใบหน้าของคุณได้รับการเข้ารหัสมาตรฐานสูงสุด ไม่สแกนขายต่อ และประมวลผลเฉพาะเพื่อคุณ' 
        : 'Your facial scan data is encrypted with military-grade standards and processed exclusively for your report.'
    },
    {
      icon: Heart,
      title: isTh ? 'เคารพความเป็นตัวเอง' : 'Respecting Natural Beauty',
      desc: isTh 
        ? 'ไม่ได้ปรับให้ทุกคนเหมือนกัน แต่เน้นค้นหาจุดเด่นและคำถามสำคัญที่ควรปรึกษาแพทย์ก่อนตัดสินใจ' 
        : 'Enhancing unique individual features rather than enforcing standardized beauty norms.'
    }
  ];

  return (
    <section id="about" className="landing-section-about" style={{ padding: '70px 20px', background: '#FFFFFF', position: 'relative' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f5f5f7', border: '1px solid #d2d2d7', padding: '6px 14px', borderRadius: '20px', color: '#0066cc', fontSize: '0.8rem', fontWeight: 700, marginBottom: '14px' }}>
            <Sparkles size={14} />
            <span>{isTh ? 'เกี่ยวกับเรา' : 'ABOUT US'}</span>
          </div>
          <h2 style={{ fontSize: '2.1rem', fontWeight: 800, color: '#1d1d1f', letterSpacing: '-0.02em', marginBottom: '14px' }}>
            {isTh ? 'ทำความรู้จักกับ DOODEE' : 'Meet DOODEE AI'}
          </h2>
          <p style={{ fontSize: '1rem', color: '#6e6e73', maxWidth: '640px', margin: '0 auto', lineHeight: 1.6, fontWeight: 500 }}>
            {isTh 
              ? 'DOODEE คือผู้ช่วยประเมินโครงหน้าและผิวพรรณด้วย AI ก่อนเข้าพบแพทย์คลินิกความงาม เพื่อให้คุณเข้าใจสัดส่วนใบหน้าของตัวเอง และเตรียมคำถามสำคัญได้อย่างมั่นใจ'
              : 'DOODEE is an AI-powered pre-consultation companion for facial aesthetic assessment, helping you understand your facial proportions and ask informed questions before clinic visits.'
            }
          </p>
        </div>

        {/* Mission Card Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '40px' }}>
          {values.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div 
                key={idx}
                style={{
                  background: '#f5f5f7',
                  border: '1px solid #d2d2d7',
                  borderRadius: '20px',
                  padding: '28px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}
              >
                <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: '#f5f5f7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0066cc' }}>
                  <Icon size={22} />
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1d1d1f', margin: 0 }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: '0.92rem', color: '#6e6e73', lineHeight: 1.55, margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Story / Banner */}
        <div style={{ background: 'linear-gradient(135deg, #0066cc 0%, #1d1d1f 100%)', borderRadius: '24px', padding: '32px 24px', color: '#FFFFFF', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.85, marginBottom: '6px' }}>
              {isTh ? 'ทำไมต้องเช็กก่อน?' : 'WHY PRE-CONSULT?' }
            </div>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '10px', lineHeight: 1.3 }}>
              {isTh ? 'ลดความลังเล เพิ่มความคุ้มค่าให้ทุกการตัดสินใจ' : 'Reduce Uncertainty, Maximize Your Consultation Value'}
            </h3>
            <p style={{ fontSize: '0.92rem', opacity: 0.9, lineHeight: 1.55, margin: 0 }}>
              {isTh 
                ? 'เราช่วยเปลี่ยนการทำหัตถการจากความรู้สึกที่ไม่แน่นอน ให้เป็นข้อมูลเชิงสัดส่วนที่ชัดเจน เข้าใจว่าจุดไหนตอบโจทย์เป้าหมายของคุณมากที่สุด'
                : 'We transform aesthetic procedures from vague uncertainty into clear structural insights so you know exactly what aligns with your personal goals.'
              }
            </p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', padding: '16px 24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.2)', textAlign: 'center', minWidth: '160px' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>100%</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>{isTh ? 'ความเป็นส่วนตัว' : 'Private & Secure'}</div>
          </div>
        </div>

      </div>
    </section>
  );
}
