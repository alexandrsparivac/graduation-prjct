import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('the lesson API rejects old vocabulary, reviews answers, and shares only identical requests from the same user', { timeout: 15000 }, async t => {
  const temp = await mkdtemp(join(tmpdir(), 'ld-lesson-api-'));
  const spy = join(temp, 'calls.json');
  const preload = join(temp, 'mock-provider.mjs');
  const choices = extra => ({ question: 'Question?', options: ['a', 'b', 'c', 'd'], answer: 0, ...extra });
  const vocabulary = ['ladder', 'secateurs', 'trellis', 'tendril', 'rootstock', 'twine', 'gloves', 'clip',
    'hook', 'basket', 'spade', 'mulch', 'shade', 'sunlight', 'drainage'];
  const phrases = ['Bring the ladder here.', 'These gloves are wet.', 'Cut this twine carefully.',
    'The basket is full.', 'We need a longer hook.', 'There is shade near the gate.',
    'Keep the secateurs clean.', 'Is the drainage open?'];
  const parts = {
    core: { title: 'Checking vine supports', intro: 'Check equipment.', objectives: ['Identify tools', 'Ask for equipment', 'Check a support'],
      scenario: 'Two vineyard workers check the trellis and arrange tools.',
      vocabulary: vocabulary.map(term => ({ term, translation: term, partOfSpeech: 'noun', example: `Use the ${term}.`, exampleTranslation: `Use the ${term}.` })),
      phrases: phrases.map(phrase => ({ phrase, translation: phrase, usage: 'During the equipment check.' })) },
    story: { dialogue: { context: 'Equipment check.', lines: Array.from({ length: 12 }, () => ({ speaker: 'Ana', text: 'Check the trellis.', translation: 'Check it.' })) },
      reading: { title: 'A work note', passage: Array(130).fill('vineyard').join(' '), translation: 'A translated note.', questions: Array.from({ length: 3 }, () => choices()) } },
    practice: { grammar: { title: 'Imperatives', explanation: 'Give an instruction.', examples: Array(4).fill('Check the trellis.'),
      practice: Array.from({ length: 4 }, () => ({ sentence: '___ the trellis.', answer: 'Check', hint: 'Give an instruction.' })) },
      listening: Array.from({ length: 5 }, () => choices({ text: 'Check the trellis.' })),
      speaking: Array.from({ length: 6 }, () => ({ text: 'Check the trellis.', translation: 'Check it.', tip: 'Speak clearly.' })) },
    quiz: { quiz: Array.from({ length: 8 }, () => choices({ explanation: 'The correct answer.' })), tips: Array(4).fill('Check the tool before use.') },
  };
  await writeFile(preload, `
    import fs from 'node:fs';
    const parts = ${JSON.stringify(parts)};
    const calls = [];
    let coreCalls = 0;
    let permanentCalls = 0;
    let transientCalls = 0;
    let deadlineCalls = 0;
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).endsWith('/auth/v1/user') && options.headers.Authorization?.includes('cancel-user')) {
        return Response.json({id: 'cancel-learner'});
      }
      if (String(url).endsWith('/auth/v1/user') && options.headers.Authorization?.includes('busy-user')) {
        return Response.json({id: 'busy-learner'});
      }
      if (String(url).endsWith('/auth/v1/user') && options.headers.Authorization?.includes('third-user')) {
        return Response.json({id: 'third-learner'});
      }
      if (String(url).endsWith('/auth/v1/user') && options.headers.Authorization?.includes('permanent-user')) {
        return Response.json({id: 'permanent-learner'});
      }
      if (String(url).endsWith('/auth/v1/user') && options.headers.Authorization?.includes('transient-user')) {
        return Response.json({id: 'transient-learner'});
      }
      if (String(url).endsWith('/auth/v1/user') && options.headers.Authorization?.includes('deadline-user')) {
        return Response.json({id: 'deadline-learner'});
      }
      if (String(url).endsWith('/auth/v1/user') && options.headers.Authorization?.includes('rate-user')) {
        return Response.json({id: 'rate-learner'});
      }
      if (String(url).endsWith('/auth/v1/user')) {
        const id = options.headers.Authorization === 'Bearer other-user' ? 'other' : 'learner';
        return Response.json({id});
      }
      if (String(url).includes('/rest/v1/lessons')) {
        const row = { id: '12345678-1234-1234-1234-123456789012', ...JSON.parse(options.body) };
        return Response.json([row], { status: 201 });
      }
      if (String(url).includes('/rest/v1/lesson_localizations')) {
        return Response.json([{ lesson_id: '12345678-1234-1234-1234-123456789012' }], { status: 201 });
      }
      if (String(url).includes('/rest/v1/rpc/submit_lesson_attempt')) {
        fs.writeFileSync(${JSON.stringify(spy + '.rpc')}, JSON.stringify({
          payload: JSON.parse(options.body), authorization: options.headers.Authorization,
        }));
        return Response.json({ score: 6, total: 8, earned_level: 'A1', duplicate: false });
      }
      if (String(url) !== 'https://api.groq.com/openai/v1/chat/completions') throw new Error('Unexpected external request in test');
      const requestText = String(options.body);
      const heldJob = requestText.includes('Cancellation test') ? 'cancel'
        : requestText.includes('Concurrency hold') ? 'hold' : null;
      if (heldJob) {
        fs.writeFileSync(${JSON.stringify(spy)} + '.' + heldJob + '.started', 'started');
        return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
          fs.writeFileSync(${JSON.stringify(spy)} + '.' + heldJob + '.cancel', 'aborted');
          reject(options.signal.reason || new Error('aborted'));
        }, { once: true }));
      }
      if (requestText.includes('Permanent provider error test')) {
        permanentCalls++;
        fs.writeFileSync(${JSON.stringify(spy)} + '.permanent', String(permanentCalls));
        return Response.json({error: 'invalid api key'}, { status: 401 });
      }
      if (requestText.includes('Transient provider error test') && transientCalls < 2) {
        transientCalls++;
        fs.writeFileSync(${JSON.stringify(spy)} + '.transient', String(transientCalls));
        return Response.json({error: 'provider unavailable'}, { status: 503 });
      }
      if (requestText.includes('Deadline provider error test')) {
        deadlineCalls++;
        fs.writeFileSync(${JSON.stringify(spy)} + '.deadline', String(deadlineCalls));
        return Response.json({error: 'provider unavailable'}, { status: 503 });
      }
      const request = JSON.parse(options.body);
      const section = request.messages[0].content.includes('strict reviewer') ? 'review'
        : request.messages[1].content.match(/"(core|story|practice|quiz)" section/)[1];
      calls.push({section, temperature:request.temperature});
      fs.writeFileSync(${JSON.stringify(spy)}, JSON.stringify(calls));
      const data = section === 'review' ? {valid:true, issues:[]} : structuredClone(parts[section]);
      if (section === 'core' && ++coreCalls === 1) data.vocabulary[0].term = 'grapes';
      await new Promise(resolve => setTimeout(resolve, 30));
      return Response.json({choices:[{message:{content:JSON.stringify(data)}}]});
    };
  `);
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const root = fileURLToPath(new URL('..', import.meta.url));
  const child = spawn(process.execPath, ['--import', preload, join(root, 'server.js')], {
    cwd: root, env: { ...process.env, PORT: String(port), GROQ_API_KEY: 'test-only', GROQ_MODEL: 'test-model',
      SUPABASE_URL: 'https://auth.test.invalid', SUPABASE_ANON_KEY: 'test-only',
      SUPABASE_SERVICE_ROLE_KEY: 'service-test-only', LESSON_DEADLINE_MS: '1200',
      GROQ_RETRY_BASE_MS: '20', GROQ_RETRY_MAX_MS: '80',
      LESSON_REQUESTS_PER_MINUTE: '2', MAX_CONCURRENT_LESSONS: '2' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill(); await exit; }
    await rm(temp, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { if (String(chunk).includes('Server running')) resolve(); });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Test server exited: ${code}`)));
  });
  const live = await fetch(`http://127.0.0.1:${port}/api/health/live`);
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { status: 'ok' });
  const ready = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: 'ready' });
  const page = await fetch(`http://127.0.0.1:${port}/login`);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.equal(page.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(page.headers.get('permissions-policy'), 'camera=(), microphone=(self), geolocation=()');
  const request = { language: 'English', languageCode: 'en', domain: 'Agriculture', domainSlug: 'agriculture',
    topic: 'Viticulture', topicKey: 'Viticultură', level: 'A1', nativeLanguage: 'Romanian', nativeLanguageCode: 'ro',
    variationId: 'test-variant', avoid: { terms: ['grape'] } };
  const send = (body = request, token = 'learner') => fetch(`http://127.0.0.1:${port}/api/lesson`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  assert.equal((await send(request, null)).status, 401);
  assert.equal((await send({ ...request, level: 'A0' })).status, 400);
  const speech = (body, token = 'learner') => fetch(`http://127.0.0.1:${port}/api/speech`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  assert.equal((await speech({ text: 'Hi', locale: 'en' }, null)).status, 401);
  assert.equal((await speech({ text: 'Hi', locale: 'en', rate: 50 })).status, 400);
  assert.equal((await speech({ text: 'Hi', locale: 'unknown' })).status, 400);
  const attemptUrl = `http://127.0.0.1:${port}/api/lesson-attempt`;
  const attemptPayload = { lessonId: '12345678-1234-1234-1234-123456789012',
    attemptId: '22345678-1234-1234-1234-123456789012', answers: Array(8).fill(2) };
  const invalidAttempt = await fetch(attemptUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer learner' },
    body: JSON.stringify({ ...attemptPayload, answers: [2] }),
  });
  assert.equal(invalidAttempt.status, 400);
  const attemptResponse = await fetch(attemptUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer learner' },
    body: JSON.stringify(attemptPayload),
  });
  assert.deepEqual(await attemptResponse.json(), { score: 6, total: 8, earned_level: 'A1', duplicate: false });
  assert.deepEqual(JSON.parse(await readFile(spy + '.rpc', 'utf8')), {
    payload: { p_lesson_id: attemptPayload.lessonId, p_attempt_id: attemptPayload.attemptId,
      p_answers: attemptPayload.answers },
    authorization: 'Bearer learner',
  });
  const responses = await Promise.all([send(), send(), send(request, 'other-user')]);
  responses.forEach(response => assert.equal(response.status, 200));
  const lessons = await Promise.all(responses.map(response => response.json()));
  assert.deepEqual(lessons[0], lessons[1]);
  assert.ok(lessons[0].lesson.vocabulary.every(item => item.term !== 'grapes'));
  assert.equal(lessons[0].lesson.generation.variationId, request.variationId);
  assert.deepEqual(lessons[0].lesson.generation.history.terms, ['grape']);
  const cachePayload = {
    kind: 'lesson', languageCode: request.languageCode, domainSlug: request.domainSlug,
    topic: request.topicKey, level: request.level, nativeLanguageCode: request.nativeLanguageCode,
    content: lessons[0].lesson, model: lessons[0].model, cacheProof: lessons[0].cacheProof,
    issuedAt: lessons[0].cacheIssuedAt,
  };
  const forged = await fetch(`http://127.0.0.1:${port}/api/lesson-cache`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer learner' },
    body: JSON.stringify({ ...cachePayload, content: { ...cachePayload.content, title: 'forged' } }),
  });
  assert.equal(forged.status, 403, 'the server must reject edits to generated content');
  const cacheResponse = await fetch(`http://127.0.0.1:${port}/api/lesson-cache`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer learner' },
    body: JSON.stringify(cachePayload),
  });
  assert.equal(cacheResponse.status, 201);
  assert.equal((await cacheResponse.json()).created, true);
  const calls = JSON.parse(await readFile(spy, 'utf8'));
  const counts = Object.fromEntries(['core', 'story', 'practice', 'quiz', 'review'].map(section =>
    [section, calls.filter(call => call.section === section).length]));
  assert.deepEqual(counts, { core: 3, story: 2, practice: 2, quiz: 2, review: 2 });
  assert.ok(calls.filter(call => call.section === 'review').every(call => call.temperature === 0.1));

  const permanent = await send({ ...request, topic: 'Permanent provider error test',
    topicKey: 'Permanent provider error test', variationId: 'permanent-error' }, 'permanent-user');
  assert.equal(permanent.status, 503);
  assert.match((await permanent.json()).reason, /permanently \(HTTP 401\)/);
  assert.equal(await readFile(spy + '.permanent', 'utf8'), '1',
    'permanent provider errors must not be retried');

  const transient = await send({ ...request, topic: 'Transient provider error test',
    topicKey: 'Transient provider error test', variationId: 'transient-error' }, 'transient-user');
  assert.equal(transient.status, 200, 'transient provider failures should retry successfully');
  assert.equal(await readFile(spy + '.transient', 'utf8'), '2');

  const deadlineStarted = Date.now();
  const deadline = await send({ ...request, topic: 'Deadline provider error test',
    topicKey: 'Deadline provider error test', variationId: 'deadline-error' }, 'deadline-user');
  const deadlineElapsed = Date.now() - deadlineStarted;
  assert.equal(deadline.status, 503);
  assert.ok(Number(await readFile(spy + '.deadline', 'utf8')) > 1);
  assert.ok(deadlineElapsed < 3_000, `provider retries exceeded the request deadline (${deadlineElapsed}ms)`);

  for (const variationId of ['rate-limit-one', 'rate-limit-two']) {
    assert.equal((await send({ ...request, variationId }, 'rate-user')).status, 200);
  }
  const limited = await send({ ...request, variationId: 'rate-limit-three' }, 'rate-user');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');

  const heldRequest = (token, body, signal) => fetch(`http://127.0.0.1:${port}/api/lesson`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const waitForMarker = async (file, expected) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        assert.equal(await readFile(file, 'utf8'), expected);
        return;
      } catch {
        if (attempt === 49) throw new Error(`Timed out waiting for ${file}`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  };

  const cancelController = new AbortController();
  const cancelRequest = heldRequest('cancel-user', {
    ...request, topic: 'Cancellation test', topicKey: 'Cancellation test', variationId: 'cancel-test',
  }, cancelController.signal);
  await waitForMarker(spy + '.cancel.started', 'started');
  const perUserBusy = await heldRequest('cancel-user', {
    ...request, variationId: 'different-concurrent-lesson',
  });
  assert.equal(perUserBusy.status, 429, 'a user cannot start a second distinct generation at once');
  assert.equal(perUserBusy.headers.get('retry-after'), '10');

  const holdController = new AbortController();
  const holdRequest = heldRequest('busy-user', {
    ...request, topic: 'Concurrency hold', topicKey: 'Concurrency hold', variationId: 'hold-test',
  }, holdController.signal);
  await waitForMarker(spy + '.hold.started', 'started');
  const globalBusy = await heldRequest('third-user', { ...request, variationId: 'global-limit-test' });
  assert.equal(globalBusy.status, 429, 'the process-wide generation limit must reject excess work');
  assert.equal(globalBusy.headers.get('retry-after'), '10');

  cancelController.abort();
  holdController.abort();
  await assert.rejects(cancelRequest, error => error.name === 'AbortError');
  await assert.rejects(holdRequest, error => error.name === 'AbortError');
  await Promise.all([
    waitForMarker(spy + '.cancel.cancel', 'aborted'),
    waitForMarker(spy + '.hold.cancel', 'aborted'),
  ]);
});
