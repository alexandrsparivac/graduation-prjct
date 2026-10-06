// Interface translations.
//
// The engine lives here; each language is a separate file under /js/i18n/ that
// is fetched only when that language is actually selected. Romanian is bundled
// as the base so the first paint never waits on a network round-trip.
//
// A string is either a plain value or an array of plural forms ordered by the
// language's own rule — see pluralIndex().

import ro from './i18n/ro.js';
import roCatalog from './catalog/ro.js';
import { localizedDomain, localizedTopic } from './catalog-labels.js';

// Every language the interface can be switched to. `dir` is only set where it
// is not left-to-right. The flag is decorative and appears only in the language
// picker — everywhere else the interface stays free of emoji.
export const UI_LANGS = [
  { code: 'ro', label: 'Română', country: 'România', flag: '🇷🇴' },
  { code: 'en', label: 'English', country: 'United Kingdom', flag: '🇬🇧' },
  { code: 'ru', label: 'Русский', country: 'Россия', flag: '🇷🇺' },
  { code: 'uk', label: 'Українська', country: 'Україна', flag: '🇺🇦' },
  { code: 'de', label: 'Deutsch', country: 'Deutschland', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', country: 'France', flag: '🇫🇷' },
  { code: 'es', label: 'Español', country: 'España', flag: '🇪🇸' },
  { code: 'it', label: 'Italiano', country: 'Italia', flag: '🇮🇹' },
  { code: 'pt', label: 'Português', country: 'Portugal', flag: '🇵🇹' },
  { code: 'nl', label: 'Nederlands', country: 'Nederland', flag: '🇳🇱' },
  { code: 'sv', label: 'Svenska', country: 'Sverige', flag: '🇸🇪' },
  { code: 'no', label: 'Norsk', country: 'Norge', flag: '🇳🇴' },
  { code: 'da', label: 'Dansk', country: 'Danmark', flag: '🇩🇰' },
  { code: 'fi', label: 'Suomi', country: 'Suomi', flag: '🇫🇮' },
  { code: 'pl', label: 'Polski', country: 'Polska', flag: '🇵🇱' },
  { code: 'cs', label: 'Čeština', country: 'Česko', flag: '🇨🇿' },
  { code: 'hu', label: 'Magyar', country: 'Magyarország', flag: '🇭🇺' },
  { code: 'el', label: 'Ελληνικά', country: 'Ελλάδα', flag: '🇬🇷' },
  { code: 'tr', label: 'Türkçe', country: 'Türkiye', flag: '🇹🇷' },
  { code: 'ar', label: 'العربية', country: 'العالم العربي', dir: 'rtl', flag: '🇸🇦' },
  { code: 'he', label: 'עברית', country: 'ישראל', dir: 'rtl', flag: '🇮🇱' },
  { code: 'hi', label: 'हिन्दी', country: 'भारत', flag: '🇮🇳' },
  { code: 'zh', label: '中文', country: '中国', flag: '🇨🇳' },
  { code: 'ja', label: '日本語', country: '日本', flag: '🇯🇵' },
  { code: 'ko', label: '한국어', country: '대한민국', flag: '🇰🇷' }
];

export const DEFAULT_LANG = 'ro';
const FALLBACK_CHAIN = ['en', 'ro'];
const STORE_KEY = 'uiLang';

const KNOWN = new Set(UI_LANGS.map(l => l.code));
const loaded = { ro };
const catalogs = { ro: roCatalog };
const inFlight = {};

export const langMeta = code => UI_LANGS.find(l => l.code === code);

// Private browsing can make localStorage throw; the language choice is a
// convenience, never a reason to break a page.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* not persisted */ } }
};

function detect() {
  const saved = store.get(STORE_KEY);
  if (saved && KNOWN.has(saved)) return saved;
  const nav = (navigator.language || '').slice(0, 2).toLowerCase();
  return KNOWN.has(nav) ? nav : DEFAULT_LANG;
}

let current = DEFAULT_LANG;
export const getLang = () => current;

/** Fetch a language file. A missing or broken file degrades to the fallback. */
async function load(code) {
  if (loaded[code] && catalogs[code]) return loaded[code];
  if (!inFlight[code]) {
    const strings = import(`./i18n/${code}.js`)
      .then(m => { loaded[code] = m.default; return m.default; })
      .catch(err => {
        console.warn(`No translation file for "${code}":`, err.message);
        loaded[code] = {};
        return loaded[code];
      });
    const catalog = import(`./catalog/${code}.js`)
      .then(m => { catalogs[code] = m.default; })
      .catch(err => { console.warn(`No study catalog for "${code}":`, err.message); });
    inFlight[code] = Promise.all([strings, catalog]).then(([dict]) => dict);
  }
  return inFlight[code];
}

const activeCatalog = () => catalogs[current] || catalogs.en || roCatalog;
export const domainName = domain => localizedDomain(domain, activeCatalog());
export const domainDescription = domain => localizedDomain(domain, activeCatalog(), 'description');
export const topicName = (slug, topic) => localizedTopic(slug, topic, activeCatalog());

