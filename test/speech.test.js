import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { speechInput, escapeSpeechText, synthesizeSpeech, createSpeechService, NEURAL_VOICES, FEMALE_NEURAL_VOICES } from '../lib/tts.js';
import { createNeuralSpeech } from '../public/js/neural-speech.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } });

test('speech uses a native neural voice for all 25 learning languages and rejects invalid inputs', () => {
  assert.equal(Object.keys(NEURAL_VOICES).length, 25);
  for (const [locale, voice] of Object.entries(NEURAL_VOICES)) {
    assert.equal(speechInput({ text: 'Lesson', locale }).voice, voice);
    assert.match(voice, /Neural$/);
  }
  assert.equal(speechInput({ text: 'Hello', locale: 'en-US' }).voice, 'en-US-AndrewMultilingualNeural');
  assert.equal(speechInput({ text: 'Hei', locale: 'nb-NO', rate: 0.54 }).voice, NEURAL_VOICES.no);
  for (const input of [null, {}, { text: '  ', locale: 'en' }, { text: 'x'.repeat(8001), locale: 'en' },
    { text: 'Hi', locale: 'constructor' }, { text: 'Hi', locale: 'en', rate: '1' },
    { text: 'Hi', locale: 'en', rate: NaN }, { text: 'Hi', locale: 'en', rate: 0.1 }]) {
    assert.throws(() => speechInput(input));
  }
});

test('both voice types use native voices in all 25 languages and arbitrary voice types are rejected', () => {
  assert.deepEqual(Object.keys(FEMALE_NEURAL_VOICES), Object.keys(NEURAL_VOICES));
  for (const locale of Object.keys(NEURAL_VOICES)) {
    const male = speechInput({ text: 'Lesson', locale, voiceType: 'male' });
    const female = speechInput({ text: 'Lesson', locale, voiceType: 'female' });
    assert.equal(male.voice, NEURAL_VOICES[locale]);
    assert.equal(female.voice, FEMALE_NEURAL_VOICES[locale]);
    assert.notEqual(female.voice, male.voice, locale);
    assert.equal(female.voice.split('-')[0], male.voice.split('-')[0], locale);
  }
  assert.equal(speechInput({ text: 'Hei', locale: 'nb-NO', voiceType: 'female' }).voice, FEMALE_NEURAL_VOICES.no);
  assert.equal(speechInput({ text: 'Hi', locale: 'en-US', voiceType: 'female' }).voice, FEMALE_NEURAL_VOICES.en);
  for (const voiceType of ['constructor', '__proto__', 'en-US-AvaMultilingualNeural', '', null, {}, 1]) {
    assert.throws(() => speechInput({ text: 'Hi', locale: 'en', voiceType }), /voice type/);
  }
});

test('speech escapes SSML without changing technical text or the selected slow rate', async () => {
  let closed = 0;
  let seen;
  const audio = await synthesizeSpeech(speechInput({ text: 'A < B & "C"\u0001', locale: 'de', rate: 0.54 }), {
    createTTS: () => ({
      async setMetadata(voice, format) { seen = { voice, format }; },
      toStream(text, options) { Object.assign(seen, { text, options }); return { audioStream: Readable.from([Buffer.from('mp3')]) }; },
      close() { closed++; }
    })
  });
  assert.equal(audio.toString(), 'mp3');
  assert.equal(seen.text, 'A &lt; B &amp; &quot;C&quot;');
  assert.equal(seen.voice, NEURAL_VOICES.de);
  assert.equal(seen.options.rate, 0.54);
  assert.equal(closed, 1);
  assert.equal(escapeSpeechText("<voice name='bad'>"), '&lt;voice name=&apos;bad&apos;&gt;');
});

