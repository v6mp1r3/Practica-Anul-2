import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { en } from './en';
import { ru } from './ru';
import { ro, type MessageKey } from './ro';

export type Lang = 'ro' | 'en' | 'ru';
export const LANGS: Lang[] = ['ro', 'en', 'ru'];
const dictionaries: Record<Lang, Record<MessageKey, string>> = { ro, en, ru };

/** Locale used for dates and numbers in each interface language. */
export const dateLocale = (l: Lang) => ({ ro: 'ro-MD', en: 'en-GB', ru: 'ru-RU' })[l];
const LANG_KEY = 'eduschedule:lang';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translate;
}

const I18nContext = createContext<I18n | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'ro' || saved === 'en' || saved === 'ru') return saved;
  } catch {
    /* ignore */
  }
  return 'ro';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.documentElement.lang = l;
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback<Translate>(
    (key, vars) => {
      let s: string = dictionaries[lang][key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export type { MessageKey };