export function languageName(code, locale = current) {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code);
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch { /* older browser */ }
  return langMeta(code)?.label || code;
}

// Database translations can also cover fields added outside the original seed.
// Bundled catalogs keep the UI working before migration 006 is installed.
export async function loadCatalogTranslations(sb) {
  const code = current;
  const { data, error } = await sb.from('domain_translations')
    .select('domain_slug, name, description, topics').eq('language_code', code);
  if (!error && data?.length) {
    catalogs[code] = { ...catalogs[code], ...Object.fromEntries(data.map(d => [d.domain_slug, d])) };
  }
}

// Plural form index. Romanian, Russian and Ukrainian need three forms; Polish
// and Czech too but with different rules; CJK and Turkish need one.
function pluralIndex(lang, n) {
  const abs = Math.abs(n);
  const mod10 = abs % 10, mod100 = abs % 100;
  switch (lang) {
    case 'ro':
      if (abs === 1) return 0;
      if (abs === 0 || (mod100 >= 1 && mod100 <= 19)) return 1;
      return 2;
    case 'ru': case 'uk':
      if (mod10 === 1 && mod100 !== 11) return 0;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
      return 2;
    case 'pl':
      if (abs === 1) return 0;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
      return 2;
    case 'cs':
      if (abs === 1) return 0;
      if (abs >= 2 && abs <= 4) return 1;
      return 2;
    case 'ar':
      if (abs === 0) return 0;
      if (abs === 1) return 1;
      if (abs === 2) return 2;
      if (mod100 >= 3 && mod100 <= 10) return 3;
      if (mod100 >= 11) return 4;
      return 5;
    case 'zh': case 'ja': case 'ko': case 'tr': case 'hu':
      return 0;
    default:
      return abs === 1 ? 0 : 1;
  }
}

const fill = (str, vars) =>
  String(str).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m));

/** Look a key up in the active language, then down the fallback chain. */
function lookup(key) {
  const chain = [current, ...FALLBACK_CHAIN];
  for (const code of chain) {
    const entry = loaded[code]?.[key];
    if (entry != null) return { entry, code };
  }
  return null;
}

/** Translate a key. `vars` fills {placeholders}. */
export function t(key, vars) {
  const hit = lookup(key);
  if (!hit) return key;
  const { entry } = hit;
  return fill(Array.isArray(entry) ? entry[0] : entry, vars);
}

/** Translate a plural key, choosing the form that matches `n`. */
export function tp(key, n, vars) {
  const hit = lookup(key);
  if (!hit) return key;
  const forms = Array.isArray(hit.entry) ? hit.entry : [hit.entry];
  // Index by the rule of the language the string actually came from, so a
  // fallback string is not indexed with the wrong rule.
  const idx = Math.min(pluralIndex(hit.code, n), forms.length - 1);
  return fill(forms[idx], { n, ...vars });
}

/**
 * Translate every marked element under `root`.
 *   data-i18n="key"                  -> textContent
 *   data-i18n-html="key"             -> innerHTML (our own strings only)
 *   data-i18n-attr="placeholder:key" -> attributes, semicolon-separated
 */
export function applyI18n(root = document) {
  // querySelectorAll only sees descendants, so the root element is handled
  // separately — otherwise translating a single element would silently do
  // nothing.
  const scope = el => {
    const list = [...el.querySelectorAll('[data-i18n], [data-i18n-html], [data-i18n-attr]')];
    if (el.nodeType === 1 && (el.dataset.i18n || el.dataset.i18nHtml || el.dataset.i18nAttr)) list.unshift(el);
    return list;
  };

  for (const el of scope(root)) {
    if (el.dataset.i18n) el.textContent = t(el.dataset.i18n);
    if (el.dataset.i18nHtml) el.innerHTML = t(el.dataset.i18nHtml);
    if (el.dataset.i18nAttr) {
      el.dataset.i18nAttr.split(';').forEach(pair => {
        const [attr, key] = pair.split(':').map(s => s.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
    }
  }

  const title = document.querySelector('title[data-i18n]');
  if (title) document.title = t(title.dataset.i18n);
}

const listeners = new Set();

/** Re-run `fn` whenever the language changes — for text that JS builds. */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyDir(code) {
  const dir = langMeta(code)?.dir || 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = code;
}

let languageRequest = 0;
export async function setLang(code, { rememberChoice = true } = {}) {
  if (!KNOWN.has(code)) return;
  const request = ++languageRequest;
  await Promise.all([load(code), ...FALLBACK_CHAIN.map(load)]);
  if (request !== languageRequest) return;
  const changed = code !== current;
  current = code;
  store.set(STORE_KEY, code);
  if (rememberChoice) store.set('uiLangPending', code);
  applyDir(code);
  applyI18n();
  if (changed) listeners.forEach(fn => fn(code));
}

/**
 * Call once per page before revealing content. Resolves when the saved
 * language is in memory, so the page never flashes Romanian first.
 */
export async function initI18n() {
  const wanted = detect();
  await Promise.all([load(wanted), ...FALLBACK_CHAIN.map(load)]);
  current = wanted;
  applyDir(wanted);
  applyI18n();
  return wanted;
}
