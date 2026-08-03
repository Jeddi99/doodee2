import React, { useEffect, useState } from 'react';
import { Globe2, LogOut, Moon, Settings, Shield, Sun, Trash2 } from 'lucide-react';

import { deleteAccount } from '../lib/api';
import { firebaseSignOut } from '../lib/firebase';


export default function SettingsView({ lang, setLang, setCurrentRoute }) {
  const isTh = lang === 'th';
  const [theme, setTheme] = useState(window.localStorage.getItem('doodee-theme') || 'light');
  const [error, setError] = useState('');

  useEffect(() => {
    window.localStorage.setItem('doodee-theme', theme);
    document.documentElement.dataset.doodeeTheme = theme;
  }, [theme]);

  const signOut = async () => {
    setError('');
    try {
      await firebaseSignOut();
      setCurrentRoute('landing');
    } catch (actionError) {
      setError(actionError.message);
    }
  };

  const removeAccount = async () => {
    if (!window.confirm(isTh ? 'ลบบัญชี ผลวิเคราะห์ ภาพ และภาพจำลองทั้งหมดถาวรหรือไม่?' : 'Permanently delete your account, analyses, source images, and simulations?')) return;
    setError('');
    try {
      await deleteAccount();
      await firebaseSignOut();
      setCurrentRoute('landing');
    } catch (actionError) {
      setError(actionError.message);
    }
  };

  return (
    <div className="settings-page">
      <header className="settings-hero"><div className="settings-hero-icon"><Settings size={22} /></div><div><span>{isTh ? 'การตั้งค่า' : 'Settings'}</span><h1>{isTh ? 'บัญชีและความเป็นส่วนตัว' : 'Account and privacy'}</h1></div></header>
      {error && <p role="alert">{error}</p>}
      <div className="settings-grid">
        <section className="settings-card"><h2><Globe2 size={18} /> {isTh ? 'ภาษา' : 'Language'}</h2><div className="settings-language"><button type="button" className={lang === 'th' ? 'is-selected' : ''} onClick={() => setLang('th')}>TH</button><button type="button" className={lang === 'en' ? 'is-selected' : ''} onClick={() => setLang('en')}>EN</button></div></section>
        <section className="settings-card"><h2><Moon size={18} /> {isTh ? 'ธีม' : 'Theme'}</h2><div className="settings-language"><button type="button" className={theme === 'light' ? 'is-selected' : ''} onClick={() => setTheme('light')}><Sun size={16} /> Light</button><button type="button" className={theme === 'dark' ? 'is-selected' : ''} onClick={() => setTheme('dark')}><Moon size={16} /> Dark</button></div></section>
        <section className="settings-card"><h2><Shield size={18} /> {isTh ? 'การเก็บข้อมูล' : 'Data retention'}</h2><p>{isTh ? 'ภาพผู้ใหญ่ลบภายใน 30 วัน ข้อมูลผู้เยาว์ทั้งหมดลบภายใน 24 ชั่วโมง คุณลบข้อมูลก่อนกำหนดได้ตลอดเวลา' : 'Adult source images are deleted within 30 days. All minor data is deleted within 24 hours. You can delete sooner at any time.'}</p></section>
        <section className="settings-card settings-logout-card"><button type="button" className="settings-logout-button" onClick={signOut}><LogOut size={16} />{isTh ? 'ออกจากระบบ' : 'Sign out'}</button><button type="button" className="settings-outline-danger" onClick={removeAccount}><Trash2 size={16} />{isTh ? 'ลบบัญชีและข้อมูลทั้งหมด' : 'Delete account and all data'}</button></section>
      </div>
    </div>
  );
}
