import React, { useState, useEffect } from 'react';
import { ScanLine, Globe, ChevronDown, Menu, X } from 'lucide-react';

export default function Header({ currentRoute, setCurrentRoute, lang, setLang }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { id: 'about', label: lang === 'th' ? 'เกี่ยวกับเรา' : 'About Us', route: 'landing' },
    { id: 'data-we-use', label: lang === 'th' ? 'ข้อมูลที่เราใช้' : 'Data We Use', route: 'landing' },
    { id: 'pricing', label: lang === 'th' ? 'การ Subscription' : 'Subscription', route: 'landing' },
    { id: 'contact', label: lang === 'th' ? 'ติดต่อเรา' : 'Contact Us', route: 'landing' },
    { id: 'tryon', label: lang === 'th' ? 'Try-On Lab' : 'Try-On Lab', route: 'tryon' },
  ];

  const scrollToSection = (id) => {
    setMobileMenuOpen(false);
    if (currentRoute !== 'landing') {
      setCurrentRoute('landing');
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      className="landing-header"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        transition: 'all 0.3s ease',
        background: isScrolled ? 'rgba(251, 251, 253, 0.88)' : 'rgba(251, 251, 253, 0.72)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '1px solid rgba(210, 210, 215, 0.72)',
        padding: isScrolled ? '8px 18px' : '10px 20px'
      }}
    >
      <div className="landing-header-inner" style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        
        {/* Brand Logo */}
        <div
          className="landing-header-brand"
          onClick={() => setCurrentRoute('landing')} 
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
        >
          <img 
            src="/doodee-logo.webp" 
            alt="DOODEE Logo" 
            style={{ width: '30px', height: '30px', borderRadius: '9px', objectFit: 'contain' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="font-wordmark" style={{ fontSize: '1rem', fontWeight: 600, color: '#1d1d1f', lineHeight: 1, letterSpacing: 0 }}>
              DOODEE
            </span>
            <span className="landing-brand-subtitle" style={{ fontSize: '0.58rem', fontWeight: 400, letterSpacing: '-0.08px', color: '#6e6e73', marginTop: '2px' }}>
              AESTHETIC AI
            </span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '20px' }} className="desktop-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (item.route === 'landing') {
                  scrollToSection(item.id);
                } else {
                  setCurrentRoute(item.route);
                }
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: (currentRoute === item.route && item.route !== 'landing') ? '#0066cc' : '#1d1d1f',
                fontSize: '12px',
                fontWeight: 400,
                cursor: 'pointer',
                transition: 'color 0.2s'
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right Actions: Lang Switcher & Main CTA */}
        <div className="landing-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          
          {/* Language Switcher Button */}
          <button
            className="landing-language-button"
            onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: '20px',
              padding: '6px 12px',
              color: '#1d1d1f',
              fontSize: '12px',
              fontWeight: 400,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Globe size={14} color="#0066cc" />
            <span>{lang === 'th' ? 'TH' : 'EN'}</span>
          </button>

          {/* Main Primary CTA Button */}
          <button
            className="btn-brand-primary landing-primary-cta"
            onClick={() => setCurrentRoute('scan')}
            style={{ padding: '8px 17px', fontSize: '12px', borderRadius: '999px', background: '#0066cc' }}
          >
            <ScanLine size={16} />
            <span>{lang === 'th' ? 'เริ่มสแกน' : 'Start Scan'}</span>
          </button>

          <button
            type="button"
            className="landing-mobile-menu-button"
            aria-label={mobileMenuOpen ? (lang === 'th' ? 'ปิดเมนู' : 'Close menu') : (lang === 'th' ? 'เปิดเมนู' : 'Open menu')}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((value) => !value)}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

        </div>

      </div>

      {mobileMenuOpen && (
        <div className="landing-mobile-menu">
          <nav aria-label={lang === 'th' ? 'เมนูหลัก' : 'Main navigation'}>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.route === 'landing') {
                    scrollToSection(item.id);
                  } else {
                    setMobileMenuOpen(false);
                    setCurrentRoute(item.route);
                  }
                }}
              >
                <span>{item.label}</span>
                <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
              </button>
            ))}
          </nav>
          <button type="button" className="landing-mobile-start" onClick={() => { setMobileMenuOpen(false); setCurrentRoute('scan'); }}>
            <ScanLine size={17} />{lang === 'th' ? 'เริ่มต้นกับ DOODEE' : 'Get started'}
          </button>
        </div>
      )}
    </header>
  );
}