test('speech closes the provider on empty audio, truncated streams and timeouts', async () => {
  for (const kind of ['empty', 'truncated', 'timeout']) {
    let closed = 0;
    await assert.rejects(synthesizeSpeech(speechInput({ text: 'Hi', locale: 'en' }), {
      timeoutMs: 10,
      createTTS: () => ({
        setMetadata: () => kind === 'timeout' ? new Promise(() => {}) : Promise.resolve(),
        toStream: () => ({ audioStream: Readable.from((async function* () {
          if (kind === 'truncated') { yield Buffer.from('partial'); throw new Error('Stream truncated'); }
        })()) }),
        close() { closed++; }
      })
    }));
    assert.equal(closed, 1, kind);
  }
});

test('audio cache shares concurrent synthesis, separates speeds and stays within its memory limit', async () => {
  let calls = 0;
  const gate = deferred();
  const service = createSpeechService({ maxBytes: 6, synthesize: async () => {
    calls++; if (calls === 1) await gate.promise; return Buffer.from('mp3');
  } });
  const input = speechInput({ text: 'Hi', locale: 'en' });
  const first = service(input), second = service(input);
  gate.resolve();
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
  await service(input);
  assert.equal(calls, 1);
  await service({ ...input, rate: 0.54 });
  await service({ ...input, text: 'Different' });
  await service(input);
  assert.equal(calls, 4, 'the oldest entry is evicted');
});

test('a failed synthesis can be retried and is never cached as audio', async () => {
  let calls = 0;
  const service = createSpeechService({ synthesize: async () => {
    if (++calls === 1) throw new Error('Offline'); return Buffer.from('mp3');
  } });
  const input = speechInput({ text: 'Hi', locale: 'ro' });
  await assert.rejects(service(input));
  assert.equal((await service(input)).toString(), 'mp3');
  assert.equal(calls, 2);
});

test('server audio cache keeps selected voices separate for the same text and speed', async () => {
  const synthesized = [];
  const service = createSpeechService({ synthesize: async input => {
    synthesized.push(input.voice);
    return Buffer.from(input.voice);
  } });
  const male = speechInput({ text: 'Salut', locale: 'ro', voiceType: 'male' });
  const female = speechInput({ text: 'Salut', locale: 'ro', voiceType: 'female' });
  assert.equal((await service(male)).toString(), NEURAL_VOICES.ro);
  assert.equal((await service(female)).toString(), FEMALE_NEURAL_VOICES.ro);
  assert.equal((await service(male)).toString(), NEURAL_VOICES.ro);
  assert.equal((await service(female)).toString(), FEMALE_NEURAL_VOICES.ro);
  assert.deepEqual(synthesized, [NEURAL_VOICES.ro, FEMALE_NEURAL_VOICES.ro]);
});

function audioContext() {
  const sources = [];
  let resumed = 0;
  return {
    state: 'running', destination: {}, sources,
    get resumed() { return resumed; },
    resume() { resumed++; return Promise.resolve(); },
    async decodeAudioData() { return { duration: 1 }; },
    createBufferSource() {
      const source = { starts: 0, stops: 0, disconnects: 0,
        connect() {}, start() { this.starts++; }, stop() { this.stops++; }, disconnect() { this.disconnects++; } };
      sources.push(source);
      return source;
    }
  };
}

test('the player unlocks audio inside the click, authenticates requests and replays cached audio', async () => {
  const ctx = audioContext();
  let fetched = 0, ended = 0, cancelled = 0;
  const player = createNeuralSpeech({ createContext: () => ctx, getToken: async () => 'test-token',
    fetchImpl: async (url, options) => {
      fetched++;
      assert.equal(url, '/api/speech');
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.equal(JSON.parse(options.body).rate, 0.54);
      return response();
    } });
  const playing = player.speak('Measure the distance.', 'en-US', { rate: 0.54, onend: () => ended++, oncancel: () => cancelled++ });
  assert.equal(ctx.resumed, 1, 'audio resumes before awaiting the session');
  await playing;
  assert.equal(ctx.sources[0].starts, 1);
  ctx.sources[0].onended();
  assert.equal(ended, 1);
  await player.speak('Measure the distance.', 'en-US', { rate: 0.54, oncancel: () => cancelled++ });
  assert.equal(fetched, 1);
  player.stop();
  assert.equal(cancelled, 1);
  assert.equal(ctx.sources[1].stops, 1);
  assert.equal(ended, 1, 'stopping does not restart a dialogue chain');
});

