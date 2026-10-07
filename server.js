import 'dotenv/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSectionPrompt, parseSectionResult, validateLesson, mergeSections, SECTION_TOKENS, SECTION_MIN_TOKENS, sectionRetryPrompt, buildLessonReviewPrompt, parseLessonReview } from './lib/lesson-prompt.js';
import { prepareLessonContext, lessonRequestKey, validateCoreNovelty, generateLessonParts, refineLessonParts, LEVEL_DESIGNS } from './lib/lesson-design.js';
import { speechInput, createSpeechService } from './lib/tts.js';
import { transcriptionInput, transcribeSpeech, MAX_RECORDING_BYTES } from './lib/transcription.js';
import { isApplicationReady } from './lib/readiness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
  });
  next();
});

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Comma-separated fallback chain. The big model gives the best lessons; when
// its free-tier daily quota runs out, sections transparently continue on the
// next model instead of failing the whole lesson.
const GROQ_MODELS = (process.env.GROQ_MODEL || 'openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b')
  .split(',').map(s => s.trim()).filter(Boolean);

// Shown in the UI when every model reports an exhausted daily quota.
const QUOTA_MSG = 'Limita zilnică gratuită a AI-ului a fost atinsă. Încearcă din nou mai târziu — lecțiile deja salvate și progresul tău rămân disponibile.';

// Sections are ~4x shorter than the old single-prompt lesson, so each call
// gets a small budget that stays well under the free-tier TPM ceiling and
// finishes faster (LLM latency grows with output length).
const sectionBudget = section => Number(process.env[`GROQ_TOKENS_${section.toUpperCase()}`] || SECTION_TOKENS[section]);

// Allow room for the vocabulary plan, parallel exercises and correctness
// review, including free-tier rate limits. A repair regenerates its section.
const LESSON_DEADLINE_MS = Number(process.env.LESSON_DEADLINE_MS || 240_000);
const positiveLimit = (value, fallback) => Number.isSafeInteger(Number(value)) && Number(value) > 0
  ? Number(value) : fallback;
const LESSON_REQUESTS_PER_MINUTE = positiveLimit(process.env.LESSON_REQUESTS_PER_MINUTE, 10);
const MAX_CONCURRENT_LESSONS = positiveLimit(process.env.MAX_CONCURRENT_LESSONS, 3);
const MAX_CONCURRENT_LESSONS_PER_USER = positiveLimit(process.env.MAX_CONCURRENT_LESSONS_PER_USER, 1);
const GROQ_RETRY_BASE_MS = positiveLimit(process.env.GROQ_RETRY_BASE_MS, 500);
const GROQ_RETRY_MAX_MS = positiveLimit(process.env.GROQ_RETRY_MAX_MS, 8_000);

// Coalesce identical concurrent requests (double-click on regen, two tabs).
// The second caller awaits the first instead of doubling the Groq burst.
const inflight = new Map();
const lessonRequests = new Map();
const activeLessonsByUser = new Map();
let activeLessonCount = 0;

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason || Object.assign(new Error('Aborted'), { name: 'AbortError' }));
  const timer = setTimeout(done, ms);
  function done() {
    signal?.removeEventListener('abort', abort);
    resolve();
  }
  function abort() {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    reject(signal.reason || Object.assign(new Error('Aborted'), { name: 'AbortError' }));
  }
  signal?.addEventListener('abort', abort, { once: true });
});
const retryBackoffMs = attempt => Math.min(GROQ_RETRY_MAX_MS,
  GROQ_RETRY_BASE_MS * (2 ** Math.min(Math.max(0, attempt - 1), 10)));
const remainingWait = (ms, deadline) => Math.min(ms, Math.max(0, deadline - Date.now()));

function allowLessonRequest(userId) {
  const minute = Math.floor(Date.now() / 60_000);
  const bucket = lessonRequests.get(userId);
  const count = bucket?.minute === minute ? bucket.count + 1 : 1;
  lessonRequests.set(userId, { minute, count });
  for (const [id, saved] of lessonRequests) if (saved.minute !== minute) lessonRequests.delete(id);
  if (lessonRequests.size > 10_000) lessonRequests.delete(lessonRequests.keys().next().value);
  return count <= LESSON_REQUESTS_PER_MINUTE;
}

