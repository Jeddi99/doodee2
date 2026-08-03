import React from 'react';

export default function DifferenceSection({ lang }) {
  const isTh = lang === 'th';

  const oldWay = [
    isTh ? "จ่ายก่อนรู้ priority" : "Spending before knowing priorities",
    isTh ? "เลือกหัตถการตามกระแส" : "Choosing procedures by trend",
    isTh ? "ดูแค่ฟิลเตอร์หรือ before/after" : "Relying on filters or before/after images",
    isTh ? "ปรึกษาโดยยังไม่รู้ว่าควรถามอะไร" : "Consulting before knowing what to ask"
  ];

  const newWay = [
    isTh ? "เช็กภาพรวมก่อนใช้เงิน" : "Check the whole face before spending",
    isTh ? "รู้จุดที่คุ้มสุดสำหรับหน้า" : "Know what is most worth it for your face",
    isTh ? "เตรียมคำถามก่อนคุยคลินิก" : "Prepare better clinic questions",
    isTh ? "ค่อยเลือกแพ็กเกจหรือหัตถการ" : "Then choose a package or procedure"
  ];

  return (
    <section id="why-doodee" className="landing-difference" style={{ background: '#f5f5f7', color: '#1d1d1f', padding: '100px 24px' }}>
      <div className="landing-difference-container" style={{ maxWidth: '1280px', margin: '0 auto' }}>
        
        {/* Header */}
        <div className="landing-difference-header" style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 60px auto' }}>
          <span className="landing-section-label" style={{ background: '#f5f5f7', color: '#0066cc', borderColor: '#d2d2d7' }}>
            {isTh ? 'ทำไมต้อง DOODEE' : 'Why DooDee'}
          </span>

          <h2 className="landing-difference-title" style={{ fontSize: '2.75rem', fontWeight: 700, color: '#1d1d1f', lineHeight: 1.05, marginTop: '20px', marginBottom: '16px', letterSpacing: '-0.02em' }}>
            {isTh ? 'ไม่ใช่ทุกหัตถการจะเป็นจุดเริ่มต้นที่เหมาะกับทุกหน้า' : 'Not every procedure is the right first step for every face'}
          </h2>

          <p className="landing-difference-description" style={{ fontSize: '1.1rem', color: '#1d1d1f', lineHeight: 1.6 }}>
            {isTh 
              ? 'แต่ละคนอาจอยากสำรวจเรื่องผิว คาง กรอบหน้า ใต้ตา หรือแค่คุณภาพรูปและสไตล์ต่างกัน DOODEE จึงเริ่มจากภาพรวม แล้วช่วยจัดคำถามที่ควรคุยก่อน'
              : 'Different users may want to explore skin clarity, chin, jawline, under-eye balance, photo quality, or styling. DOODEE starts with the whole face, then organizes the questions worth discussing first.'
            }
          </p>
        </div>

        {/* Path Cards */}
        <div className="landing-difference-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #d2d2d7', borderBottom: '1px solid #d2d2d7' }}>
          
          {/* Before DooDee */}
          <div className="landing-difference-column landing-difference-column--before" style={{ padding: '40px', borderRight: '1px solid #d2d2d7' }}>
            <h3 style={{ fontSize: '2rem', fontWeight: 700, color: '#6e6e73', marginBottom: '24px' }}>
              {isTh ? "ก่อนใช้ DOODEE" : "Before DooDee"}
            </h3>
            <ul className="landing-difference-list" style={{ listStyle: 'none' }}>
              {oldWay.map((item, index) => (
                <li className="landing-difference-item" key={index} style={{ display: 'grid', gridTemplateColumns: '2rem 1fr', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #d2d2d7', fontSize: '1rem', color: '#6e6e73' }}>
                  <span style={{ fontWeight: 600, color: '#8A9E92' }}>0{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* With DooDee */}
          <div className="landing-difference-column landing-difference-column--after" style={{ padding: '40px' }}>
            <h3 style={{ fontSize: '2rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '24px' }}>
              {isTh ? "เมื่อใช้ DOODEE" : "With DooDee"}
            </h3>
            <ul className="landing-difference-list" style={{ listStyle: 'none' }}>
              {newWay.map((item, index) => (
                <li className="landing-difference-item" key={index} style={{ display: 'grid', gridTemplateColumns: '2rem 1fr', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #d2d2d7', fontSize: '1rem', color: '#1d1d1f', fontWeight: 600 }}>
                  <span style={{ fontWeight: 700, color: '#0066cc' }}>0{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>

      </div>
    </section>
  );
}
