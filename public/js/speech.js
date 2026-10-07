import { createNeuralSpeech } from './neural-speech.js';
import { speechRate, speechVoice } from './prefs.js';
import { createVoiceRecorder } from './voice-recorder.js';
export { similarity } from './speech-match.js';

const BCP47 = {
  en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', nl: 'nl-NL', sv: 'sv-SE', no: 'nb-NO',
  da: 'da-DK', fi: 'fi-FI', pl: 'pl-PL', cs: 'cs-CZ', hu: 'hu-HU', el: 'el-GR', tr: 'tr-TR', ru: 'ru-RU', uk: 'uk-UA',
  ar: 'ar-SA', he: 'he-IL', hi: 'hi-IN', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', ro: 'ro-RO'
};
export const toLocale = code => BCP47[code] || code;

export const ttsSupported = !!(window.Audio || window.AudioContext || window.webkitAudioContext);
export const sttSupported = !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

async function getSpeechToken(refresh = false) {
    const { getSupabase } = await import('./supabase-client.js');
    const sb = await getSupabase();
    const { data } = await (refresh ? sb.auth.refreshSession() : sb.auth.getSession());
    return data.session?.access_token;
}
const neural = createNeuralSpeech({
  getToken: getSpeechToken,
  onError: error => {
    console.warn('Speech playback failed', { code: error.code || error.name, stage: error.stage, status: error.status });
    window.dispatchEvent(new CustomEvent('speecherror', { detail: error }));
  }
});
const recordVoice = createVoiceRecorder({ getToken: getSpeechToken });
let recording;

// Every listening button uses the same saved voice, including review and
// dialogue playback. An explicit option can override it for a preview.
export const speak = (text, locale, options) => neural.speak(text, locale, {
  rate: speechRate(), voiceType: speechVoice(), ...options
});

export function stopSpeaking() {
  neural.stop();
}

window.addEventListener('pagehide', () => { stopSpeaking(); recording?.abort(); });

export function listen(locale, callbacks = {}) {
  recording?.abort();
  if (!sttSupported) { callbacks.onerror?.('unsupported'); callbacks.onend?.(); return null; }
  recording = recordVoice(locale, callbacks);
  return recording;
}
