import { getPrefs } from './legacy.js';

export function applyThemePrefs() {
  const p = getPrefs();
  const root = document.documentElement;
  const theme = p.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : p.theme;
  root.dataset.theme = theme;
}
