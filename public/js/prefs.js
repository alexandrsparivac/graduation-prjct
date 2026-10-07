// User preferences that are not part of the learning data: theme, ambient
// background animation, lesson translation visibility, speech rate and voice.
//
// They live in localStorage so they apply before the first paint and work even
// when signed out. The matching snippet in each page's <head> reads the same
// key to set the theme early, so the page never flashes the wrong colours.

const KEY = 'prefs';

export const DEFAULTS = {
  theme: 'system',          // 'system' | 'light' | 'dark'
  bgWords: true,            // ambient background effects
  showTranslations: true,   // reveal the reading translation without asking
  speechRate: 'normal',     // 'slow' | 'normal' | 'fast'
  speechVoice: 'male'       // 'male' | 'female'
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
  if (!SPEECH_VOICES.includes(cache.speechVoice)) cache.speechVoice = DEFAULTS.speechVoice;
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
  root.classList.toggle('no-bg-words', !p.bgWords);
  if (p.bgWords) ensureBackgroundWords();
}

/**
 * The ambient background sits behind every page. The field is built the first
 * time the effect is switched on, so leaving it off costs nothing.
 */
let wordsMounted = false;
function ensureBackgroundWords() {
  if (wordsMounted || !document.body) return;
  wordsMounted = true;
  let field = document.getElementById('wordField');
  if (!field) {
    field = document.createElement('div');
    field.className = 'word-field';
    field.id = 'wordField';
    field.setAttribute('aria-hidden', 'true');
    document.body.prepend(field);
  }
  import('./bg-words.js').then(m => m.mountBackgroundWords(field));
}
