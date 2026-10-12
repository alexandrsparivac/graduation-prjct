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
export const ttsSupported = !!(window.Audio || window.AudioContext || window.webkitAudioContext);
export const sttSupported = !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

// Every listening button uses the same saved voice, including review and
// dialogue playback. An explicit option can override it for a preview.
export const speak = (text, locale, options) => neural.speak(text, locale, {
  rate: speechRate(), voiceType: speechVoice(), ...options,
});

export function stopSpeaking() {
  neural.stop();
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
