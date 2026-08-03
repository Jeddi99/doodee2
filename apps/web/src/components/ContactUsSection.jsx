import React, { useState } from 'react';
import { Mail, MessageSquare, Send, CheckCircle2, MapPin, Building2 } from 'lucide-react';

export default function ContactUsSection({ lang }) {
  const isTh = lang === 'th';
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    topic: 'general',
    message: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ name: '', contact: '', topic: 'general', message: '' });
    }, 4000);
  };

  return (
    <section id="contact" className="landing-section-contact" style={{ padding: '70px 20px', background: '#FFFFFF', position: 'relative' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f5f5f7', border: '1px solid #d2d2d7', padding: '6px 14px', borderRadius: '20px', color: '#0066cc', fontSize: '0.8rem', fontWeight: 700, marginBottom: '14px' }}>
            <Mail size={14} />
            <span>{isTh ? 'ติดต่อเรา' : 'CONTACT US'}</span>
          </div>
          <h2 style={{ fontSize: '2.1rem', fontWeight: 800, color: '#1d1d1f', letterSpacing: '-0.02em', marginBottom: '14px' }}>
            {isTh ? 'พร้อมพูดคุยและสอบถามเพิ่มเติม' : 'We are here to help'}
          </h2>
          <p style={{ fontSize: '1rem', color: '#6e6e73', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6, fontWeight: 500 }}>
            {isTh 
              ? 'ไม่ว่าคุณจะเป็นผู้ใช้งานทั่วไป คลินิกความงาม หรือสนใจร่วมเป็นพันธมิตร สามารถส่งข้อความถึงทีมงาน DOODEE ได้ทันที'
              : 'Whether you are a user, clinic operator, or potential partner, feel free to reach out to the DOODEE team.'
            }
          </p>
        </div>

        {/* Content Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', alignItems: 'start' }}>
          
          {/* Direct Channels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '20px', padding: '24px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={20} color="#0066cc" />
                <span>{isTh ? 'ช่องทางติดต่อด่วน' : 'Direct Channels'}</span>
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#06C755', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem' }}>
                    LINE
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#807A72' }}>LINE Official Account</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1d1d1f' }}>@doodee.ai</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#f5f5f7', color: '#0066cc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Mail size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#807A72' }}>Email Support</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1d1d1f' }}>support@doodee.ai</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#f5f5f7', color: '#0066cc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#807A72' }}>Clinic Partnership</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1d1d1f' }}>partner@doodee.ai</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Address / Operating Hours */}
            <div style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '20px', padding: '20px 24px', fontSize: '0.88rem', color: '#68635B', lineHeight: 1.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#1d1d1f', marginBottom: '8px' }}>
                <MapPin size={16} color="#0066cc" />
                <span>{isTh ? 'เวลาทำการสนับสนุน' : 'Support Hours'}</span>
              </div>
              <div>{isTh ? 'จันทร์ - ศุกร์: 09:00 - 18:00 น. (เว้นวันหยุดนักขัตฤกษ์)' : 'Mon - Fri: 09:00 - 18:00 (ICT)'}</div>
            </div>

          </div>

          {/* Contact Form */}
          <div style={{ background: '#f5f5f7', border: '1px solid #d2d2d7', borderRadius: '20px', padding: '28px' }}>
            {submitted ? (
              <div style={{ textAlign: 'center', padding: '40px 10px' }}>
                <CheckCircle2 size={48} color="#0066cc" style={{ margin: '0 auto 16px' }} />
                <h4 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '8px' }}>
                  {isTh ? 'ส่งข้อความเรียบร้อยแล้ว' : 'Message Sent Successfully'}
                </h4>
                <p style={{ fontSize: '0.9rem', color: '#6e6e73' }}>
                  {isTh 
                    ? 'ทีมงาน DOODEE ได้รับข้อความของคุณแล้ว และจะติดต่อกลับโดยเร็วที่สุด' 
                    : 'The DOODEE team has received your message and will respond shortly.'
                  }
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#3E3B36', marginBottom: '6px' }}>
                    {isTh ? 'ชื่อของคุณ' : 'Your Name'} *
                  </label>
                  <input 
                    type="text" 
                    required 
                    placeholder={isTh ? 'สมชาย ใจดี' : 'Jane Doe'}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #D8D2C7', fontSize: '0.95rem', background: '#FFFFFF', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#3E3B36', marginBottom: '6px' }}>
                    {isTh ? 'อีเมล หรือ เบอร์โทรศัพท์' : 'Email or Phone Number'} *
                  </label>
                  <input 
                    type="text" 
                    required 
                    placeholder={isTh ? 'example@email.com หรือ 0812345678' : 'contact@example.com'}
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #D8D2C7', fontSize: '0.95rem', background: '#FFFFFF', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#3E3B36', marginBottom: '6px' }}>
                    {isTh ? 'หัวข้อที่ต้องการติดต่อ' : 'Topic'}
                  </label>
                  <select 
                    value={formData.topic}
                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #D8D2C7', fontSize: '0.95rem', background: '#FFFFFF', outline: 'none' }}
                  >
                    <option value="general">{isTh ? 'สอบถามข้อมูลทั่วไป / การใช้งาน' : 'General Inquiry / Usage'}</option>
                    <option value="subscription">{isTh ? 'แผนบริการ / การชำระเงิน' : 'Subscription & Pricing'}</option>
                    <option value="clinic">{isTh ? 'สนใจร่วมเป็นคลินิกพันธมิตร' : 'Clinic Partner Partnership'}</option>
                    <option value="support">{isTh ? 'แจ้งปัญหาการใช้งาน' : 'Report an Issue'}</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#3E3B36', marginBottom: '6px' }}>
                    {isTh ? 'ข้อความ' : 'Message'} *
                  </label>
                  <textarea 
                    rows={4}
                    required
                    placeholder={isTh ? 'พิมพ์ข้อความของคุณที่นี่...' : 'Type your message here...'}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #D8D2C7', fontSize: '0.95rem', background: '#FFFFFF', outline: 'none', resize: 'vertical' }}
                  ></textarea>
                </div>

                <button 
                  type="submit"
                  style={{
                    padding: '14px 24px',
                    background: '#0066cc',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '14px',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(0, 102, 204, 0.25)',
                    transition: 'background 0.2s'
                  }}
                >
                  <Send size={16} />
                  <span>{isTh ? 'ส่งข้อความ' : 'Send Message'}</span>
                </button>
              </form>
            )}
          </div>

        </div>

      </div>
    </section>
  );
}
