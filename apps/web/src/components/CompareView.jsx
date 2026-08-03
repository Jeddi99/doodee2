import React from 'react';
import { PRESET_MODELS } from '../data/mockData';
import { TrendingUp, CheckCircle2 } from 'lucide-react';

export default function CompareView() {
  const modelA = PRESET_MODELS[0]; // Female baseline 9.2
  const modelB = PRESET_MODELS[1]; // Male baseline 8.8 or styled scan

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Banner */}
      <div style={{ background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: '24px', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', boxShadow: '0 4px 20px rgba(47, 62, 70, 0.03)' }}>
        <div>
          <span style={{ background: '#f5f5f7', color: '#0066cc', border: '1px solid #d2d2d7', fontSize: '0.75rem', fontWeight: 700, padding: '4px 12px', borderRadius: '24px', marginBottom: '8px', display: 'inline-block' }}>
            Side-by-Side Comparison
          </span>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1d1d1f' }}>
            เปรียบเทียบผลสแกนและสัดส่วนโครงหน้า (Diff Analysis)
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#1d1d1f' }}>วิเคราะห์ความเปลี่ยนแปลงระหว่างผลสแกน 2 รูปแบบอย่างแม่นยำ</p>
        </div>

        <div style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', color: '#0066cc', borderRadius: '16px', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <TrendingUp size={16} /> Delta Score: +0.4 S-Tier Advantage
        </div>
      </div>

      {/* Side-by-Side Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        {/* Scan A */}
        <div style={{ background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: '24px', padding: '20px', boxShadow: '0 4px 20px rgba(47, 62, 70, 0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <img src={modelA.avatar} alt="Scan A" style={{ width: '54px', height: '54px', borderRadius: '16px', objectFit: 'cover' }} />
            <div>
              <span style={{ background: '#f5f5f7', color: '#0066cc', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', display: 'inline-block' }}>Scan A (ตั้งต้น)</span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1d1d1f', marginTop: '4px' }}>{modelA.name.split(' (')[0]}</h3>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '1.6rem', fontWeight: 800, color: '#0066cc' }}>{modelA.overallScore}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '16px' }}>
              <span style={{ color: '#6e6e73', fontWeight: 600 }}>Facial Harmony Ratio</span>
              <strong style={{ color: '#1d1d1f' }}>9.4</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '16px' }}>
              <span style={{ color: '#6e6e73', fontWeight: 600 }}>Angularity & Jawline</span>
              <strong style={{ color: '#1d1d1f' }}>8.9</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '16px' }}>
              <span style={{ color: '#6e6e73', fontWeight: 600 }}>Eye Area Canthal Tilt</span>
              <strong style={{ color: '#1d1d1f' }}>9.5 (+4.2°)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '16px' }}>
              <span style={{ color: '#6e6e73', fontWeight: 600 }}>Facial Symmetry</span>
              <strong style={{ color: '#1d1d1f' }}>9.3 (99.1%)</strong>
            </div>
          </div>
        </div>

        {/* Scan B */}
        <div style={{ background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: '24px', padding: '20px', boxShadow: '0 4px 20px rgba(47, 62, 70, 0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <img src={modelB.avatar} alt="Scan B" style={{ width: '54px', height: '54px', borderRadius: '16px', objectFit: 'cover' }} />
            <div>
              <span style={{ background: '#f5f5f7', color: '#6e6e73', border: '1px solid #d2d2d7', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', display: 'inline-block' }}>Scan B (เปรียบเทียบ)</span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1d1d1f', marginTop: '4px' }}>{modelB.name.split(' (')[0]}</h3>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '1.6rem', fontWeight: 800, color: '#6e6e73' }}>{modelB.overallScore}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '16px' }}>
              <span style={{ color: '#6e6e73', fontWeight: 600 }}>Facial Harmony Ratio</span>
              <strong style={{ color: '#1d1d1f' }}>8.7 <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>(-0.7)</span></strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '16px' }}>
              <span style={{ color: '#6e6e73', fontWeight: 600 }}>Angularity & Jawline</span>
              <strong style={{ color: '#1d1d1f' }}>9.4 <span style={{ color: '#0066cc', fontSize: '0.75rem' }}>(+0.5)</span></strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '16px' }}>
              <span style={{ color: '#6e6e73', fontWeight: 600 }}>Eye Area Canthal Tilt</span>
              <strong style={{ color: '#1d1d1f' }}>8.6 (+2.1°)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '16px' }}>
              <span style={{ color: '#6e6e73', fontWeight: 600 }}>Facial Symmetry</span>
              <strong style={{ color: '#1d1d1f' }}>8.9 (97.2%)</strong>
            </div>
          </div>
        </div>

      </div>

      {/* Comparative Summary Box */}
      <div style={{ background: '#ffffff', border: '1px solid #d2d2d7', borderLeft: '4px solid #0066cc', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 20px rgba(47, 62, 70, 0.03)' }}>
        <h4 style={{ fontSize: '0.95rem', color: '#0066cc', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
          <CheckCircle2 size={16} /> สรุปผลเปรียบเทียบ AI Comparative Analysis:
        </h4>
        <p style={{ fontSize: '0.85rem', color: '#1d1d1f', lineHeight: 1.6 }}>
          Scan A มีความได้สัดส่วนในหมวด Facial Harmony และ Eye Area สูงกว่า Scan B เล็กน้อย (+0.7 และ +0.9 ตามลำดับ) ในขณะที่ Scan B มีความชัดของกรอบหน้ากราม (Angularity & Jawline Index) สูงกว่าชัดเจน เหมาะสำหรับผู้ที่ต้องการลุคที่มีความคมเข้ม
        </p>
      </div>

    </div>
  );
}
