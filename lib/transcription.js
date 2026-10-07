const LANGUAGES = new Set('en de fr es it pt nl sv no da fi pl cs hu el tr ru uk ar he hi zh ja ko ro'.split(' '));
const FORMATS = new Map([
  ['audio/webm', 'webm'], ['audio/mp4', 'mp4'], ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'], ['audio/x-wav', 'wav'], ['audio/mpeg', 'mp3']
]);
export const MAX_RECORDING_BYTES = 4 * 1024 * 1024;

export function transcriptionInput(audio, contentType, locale) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  const language = String(locale || '').toLowerCase().split('-')[0].replace(/^nb$/, 'no');
  if (!FORMATS.has(mime) || !LANGUAGES.has(language)) throw new Error('invalid_recording');
  if (!Buffer.isBuffer(audio) || audio.length < 128 || audio.length > MAX_RECORDING_BYTES) throw new Error('invalid_recording');
  return { audio, mime, language, extension: FORMATS.get(mime) };
}

/** Audio stays in memory; the reference answer is deliberately never sent. */
export async function transcribeSpeech(input, { apiKey, fetchImpl = fetch, signal } = {}) {
  if (!apiKey) throw new Error('transcription_unavailable');
  const form = new FormData();
  form.set('file', new Blob([input.audio], { type: input.mime }), `recording.${input.extension}`);
  form.set('model', 'whisper-large-v3');
  form.set('language', input.language);
  form.set('temperature', '0');
  form.set('response_format', 'verbose_json');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 45_000);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  let result;
  try {
    const response = await fetchImpl('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error(response.status === 429 ? 'transcription_rate_limited' : 'transcription_unavailable');
      error.status = response.status;
      throw error;
    }
    result = await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
  // Whisper can invent words in silence. Discard segments marked as silence
  // only when the decoder also reports low confidence in those words.
  const segments = Array.isArray(result.segments) ? result.segments : null;
  const text = (segments?.length ? segments
    .filter(segment => !(segment.no_speech_prob > 0.7 && segment.avg_logprob < -1))
    .map(segment => segment.text || '').join(' ') : result.text);
  if (typeof text !== 'string' || !text.trim()) throw new Error('no_speech');
  return text.trim().slice(0, 4000);
}
