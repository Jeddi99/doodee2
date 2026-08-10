import React, { useState } from 'react';
import {
  Palette, ScanFace, History, Settings, Menu, X, WandSparkles, House
} from 'lucide-react';

export default function Sidebar({ currentRoute, setCurrentRoute, lang }) {
  const isTh = lang === 'th';
  const isCompactRoute = ['face-scan', 'simulation', 'tryon'].includes(currentRoute);
  const [isFloatingOpen, setIsFloatingOpen] = useState(false);
  const isCollapsed = isCompactRoute && !isFloatingOpen;

  const navItems = [
    { id: 'home', label: isTh ? 'หน้าหลัก' : 'Home', icon: House },
    { id: 'analysis', label: isTh ? 'คะแนนวิเคราะห์' : 'Analysis Scores', icon: ScanFace },
    { id: 'simulation', label: isTh ? 'จำลองใบหน้า' : 'Face Simulation', icon: WandSparkles },
    { id: 'tryon', label: isTh ? 'แต่งหน้า Try-On' : 'Virtual Try-On', icon: Palette },
    { id: 'history', label: isTh ? 'ประวัติและรายงาน' : 'History & Reports', icon: History },
    { id: 'settings', label: isTh ? 'การตั้งค่า' : 'Settings', icon: Settings },
  ];

  const handleNavigation = async (route) => {
    setIsFloatingOpen(false);
    const needsLandscape = route === 'tryon';
    try {
      if (screen.orientation?.lock) {
        await screen.orientation.lock(needsLandscape ? 'landscape' : 'portrait-primary');
      } else if (!needsLandscape) {
        screen.orientation?.unlock?.();
      }
    } catch {
      if (!needsLandscape) {
        screen.orientation?.unlock?.();
      }
      // Each orientation-specific workspace provides its own rotate gate.
    }
    setCurrentRoute(route);
  };

  return (
    <>
      {isCompactRoute && isFloatingOpen && (
        <button
          className="sidebar-floating-backdrop"
          type="button"
          aria-label={isTh ? 'ปิดเมนูนำทาง' : 'Close navigation menu'}
          onClick={() => setIsFloatingOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 54,
            border: 'none',
            background: 'rgba(0, 0, 0, 0.12)',
            backdropFilter: 'blur(1px)',
            cursor: 'default'
          }}
        />
      )}

      <aside className="dashboard-sidebar" style={{
        width: isCollapsed ? '62px' : '248px',
        height: 'calc(100vh - 16px)',
        position: 'fixed',
        top: '8px',
        left: '8px',
        background: 'rgba(255,255,255,0.86)',
        border: '1px solid #e8e8ed',
        borderRadius: isCollapsed ? '14px' : '18px',
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: isCollapsed ? '10px 8px' : '16px 12px',
        zIndex: isCompactRoute && isFloatingOpen ? 55 : 50,
        flexShrink: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
        transition: 'width 220ms ease, padding 220ms ease, border-radius 220ms ease, box-shadow 220ms ease'
      }}>
        <div className="dashboard-sidebar-main" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div className="dashboard-sidebar-brand" style={{
            display: 'flex',
            flexDirection: isCollapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            gap: isCollapsed ? '9px' : '10px',
            padding: isCollapsed ? '0 0 12px' : '0 7px 15px',
            borderBottom: '1px solid #d2d2d7',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
              <img
                src="/doodee-logo.webp"
                alt="DOODEE Logo"
                style={{ width: isCollapsed ? '30px' : '34px', height: isCollapsed ? '30px' : '34px', borderRadius: '10px', boxShadow: 'none', flexShrink: 0 }}
              />
              {!isCollapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="font-wordmark" style={{ fontSize: '1.05rem', fontWeight: 600, color: '#1d1d1f', lineHeight: 1, letterSpacing: 0 }}>
                    DOODEE
                  </span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 400, letterSpacing: '-0.08px', color: '#6e6e73', marginTop: '3px', whiteSpace: 'nowrap' }}>
                    BEAUTY AI PLATFORM
                  </span>
                </div>
              )}
            </div>

            {isCompactRoute && (
              <button
                type="button"
                aria-label={isFloatingOpen ? (isTh ? 'ย่อเมนู' : 'Collapse menu') : (isTh ? 'เปิดเมนูฟังก์ชัน' : 'Open function menu')}
                title={isFloatingOpen ? (isTh ? 'ย่อเมนู' : 'Collapse menu') : (isTh ? 'เปิดเมนูฟังก์ชัน' : 'Open function menu')}
                onClick={() => setIsFloatingOpen(value => !value)}
                style={{
                  width: '34px',
                  height: '34px',
                  flexShrink: 0,
                  borderRadius: '16px',
                  border: '1px solid #d2d2d7',
                  background: isFloatingOpen ? '#f5f5f7' : '#ffffff',
                  color: '#0066cc',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  boxShadow: 'none'
                }}
              >
                {isFloatingOpen ? <X size={17} /> : <Menu size={17} />}
              </button>
            )}
          </div>

          <nav
            className="dashboard-sidebar-nav"
            aria-label={isTh ? 'เมนูฟังก์ชัน' : 'Function menu'}
            style={{ display: 'flex', flexDirection: 'column', alignItems: isCollapsed ? 'center' : 'stretch', gap: '7px', marginTop: isCollapsed ? '12px' : '16px', overflowY: 'auto', flex: 1, minHeight: 0 }}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentRoute === item.id;
              return (
                <button
                  className={isActive ? 'is-active' : ''}
                  key={item.id}
                  type="button"
                  aria-label={item.label}
                  title={isCollapsed ? item.label : undefined}
                  onClick={() => handleNavigation(item.id)}
                  style={{
                    width: isCollapsed ? '44px' : '100%',
                    height: '44px',
                    minHeight: '44px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    gap: '10px',
                    padding: isCollapsed ? 0 : '0 14px',
                    borderRadius: '12px',
                    borderStyle: 'solid',
                    borderWidth: '1px',
                    borderColor: 'transparent',
                    background: isActive ? 'rgba(0, 102, 204, 0.1)' : 'transparent',
                    color: isActive ? '#0066cc' : '#1d1d1f',
                    fontSize: '13px',
                    fontWeight: 400,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.18s ease',
                    boxShadow: 'none',
                    boxSizing: 'border-box'
                  }}
                >
                  <Icon size={isCollapsed ? 19 : 16} color={isActive ? '#0066cc' : 'currentColor'} style={{ flexShrink: 0 }} />
                  {!isCollapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

      </aside>
    </>
  );
}
