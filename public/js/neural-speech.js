/** Unlock both browser audio paths in the original click, before networking. */
export function createNeuralSpeech({ getToken, onError, fetchImpl = fetch,
  createContext = () => new (window.AudioContext || window.webkitAudioContext)(),
  createAudio = () => typeof Audio === 'function' ? new Audio() : null,
  createURL = blob => URL.createObjectURL(blob), revokeURL = url => URL.revokeObjectURL(url),
  maxCacheBytes = 16 * 1024 * 1024, timeoutMs = 45_000, decodeTimeoutMs = 2500 } = {}) {
  let context, media, active, cacheBytes = 0;
  const cache = new Map();
  const errorCode = (code, extras = {}) => Object.assign(new Error(code), { code, ...extras });
  let silence;
  function silentWav() {
    if (silence) return silence;
    const bytes = new Uint8Array(844), view = new DataView(bytes.buffer);
    const word = (offset, text) => Array.from(text).forEach((letter, i) => { bytes[offset + i] = letter.charCodeAt(0); });
    word(0, 'RIFF'); view.setUint32(4, 836, true); word(8, 'WAVE'); word(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true); view.setUint32(28, 8000, true);
    view.setUint16(32, 1, true); view.setUint16(34, 8, true); word(36, 'data'); view.setUint32(40, 800, true);
    bytes.fill(128, 44);
    silence = `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
    return silence;
  }
  function release(turn) {
    if (turn.source) {
      turn.source.onended = null;
      try { turn.source.stop(); } catch { /* ended */ }
      turn.source.disconnect();
    }
    if (media) {
      media.onended = media.onerror = null;
      media.pause();
      media.removeAttribute('src');
    }
    if (turn.url) { revokeURL(turn.url); turn.url = null; }
  }
  function stop() {
    if (!active) return;
    const old = active;
    active = null;
    old.controller.abort();
    release(old);
    old.oncancel?.();
  }
  function save(key, encoded) {
    if (cache.has(key) || encoded.byteLength > maxCacheBytes) return;
    cache.set(key, encoded);
    cacheBytes += encoded.byteLength;
    while (cache.size > 32 || cacheBytes > maxCacheBytes) {
      const first = cache.keys().next().value;
      cacheBytes -= cache.get(first).byteLength;
      cache.delete(first);
    }
  }
  async function speak(text, locale, { rate = 0.95, voiceType = 'male', onend, oncancel, onstart, onerror } = {}) {
    stop();
    const turn = { controller: new AbortController(), oncancel, stage: 'unlock' };
    active = turn;
    let resumed, unlocked;
    try {
      if (!media) media = createAudio();
      if (media) {
        media.preload = 'auto'; media.volume = 1; media.muted = false; media.playsInline = true;
        media.src = silentWav();
        // Keep the same element for the real MP3; Safari remembers this gesture.
        unlocked = Promise.resolve(media.play()).then(() => null, error => error);
      }
    } catch { media = null; }
    try {
      if (!context || context.state === 'closed') context = createContext();
      resumed = Promise.resolve(context.resume()).then(() => null, error => error);
    } catch (error) { resumed = Promise.resolve(error); }
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(turn.controller.signal.reason || errorCode('cancelled'));
      turn.controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const stage = (name, promise) => { turn.stage = name; return Promise.race([promise, aborted]); };
    const shortStage = async promise => {
      if (!media) return promise;
      let timer;
      try { return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(errorCode('audio_context_unavailable')), decodeTimeoutMs);
      })]); } finally { clearTimeout(timer); }
    };
    const timer = setTimeout(() => turn.controller.abort(new Error('Speech timed out')), timeoutMs);
    const failed = error => {
      if (active !== turn) return;
      active = null;
      release(turn);
      error.stage ||= turn.stage;
      oncancel?.(); onerror?.(error); onError?.(error);
    };
    try {
      const key = JSON.stringify([text, locale, rate, voiceType]);
      let encoded = cache.get(key);
      if (encoded) { cache.delete(key); cache.set(key, encoded); }
      else {
        let token = await stage('session', getToken());
        if (active !== turn) return;
        if (!token) throw errorCode('unauthorized');
        const request = () => fetchImpl('/api/speech', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, locale, rate, voiceType }), signal: turn.controller.signal
        });
        let response = await stage('network', request());
        if (response.status === 401) {
          token = await stage('session', getToken(true));
          if (!token) throw errorCode('unauthorized', { status: 401 });
          response = await stage('network', request());
        }
        if (!response.ok) throw errorCode(response.status === 401 ? 'unauthorized' : 'speech_unavailable', { status: response.status });
        if (!response.headers.get('content-type')?.startsWith('audio/')) throw errorCode('invalid_audio');
        encoded = await stage('body', response.arrayBuffer());
        if (active !== turn) return;
        if (!encoded.byteLength) throw errorCode('empty_audio');
      }
      let decoded, contextError;
      try {
        const unlockError = await stage('unlock', shortStage(resumed));
        if (unlockError) throw unlockError;
        if (context.state === 'interrupted' || context.state === 'suspended') throw errorCode('audio_context_unavailable');
        decoded = await stage('decode', shortStage(context.decodeAudioData(encoded.slice(0))));
      } catch (error) { contextError = error; }
      if (active !== turn) return;
      if (turn.controller.signal.aborted) throw turn.controller.signal.reason;
      if (contextError) {
        if (!media) throw contextError;
        await stage('unlock', shortStage(unlocked));
        if (active !== turn) return;
        media.pause();
        turn.url = createURL(new Blob([encoded], { type: 'audio/mpeg' }));
        media.src = turn.url;
        media.onended = () => {
          if (active !== turn) return;
          active = null; release(turn); onend?.();
        };
        media.onerror = () => failed(errorCode('invalid_audio'));
        try { await stage('play', media.play()); }
        catch (error) { throw errorCode(error.name === 'NotAllowedError' ? 'playback_blocked' : 'invalid_audio'); }
      } else {
        if (media) media.pause();
        const source = context.createBufferSource();
        turn.source = source;
        source.buffer = decoded;
        source.connect(context.destination);
        source.onended = () => {
          if (active !== turn) return;
          active = null; release(turn); onend?.();
        };
        source.start();
      }
      if (active !== turn) return;
      // Broken MP3 data never poisons the cache; retry fetches fresh bytes.
      save(key, encoded);
      clearTimeout(timer);
      onstart?.();
    } catch (error) { failed(error); }
    finally {
      clearTimeout(timer);
      turn.controller.signal.removeEventListener('abort', onAbort);
    }
  }
  return { speak, stop };
}
