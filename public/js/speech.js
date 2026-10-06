const BCP47 = {
  en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', nl: 'nl-NL', sv: 'sv-SE', no: 'nb-NO',
  da: 'da-DK', fi: 'fi-FI', pl: 'pl-PL', cs: 'cs-CZ', hu: 'hu-HU', el: 'el-GR', tr: 'tr-TR', ru: 'ru-RU', uk: 'uk-UA',
  ar: 'ar-SA', he: 'he-IL', hi: 'hi-IN', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', ro: 'ro-RO'
};
export const toLocale = code => BCP47[code] || code;

export const ttsSupported = 'speechSynthesis' in window;
export const sttSupported = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

let voices = [];
if (ttsSupported) {
  voices = speechSynthesis.getVoices();
  speechSynthesis.addEventListener('voiceschanged', () => { voices = speechSynthesis.getVoices(); });
}

/**
 * The guesses the engine returns for one utterance, best first.
 *
 * A SpeechRecognitionResult is an indexed collection, but only Chromium gives
 * it a Symbol.iterator — spreading it throws in Safari. Reading it by index is
 * what every engine agrees on.
 */
function alternatives(result) {
  if (!result) return [];
  const out = [];
  for (let i = 0; i < (result.length || 0); i++) {
    const t = (result.item ? result.item(i) : result[i])?.transcript;
    if (t) out.push(t);
  }
  return out;
}

function pickVoice(locale) {
  const lang = locale.split('-')[0];
  return voices.find(v => v.lang === locale) || voices.find(v => v.lang.startsWith(lang)) || null;
}

export function speak(text, locale, { rate = 0.95, onend } = {}) {
  if (!ttsSupported) return null;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = locale;
  u.rate = rate;
  const v = pickVoice(locale);
  if (v) u.voice = v;
  if (onend) u.onend = onend;
  speechSynthesis.speak(u);
  return u;
}

export function stopSpeaking() {
  if (ttsSupported) speechSynthesis.cancel();
}

export function listen(locale, { onresult, onerror, onend }) {
  if (!sttSupported) return null;
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new Rec();
  r.lang = locale;
  r.interimResults = false;
  r.maxAlternatives = 3;
  r.onresult = e => {
    onresult?.(alternatives(e.results?.[0]));
  };
  r.onerror = e => onerror?.(e.error);
  r.onend = () => onend?.();
  r.start();
  return r;
}

const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

// Word-level similarity 0..1 between the expected sentence and what was heard.
export function similarity(expected, heard) {
  const a = norm(expected).split(' ');
  const b = new Set(norm(heard).split(' '));
  if (!a.length) return 0;
  const hit = a.filter(w => b.has(w)).length;
  return hit / a.length;
}
