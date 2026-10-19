// Speech wiring for the React app. The vanilla speech.js singleton gets its
// token from the vanilla Supabase client, which holds no session on this
// origin — so every neural voice (male and female alike) failed here with
// 401s. Same engines, but the token comes from this app's client.
import { supabase } from './supabase.js';
import { speechRate, speechVoice } from '../../../shared/prefs.js';
import { createNeuralSpeech } from '../../../shared/neural-speech.js';
import { createVoiceRecorder } from '../../../shared/voice-recorder.js';

export { similarity } from '../../../shared/speech-match.js';

async function getSpeechToken(refresh = false) {
  if (refresh) {
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

const neural = createNeuralSpeech({
  getToken: getSpeechToken,
  onError: (error) => {
    console.warn('Speech playback failed', { code: error.code || error.name, stage: error.stage, status: error.status });
    window.dispatchEvent(new CustomEvent('speecherror', { detail: error }));
  },
});
const recordVoice = createVoiceRecorder({ getToken: getSpeechToken });
let recording;

const BCP47 = {
  en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', nl: 'nl-NL', sv: 'sv-SE', no: 'nb-NO',
  da: 'da-DK', fi: 'fi-FI', pl: 'pl-PL', cs: 'cs-CZ', hu: 'hu-HU', el: 'el-GR', tr: 'tr-TR', ru: 'ru-RU', uk: 'uk-UA',
  ar: 'ar-SA', he: 'he-IL', hi: 'hi-IN', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', ro: 'ro-RO',
};
export const toLocale = (code) => BCP47[code] || code;
const browserSpeech = typeof window !== 'undefined' ? window.speechSynthesis : null;
let nativeTurn = 0;
let nativeUtterance = null;
let nativeCancel = null;

const FEMALE_VOICE_NAMES = /female|woman|girl|ava|allison|zira|samantha|karen|tessa|victoria|serena|susan|hazel|aria|jenny|libby|sonia|natasha|helena|alina|zoe|ting-ting/i;
const MALE_VOICE_NAMES = /male|man|boy|aaron|albert|arthur|david|alex|daniel|fred|jorge|thomas|mark|andrew|guy|ryan|liam|matthew|emil|florian|evan|gordon|ralph|rishi|tom|xander|yuri/i;
const NATURAL_VOICE_NAMES = /natural|neural|enhanced|premium|siri|google|microsoft|online/i;

function findBrowserVoice(locale, voiceType) {
  if (!browserSpeech) return null;
  const voices = browserSpeech.getVoices();
  if (!voices.length) return null;
  const language = String(locale || '').toLowerCase().split('-')[0];
  const localVoices = voices.filter(voice => voice.lang?.toLowerCase().startsWith(`${language}-`) || voice.lang?.toLowerCase() === language);
  const candidates = (localVoices.length ? localVoices : voices).slice().sort((a, b) => {
    // Prefer a natural/high-quality voice, while keeping the user's voice type
    // as the first priority whenever the installed voice names expose it.
    const genderScore = voice => voice.gender?.toLowerCase() === voiceType
      || (voiceType === 'female' ? FEMALE_VOICE_NAMES : MALE_VOICE_NAMES).test(voice.name || '') ? 2 : 0;
    const qualityScore = voice => NATURAL_VOICE_NAMES.test(voice.name || '') ? 1 : 0;
    return (genderScore(b) + qualityScore(b)) - (genderScore(a) + qualityScore(a));
  });
  const namePattern = voiceType === 'female' ? FEMALE_VOICE_NAMES : MALE_VOICE_NAMES;
  return candidates.find(voice => voice.gender?.toLowerCase() === voiceType || namePattern.test(voice.name || ''))
    || null;
}

function speakInBrowser(text, locale, options) {
  if (!browserSpeech || typeof window.SpeechSynthesisUtterance !== 'function') return false;
  const turn = ++nativeTurn;
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  utterance.rate = Math.max(0.5, Math.min(1.5, options.rate ?? speechRate()));
  const voice = findBrowserVoice(locale, options.voiceType ?? speechVoice());
  // Do not silently substitute the browser's default voice: its gender may be
  // opposite to the user's explicit selection.
  if (!voice) return false;
  utterance.voice = voice;
  nativeUtterance = utterance;
  nativeCancel = options.oncancel;
  utterance.onstart = () => { if (turn === nativeTurn) options.onstart?.(); };
  utterance.onend = () => {
    if (turn !== nativeTurn) return;
    nativeUtterance = null;
    nativeCancel = null;
    options.onend?.();
  };
  utterance.onerror = event => {
    if (turn !== nativeTurn) return;
    nativeUtterance = null;
    nativeCancel = null;
    if (event.error === 'canceled' || event.error === 'interrupted') options.oncancel?.();
    else options.onerror?.(event);
  };
  try {
    browserSpeech.cancel();
    browserSpeech.speak(utterance);
    return true;
  } catch (error) {
    nativeUtterance = null;
    nativeCancel = null;
    return false;
  }
}

export const ttsSupported = !!(window.Audio || window.AudioContext || window.webkitAudioContext || (browserSpeech && window.SpeechSynthesisUtterance));
export const sttSupported = !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

// Use the selected Microsoft Neural voice on the server first. If its service
// is unavailable and no server fallback can be reached, use the closest local
// voice installed on the device.
export const speak = (text, locale, options = {}) => {
  if (nativeUtterance) stopSpeaking();
  else neural.stop();
  const speechOptions = { rate: speechRate(), voiceType: speechVoice(), ...options };
  return neural.speak(text, locale, {
    ...speechOptions,
    onerror: error => {
      if (!speakInBrowser(text, locale, speechOptions)) speechOptions.onerror?.(error);
    },
  });
};

export function stopSpeaking() {
  neural.stop();
  if (nativeUtterance) {
    ++nativeTurn;
    nativeUtterance = null;
    browserSpeech?.cancel();
    const cancel = nativeCancel;
    nativeCancel = null;
    cancel?.();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { stopSpeaking(); recording?.abort(); });
}

export function listen(locale, callbacks = {}) {
  recording?.abort?.();
  // Fast path: on-device recognition where the browser has it (no upload,
  // result the moment you press the mic again). Otherwise the server path.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    try {
      const rec = new SR();
      rec.lang = locale;
      rec.interimResults = false;
      rec.maxAlternatives = 3;
      let finished = false;
      rec.onresult = (e) => {
        const last = e.results[e.results.length - 1];
        const alts = [];
        for (let i = 0; i < last.length; i++) alts.push(last[i].transcript);
        if (!finished && alts.length) {
          finished = true;
          callbacks.onresult?.(alts);
        }
      };
      rec.onerror = (e) => callbacks.onerror?.(e.error || 'error');
      rec.onend = () => callbacks.onend?.();
      rec.onstart = () => callbacks.onstart?.();
      rec.start();
      recording = {
        stop: () => { try { rec.stop(); } catch { /* already ended */ } },
        abort: () => { try { rec.abort(); } catch { /* already ended */ } },
      };
      return recording;
    } catch { /* fall through to the server recorder */ }
  }
  recording = recordVoice(locale, callbacks);
  return recording;
}

// Warm the server speech cache (and connection) before the learner presses
// play, so the first playback starts at once. Best effort, never blocks.
export async function prefetchSpeech(text, locale) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token || !text?.trim()) return;
    await fetch('/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, locale, rate: speechRate(), voiceType: speechVoice() }),
    });
  } catch { /* first press just pays the normal cost */ }
}
