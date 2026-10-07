import test from 'node:test';
import assert from 'node:assert/strict';
import { transcriptionInput, transcribeSpeech } from '../lib/transcription.js';
import { createVoiceRecorder } from '../public/js/voice-recorder.js';
import { similarity } from '../public/js/speech-match.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

test('spoken answers preserve word order, count missing/repeated/extra words and normalize punctuation', () => {
  assert.equal(similarity('Put the gloves on.', 'Put the gloves on!'), 1);
  assert.ok(similarity('Put the gloves on.', 'on gloves the put') < 0.6);
  assert.equal(similarity('I need two two tools.', 'I need two tools.'), 0.8);
  assert.equal(similarity('Put gloves on.', 'Put the red gloves on.'), 0.6);
  assert.equal(similarity("We can't work.", 'We cannot work.'), 1);
  assert.equal(similarity("I'm ready.", 'I am ready.'), 1);
  assert.equal(similarity('I water the vines.', ''), 0);
  assert.equal(similarity('', ''), 0);
  assert.equal(similarity('Наденьте перчатки.', 'НАДЕНЬТЕ ПЕРЧАТКИ!', 'ru-RU'), 1);
  assert.equal(similarity('戴上手套。', '戴上手套！', 'zh-CN'), 1);
  assert.ok(similarity('戴上手套。', '手套', 'zh-CN') < 1);
});

test('transcription accepts browser MP4/WebM formats, resolves language and rejects invalid or oversized recordings', () => {
  const audio = Buffer.alloc(256);
  assert.equal(transcriptionInput(audio, 'audio/mp4;codecs=mp4a.40.2', 'en-US').extension, 'mp4');
  assert.equal(transcriptionInput(audio, 'audio/webm;codecs=opus', 'nb-NO').language, 'no');
  for (const args of [[audio, 'text/plain', 'en'], [audio, 'audio/mp4', 'constructor'],
    [Buffer.alloc(0), 'audio/mp4', 'en'], [Buffer.alloc(5 * 1024 * 1024), 'audio/mp4', 'en']]) {
    assert.throws(() => transcriptionInput(...args), /invalid_recording/);
  }
});

test('Whisper receives the actual recording and lesson language, never the reference answer', async () => {
  const input = transcriptionInput(Buffer.alloc(256, 2), 'audio/mp4', 'ru-RU');
  const text = await transcribeSpeech(input, { apiKey: 'test-only', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/audio/transcriptions');
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    assert.equal(options.body.get('model'), 'whisper-large-v3');
    assert.equal(options.body.get('language'), 'ru');
    assert.equal(options.body.get('temperature'), '0');
    assert.equal(options.body.has('prompt'), false);
    assert.deepEqual(Buffer.from(await options.body.get('file').arrayBuffer()), input.audio);
    assert.ok(options.signal);
    return Response.json({ text: ' Наденьте перчатки. ', segments: [{ text: ' Наденьте перчатки. ', no_speech_prob: 0.02, avg_logprob: -0.2 }] });
  } });
  assert.equal(text, 'Наденьте перчатки.');
});

test('provider errors and silence cannot be accepted as a spoken answer', async () => {
  const input = transcriptionInput(Buffer.alloc(256), 'audio/webm', 'en');
  for (const [response, code] of [[new Response('{}', { status: 429 }), 'transcription_rate_limited'],
    [new Response('{}', { status: 503 }), 'transcription_unavailable'],
    [Response.json({ text: 'Invented.', segments: [{ text: 'Invented.', no_speech_prob: 0.95, avg_logprob: -2 }] }), 'no_speech'],
    [Response.json({ text: ' ' }), 'no_speech']]) {
    await assert.rejects(transcribeSpeech(input, { apiKey: 'test-only', fetchImpl: async () => response }), new RegExp(code));
  }
});

function microphone() {
  const track = { stops: 0, stop() { this.stops++; } };
  return { track, getTracks: () => [track] };
}
class Recorder {
  static latest;
  static isTypeSupported = type => type === 'audio/mp4';
  constructor(stream, options) { this.stream = stream; this.mimeType = options.mimeType; this.state = 'inactive'; Recorder.latest = this; }
  start() { this.state = 'recording'; }
  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array(256)], { type: this.mimeType }) });
    queueMicrotask(() => this.onstop?.());
  }
}

