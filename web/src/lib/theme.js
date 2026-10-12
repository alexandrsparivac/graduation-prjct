import { getPrefs } from './legacy.js';

// Single fixed accent: black lightened a touch. The accent picker is gone
// from Settings; stored accent values are ignored.
const FIXED_PRIMARY = '#262626';
const FIXED_ON_PRIMARY = '#fafafa';

export function applyThemePrefs() {
  const p = getPrefs();
  const root = document.documentElement;
  const theme = p.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : p.theme;
  root.dataset.theme = theme;
  root.style.setProperty('--primary', FIXED_PRIMARY);
  root.style.setProperty('--primary-hover', '#333333');
  root.style.setProperty('--on-primary', FIXED_ON_PRIMARY);
}