function waitForLessonJob(entry, req, res) {
  entry.subscribers++;
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      res.off('close', disconnected);
      req.off('aborted', disconnected);
      entry.subscribers--;
      if (entry.subscribers === 0 && !entry.done) entry.controller.abort();
      resolve(result);
    };
    const disconnected = () => {
      if (!res.writableEnded) finish({ disconnected: true });
    };
    res.on('close', disconnected);
    req.on('aborted', disconnected);
    if (req.aborted || res.destroyed) disconnected();
    entry.promise.then(
      value => finish({ value }),
      error => finish({ error }),
    );
  });
}

/** How long Groq wants us to wait, from the header or the message it returns. */
function retryDelayMs(status, headers, body) {
  const header = Number(headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return header * 1000 + 250;
  const match = /try again in ([\d.]+)\s*s/i.exec(body || '');
  if (match) return Math.ceil(Number(match[1]) * 1000) + 500;
  return status === 429 ? 15_000 : 2_000;
}

app.use(express.json({ limit: '1mb' }));

app.get('/api/health/live', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health/ready', (_req, res) => {
  const ready = isApplicationReady();
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
});

// The Supabase anon key is public by design (RLS protects the data), so it can be served to the client.
app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  });
});

async function verifySupabaseUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    signal: AbortSignal.timeout(10_000),
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  return r.json();
}

const cacheProofMaxAgeMs = 5 * 60_000;
const supportedLanguageCodes = new Set('en de fr es it pt nl sv no da fi pl cs hu el tr ru uk ar he hi zh ja ko ro'.split(' '));
const stableJson = value => Array.isArray(value) ? `[${value.map(stableJson).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
    : JSON.stringify(value);
function cacheProofValue(userId, input) {
  return stableJson([userId, input.languageCode, input.domainSlug, input.topic, input.level,
    input.nativeLanguageCode, input.model, input.issuedAt, input.content]);
}
function signLessonCache(userId, input) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createHmac('sha256', key).update(cacheProofValue(userId, input)).digest('hex');
}
function verifyLessonCacheProof(userId, input) {
  if (!/^[a-f0-9]{64}$/i.test(input.cacheProof || '')
    || !Number.isSafeInteger(input.issuedAt)
    || Math.abs(Date.now() - input.issuedAt) > cacheProofMaxAgeMs) return false;
  const expected = signLessonCache(userId, input);
  if (!expected) return false;
  return timingSafeEqual(Buffer.from(input.cacheProof, 'hex'), Buffer.from(expected, 'hex'));
}

async function supabaseServiceRequest(resource, { method = 'GET', body, prefer } = {}) {
  const baseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) throw new Error('lesson_cache_unavailable');
  const response = await fetch(`${baseUrl}/rest/v1/${resource}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`Supabase cache write failed [${response.status}]:`, text.slice(0, 300));
    throw new Error('lesson_cache_unavailable');
  }
  return text ? JSON.parse(text) : [];
}