test('a complete utterance is recorded with noise reduction, then uploaded after stopping the microphone', async () => {
  const stream = microphone();
  const done = deferred(), callbacks = [];
  const listen = createVoiceRecorder({ Recorder, getToken: async () => 'test-token',
    getMicrophone: async constraints => {
      assert.equal(constraints.audio.echoCancellation, true);
      assert.equal(constraints.audio.noiseSuppression, true);
      assert.equal(constraints.audio.channelCount, 1);
      return stream;
    }, fetchImpl: async (url, options) => {
      assert.equal(url, '/api/transcription?locale=en-US');
      assert.equal(options.headers['Content-Type'], 'audio/mp4');
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.equal(options.body.size, 256);
      assert.ok(stream.track.stops > 0, 'the microphone is closed before network work');
      return Response.json({ text: 'Put the gloves on.' });
    } });
  const session = listen('en-US', { onstart: () => callbacks.push('start'), onprocessing: () => callbacks.push('processing'),
    onresult: text => callbacks.push(text), onerror: error => callbacks.push(error), onend: () => { callbacks.push('end'); done.resolve(); } });
  await pause(370);
  session.stop();
  await done.promise;
  assert.deepEqual(callbacks, ['start', 'processing', ['Put the gloves on.'], 'end']);
});

test('cancelling a pending permission grant closes late tracks and never uploads', async () => {
  const permission = deferred(), stream = microphone(), events = [];
  const listen = createVoiceRecorder({ Recorder, getMicrophone: () => permission.promise,
    getToken: async () => { throw new Error('Must not authenticate'); }, fetchImpl: async () => { throw new Error('Must not upload'); } });
  const session = listen('en', { onstart: () => events.push('start'), onerror: error => events.push(error), onend: () => events.push('end') });
  session.abort();
  permission.resolve(stream);
  await pause(0);
  assert.deepEqual(events, ['end']);
  assert.equal(stream.track.stops, 1);
});

test('permission errors remain visible, settle once, and a subsequent recording can start', async () => {
  const errors = [], stream = microphone();
  let attempt = 0, starts = 0, ends = 0;
  const listen = createVoiceRecorder({ Recorder, getMicrophone: async () => {
    if (++attempt === 1) throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' });
    return stream;
  } });
  listen('en', { onerror: error => errors.push(error), onend: () => ends++ });
  await pause(0);
  const second = listen('en', { onstart: () => starts++, onend: () => ends++ });
  await pause(0);
  second.abort();
  assert.deepEqual(errors, ['not-allowed']);
  assert.equal(starts, 1);
  assert.equal(ends, 2);
  assert.ok(stream.track.stops > 0);
});

test('leaving an exercise aborts pending transcription and ignores its late result', async () => {
  const stream = microphone(), request = deferred(), entered = deferred(), events = [];
  let signal;
  const listen = createVoiceRecorder({ Recorder, getMicrophone: async () => stream, getToken: async () => 'token',
    fetchImpl: (_url, options) => { signal = options.signal; entered.resolve(); return request.promise; } });
  const session = listen('en', { onresult: value => events.push(value), onerror: value => events.push(value), onend: () => events.push('end') });
  await pause(370); session.stop(); await entered.promise; session.abort();
  request.resolve(Response.json({ text: 'Old result' }));
  await pause(0);
  assert.equal(signal.aborted, true);
  assert.deepEqual(events, ['end']);
});

test('stalled permission or transcription does not leave a hidden microphone or permanent loading state', async () => {
  const permission = deferred(), stream = microphone(), errors = [], done = deferred();
  const listen = createVoiceRecorder({ Recorder, permissionTimeoutMs: 15, getMicrophone: () => permission.promise });
  listen('en', { onerror: error => errors.push(error), onend: () => done.resolve() });
  await done.promise;
  permission.resolve(stream); await pause(0);
  assert.deepEqual(errors, ['permission-timeout']);
  assert.equal(stream.track.stops, 1);
  const completed = deferred();
  const hanging = createVoiceRecorder({ Recorder, getMicrophone: async () => microphone(), getToken: () => new Promise(() => {}), transcriptionTimeoutMs: 15 });
  const session = hanging('en', { onerror: error => errors.push(error), onend: () => completed.resolve() });
  await pause(370); session.stop(); await completed.promise;
  assert.deepEqual(errors, ['permission-timeout', 'transcription_unavailable']);
});

test('a recording survives one expired session and retries the same audio after refreshing', async () => {
  const stream = microphone(), done = deferred(), refreshes = [], tokens = [], uploads = [];
  const listen = createVoiceRecorder({ Recorder, getMicrophone: async () => stream,
    getToken: async refresh => { refreshes.push(!!refresh); return refresh ? 'fresh' : 'expired'; },
    fetchImpl: async (_url, options) => {
      tokens.push(options.headers.Authorization); uploads.push(options.body);
      return tokens.length === 1 ? Response.json({error:'unauthorized'},{status:401}) : Response.json({text:'Put the gloves on.'});
    } });
  let result;
  const session = listen('en', {onresult: value=>{result=value;},onend:()=>done.resolve()});
  await pause(370); session.stop(); await done.promise;
  assert.deepEqual(refreshes,[false,true]);
  assert.deepEqual(tokens,['Bearer expired','Bearer fresh']);
  assert.equal(uploads[0],uploads[1]);
  assert.deepEqual(result,['Put the gloves on.']);
});
