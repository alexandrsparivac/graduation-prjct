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

/** Send only the learner's recording to the self-hosted OpenAI Whisper worker. */
export async function transcribeSpeech(input, { serviceUrl = process.env.WHISPER_SERVICE_URL || 'http://127.0.0.1:8765',
  serviceToken = process.env.WHISPER_SERVICE_TOKEN, fetchImpl = fetch, signal } = {}) {
  if (!serviceToken) throw new Error('transcription_unavailable');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 45_000);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  let result;
  try {
    const response = await fetchImpl(`${serviceUrl.replace(/\/$/, '')}/transcribe?language=${encodeURIComponent(input.language)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${serviceToken}`, 'Content-Type': input.mime },
      body: input.audio, signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error(response.status === 422 ? 'no_speech'
        : response.status === 429 ? 'transcription_rate_limited' : 'transcription_unavailable');
      error.status = response.status;
      throw error;
    }
    result = await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
  const text = result.text;
  if (typeof text !== 'string' || !text.trim()) throw new Error('no_speech');
  return text.trim().slice(0, 4000);
}