const speechAudio = createSpeechService();
const speechRequests = new Map();
const transcriptionRequests = new Map();
let transcribing = 0;
app.post('/api/transcription', express.raw({ type: 'audio/*', limit: MAX_RECORDING_BYTES }), async (req, res) => {
  const controller = new AbortController();
  const disconnected = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', disconnected);
  let acquired = false;
  try {
    const user = await verifySupabaseUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    let input;
    try { input = transcriptionInput(req.body, req.headers['content-type'], req.query.locale); }
    catch { return res.status(400).json({ error: 'invalid_recording' }); }
    const minute = Math.floor(Date.now() / 60_000);
    const bucket = transcriptionRequests.get(user.id);
    const count = bucket?.minute === minute ? bucket.count + 1 : 1;
    if (count > 20 || transcribing >= 4) return res.status(429).set('Retry-After', '60').json({ error: 'transcription_rate_limited' });
    transcriptionRequests.set(user.id, { minute, count });
    for (const [id, saved] of transcriptionRequests) if (saved.minute !== minute) transcriptionRequests.delete(id);
    if (transcriptionRequests.size > 1000) transcriptionRequests.delete(transcriptionRequests.keys().next().value);
    transcribing++;
    acquired = true;
    const text = await transcribeSpeech(input, { apiKey: process.env.GROQ_API_KEY, signal: controller.signal });
    res.set('Cache-Control', 'no-store').json({ text });
  } catch (error) {
    if (!controller.signal.aborted) {
      const code = ['no_speech', 'transcription_rate_limited'].includes(error.message) ? error.message : 'transcription_unavailable';
      res.status(code === 'no_speech' ? 422 : code === 'transcription_rate_limited' ? 429 : 503).json({ error: code });
    }
  } finally {
    if (acquired) transcribing--;
    res.off('close', disconnected);
  }
});
app.post('/api/speech', async (req, res) => {
  try {
    const user = await verifySupabaseUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    let input;
    try { input = speechInput(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const minute = Math.floor(Date.now() / 60_000);
    const bucket = speechRequests.get(user.id);
    const count = bucket?.minute === minute ? bucket.count + 1 : 1;
    if (count > 60) return res.status(429).set('Retry-After', '60').json({ error: 'speech_rate_limited' });
    speechRequests.set(user.id, { minute, count });
    if (speechRequests.size > 1000) {
      for (const [id, saved] of speechRequests) if (saved.minute !== minute) speechRequests.delete(id);
      if (speechRequests.size > 1000) speechRequests.delete(speechRequests.keys().next().value);
    }
    const audio = await speechAudio(input);
    res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=3600' }).send(audio);
  } catch (error) {
    console.error('Speech synthesis failed:', error.message);
    res.status(503).json({ error: 'speech_unavailable' });
  }
});

app.post('/api/lesson-cache', async (req, res) => {
  try {
    const user = await verifySupabaseUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({ error: 'lesson_cache_unavailable' });
    }
    const input = req.body;
    if (!input || !verifyLessonCacheProof(user.id, input)) {
      return res.status(403).json({ error: 'invalid_cache_proof' });
    }
    const { languageCode, domainSlug, topic, level, nativeLanguageCode, content, model } = input;
    if (!supportedLanguageCodes.has(languageCode) || !supportedLanguageCodes.has(nativeLanguageCode)
      || !/^[a-z][a-z0-9_-]{1,49}$/i.test(domainSlug || '')
      || typeof topic !== 'string' || !topic.trim() || topic.length > 200
      || !Object.hasOwn(LEVEL_DESIGNS, level)
      || typeof model !== 'string' || !model.trim() || model.length > 200) {
      return res.status(400).json({ error: 'invalid_lesson_metadata' });
    }
    const lessonCheck = validateLesson(content, languageCode);
    if (!lessonCheck.valid) return res.status(400).json({ error: 'invalid_lesson', reason: lessonCheck.reason });

    if (input.kind === 'lesson') {
      const rows = await supabaseServiceRequest(
        `lessons?on_conflict=${encodeURIComponent('language_code,domain_slug,topic,level')}`,
        {
          method: 'POST',
          body: {
            language_code: languageCode, domain_slug: domainSlug, topic, level,
            native_language: nativeLanguageCode, content, model, created_by: user.id,
          },
          prefer: 'resolution=ignore-duplicates,return=representation',
        },
      );
      const saved = rows[0] || (await supabaseServiceRequest(
        `lessons?select=id,language_code,domain_slug,topic,level,native_language,content,model&language_code=eq.${encodeURIComponent(languageCode)}&domain_slug=eq.${encodeURIComponent(domainSlug)}&topic=eq.${encodeURIComponent(topic)}&level=eq.${encodeURIComponent(level)}`,
      ))[0];
      if (!saved) throw new Error('lesson_cache_unavailable');
      return res.status(rows.length ? 201 : 200).json({ row: saved, created: rows.length > 0 });
    }

    if (!['localization', 'personal'].includes(input.kind)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.lessonId || '')) {
      return res.status(400).json({ error: 'invalid_cache_target' });
    }
    const lesson = (await supabaseServiceRequest(
      `lessons?select=id,language_code,domain_slug,topic,level,native_language&id=eq.${encodeURIComponent(input.lessonId)}`,
    ))[0];
    if (!lesson || lesson.language_code !== languageCode || lesson.domain_slug !== domainSlug
      || lesson.topic !== topic || lesson.level !== level
      || (input.kind === 'localization' && lesson.native_language === nativeLanguageCode)) {
      return res.status(404).json({ error: 'lesson_not_found' });
    }
    if (input.kind === 'personal') {
      await supabaseServiceRequest(
        `user_progress?on_conflict=${encodeURIComponent('user_id,lesson_id')}`,
        {
          method: 'POST',
          body: {
            user_id: user.id, lesson_id: lesson.id,
            lesson_variant: { native_language: nativeLanguageCode, content, model },
          },
          prefer: 'resolution=merge-duplicates,return=minimal',
        },
      );
      return res.status(201).json({ saved: true });
    }
    const rows = await supabaseServiceRequest(
      `lesson_localizations?on_conflict=${encodeURIComponent('lesson_id,native_language')}`,
      {
        method: 'POST',
        body: {
          lesson_id: lesson.id, native_language: nativeLanguageCode, content, model, created_by: user.id,
        },
        prefer: 'resolution=ignore-duplicates,return=representation',
      },
    );
    return res.status(rows.length ? 201 : 200).json({ created: rows.length > 0 });
  } catch (error) {
    console.error('Lesson cache write failed:', error.message);
    return res.status(503).json({ error: 'lesson_cache_unavailable' });
  }
});

