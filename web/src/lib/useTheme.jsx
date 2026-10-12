import { useEffect, useState } from 'react';
import { getPrefs, onPrefsChange } from './legacy.js';

const calc = () => {
  const theme = getPrefs().theme;
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export function useTheme() {
  const [theme, setTheme] = useState(calc);
  useEffect(() => {
    const off = onPrefsChange(() => setTheme(calc()));
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => setTheme(calc());
    mq.addEventListener('change', onMq);
    return () => {
      off();
      mq.removeEventListener('change', onMq);
    };
  }, []);
  return theme;
}
