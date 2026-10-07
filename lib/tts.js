// Native neural voices for every learning language in the catalog. English
// uses Andrew's conversational voice; no browser speechSynthesis is involved.
export const NEURAL_VOICES = Object.freeze({
  en: 'en-US-AndrewMultilingualNeural', de: 'de-DE-FlorianMultilingualNeural',
  fr: 'fr-FR-RemyMultilingualNeural', es: 'es-ES-AlvaroNeural',
  it: 'it-IT-GiuseppeMultilingualNeural', pt: 'pt-PT-DuarteNeural',
  nl: 'nl-NL-MaartenNeural', sv: 'sv-SE-MattiasNeural', no: 'nb-NO-FinnNeural',
  da: 'da-DK-JeppeNeural', fi: 'fi-FI-HarriNeural', pl: 'pl-PL-MarekNeural',
  cs: 'cs-CZ-AntoninNeural', hu: 'hu-HU-TamasNeural', el: 'el-GR-NestorasNeural',
  tr: 'tr-TR-AhmetNeural', ru: 'ru-RU-DmitryNeural', uk: 'uk-UA-OstapNeural',
  ar: 'ar-SA-HamedNeural', he: 'he-IL-AvriNeural', hi: 'hi-IN-MadhurNeural',
  zh: 'zh-CN-YunxiNeural', ja: 'ja-JP-KeitaNeural', ko: 'ko-KR-HyunsuMultilingualNeural',
  ro: 'ro-RO-EmilNeural'
});

export const FEMALE_NEURAL_VOICES = Object.freeze({
  en: 'en-US-AvaMultilingualNeural', de: 'de-DE-SeraphinaMultilingualNeural',
  fr: 'fr-FR-VivienneMultilingualNeural', es: 'es-ES-ElviraNeural',
  it: 'it-IT-IsabellaNeural', pt: 'pt-PT-RaquelNeural',
  nl: 'nl-NL-FennaNeural', sv: 'sv-SE-SofieNeural', no: 'nb-NO-PernilleNeural',
  da: 'da-DK-ChristelNeural', fi: 'fi-FI-NooraNeural', pl: 'pl-PL-ZofiaNeural',
  cs: 'cs-CZ-VlastaNeural', hu: 'hu-HU-NoemiNeural', el: 'el-GR-AthinaNeural',
  tr: 'tr-TR-EmelNeural', ru: 'ru-RU-SvetlanaNeural', uk: 'uk-UA-PolinaNeural',
  ar: 'ar-SA-ZariyahNeural', he: 'he-IL-HilaNeural', hi: 'hi-IN-SwaraNeural',
  zh: 'zh-CN-XiaoxiaoNeural', ja: 'ja-JP-NanamiNeural', ko: 'ko-KR-SunHiNeural',
  ro: 'ro-RO-AlinaNeural'
});

const VOICE_TYPES = Object.freeze({ male: NEURAL_VOICES, female: FEMALE_NEURAL_VOICES });

export function speechInput(input = {}) {
  if (!input || typeof input !== 'object') throw new Error('Invalid speech input');
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text || text.length > 8000) throw new Error('Speech text must contain 1–8000 characters');
  const language = typeof input.locale === 'string' ? input.locale.toLowerCase().split('-')[0] : '';
  const code = language === 'nb' ? 'no' : language;
  if (!Object.hasOwn(NEURAL_VOICES, code)) throw new Error('Unsupported speech language');
  const voiceType = input.voiceType === undefined ? 'male' : input.voiceType;
  if (typeof voiceType !== 'string' || !Object.hasOwn(VOICE_TYPES, voiceType)) {
    throw new Error('Unsupported speech voice type');
  }
  const rate = input.rate === undefined ? 0.95 : input.rate;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0.5 || rate > 1.5) {
    throw new Error('Speech rate must be between 0.5 and 1.5');
  }
  return { text, voice: VOICE_TYPES[voiceType][code], rate: Math.round(rate * 100) / 100 };
}

// The provider accepts SSML: learner text must remain plain text, including
// angle brackets and ampersands in technical vocabulary.
export const escapeSpeechText = text => text
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

export async function synthesizeSpeech(input, { createTTS, timeoutMs = 30_000 } = {}) {
  const outputFormat = 'audio-24khz-48kbitrate-mono-mp3';
  let tts;
  let timer;
  try {
    return await Promise.race([
      (async () => {
        if (createTTS) {
          tts = createTTS();
        } else {
          const { MsEdgeTTS } = await import('msedge-tts');
          tts = new MsEdgeTTS();
        }
        await tts.setMetadata(input.voice, outputFormat);
        const { audioStream } = tts.toStream(escapeSpeechText(input.text), { rate: input.rate });
        const chunks = [];
        let bytes = 0;
        for await (const chunk of audioStream) {
          bytes += chunk.length;
          if (bytes > 4 * 1024 * 1024) throw new Error('Speech audio is too large');
          chunks.push(chunk);
        }
        if (!bytes) throw new Error('Speech provider returned empty audio');
        return Buffer.concat(chunks);
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Speech provider timed out')), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
    tts?.close();
  }
}

/** Bounded memory cache: identical clicks share one request; failures retry. */
export function createSpeechService({ synthesize = synthesizeSpeech, maxBytes = 32 * 1024 * 1024, maxEntries = 128, ttlMs = 3600_000 } = {}) {
  const cache = new Map();
  const pending = new Map();
  let bytes = 0;
  const drop = key => { bytes -= cache.get(key).audio.length; cache.delete(key); };
  return async input => {
    const key = JSON.stringify(input);
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
      cache.delete(key); cache.set(key, hit);
      return hit.audio;
    }
    if (hit) drop(key);
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 6) throw new Error('Speech provider is busy');
    const job = (async () => {
      const audio = await synthesize(input);
      if (audio.length <= maxBytes) {
        cache.set(key, { audio, expires: Date.now() + ttlMs });
        bytes += audio.length;
        while (bytes > maxBytes || cache.size > maxEntries) drop(cache.keys().next().value);
      }
      return audio;
    })();
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
  };
}
