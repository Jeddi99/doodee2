import React, { useState } from 'react';
import { PRESET_MODELS } from '../data/mockData';
import { STUDIO_CATEGORIES } from '../data/studio';
import { Download, Share2, Check, Sparkles, ShieldCheck, Stethoscope, Sliders, Layers, DollarSign } from 'lucide-react';

export default function ConsultationReportView({ lang, studioDraft }) {
  const isTh = lang === 'th';
  const [activeTab, setActiveTab] = useState('doctor-summary');
  const [copied, setCopied] = useState(false);

  const model = studioDraft?.model || PRESET_MODELS[0];
  const selectedStudioProcedures = STUDIO_CATEGORIES.flatMap((category) => {
    const selectedId = studioDraft?.selectedProcedures?.[category.id];
    const preset = category.presets.find(([id]) => id === selectedId);
    return preset ? [{ category: category.label, name: preset[1] }] : [];
  });
  const adjustedStudioValues = STUDIO_CATEGORIES.flatMap((category) => category.sliders)
    .filter(([key]) => studioDraft?.adjustments?.[key])
    .map(([key, label]) => ({ label, value: studioDraft.adjustments[key] }));

  const handleCopyLink = () => {
    navigator.clipboard.writeText('https://doodee.app/report?id=DOC-2026-88912');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reportTabs = [
    { id: 'face-analysis', label: 'Face Analysis', sub: 'คะแนนและจุดเด่น-จุดที่ควรพัฒนา', icon: Sparkles },
    { id: 'surgery-preview', label: 'Surgery Preview', sub: 'ภาพก่อน-หลังที่เลือก', icon: Layers },
    { id: 'skin-map', label: 'Skin Problem Map', sub: 'แผนที่ปัญหาผิวของคุณ', icon: Sliders },
    { id: 'recommended-plan', label: 'Recommended Plan', sub: 'แผนการแก้ไขแนะนำลำดับขั้น', icon: ShieldCheck },
    { id: 'estimated-cost', label: 'Estimated Cost & Time', sub: 'งบประมาณและระยะเวลา', icon: DollarSign },
    { id: 'doctor-summary', label: 'Report for Doctor', sub: 'รายงานสำหรับปรึกษาแพทย์', icon: Stethoscope },
  ];

  return (
    <div className="report-workspace consult-report" style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Banner */}
      <div className="report-workspace-header consult-report-header" style={{ background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: '24px', padding: '24px 32px', boxShadow: '0 4px 20px rgba(47, 62, 70, 0.03)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div className="consult-report-heading">
          <span style={{ background: '#f5f5f7', color: '#0066cc', border: '1px solid #d2d2d7', fontSize: '0.75rem', fontWeight: 700, padding: '4px 12px', borderRadius: '24px', marginBottom: '8px', display: 'inline-block' }}>
            4. PERSONALIZED CONSULTATION REPORT
          </span>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1d1d1f', marginTop: '4px', marginBottom: '6px' }}>
            {isTh ? 'รายงานสรุปสำหรับคุณและแพทย์ (Clinical Consultation Report)' : 'Clinical Consultation Summary Report'}
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#1d1d1f' }}>
            {isTh ? 'สรุปข้อมูลสัดส่วน ภาพจำลอง และแผนการรักษาสมบูรณ์แบบสำหรับยื่นปรึกษาแพทย์หน้าคลินิก' : 'Comprehensive baseline summary ready for clinician review and consultation.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="consult-report-actions" style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn-brand-primary" 
            onClick={() => alert('ส่งออกรายงาน PDF ความละเอียดสูงเรียบร้อยแล้ว!')}
            style={{ padding: '10px 18px', fontSize: '0.85rem', borderRadius: '16px' }}
          >
            <Download size={16} />
            <span>ดาวน์โหลด PDF</span>
          </button>

          <button 
            style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '16px', padding: '10px 16px', color: '#1d1d1f', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={handleCopyLink}
          >
            {copied ? <Check size={16} color="#0066cc" /> : <Share2 size={16} />}
            <span>{copied ? 'คัดลอกแล้ว!' : 'แชร์ให้แพทย์'}</span>
          </button>
        </div>
      </div>

      {/* 6 Report Navigation Cards Grid (Matching Section 4 in Diagram) */}
      <div className="report-tabs consult-report-tabs" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
        {reportTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <div
              className="consult-report-tab"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: isActive ? '#f5f5f7' : '#ffffff',
                border: isActive ? '2px solid #0066cc' : '1px solid #d2d2d7',
                borderRadius: '20px',
                padding: '14px 10px',
                cursor: 'pointer',
                textAlign: 'center',
                boxShadow: '0 4px 16px rgba(47, 62, 70, 0.03)',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isActive ? '#0066cc' : '#f5f5f7', color: isActive ? '#ffffff' : '#0066cc', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                <Icon size={18} />
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1d1d1f', lineHeight: 1.2 }}>{tab.label}</div>
              <div style={{ fontSize: '0.65rem', color: '#6e6e73', marginTop: '4px' }}>{tab.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Main Active Report Container */}
      <div className="report-active-content consult-report-main" style={{ background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: '24px', padding: '32px', boxShadow: '0 4px 20px rgba(47, 62, 70, 0.03)' }}>
        
        {/* TAB: Report for Doctor */}
        {activeTab === 'doctor-summary' && (
          <div className="consult-doctor-summary" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Top Doctor Patient Info Header */}
            <div className="consult-patient-header" style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '20px', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="consult-patient-identity" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <img src={model.avatar} alt="Patient" style={{ width: '60px', height: '60px', borderRadius: '50%', border: '2px solid #0066cc', objectFit: 'cover' }} />
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0066cc', textTransform: 'uppercase' }}>PATIENT CONSULTATION DOSSIER</div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1d1d1f' }}>{model.name}</h2>
                  <div style={{ fontSize: '0.8rem', color: '#6e6e73' }}>วันที่ประเมิน: 26 ก.ค. 2026 | รหัสอ้างอิง: #DOC-2026-88912</div>
                </div>
              </div>

              <div className="consult-score" style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: '#6e6e73' }}>คะแนนสัดส่วนรวม</div>
                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#0066cc', lineHeight: 1 }}>{model.overallScore} <span style={{ fontSize: '1rem', color: '#6e6e73' }}>/ 10</span></div>
              </div>
            </div>

            {/* 3 Main Medical Summary Boxes */}
            <div className="consult-summary-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
              
              {/* Box 1: Structure & Symmetry */}
              <div className="consult-summary-card" style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', padding: '20px', borderRadius: '20px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={16} color="#0066cc" /> 1. ภาพรวมสัดส่วนเรขาคณิต
                </h4>
                <ul style={{ paddingLeft: '18px', fontSize: '0.82rem', color: '#1d1d1f', lineHeight: 1.6 }}>
                  <li>Facial Harmony: <strong>72% (7.2/10)</strong></li>
                  <li>Jawline Definition: <strong>78% (7.8/10)</strong></li>
                  <li>Golden Ratio Alignment: <strong>74%</strong></li>
                  <li>Symmetry Index: <strong>77% (ความสมมาตรสูง)</strong></li>
                </ul>
              </div>

              {/* Box 2: Surgery Plan */}
              <div className="consult-summary-card" style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', padding: '20px', borderRadius: '20px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={16} color="#0066cc" /> 2. ความต้องการศัลยกรรม
                </h4>
                <ul style={{ paddingLeft: '18px', fontSize: '0.82rem', color: '#1d1d1f', lineHeight: 1.6 }}>
                  <li>ตำแหน่งที่ต้องการปรับ: <strong>{selectedStudioProcedures.map(({ category }) => category).join(', ') || 'ยังไม่ได้เลือก'}</strong></li>
                  <li>รูปแบบที่เลือก: <strong>{selectedStudioProcedures.map(({ name }) => name).join(', ') || 'ยังไม่ได้เลือก'}</strong></li>
                  <li>ค่าที่ปรับจากภาพเดิม: <strong>{adjustedStudioValues.length} รายการ</strong></li>
                  <li>ประเมินงบศัลยกรรม: <strong>30,000 - 80,000 บาท</strong></li>
                </ul>
              </div>

              {/* Box 3: Skin & Treatment Plan */}
              <div className="consult-summary-card" style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', padding: '20px', borderRadius: '20px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sliders size={16} color="#0066cc" /> 3. แผนดูแลผิวพรรณ
                </h4>
                <ul style={{ paddingLeft: '18px', fontSize: '0.82rem', color: '#1d1d1f', lineHeight: 1.6 }}>
                  <li>ปัญหาหลัก: <strong>สิวอักเสบ, รอยสิว, รูขุมขนกว้าง</strong></li>
                  <li>Priority 1 (ทำก่อน): <strong>Pico Laser + ฉีดสิว</strong></li>
                  <li>Priority 2 (ทำทีหลัง): <strong>LED Therapy + สกินแคร์</strong></li>
                  <li>ประเมินงบผิวพรรณ: <strong>15,000 - 35,000 บาท</strong></li>
                </ul>
              </div>

            </div>

            {/* Doctor Note Disclaimer */}
            <div className="consult-disclaimer" style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '20px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: '#0066cc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldCheck size={20} color="#0066cc" />
                <span>รายงานนี้เป็นข้อมูลตั้งต้นเชิงเรขาคณิต (Pre-Consultation Baseline) เพื่อช่วยเตรียมคำถาม ไม่ใช่คำวินิจฉัยทางการแพทย์</span>
              </div>
              <strong style={{ color: '#0066cc' }}>DooDee AI Platform</strong>
            </div>

          </div>
        )}

        {activeTab === 'surgery-preview' && (
          <div className="consult-studio-preview">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.8fr) 1fr', gap: '24px', alignItems: 'start' }}>
              <div>
                <img src={model.avatar} alt="ภาพตั้งต้นจากการสแกน" style={{ display: 'block', width: '100%', maxHeight: '480px', objectFit: 'cover', borderRadius: '20px' }} />
                <p style={{ marginTop: '8px', color: '#6e6e73', fontSize: '0.75rem', textAlign: 'center' }}>ภาพตั้งต้นจากการสแกนล่าสุด</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <section>
                  <h3 style={{ marginBottom: '10px' }}>รูปแบบที่เลือก</h3>
                  {selectedStudioProcedures.length ? (
                    <ul style={{ paddingLeft: '20px', lineHeight: 1.8 }}>
                      {selectedStudioProcedures.map(({ category, name }) => <li key={category}><strong>{category}:</strong> {name}</li>)}
                    </ul>
                  ) : <p style={{ color: '#6e6e73' }}>ยังไม่ได้เลือกรูปแบบสำเร็จ</p>}
                </section>
                <section>
                  <h3 style={{ marginBottom: '10px' }}>ค่าที่ปรับจากภาพเดิม</h3>
                  {adjustedStudioValues.length ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                      {adjustedStudioValues.map(({ label, value }) => (
                        <div key={label} style={{ padding: '10px 12px', borderRadius: '12px', background: '#f5f5f7', display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '0.8rem' }}>
                          <span>{label}</span><strong style={{ color: '#7457d7' }}>{value}%</strong>
                        </div>
                      ))}
                    </div>
                  ) : <p style={{ color: '#6e6e73' }}>ทุกค่ายังเป็นภาพเดิม</p>}
                </section>
              </div>
            </div>
          </div>
        )}

        {/* Other Active Tab Fallback Content */}
        {activeTab !== 'doctor-summary' && activeTab !== 'surgery-preview' && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1d1d1f' }}>
              แสดงรายละเอียดหมวด {reportTabs.find(t => t.id === activeTab)?.label}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#6e6e73', marginTop: '8px' }}>
              {reportTabs.find(t => t.id === activeTab)?.sub} - ข้อมูลถูกเตรียมพร้อมสำหรับส่งออกรายงาน PDF และยื่นปรึกษาแพทย์
            </p>
          </div>
        )}

      </div>

    </div>
  );
}
