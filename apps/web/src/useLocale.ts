import { useCallback, useEffect, useState } from 'react';
import { siteCopy, type Locale } from './localization';

const STORAGE_KEY = 'doodee_language';
const EVENT_NAME = 'doodee:locale_change';

function readStoredLocale(): Locale {
  // Django runs LANGUAGE_CODE="th" and the product ships Thailand-first, so an
  // unset preference means Thai here — qijek's standalone demo defaulted to en.
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'th';
  } catch {
    return 'th';
  }
}

/**
 * Single source of locale for the app. Replaces the `lang` prop that every
 * doodee component used to thread down by hand; components read `copy` from
 * `localization.ts` instead of carrying inline th/en ternaries.
 */
export function useLocale() {
  const [locale, setLocale] = useState<Locale>(readStoredLocale);

  useEffect(() => {
    const handleLocaleChange = (e: Event) => {
      const customEvent = e as CustomEvent<Locale>;
      if (customEvent.detail) {
        setLocale(customEvent.detail);
      } else {
        setLocale(readStoredLocale());
      }
    };
    window.addEventListener(EVENT_NAME, handleLocaleChange);
    return () => window.removeEventListener(EVENT_NAME, handleLocaleChange);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.body.dataset.locale = locale;
    document.title =
      locale === 'th'
        ? 'DOODEE — รู้ว่าอะไรสร้างความต่างบนใบหน้าคุณ'
        : 'DOODEE — Look better with a plan built for your face.';
  }, [locale]);

  const chooseLocale = useCallback((next: Locale) => {
    setLocale(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private-mode Safari throws on write; the in-memory state still applies.
    }
    document.cookie = `doodee_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  }, []);

  return { locale, chooseLocale, copy: siteCopy[locale] };
}
