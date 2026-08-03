import React, { useEffect, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';

export default function AppHeaderBar({ lang, setLang }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const isTh = lang === 'th';

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setIsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const selectLanguage = (nextLang) => {
    setLang(nextLang);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="app-language-switcher" ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`app-language-trigger${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls="app-language-menu"
        aria-label={isTh ? 'เปลี่ยนภาษา' : 'Change language'}
        title={isTh ? 'เปลี่ยนภาษา' : 'Change language'}
      >
        <Globe size={19} aria-hidden="true" />
        <span aria-hidden="true">{isTh ? 'TH' : 'EN'}</span>
      </button>

      {isOpen && (
        <div
          id="app-language-menu"
          className="app-language-menu"
          role="menu"
          aria-label={isTh ? 'เลือกภาษา' : 'Choose language'}
        >
          <p>{isTh ? 'เลือกภาษา' : 'Choose language'}</p>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={isTh}
            className={isTh ? 'is-selected' : ''}
            onClick={() => selectLanguage('th')}
          >
            <span><strong>TH</strong> ภาษาไทย</span>
            {isTh && <Check size={17} aria-hidden="true" />}
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!isTh}
            className={!isTh ? 'is-selected' : ''}
            onClick={() => selectLanguage('en')}
          >
            <span><strong>EN</strong> English</span>
            {!isTh && <Check size={17} aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  );
}
