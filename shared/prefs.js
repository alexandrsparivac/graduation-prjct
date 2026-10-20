// User preferences that are not part of the learning data: theme, ambient
// background animation, lesson translation visibility, speech rate and voice.
//
// They live in localStorage so they apply before the first paint and work even
// when signed out. The matching snippet in each page's <head> reads the same
// key to set the theme early, so the page never flashes the wrong colours.
import { BUILDER_SECTIONS } from './lesson-builder.js';

const KEY = 'prefs';
const ACCENTS = ['violet', 'blue', 'teal', 'green', 'orange', 'rose'];
const HEX_COLOR = /^#[\da-f]{6}$/i;

export const DEFAULTS = {
  theme: 'system',          // 'system' | 'light' | 'dark'
  headerLayout: 'left',     // 'left' | 'top'
  accent: 'violet',         // Persistent system-wide accent colour
  bgWords: true,            // ambient background effects
  showTranslations: true,   // reveal the reading translation without asking
  speechRate: 'normal',     // 'slow' | 'normal' | 'fast'
  speechVoice: 'male',      // 'male' | 'female'
  lessonSections: BUILDER_SECTIONS.map(section => section.key)
};

export const SPEECH_RATES = { slow: 0.72, normal: 0.95, fast: 1.15 };
export const SPEECH_VOICES = ['male', 'female'];

let cache = null;

// Private browsing and locked-down profiles can make localStorage throw on
// read or write. Preferences are a convenience, never a reason to break a page.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* not persisted */ } }
};

export function getPrefs() {
  if (cache) return cache;
  let saved = {};
  try { saved = JSON.parse(store.get(KEY) || '{}'); } catch { /* corrupt value, ignore */ }
  cache = { ...DEFAULTS, ...saved };
  if (typeof cache.accent === 'string' && HEX_COLOR.test(cache.accent)) cache.accent = cache.accent.toLowerCase();
  else if (!ACCENTS.includes(cache.accent)) cache.accent = DEFAULTS.accent;
  if (!SPEECH_VOICES.includes(cache.speechVoice)) cache.speechVoice = DEFAULTS.speechVoice;
  if (!['top', 'left'].includes(cache.headerLayout)) cache.headerLayout = DEFAULTS.headerLayout;
  const validSections = new Set(BUILDER_SECTIONS.map(section => section.key));
  cache.lessonSections = Array.isArray(cache.lessonSections)
    ? [...new Set(cache.lessonSections.filter(section => validSections.has(section)))]
    : [...DEFAULTS.lessonSections];
  if (!cache.lessonSections.length) cache.lessonSections = [...DEFAULTS.lessonSections];
  return cache;
}

export const getPref = key => getPrefs()[key];

/** Numeric synthesis rate for the neural voice, from the stored label. */
export const speechRate = () => SPEECH_RATES[getPref('speechRate')] ?? SPEECH_RATES.normal;
export const speechVoice = () => SPEECH_VOICES.includes(getPref('speechVoice')) ? getPref('speechVoice') : DEFAULTS.speechVoice;

const listeners = new Set();

export function onPrefsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist() {
  store.set(KEY, JSON.stringify(cache));
  applyPrefs();
  listeners.forEach(fn => fn(cache));
}

export function setPref(key, value) {
  getPrefs();
  if (cache[key] === value) return;
  cache[key] = value;
  persist();
}

export function resetPrefs() {
  cache = { ...DEFAULTS };
  persist();
}

/** Put the current preferences onto <html> so CSS and modules can react. */
export function applyPrefs() {
  const p = getPrefs();
  const root = document.documentElement;
  if (p.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = p.theme;
  if (HEX_COLOR.test(p.accent)) {
    root.dataset.accent = 'custom';
    root.style.setProperty('--ant-primary', p.accent);
    root.style.setProperty('--ant-text-light-solid', contrastText(p.accent));
  } else {
    root.dataset.accent = p.accent;
    root.style.removeProperty('--ant-primary');
    root.style.removeProperty('--ant-text-light-solid');
  }
  root.classList.toggle('no-bg-words', !p.bgWords);
  if (p.bgWords) ensureBackgroundWords();
}

function contrastText(hex) {
  const rgb = hex.slice(1).match(/.{2}/g).map(part => parseInt(part, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.059;
  return darkContrast > whiteContrast ? '#19182c' : '#ffffff';
}

/**
 * The ambient background is owned by the React frontend (AmbientGL), which
 * reads the `bgWords` preference itself. This stays a no-op so the shared
 * preferences module never touches page DOM from the old vanilla app.
 */
let wordsMounted = false;
function ensureBackgroundWords() {
  wordsMounted = true;
}