app.post('/api/lesson-attempt', async (req, res) => {
  try {
    const user = await verifySupabaseUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const { lessonId, attemptId, answers } = req.body || {};
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(lessonId || '') || !uuid.test(attemptId || '')
      || !Array.isArray(answers) || answers.length !== 8
      || answers.some(answer => answer !== null && (!Number.isInteger(answer) || answer < 0 || answer > 3))) {
      return res.status(400).json({ error: 'invalid_attempt' });
    }
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/submit_lesson_attempt`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: req.headers.authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_lesson_id: lessonId, p_attempt_id: attemptId, p_answers: answers }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      console.error(`Lesson attempt submission failed [${response.status}]:`, JSON.stringify(result).slice(0, 300));
      return res.status(response.status === 400 || response.status === 404 ? response.status : 503)
        .json({ error: 'attempt_unavailable' });
    }
    return res.json(result);
  } catch (error) {
    console.error('Lesson attempt submission failed:', error.message);
    return res.status(503).json({ error: 'attempt_unavailable' });
  }
});

async function requestGroq(messages, maxTokens, model, temperature = 0.65, signal = null, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Groq request timed out')), Math.max(1, timeoutMs));
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      // Sections are short; a healthy one answers well under this.
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        // Reasoning tokens come out of the same budget as the answer. At
        // "medium" the model spent 4k of them and the JSON was cut off
        // mid-lesson; "low" leaves the whole budget for the lesson itself.
        reasoning_effort: 'low',
        response_format: { type: 'json_object' }
      })
    });
    if (!groqRes.ok) {
      const text = await groqRes.text();
      console.error(`Groq error [${model}]:`, groqRes.status, text.slice(0, 300));
      // 413 means the budget itself is too small for what we asked for; 429
      // means we asked too soon. They need different responses.
      if (groqRes.status === 413) return { tooLarge: true };
      if (groqRes.status === 429) {
        // Daily quota (TPD/RPD) never clears within our deadline — fail over
        // to the next model instead of waiting. Per-minute limits do clear,
        // so those are waited out on the same model.
        const quota = /per day|TPD|RPD|daily|quota/i.test(text);
        return { waitMs: retryDelayMs(429, groqRes.headers, text), quota };
      }
      return {
        error: true, status: groqRes.status,
        retryable: groqRes.status === 408 || groqRes.status === 425 || groqRes.status >= 500,
      };
    }
    const data = await groqRes.json();
    return { raw: data.choices?.[0]?.message?.content || '' };
  } catch (err) {
    if (signal?.aborted) throw signal.reason || err;
    console.error('Groq request failed:', err.name, err.message);
    return { error: true, retryable: true };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

/** Generate one section, retrying only that section until it validates. */
async function generateSection(section, ctx, deadline, feedback = null, signal = null) {
  const base = buildSectionPrompt(section, ctx);
  let maxTokens = sectionBudget(section);
  let modelIdx = 0;
  let lastReason = feedback;
  let attempt = 0;

  while (Date.now() < deadline && !signal?.aborted) {
    attempt++;
    const model = GROQ_MODELS[modelIdx];
    const messages = lastReason
      ? [...base, { role: 'user', content: sectionRetryPrompt(section, lastReason) }]
      : base;

    const result = await requestGroq(messages, maxTokens, model, 0.65, signal,
      Math.min(45_000, Math.max(1, deadline - Date.now())));

    if (result.tooLarge) {
      if (maxTokens <= SECTION_MIN_TOKENS) {
        return { section, data: null, reason: `"${section}": account token limit too low` };
      }
      maxTokens = Math.max(SECTION_MIN_TOKENS, Math.floor(maxTokens * 0.8));
      console.warn(`[${section}] budget too large, retrying with max_tokens=${maxTokens}.`);
      continue;
    }

    if (result.waitMs) {
      if (result.quota) {
        // This model's daily budget is spent. Move the section to the next
        // model right away; only give up when no model has budget left.
        if (modelIdx < GROQ_MODELS.length - 1) {
          console.warn(`[${section}] daily quota out on ${model}, falling back to ${GROQ_MODELS[modelIdx + 1]}.`);
          modelIdx++;
          continue;
        }
        return { section, data: null, reason: QUOTA_MSG, quota: true };
      }
      const wait = Math.min(result.waitMs, 20_000, Math.max(0, deadline - Date.now()));
      if (wait <= 0) break;
      console.warn(`[${section}] rate limited, waiting ${Math.round(wait / 1000)}s.`);
      await sleep(wait, signal);
      continue;
    }

    if (result.error) {
      if (!result.retryable) {
        return { section, data: null, reason: `Provider request failed permanently (HTTP ${result.status})` };
      }
      const wait = remainingWait(retryBackoffMs(attempt), deadline);
      if (wait <= 0) break;
      await sleep(wait, signal);
      continue;
    }

    const { data, reason } = parseSectionResult(section, result.raw, ctx.languageCode);
    const novelty = data && section === 'core' ? validateCoreNovelty(data, ctx) : { valid: true };
    if (data && novelty.valid) {
      if (attempt > 1) console.log(`[${section}] valid after ${attempt} attempts.`);
      return { section, data, reason: null, model };
    }
    lastReason = novelty.valid ? reason : novelty.reason;
    console.warn(`[${section}] attempt ${attempt} rejected: ${lastReason}`);
  }

  return { section, data: null, reason: lastReason || `"${section}": deadline exceeded` };
}

async function reviewLesson(parts, ctx, deadline, signal = null) {
  const messages = buildLessonReviewPrompt(ctx, parts);
  let modelIdx = 0;
  let attempt = 0;
  while (Date.now() < deadline && !signal?.aborted) {
    attempt++;
    const result = await requestGroq(messages, 1200, GROQ_MODELS[modelIdx], 0.1, signal,
      Math.min(45_000, Math.max(1, deadline - Date.now())));
    if (result.quota) {
      if (modelIdx < GROQ_MODELS.length - 1) { modelIdx++; continue; }
      throw Object.assign(new Error(QUOTA_MSG), { quota: true });
    }
    if (result.error) {
      if (!result.retryable) {
        throw new Error(`Lesson review provider failed permanently (HTTP ${result.status})`);
      }
      const wait = remainingWait(retryBackoffMs(attempt), deadline);
      if (wait <= 0) break;
      await sleep(wait, signal);
      continue;
    }
    if (result.raw) {
      const assessment = parseLessonReview(result.raw);
      if (assessment) return assessment;
    }
    const wait = remainingWait(Math.min(result.waitMs || 1500, 20_000), deadline);
    if (wait <= 0) break;
    await sleep(wait, signal);
  }
  throw new Error('Lesson correctness review timed out');
}

app.post('/api/lesson', async (req, res) => {
  try {
    const user = await verifySupabaseUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: 'AI is not configured (GROQ_API_KEY missing)' });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({ error: 'Lesson caching is not configured (SUPABASE_SERVICE_ROLE_KEY missing)' });
    }

    let ctx;
    try {
      ctx = prepareLessonContext(req.body);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const key = lessonRequestKey(user.id, ctx);
    if (!allowLessonRequest(user.id)) {
      return res.status(429).set('Retry-After', '60').json({ error: 'lesson_rate_limited' });
    }

    // Reuse an identical request that is already generating.
    const shared = inflight.get(key);
    if (shared) {
      const outcome = await waitForLessonJob(shared, req, res);
      if (outcome.disconnected || res.destroyed) return;
      if (outcome.error) {
        return res.status(503).json({ error: 'lesson_unavailable', reason: outcome.error?.message || null });
      }
      return res.json(outcome.value);
    }
    const userActive = activeLessonsByUser.get(user.id) || 0;
    if (activeLessonCount >= MAX_CONCURRENT_LESSONS || userActive >= MAX_CONCURRENT_LESSONS_PER_USER) {
      return res.status(429).set('Retry-After', '10').json({ error: 'lesson_generation_busy' });
    }

    const controller = new AbortController();
    const entry = { controller, subscribers: 0, done: false, promise: null };
    activeLessonCount++;
    activeLessonsByUser.set(user.id, userActive + 1);
    const deadline = Date.now() + LESSON_DEADLINE_MS;
    const t0 = Date.now();

    // Choose fresh target material and one concrete scenario first. The other
    // three sections reinforce that same plan in parallel, with local retries.
    const job = Promise.resolve().then(async () => {
      let results = await generateLessonParts(ctx, generateSection, deadline, controller.signal);
      const failed = results.filter(r => !r.data);
      if (failed.length) {
        const reason = failed.every(r => r.quota)
          ? QUOTA_MSG
          : failed.map(r => r.reason).join('; ');
        console.error(`Lesson ${key} failed sections: ${reason}`);
        const err = new Error(reason);
        err.quota = failed.every(r => r.quota);
        throw err;
      }
      results = await refineLessonParts(ctx, results, generateSection, reviewLesson, deadline, 2, controller.signal);
      const parts = Object.fromEntries(results.map(r => [r.section, r.data]));
      const lesson = mergeSections(parts);
      lesson.generation = { variationId: ctx.variationId, focus: ctx.focus, history: ctx.history };
      const check = validateLesson(lesson, ctx.languageCode);
      if (!check.valid) throw new Error(check.reason);
      const used = [...new Set(results.map(r => r.model))].join('+');
      console.log(`Lesson ${key} done in ${Math.round((Date.now() - t0) / 1000)}s [${used}].`);
      const cacheInput = {
        languageCode: ctx.languageCode, domainSlug: ctx.domainSlug, topic: ctx.topicKey || ctx.topic,
        level: ctx.level, nativeLanguageCode: req.body.nativeLanguageCode, model: used,
        issuedAt: Date.now(), content: lesson,
      };
      return { lesson, model: used, cacheProof: signLessonCache(user.id, cacheInput), cacheIssuedAt: cacheInput.issuedAt };
    });
    entry.promise = job.finally(() => {
      entry.done = true;
      if (inflight.get(key) === entry) inflight.delete(key);
      activeLessonCount--;
      const remaining = (activeLessonsByUser.get(user.id) || 1) - 1;
      if (remaining) activeLessonsByUser.set(user.id, remaining);
      else activeLessonsByUser.delete(user.id);
    });
    inflight.set(key, entry);
    const outcome = await waitForLessonJob(entry, req, res);
    if (outcome.disconnected || res.destroyed) return;
    if (outcome.error) {
      return res.status(503).json({
        error: 'lesson_unavailable', reason: outcome.error?.message || null, quota: !!outcome.error?.quota,
      });
    }
    return res.json(outcome.value);
  } catch (err) {
    console.error(err);
    if (!res.destroyed && !res.writableEnded) res.status(500).json({ error: 'Internal server error' });
  }
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/', (_req, res) => res.redirect('/login'));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
