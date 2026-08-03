import React, { useEffect, useState } from 'react';
import {
  Check,
  Crown,
  Gift,
  ScanFace,
  ShieldCheck,
  Sparkles,
  X,
  Zap
} from 'lucide-react';

const FEATURES = [
  { id: 'single-reference', th: 'ภาพอ้างอิงก่อนปรึกษา', en: 'Single consultation reference' },
  { id: 'multi-reference', th: 'ภาพอ้างอิงหลายประเด็น', en: 'Multiple reference images' },
  { id: 'try-on', th: 'Try-on ผม / ตา / ริมฝีปาก', en: 'Hair / eye / lip Try-on' },
  { id: 'report', th: 'คำแนะนำรายงาน', en: 'Personal report guidance' },
  { id: 'questions', th: 'จัดลำดับคำถามก่อนปรึกษา', en: 'Prioritized consultation questions' },
  { id: 'pdf', th: 'รายงาน PDF', en: 'PDF report' },
  { id: 'tracking', th: 'โหมดติดตามผล', en: 'Progress tracking' },
  { id: 'compare', th: 'เปรียบเทียบหลายรูป', en: 'Multi-photo comparison' },
  { id: 'doctor', th: 'ปรึกษากับแพทย์', en: 'Doctor consultation' }
];

const PLANS = [
  {
    id: 'free',
    name: 'FREE',
    titleTh: 'ทดลองใช้ส่วนตัว ไม่มีภาพประกอบ',
    titleEn: 'Personal trial without references',
    price: '0',
    scans: 1,
    references: 0,
    icon: ScanFace,
    included: ['report', 'questions'],
    buttonTh: 'ใช้แผนพื้นฐาน',
    buttonEn: 'Use basic plan'
  },
  {
    id: 'plus',
    name: 'PLUS',
    titleTh: '10 สแกน + 5 ภาพประกอบ + ลองลุค + PDF + แผนติดตามผล',
    titleEn: '10 scans + 5 references + Try-on + PDF + tracking',
    price: '149',
    scans: 10,
    references: 5,
    icon: ShieldCheck,
    recommended: true,
    included: ['single-reference', 'multi-reference', 'try-on', 'report', 'questions', 'pdf', 'tracking'],
    buttonTh: 'เลือก PLUS',
    buttonEn: 'Choose PLUS'
  },
  {
    id: 'pro',
    name: 'PRO',
    titleTh: '30 สแกน + 20 ภาพประกอบ + PDF + แผนติดตามผลครบ',
    titleEn: '30 scans + 20 references + PDF + complete tracking',
    price: '299',
    scans: 30,
    references: 20,
    icon: Crown,
    included: FEATURES.map((feature) => feature.id),
    buttonTh: 'เลือก PRO',
    buttonEn: 'Choose PRO'
  }
];

export default function PricingView({ lang = 'th' }) {
  const isTh = lang === 'th';
  const [selectedPlan, setSelectedPlan] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const choosePlan = (plan) => {
    setSelectedPlan(plan.id);
    setToast(
      plan.id === 'free'
        ? (isTh ? 'เลือกแผน FREE เรียบร้อยแล้ว' : 'FREE plan selected')
        : (isTh ? `เลือกแพ็กเกจ ${plan.name} แล้ว` : `${plan.name} plan selected`)
    );
  };

  return (
    <div className="pricing-page">
      <header className="pricing-hero">
        <div className="pricing-eyebrow"><Sparkles size={14} />DOODEE MEMBERSHIP</div>
        <h1>{isTh ? 'เลือกแพ็กเกจที่พอดีกับการดูแลของคุณ' : 'Choose the plan that fits your care journey'}</h1>
        <p>
          {isTh
            ? 'เริ่มใช้ฟรี หรือเพิ่มภาพอ้างอิง รายงาน PDF เครื่องมือเปรียบเทียบ และการติดตามผลเมื่อต้องการ'
            : 'Start free, then add references, PDF reports, comparison tools, and progress tracking when you need them.'}
        </p>
        <div className="pricing-billing-note">
          <ShieldCheck size={15} />
          <span>{isTh ? 'ยกเลิกได้ทุกเมื่อ · ไม่มีค่าธรรมเนียมแอบแฝง' : 'Cancel anytime · No hidden fees'}</span>
        </div>
      </header>

      <div className="pricing-plan-grid">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const selected = selectedPlan === plan.id;
          return (
            <article key={plan.id} className={`pricing-plan-card ${plan.id}${selected ? ' is-selected' : ''}`}>
              {/* Header Badge */}
              <div className="pricing-card-header-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginBottom: '6px' }}>
                {plan.recommended ? (
                  <div className="pricing-recommended" style={{ position: 'static', margin: 0 }}>
                    <Crown size={12} />
                    <span>{isTh ? 'แนะนำ' : 'Recommended'}</span>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#757067', background: '#F0EBE1', padding: '2px 8px', borderRadius: '10px' }}>
                    {plan.id === 'free' ? (isTh ? 'พื้นฐาน' : 'Basic') : (isTh ? 'มืออาชีพ' : 'Pro')}
                  </span>
                )}
              </div>

              <div className="pricing-plan-top">
                <div className="pricing-plan-icon"><Icon size={18} /></div>
                <span>{plan.name}</span>
                <h2>{isTh ? plan.titleTh : plan.titleEn}</h2>
              </div>

              <div className="pricing-price">
                <span>฿</span>
                <strong>{plan.price === '0' ? (isTh ? 'ฟรี' : 'Free') : plan.price}</strong>
                <small>{plan.price === '0' ? '฿0' : (isTh ? '/เดือน' : '/mo')}</small>
              </div>

              <div className="pricing-quotas">
                <div>
                  <strong>{plan.scans}</strong>
                  <span>{isTh ? 'สแกน/เดือน' : 'scans/mo'}</span>
                </div>
                <div>
                  <strong>{plan.references}</strong>
                  <span>{isTh ? 'ภาพอ้างอิง' : 'references'}</span>
                </div>
              </div>

              <div className="pricing-feature-list">
                {FEATURES.map((feature) => {
                  const included = plan.included.includes(feature.id);
                  return (
                    <div key={feature.id} className={included ? 'is-included' : 'is-excluded'}>
                      <span>{included ? <Check size={10} /> : <X size={10} />}</span>
                      <p>{isTh ? feature.th : feature.en}</p>
                    </div>
                  );
                })}
              </div>

              <button type="button" className="pricing-select-button" onClick={() => choosePlan(plan)}>
                {selected ? <Check size={15} /> : plan.id === 'free' ? <Zap size={15} /> : <Crown size={15} />}
                {selected ? (isTh ? 'เลือกแล้ว' : 'Selected') : (isTh ? plan.buttonTh : plan.buttonEn)}
              </button>

              {plan.id !== 'free' && (
                <div className="pricing-payment-note">
                  {isTh ? 'ชำระรายเดือน' : 'Monthly'}
                  <span>บัตร/QR</span>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <section className="pricing-value-strip">
        <div><Gift size={18} /><span>{isTh ? 'ใช้สิทธิ์ได้ทันทีหลังชำระเงิน' : 'Access immediately after payment'}</span></div>
        <div><ShieldCheck size={18} /><span>{isTh ? 'ข้อมูลภาพได้รับการปกป้อง' : 'Your images stay protected'}</span></div>
        <div><Sparkles size={18} /><span>{isTh ? 'อัปเกรดหรือยกเลิกได้ทุกเวลา' : 'Upgrade or cancel anytime'}</span></div>
      </section>

      {toast && <div className="pricing-toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  );
}
