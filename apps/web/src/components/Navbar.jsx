import React from 'react';
import { Sparkles, Scan, Palette, History, Award, Zap } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'scan', label: 'สแกน & วิเคราะห์ใบหน้า (Scan)', icon: Scan },
    { id: 'tryon', label: 'ห้องแต่งสไตล์ (Try-On Lab)', icon: Palette },
    { id: 'compare', label: 'เปรียบเทียบผล (Compare)', icon: History },
    { id: 'history', label: 'ประวัติ & แชร์ (History)', icon: Sparkles },
    { id: 'pricing', label: 'ราคา & วิธีคำนวณ (Pricing)', icon: Award },
  ];

  return (
    <header className="glass-card" style={{ borderRadius: '0 0 20px 20px', padding: '16px 24px', position: 'sticky', top: 0, zIndex: 100, marginBottom: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        
        {/* Brand Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => setActiveTab('scan')}>
          <div style={{ 
            width: '42px', 
            height: '42px', 
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(236, 72, 153, 0.4)'
          }}>
            <Sparkles size={24} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.5px' }}>
                DooDee <span className="gradient-text">(ดูดี)</span>
              </h1>
              <span className="badge badge-purple">v2.4 AI</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Asian-Calibrated Facial Geometry & Beauty AI</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', padding: '4px' }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: isActive ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(139, 92, 246, 0.2))' : 'transparent',
                  border: isActive ? '1px solid rgba(236, 72, 153, 0.4)' : '1px solid transparent',
                  color: isActive ? '#ffffff' : 'var(--text-muted)',
                  padding: '8px 14px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.85rem',
                  fontWeight: isActive ? 600 : 500,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease'
                }}
              >
                <Icon size={16} color={isActive ? '#ec4899' : 'currentColor'} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* User Quota Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.05)', 
            border: '1px solid var(--border-color)', 
            borderRadius: '16px',
            padding: '6px 12px',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <Zap size={14} color="#f59e0b" />
            <span>โควตาฟรี: <strong style={{ color: '#f59e0b' }}>3/3 ครั้ง</strong></span>
          </div>
          <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => setActiveTab('scan')}>
            <Scan size={16} /> สแกนรูปใหม่
          </button>
        </div>

      </div>
    </header>
  );
}
