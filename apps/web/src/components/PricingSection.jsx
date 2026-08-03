import React, { useState } from 'react';
import { Check, ArrowRight, CreditCard, QrCode, ShieldCheck, Sparkles } from 'lucide-react';

export default function PricingSection({ lang, onStartScan }) {
  const isTh = lang === 'th';
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'annual'

  const plans = [
    {
      id: 'free',
      name: isTh ? 'Starter (ฟรี)' : 'Starter (Free)',
      priceMonthly: '0',
      priceAnnual: '0',
      tier: 'free',
      blurb: isTh ? 'สแกนอ่านสัดส่วนใบหน้าฟรี' : 'Free initial face assessment baseline',
      scansQuota: '1 สแกน',
      previewsQuota: '1 ภาพ',
      recommended: false,
      badgeText: isTh ? 'ทดลองฟรี' : 'Free Trial'
    },
    {
      id: 'plus',
      name: isTh ? 'Pro Member' : 'Pro Member',
      priceMonthly: '199',
      priceAnnual: '159',
      tier: 'plus',
      blurb: isTh ? 'เปรียบเทียบสัดส่วนและหัตถการครบ' : 'Unlimited assessment & try-on comparison',
      scansQuota: isTh ? 'ไม่จำกัด' : 'Unlimited',
      previewsQuota: isTh ? 'ไม่จำกัด' : 'Unlimited',
      recommended: true,
      badgeText: isTh ? 'ยอดนิยม' : 'Most Popular'
    },
    {
      id: 'pro',
      name: isTh ? 'Clinic Partner' : 'Clinic Partner',
      priceMonthly: '1,490',
      priceAnnual: '1,190',
      tier: 'pro',
      blurb: isTh ? 'Pre-Consultation สำหรับคลินิก' : 'Pre-consultation kiosk for clinics',
      scansQuota: isTh ? 'ไม่จำกัด + API' : 'Unlimited + API',
      previewsQuota: isTh ? 'รายงาน PDF แบรนด์' : 'Custom Clinic PDF',
      recommended: false,
      badgeText: isTh ? 'สำหรับคลินิก' : 'For Clinics'
    }
  ];

  const paymentMethods = [
    { icon: QrCode, label: isTh ? 'พร้อมเพย์ QR Code' : 'PromptPay QR' },
    { icon: CreditCard, label: isTh ? 'บัตรเครดิต / เดบิต' : 'Credit / Debit Card' },
    { icon: ShieldCheck, label: isTh ? 'ใบเสร็จและระบบชำระเงินปลอดภัย' : 'Secure SSL Checkout' }
  ];

  return (
    <section id="pricing" className="landing-pricing" style={{ background: '#ffffff', color: '#1d1d1f', padding: '90px 20px' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '0', padding: 0, borderRadius: '20px', color: '#6e6e73', fontSize: '12px', fontWeight: 400, marginBottom: '10px' }}>
            <Sparkles size={14} />
            <span>{isTh ? 'การ Subscription และแผนชำระเงิน' : 'SUBSCRIPTION & PRICING'}</span>
          </div>
          <h2 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#1d1d1f', letterSpacing: '-0.02em', marginBottom: '8px' }}>
            {isTh ? 'แผนบริการตรงใจ ยืดหยุ่น ไร้ข้อผูกมัด' : 'Flexible Plans Tailored For You'}
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#6e6e73', maxWidth: '600px', margin: '0 auto 18px auto', lineHeight: 1.5, fontWeight: 500 }}>
            {isTh 
              ? 'เลือกแพ็กเกจที่เหมาะกับการประเมินของคุณ หรือทดลองใช้ฟรีครั้งแรก'
              : 'Choose the best subscription for your needs or try your first assessment for free.'
            }
          </p>

          {/* Billing Cycle Toggle */}
          <div style={{ display: 'inline-flex', alignItems: 'center', background: '#f5f5f7', padding: '3px', borderRadius: '999px', border: '1px solid #e8e8ed' }}>
            <button
              onClick={() => setBillingCycle('monthly')}
              style={{
                padding: '6px 16px',
                borderRadius: '24px',
                border: 'none',
                background: billingCycle === 'monthly' ? '#FFFFFF' : 'transparent',
                color: billingCycle === 'monthly' ? '#1d1d1f' : '#6e6e73',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: 'none',
                transition: 'all 0.2s'
              }}
            >
              {isTh ? 'รายเดือน' : 'Monthly'}
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              style={{
                padding: '6px 16px',
                borderRadius: '24px',
                border: 'none',
                background: billingCycle === 'annual' ? '#0066cc' : 'transparent',
                color: billingCycle === 'annual' ? '#FFFFFF' : '#6e6e73',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: 'none',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>{isTh ? 'รายปี' : 'Annual'}</span>
              <span style={{ background: billingCycle === 'annual' ? 'rgba(255,255,255,0.25)' : '#0066cc', color: '#FFF', fontSize: '0.65rem', padding: '2px 5px', borderRadius: '10px' }}>
                -20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid (3 Columns Compact on Mobile) */}
        <div className="landing-pricing-grid-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {plans.map((plan) => {
            const price = billingCycle === 'annual' ? plan.priceAnnual : plan.priceMonthly;
            return (
              <div 
                key={plan.id}
                className="pricing-compact-card"
                style={{
                  background: plan.recommended ? '#ffffff' : '#f5f5f7',
                  border: plan.recommended ? '1px solid #0066cc' : '1px solid #e8e8ed',
                  borderRadius: '18px',
                  padding: '22px 18px',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: 'none'
                }}
              >
                <div>
                  {/* Top Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginBottom: '8px' }}>
                    <span style={{
                      background: plan.recommended ? '#0066cc' : '#ffffff',
                      color: plan.recommended ? '#ffffff' : '#6e6e73',
                      fontSize: '0.65rem',
                      fontWeight: 400,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      whiteSpace: 'nowrap'
                    }}>
                      {plan.badgeText}
                    </span>
                  </div>

                  <h3 className="plan-card-title" style={{ fontSize: '1.05rem', fontWeight: 600, color: '#1d1d1f', margin: '4px 0' }}>{plan.name}</h3>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px', marginTop: '6px', color: '#1d1d1f' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>฿</span>
                    <span className="plan-card-price" style={{ fontSize: '2rem', fontWeight: 600, lineHeight: 1 }}>{price}</span>
                    <span style={{ fontSize: '0.7rem', color: '#6e6e73', marginLeft: '2px' }}>
                      {plan.tier === 'free' ? '' : isTh ? '/เดือน' : '/mo'}
                    </span>
                  </div>

                  <p className="plan-card-blurb" style={{ fontSize: '0.72rem', color: '#666158', marginTop: '6px', lineHeight: 1.3, minHeight: '32px' }}>
                    {plan.blurb}
                  </p>

                  <div style={{ margin: '10px 0', borderTop: '1px solid #d2d2d7', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.72rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Check size={13} color="#0066cc" />
                      <span>{plan.scansQuota}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Check size={13} color="#0066cc" />
                      <span>{plan.previewsQuota}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Check size={13} color="#0066cc" />
                      <span>{isTh ? 'รายงาน PDF' : 'PDF Report'}</span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={onStartScan}
                  style={{
                    width: '100%',
                    padding: '8px 6px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    border: plan.recommended ? 'none' : '1px solid #d2d2d7',
                    background: plan.recommended ? '#0066cc' : '#FFFFFF',
                    color: plan.recommended ? '#ffffff' : '#1d1d1f',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    boxShadow: 'none',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span>{isTh ? `เลือก` : `Select`}</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Payment Methods Strip */}
        <div style={{ background: '#FFFFFF', border: '1px solid #d2d2d7', borderRadius: '18px', padding: '20px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#3E3B36' }}>
            {isTh ? 'ช่องทางชำระเงินที่รองรับ:' : 'Supported Payment Methods:'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px' }}>
            {paymentMethods.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#1d1d1f', background: '#f5f5f7', padding: '6px 14px', borderRadius: '10px', border: '1px solid #d2d2d7' }}>
                  <Icon size={16} color="#0066cc" />
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
}
