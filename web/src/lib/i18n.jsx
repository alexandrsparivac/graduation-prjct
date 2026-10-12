import { useEffect, useReducer, useState } from 'react';
import { getLang, initI18n, onLangChange } from './legacy.js';

// Re-render the subscriber whenever the interface language changes.
export function useI18n() {
  const [lang, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => onLangChange(() => bump()), []);
  return { lang: getLang(), tick: lang };
}

export function useI18nReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    initI18n().then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  useI18n();
  return ready;
}