test('changing the voice stops playback and requests distinct audio instead of replaying the old voice', async () => {
  const ctx = audioContext();
  const requested = [];
  let cancelled = 0;
  const player = createNeuralSpeech({ createContext: () => ctx, getToken: async () => 'token',
    fetchImpl: async (_url, options) => {
      requested.push(JSON.parse(options.body));
      return response();
    } });
  await player.speak('Hello', 'en-US', { voiceType: 'male', oncancel: () => cancelled++ });
  await player.speak('Hello', 'en-US', { voiceType: 'female' });
  assert.equal(cancelled, 1);
  assert.equal(ctx.sources[0].stops, 1);
  assert.deepEqual(requested, [
    { text: 'Hello', locale: 'en-US', rate: 0.95, voiceType: 'male' },
    { text: 'Hello', locale: 'en-US', rate: 0.95, voiceType: 'female' }
  ]);
  await player.speak('Hello', 'en-US', { voiceType: 'female' });
  await player.speak('Hello', 'en-US');
  assert.equal(requested.length, 2, 'both selected voices are cached independently');
  player.stop();
});

test('voice preference survives a page reload, preserves other preferences and resets to the existing voice', async () => {
  const oldStorage = globalThis.localStorage, oldDocument = globalThis.document;
  const saved = new Map([['prefs', JSON.stringify({ theme: 'dark', bgWords: false, speechRate: 'slow' })]]);
  globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  globalThis.document = { documentElement: { dataset: {}, classList: { toggle() {} } } };
  try {
    const firstPage = await import('../public/js/prefs.js?voice-first-page');
    assert.equal(firstPage.speechVoice(), 'male', 'existing preferences retain the existing voice');
    firstPage.setPref('speechVoice', 'female');
    const nextPage = await import('../public/js/prefs.js?voice-next-page');
    assert.equal(nextPage.speechVoice(), 'female');
    assert.equal(nextPage.speechRate(), 0.72);
    assert.equal(nextPage.getPref('theme'), 'dark');
    assert.equal(nextPage.getPref('bgWords'), false);
    nextPage.resetPrefs();
    assert.equal(nextPage.speechVoice(), 'male');
    assert.equal(JSON.parse(saved.get('prefs')).speechVoice, 'male');
    saved.set('prefs', JSON.stringify({ speechVoice: 'constructor' }));
    const invalid = await import('../public/js/prefs.js?voice-invalid');
    assert.equal(invalid.speechVoice(), 'male');
    assert.equal(invalid.getPrefs().speechVoice, 'male', 'the settings picker also gets a valid default');
  } finally {
    if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('a cancelled network response cannot play after a new word or exercise starts', async () => {
  const ctx = audioContext();
  const request = deferred(), started = deferred();
  let requests = 0, cancelled = 0, errors = 0;
  let oldSignal;
  const player = createNeuralSpeech({ createContext: () => ctx, getToken: async () => 'token',
    onError: () => errors++, fetchImpl: async (_url, options) => {
      if (++requests === 1) { oldSignal = options.signal; started.resolve(); return request.promise; }
      return response();
    } });
  const old = player.speak('Old word', 'en', { oncancel: () => cancelled++ });
  await started.promise;
  await player.speak('New word', 'en');
  request.resolve(response());
  await old;
  assert.equal(oldSignal.aborted, true);
  assert.equal(cancelled, 1);
  assert.equal(errors, 0);
  assert.equal(ctx.sources.length, 1);
  assert.equal(ctx.sources[0].starts, 1);
  player.stop();
});

test('unavailable audio clears playback controls and does not silently use a browser voice', async () => {
  const ctx = audioContext();
  let errors = 0, localErrors = 0, cancelled = 0, ended = 0;
  const player = createNeuralSpeech({ createContext: () => ctx, getToken: async () => 'token',
    onError: () => errors++, fetchImpl: async () => new Response('{}', { status: 503 }) });
  await player.speak('Hi', 'en', { oncancel: () => cancelled++, onend: () => ended++, onerror: () => localErrors++ });
  assert.equal(errors, 1);
  assert.equal(cancelled, 1);
  assert.equal(localErrors, 1, 'the preview can show its own visible error');
  assert.equal(ended, 0);
  assert.equal(ctx.sources.length, 0);
});

for (const stalledStage of ['resume', 'session', 'network', 'body', 'decode']) {
  test(`stalled ${stalledStage} exits loading and reports a playback error`, async () => {
    const ctx = audioContext();
    const pending = deferred();
    const callbacks = [];
    if (stalledStage === 'resume') ctx.resume = () => pending.promise;
    if (stalledStage === 'decode') ctx.decodeAudioData = () => pending.promise;
    const player = createNeuralSpeech({ timeoutMs: 15, createContext: () => ctx,
      getToken: () => stalledStage === 'session' ? pending.promise : Promise.resolve('token'),
      fetchImpl: async () => {
        if (stalledStage === 'network') return pending.promise;
        if (stalledStage === 'body') return { ok: true, headers: new Headers({'content-type':'audio/mpeg'}), arrayBuffer: () => pending.promise };
        return response();
      },
      onError: error => callbacks.push(['global-error',error.message])
    });
    let guard;
    try {
      await Promise.race([
        player.speak('Sample', 'en', {
          oncancel: () => callbacks.push(['cancel']),
          onerror: error => callbacks.push(['local-error',error.message]),
          onstart: () => callbacks.push(['start']),
          onend: () => callbacks.push(['end'])
        }),
        new Promise((_,reject)=>{ guard=setTimeout(()=>reject(new Error('Playback never settled')),250); })
      ]);
      assert.deepEqual(callbacks, [['cancel'],['local-error','Speech timed out'],['global-error','Speech timed out']]);
      if (stalledStage === 'session') pending.resolve('token');
      else if (stalledStage === 'network') pending.resolve(response());
      else if (stalledStage === 'body') pending.resolve(new Uint8Array([1,2,3]).buffer);
      else pending.resolve({ duration: 1 });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(ctx.sources.length, 0, 'late resolution cannot play the expired sample');
    } finally { clearTimeout(guard); player.stop(); }
  });
}

test('cancelling blocked audio unlock settles promptly and a retry can play', async () => {
  const ctx = audioContext();
  const unlock = deferred();
  ctx.resume = () => unlock.promise;
  let cancelled = 0, errors = 0;
  const player = createNeuralSpeech({ createContext: () => ctx, getToken: async () => 'token', fetchImpl: async () => response(), onError: () => errors++ });
  const first = player.speak('Sample', 'en', { oncancel: () => cancelled++ });
  player.stop();
  let guard;
  try {
    await Promise.race([first, new Promise((_,reject)=>{ guard=setTimeout(()=>reject(new Error('Cancellation never settled')),250); })]);
  } finally { clearTimeout(guard); player.stop(); }
  assert.equal(cancelled, 1);
  assert.equal(errors, 0);
  ctx.resume = () => Promise.resolve();
  await player.speak('Sample', 'en');
  unlock.resolve();
  assert.equal(ctx.sources.length, 1);
  assert.equal(ctx.sources[0].starts, 1);
  player.stop();
});

function mediaPlayer() {
  return { plays: [], pauses: 0, play() { this.plays.push(this.src); return Promise.resolve(); },
    pause() { this.pauses++; }, removeAttribute() { this.src = ''; } };
}

test('Safari can play the neural MP3 through the audio element when Web Audio decoding fails', async () => {
  const ctx = audioContext(), media = mediaPlayer(), revoked = [];
  ctx.decodeAudioData = async () => { throw new Error('Decode failed'); };
  let started = 0, ended = 0, errors = 0;
  const player = createNeuralSpeech({ createContext: () => ctx, createAudio: () => media,
    createURL: () => 'blob:sample', revokeURL: url => revoked.push(url), getToken: async () => 'token',
    fetchImpl: async () => response(), onError: () => errors++ });
  const playing = player.speak('Hello', 'en', { onstart: () => started++, onend: () => ended++ });
  assert.match(media.plays[0], /^data:audio\/wav/,'the media element is unlocked inside the click');
  await playing;
  assert.equal(media.plays[1], 'blob:sample');
  assert.equal(started, 1);
  assert.equal(errors, 0);
  assert.equal(ctx.sources.length, 0);
  media.onended();
  assert.equal(ended, 1);
  assert.deepEqual(revoked, ['blob:sample']);
  assert.equal(media.src, '');
});

test('a stalled Safari AudioContext switches to media playback instead of blocking the audio request', async () => {
  const ctx = audioContext(), media = mediaPlayer();
  ctx.resume = () => new Promise(() => {});
  let fetched = 0;
  const player = createNeuralSpeech({ decodeTimeoutMs: 10, createContext: () => ctx, createAudio: () => media,
    createURL: () => 'blob:sample', revokeURL: () => {}, getToken: async () => 'token',
    fetchImpl: async () => { fetched++; return response(); } });
  await player.speak('Hello', 'en');
  assert.equal(fetched, 1);
  assert.equal(media.plays.at(-1), 'blob:sample');
  player.stop();
  assert.equal(media.src, '');
});

test('an expired bearer token is refreshed once and the original neural audio plays', async () => {
  const ctx = audioContext(), refreshes = [], tokens = [];
  const player = createNeuralSpeech({ createContext: () => ctx,
    getToken: async refresh => { refreshes.push(!!refresh); return refresh ? 'fresh' : 'expired'; },
    fetchImpl: async (_url, options) => {
      tokens.push(options.headers.Authorization);
      return tokens.length === 1 ? new Response('{}', { status: 401 }) : response();
    } });
  await player.speak('Hello', 'en');
  assert.deepEqual(refreshes, [false, true]);
  assert.deepEqual(tokens, ['Bearer expired', 'Bearer fresh']);
  assert.equal(ctx.sources[0].starts, 1);
  player.stop();
});

test('bad MP3 bytes are not cached and a retry downloads valid audio', async () => {
  const ctx = audioContext();
  let fetched = 0, errors = 0;
  ctx.decodeAudioData = async () => { if (fetched === 1) throw new Error('Bad audio'); return { duration: 1 }; };
  const player = createNeuralSpeech({ createContext: () => ctx, getToken: async () => 'token',
    fetchImpl: async () => { fetched++; return response(); }, onError: () => errors++ });
  await player.speak('Hello', 'en');
  await player.speak('Hello', 'en');
  assert.equal(fetched, 2);
  assert.equal(errors, 1);
  assert.equal(ctx.sources[0].starts, 1);
  player.stop();
});

test('blocked media playback reports the cause and cancellation never advances a dialogue', async () => {
  const ctx = audioContext(), media = mediaPlayer(), errors = [], revoked = [];
  ctx.decodeAudioData = async () => { throw new Error('No decoder'); };
  media.play = function () { return this.src.startsWith('blob:')
    ? Promise.reject(Object.assign(new Error('Blocked'), { name: 'NotAllowedError' })) : Promise.resolve(); };
  let ended = 0, cancelled = 0;
  const player = createNeuralSpeech({ createContext: () => ctx, createAudio: () => media,
    createURL: () => 'blob:sample', revokeURL: url => revoked.push(url), getToken: async () => 'token',
    fetchImpl: async () => response(), onError: error => errors.push(error.code) });
  await player.speak('Hello', 'en', { onend: () => ended++, oncancel: () => cancelled++ });
  assert.deepEqual(errors, ['playback_blocked']);
  assert.equal(ended, 0);
  assert.equal(cancelled, 1);
  assert.deepEqual(revoked, ['blob:sample']);
});
