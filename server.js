import 'dotenv/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSectionPrompt, parseSectionResult, validateLesson, mergeSections, SECTION_TOKENS, SECTION_MIN_TOKENS, sectionRetryPrompt, buildLessonReviewPrompt, parseLessonReview, extractJson } from './lib/lesson-prompt.js';
import { prepareLessonContext, lessonRequestKey, validateCoreNovelty, validatePhraseNovelty, generateLessonParts, LEVEL_DESIGNS } from './lib/lesson-design.js';
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
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
// Prefer the faster 20B model for lesson generation; fall back to the larger
// model if its free-tier daily quota is exhausted.
const GROQ_MODELS = (process.env.GROQ_MODEL || 'openai/gpt-oss-20b,openai/gpt-oss-120b,qwen/qwen3.8-27b')
  .split(',').map(s => s.trim()).filter(Boolean);
const FAST_MODEL = process.env.GROQ_FAST_MODEL || GROQ_MODELS[0];
const QUALITY_MODEL = process.env.GROQ_QUALITY_MODEL || GROQ_MODELS[1] || GROQ_MODELS[0];
const modelsFor = section => (process.env[`GROQ_MODELS_${section.toUpperCase()}`] || '')
  .split(',').map(s => s.trim()).filter(Boolean)
  .concat(section === 'core' || section === 'review' ? [FAST_MODEL] : section === 'story' || section === 'quiz' ? [QUALITY_MODEL] : [])
  .concat(GROQ_MODELS)
  .filter((model, index, all) => all.indexOf(model) === index);
const REVIEW_MODELS = modelsFor('review');

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
    const text = await transcribeSpeech(input, { signal: controller.signal });
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

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

async function supabaseAuthAdmin(resource, { method = 'GET', body } = {}) {
  const baseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) throw new Error('admin_unavailable');
  const response = await fetch(`${baseUrl}/auth/v1/admin/${resource}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`Supabase auth admin failed [${response.status}]:`, text.slice(0, 300));
    throw new Error('admin_action_failed');
  }
  return text ? JSON.parse(text) : null;
}

async function verifyAdmin(req) {
  const user = await verifySupabaseUser(req);
  if (!user) return null;
  if (ADMIN_EMAILS.includes(String(user.email || '').toLowerCase())) return user;
  // Simplu: e admin dacă profiles.is_admin este true. Citim rândul propriu
  // cu tokenul apelantului (politica RLS "profiles: own" permite asta),
  // fără roluri și fără cheia service.
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?select=is_admin&id=eq.${encodeURIComponent(user.id)}`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: req.headers.authorization || '' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const rows = await r.json();
    if (rows[0]?.is_admin === true) return user;
  } catch { /* fall through */ }
  return null;
}

function requireAdmin(handler) {
  return async (req, res) => {
    try {
      const admin = await verifyAdmin(req);
      if (!admin) return res.status(403).json({ error: 'forbidden' });
      req.adminUser = admin;
      return handler(req, res);
    } catch (error) {
      console.error('Admin endpoint failed:', error.message);
      return res.status(503).json({ error: 'admin_unavailable' });
    }
  };
}

const safeRows = async (resource) => {
  try { return await supabaseServiceRequest(resource); }
  catch { return []; }
};

// ============ ADMIN PANEL API ============

app.get('/api/admin/overview', requireAdmin(async (_req, res) => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'admin_unavailable' });
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [profiles, lessons, progress, attempts, vocab, languages, domains, newWeek] = await Promise.all([
    safeRows('profiles?select=id,created_at,is_admin,is_banned&limit=2000'),
    safeRows('lessons?select=id,created_at,language_code,level&limit=2000'),
    safeRows('user_progress?select=user_id,lesson_id,completed,score,total,completed_at&limit=5000'),
    safeRows(`lesson_attempts?select=sequence,score,total,completed_at&completed_at=gte.${encodeURIComponent(monthAgo)}&order=sequence.desc&limit=1000`),
    safeRows('user_vocabulary?select=user_id&limit=2000'),
    safeRows('languages?select=code'),
    safeRows('domains?select=slug'),
    safeRows(`profiles?select=id&created_at=gte.${encodeURIComponent(weekAgo)}&limit=2000`),
  ]);
  const completed = progress.filter(p => p.completed);
  const attemptsWeek = attempts.filter(a => a.completed_at >= weekAgo);
  res.json({
    users: {
      total: profiles.length,
      admins: profiles.filter(p => p.is_admin).length,
      banned: profiles.filter(p => p.is_banned).length,
      newWeek: newWeek.length,
    },
    lessons: { total: lessons.length },
    progress: {
      rows: progress.length,
      completed: completed.length,
      avgScore: completed.length
        ? completed.reduce((s, p) => s + (p.total ? p.score / p.total : 0), 0) / completed.length
        : null,
    },
    attempts: { month: attempts.length, week: attemptsWeek.length },
    vocab: { cards: vocab.length },
    catalog: { languages: languages.length, domains: domains.length },
  });
}));

app.get('/api/admin/users', requireAdmin(async (req, res) => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'admin_unavailable' });
  const q = String(req.query.q || '').toLowerCase().trim();
  const filter = String(req.query.filter || 'all');
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const page = Math.max(1, Number(req.query.page) || 1);
  const [profiles, authList] = await Promise.all([
    safeRows('profiles?select=id,full_name,avatar_url,native_language,onboarding_done,is_admin,is_banned,banned_reason,banned_at,created_at&order=created_at.desc&limit=1000'),
    (async () => {
      try { return await supabaseAuthAdmin(`users?per_page=200&page=1`); }
      catch { return { users: [] }; }
    })(),
  ]);
  const authById = Object.fromEntries(((authList?.users) || []).map(u => [u.id, u]));
  let users = profiles.map(p => {
    const a = authById[p.id] || {};
    return {
      ...p,
      email: a.email || null,
      email_confirmed: !!a.email_confirmed_at,
      last_sign_in_at: a.last_sign_in_at || null,
      auth_banned_until: a.banned_until || null,
    };
  });
  if (q) {
    users = users.filter(u =>
      (u.email || '').toLowerCase().includes(q) ||
      (u.full_name || '').toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q));
  }
  const weekAgo = Date.now() - 7 * 86400_000;
  if (filter === 'admins') users = users.filter(u => u.is_admin);
  else if (filter === 'banned') users = users.filter(u => u.is_banned);
  else if (filter === 'recent') users = users.filter(u => new Date(u.created_at).getTime() >= weekAgo);
  else if (filter === 'no_onboarding') users = users.filter(u => !u.onboarding_done);
  const total = users.length;
  const start = (page - 1) * limit;
  res.json({ users: users.slice(start, start + limit), total, page, limit });
}));

app.get('/api/admin/users/:id', requireAdmin(async (req, res) => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'admin_unavailable' });
  const id = req.params.id;
  const [profile, langs, domains, progress, attempts, vocab] = await Promise.all([
    safeRows(`profiles?select=*&id=eq.${encodeURIComponent(id)}`).then(r => r[0] || null),
    safeRows(`user_languages?select=language_code,level,earned_level,created_at&user_id=eq.${encodeURIComponent(id)}`),
    safeRows(`user_domains?select=language_code,domain_slug,topics,created_at&user_id=eq.${encodeURIComponent(id)}`),
    safeRows(`user_progress?select=lesson_id,completed,score,total,completed_at&user_id=eq.${encodeURIComponent(id)}&limit=500`),
    safeRows(`lesson_attempts?select=sequence,lesson_id,language_code,level,score,total,completed_at&user_id=eq.${encodeURIComponent(id)}&order=sequence.desc&limit=50`),
    safeRows(`user_vocabulary?select=language_code,term,kind,due_on&user_id=eq.${encodeURIComponent(id)}&limit=200`),
  ]);
  if (!profile) return res.status(404).json({ error: 'user_not_found' });
  let authUser = null;
  try { authUser = await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`); } catch { /* optional */ }
  res.json({
    profile,
    email: authUser?.email || null,
    email_confirmed: !!authUser?.email_confirmed_at,
    last_sign_in_at: authUser?.last_sign_in_at || null,
    languages: langs, domains, progress, attempts, vocab,
  });
}));

app.patch('/api/admin/users/:id', requireAdmin(async (req, res) => {
  const id = req.params.id;
  const { full_name, native_language, is_admin, is_banned, banned_reason } = req.body || {};
  const patch = {};
  if (full_name !== undefined) {
    if (typeof full_name !== 'string' || full_name.length > 120) return res.status(400).json({ error: 'invalid_full_name' });
    patch.full_name = full_name.trim() || null;
  }
  if (native_language !== undefined) {
    if (!supportedLanguageCodes.has(native_language)) return res.status(400).json({ error: 'invalid_language' });
    patch.native_language = native_language;
  }
  if (is_admin !== undefined) {
    if (typeof is_admin !== 'boolean') return res.status(400).json({ error: 'invalid_role' });
    if (req.adminUser.id === id && !is_admin) return res.status(400).json({ error: 'cannot_demote_self' });
    patch.is_admin = is_admin;
  }
  if (is_banned !== undefined) {
    if (typeof is_banned !== 'boolean') return res.status(400).json({ error: 'invalid_ban' });
    patch.is_banned = is_banned;
    patch.banned_at = is_banned ? new Date().toISOString() : null;
    patch.banned_reason = is_banned ? String(banned_reason || '').slice(0, 300) || null : null;
  } else if (banned_reason !== undefined && typeof banned_reason === 'string') {
    patch.banned_reason = banned_reason.slice(0, 300) || null;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing_to_update' });
  try {
    const rows = await supabaseServiceRequest(`profiles?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', body: patch, prefer: 'return=representation',
    });
    if (is_banned === true) {
      try { await supabaseAuthAdmin(`users/${encodeURIComponent(id)}/ban`, { method: 'PUT' }); } catch { /* profile flag is source of truth */ }
    }
    if (is_banned === false) {
      try { await supabaseAuthAdmin(`users/${encodeURIComponent(id)}/ban`, { method: 'DELETE' }); } catch { /* ignore */ }
    }
    res.json({ user: rows[0] || null });
  } catch {
    res.status(503).json({ error: 'admin_action_failed' });
  }
}));

app.post('/api/admin/users/:id/reset-progress', requireAdmin(async (req, res) => {
  const id = req.params.id;
  try {
    await supabaseServiceRequest(`user_progress?user_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    await supabaseServiceRequest(`user_vocabulary?user_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: 'admin_action_failed' });
  }
}));

app.post('/api/admin/users/:id/recovery', requireAdmin(async (req, res) => {
  const id = req.params.id;
  try {
    const authUser = await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`);
    if (!authUser?.email) return res.status(404).json({ error: 'no_email' });
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: authUser.email }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error('recovery_failed');
    res.json({ ok: true, email: authUser.email });
  } catch {
    res.status(503).json({ error: 'admin_action_failed' });
  }
}));

app.delete('/api/admin/users/:id', requireAdmin(async (req, res) => {
  const id = req.params.id;
  if (req.adminUser.id === id) return res.status(400).json({ error: 'cannot_delete_self' });
  try {
    await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: 'admin_action_failed' });
  }
}));

app.get('/api/admin/lessons', requireAdmin(async (req, res) => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'admin_unavailable' });
  const q = String(req.query.q || '').toLowerCase().trim();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  const rows = await safeRows(`lessons?select=id,language_code,domain_slug,topic,level,native_language,model,created_at&order=created_at.desc&limit=${limit * 2}`);
  const filtered = q
    ? rows.filter(l => (l.topic || '').toLowerCase().includes(q) || (l.domain_slug || '').toLowerCase().includes(q) || l.id.toLowerCase().includes(q))
    : rows;
  const progress = await safeRows('user_progress?select=lesson_id,completed&limit=5000');
  const doneByLesson = {};
  for (const p of progress) {
    doneByLesson[p.lesson_id] = doneByLesson[p.lesson_id] || { started: 0, done: 0 };
    doneByLesson[p.lesson_id].started++;
    if (p.completed) doneByLesson[p.lesson_id].done++;
  }
  res.json({
    lessons: filtered.slice(0, limit).map(l => ({ ...l, stats: doneByLesson[l.id] || { started: 0, done: 0 } })),
    total: filtered.length,
  });
}));

app.delete('/api/admin/lessons/:id', requireAdmin(async (req, res) => {
  try {
    await supabaseServiceRequest(`lessons?id=eq.${encodeURIComponent(req.params.id)}`, { method: 'DELETE' });
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: 'admin_action_failed' });
  }
}));

app.get('/api/admin/activity', requireAdmin(async (_req, res) => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'admin_unavailable' });
  const [attempts, progress] = await Promise.all([
    safeRows('lesson_attempts?select=sequence,user_id,lesson_id,language_code,level,score,total,completed_at&order=sequence.desc&limit=60'),
    safeRows('user_progress?select=user_id,lesson_id,completed,completed_at&order=completed_at.desc.nullslast&limit=60'),
  ]);
  const profiles = await safeRows('profiles?select=id,full_name&limit=1000');
  const names = Object.fromEntries(profiles.map(p => [p.id, p.full_name || p.id.slice(0, 8)]));
  res.json({
    attempts: attempts.map(a => ({ ...a, user_name: names[a.user_id] || a.user_id.slice(0, 8) })),
    recent: progress.filter(p => p.completed).slice(0, 30).map(p => ({ ...p, user_name: names[p.user_id] || p.user_id.slice(0, 8) })),
  });
}));

app.get('/api/admin/catalog', requireAdmin(async (_req, res) => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'admin_unavailable' });
  const [languages, domains, translations, lessons] = await Promise.all([
    safeRows('languages?select=code,name,native_name,flag&order=code'),
    safeRows('domains?select=slug,name,description,topics&order=slug'),
    safeRows('lesson_localizations?select=lesson_id,native_language&limit=2000'),
    safeRows('lessons?select=id,language_code,domain_slug&limit=2000'),
  ]);
  const locByLesson = {};
  for (const t of translations) {
    locByLesson[t.lesson_id] = locByLesson[t.lesson_id] || [];
    locByLesson[t.lesson_id].push(t.native_language);
  }
  const lessonsByLang = {};
  for (const l of lessons) {
    lessonsByLang[l.language_code] = (lessonsByLang[l.language_code] || 0) + 1;
  }
  res.json({ languages, domains, locByLesson, lessonsByLang });
}));

app.post('/api/admin/domains', requireAdmin(async (req, res) => {
  const { slug, name, description, topics } = req.body || {};
  if (!/^[a-z][a-z0-9_-]{1,49}$/i.test(slug || '') || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'invalid_domain' });
  }
  try {
    const rows = await supabaseServiceRequest('domains', {
      method: 'POST',
      body: {
        slug: slug.toLowerCase(), name: name.trim(),
        description: String(description || '').slice(0, 500),
        topics: Array.isArray(topics) ? topics.map(String).filter(Boolean).slice(0, 50) : [],
      },
      prefer: 'return=representation',
    });
    res.status(201).json({ domain: rows[0] });
  } catch {
    res.status(503).json({ error: 'admin_action_failed' });
  }
}));

app.put('/api/admin/domains/:slug', requireAdmin(async (req, res) => {
  const { name, description, topics } = req.body || {};
  const patch = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'invalid_domain' });
    patch.name = name.trim();
  }
  if (description !== undefined) patch.description = String(description).slice(0, 500);
  if (topics !== undefined) {
    if (!Array.isArray(topics)) return res.status(400).json({ error: 'invalid_topics' });
    patch.topics = topics.map(String).filter(Boolean).slice(0, 50);
  }
  try {
    const rows = await supabaseServiceRequest(`domains?slug=eq.${encodeURIComponent(req.params.slug)}`, {
      method: 'PATCH', body: patch, prefer: 'return=representation',
    });
    res.json({ domain: rows[0] || null });
  } catch {
    res.status(503).json({ error: 'admin_action_failed' });
  }
}));

app.delete('/api/admin/domains/:slug', requireAdmin(async (req, res) => {
  try {
    await supabaseServiceRequest(`domains?slug=eq.${encodeURIComponent(req.params.slug)}`, { method: 'DELETE' });
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: 'admin_action_failed' });
  }
}));

async function requestGroqPrimary(messages, maxTokens, model, temperature = 0.65, signal = null, timeoutMs = 45_000) {
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
        // "Request too large" (output-token ceiling) never clears by waiting:
        // this model physically cannot emit what we asked for. Fail over to
        // the next model instead of looping here until the deadline.
        if (/request too large/i.test(text)) return { outputLimit: true };
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
    return { raw: data.choices?.[0]?.message?.content || '', usage: data.usage || null };
  } catch (err) {
    if (signal?.aborted) throw signal.reason || err;
    console.error('Groq request failed:', err.name, err.message);
    return { error: true, retryable: true };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

async function requestGemini(messages, maxTokens, temperature = 0.65, signal = null, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Gemini request timed out')), Math.max(1, timeoutMs));
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GEMINI_API_KEY}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' }
      })
    });
    if (!response.ok) {
      const text = await response.text();
      console.error(`Gemini error [${GEMINI_MODEL}]:`, response.status, text.slice(0, 300));
      if (response.status === 413) return { tooLarge: true, provider: 'gemini', model: GEMINI_MODEL };
      if (response.status === 429) {
        if (/request too large/i.test(text)) return { outputLimit: true, provider: 'gemini', model: GEMINI_MODEL };
        return { waitMs: retryDelayMs(429, response.headers, text), quota: /per day|TPD|RPD|daily|quota/i.test(text), provider: 'gemini', model: GEMINI_MODEL };
      }
      return {
        error: true, status: response.status,
        retryable: response.status === 408 || response.status === 425 || response.status >= 500,
        provider: 'gemini', model: GEMINI_MODEL,
      };
    }
    const data = await response.json();
    return {
      raw: data.choices?.[0]?.message?.content || '', usage: data.usage || null,
      provider: 'gemini', model: GEMINI_MODEL,
    };
  } catch (err) {
    if (signal?.aborted) throw signal.reason || err;
    console.error('Gemini request failed:', err.name, err.message);
    return { error: true, retryable: true, provider: 'gemini', model: GEMINI_MODEL };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

async function requestGroq(messages, maxTokens, model, temperature = 0.65, signal = null, timeoutMs = 45_000) {
  let geminiQuotaSeen = false;
  if (process.env.GEMINI_API_KEY) {
    const primary = await requestGemini(messages, maxTokens, temperature, signal, timeoutMs);
    geminiQuotaSeen = Boolean(primary.quota);
    // Validation and section-specific retries still run through the same pipeline.
    if (!primary.error && !primary.waitMs && !primary.quota && !primary.tooLarge && !primary.outputLimit) {
      return primary;
    }
    if (signal?.aborted) throw signal.reason;
    console.warn(`Gemini unavailable for ${GEMINI_MODEL}; trying Groq fallback.`);
  }
  const fallback = await requestGroqPrimary(messages, maxTokens, model, temperature, signal, timeoutMs);
  return { ...fallback, provider: 'groq', model, quotaSeen: Boolean(fallback.quota || geminiQuotaSeen) };
}

/** Generate one section, retrying only that section until it validates. */
async function generateSection(section, ctx, deadline, feedback = null, signal = null) {
  const sectionStartedAt = Date.now();
  const base = buildSectionPrompt(section, ctx);
  let maxTokens = sectionBudget(section);
  let modelIdx = 0;
  let lastReason = feedback;
  let previousData = null;
  let attempt = 0;
  let providerQuotaSeen = false;

  while (Date.now() < deadline && !signal?.aborted) {
    attempt++;
    const models = modelsFor(section);
    const model = models[modelIdx];
    const messages = lastReason
      ? [...base, { role: 'user', content: sectionRetryPrompt(section, lastReason, previousData) }]
      : base;

    const result = await requestGroq(messages, maxTokens, model, 0.65, signal,
      Math.min(45_000, Math.max(1, deadline - Date.now())));
    providerQuotaSeen ||= Boolean(result.quota || result.quotaSeen);

    if (result.tooLarge) {
      if (maxTokens <= SECTION_MIN_TOKENS) {
        return { section, data: null, reason: `"${section}": account token limit too low`, quota: providerQuotaSeen };
      }
      maxTokens = Math.max(SECTION_MIN_TOKENS, Math.floor(maxTokens * 0.8));
      console.warn(`[${section}] budget too large, retrying with max_tokens=${maxTokens}.`);
      continue;
    }

    if (result.outputLimit) {
      // This model cannot emit a section this size at all. Move on right
      // away; only give up when no model is left.
      if (modelIdx < models.length - 1) {
        console.warn(`[${section}] output limit too small on ${model}, falling back to ${models[modelIdx + 1]}.`);
        modelIdx++;
        continue;
      }
      return { section, data: null, reason: `"${section}": no model can emit the required size right now`, quota: providerQuotaSeen };
    }

    if (result.waitMs) {
      if (result.quota) {
        // This model's daily budget is spent. Move the section to the next
        // model right away; only give up when no model has budget left.
        if (modelIdx < models.length - 1) {
          console.warn(`[${section}] daily quota out on ${model}, falling back to ${models[modelIdx + 1]}.`);
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
        return { section, data: null, reason: `Provider request failed permanently (HTTP ${result.status})`, quota: providerQuotaSeen };
      }
      const wait = remainingWait(retryBackoffMs(attempt), deadline);
      if (wait <= 0) break;
      await sleep(wait, signal);
      continue;
    }

    const { data, reason } = parseSectionResult(section, result.raw, ctx.languageCode);
    const novelty = data && section === 'core' ? validateCoreNovelty(data, ctx)
      : data && section === 'phrases' ? validatePhraseNovelty(data, ctx) : { valid: true };
    if (data && novelty.valid) {
      const usedModel = result.model || model;
      console.log(JSON.stringify({ event: 'lesson_section', section, durationMs: Date.now() - sectionStartedAt, attempt, provider: result.provider || 'groq', model: usedModel, usage: result.usage || null, valid: true }));
      return { section, data, reason: null, model: usedModel };
    }
    previousData = data;
    lastReason = novelty.valid ? reason : novelty.reason;
    console.warn(`[${section}] attempt ${attempt} rejected: ${lastReason}`);
  }

  return { section, data: null, reason: lastReason || `"${section}": deadline exceeded`, quota: providerQuotaSeen };
}

async function reviewLesson(parts, ctx, deadline, signal = null) {
  const messages = buildLessonReviewPrompt(ctx, parts);
  const models = REVIEW_MODELS;
  let modelIdx = 0;
  let attempt = 0;
  while (Date.now() < deadline && !signal?.aborted) {
    attempt++;
    const result = await requestGroq(messages, 1200, models[modelIdx], 0.1, signal,
      Math.min(45_000, Math.max(1, deadline - Date.now())));
    if (result.quota) {
      if (modelIdx < models.length - 1) { modelIdx++; continue; }
      throw Object.assign(new Error(QUOTA_MSG), { quota: true });
    }
    if (result.outputLimit) {
      if (modelIdx < models.length - 1) { modelIdx++; continue; }
      throw new Error('Lesson review: no model can emit the required size right now');
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

async function verifyAndRepairLesson(parts, ctx, originalLesson) {
  const startedAt = Date.now();
  try {
    let currentParts = { ...parts };
    let lesson = originalLesson;
    let assessment = await reviewLesson(currentParts, ctx, Date.now() + 90_000);
    if (!assessment.valid) {
      const fixes = new Map();
      for (const issue of assessment.issues) fixes.set(issue.section, [fixes.get(issue.section), issue.reason].filter(Boolean).join('; '));
      const repaired = await Promise.all([...fixes].map(async ([section, reason]) => {
        if (section === 'core') {
          const regenerated = await generateLessonParts(ctx, generateSection, Date.now() + 90_000);
          return regenerated;
        }
        return [await generateSection(section, { ...ctx, lessonCore: currentParts.core }, Date.now() + 90_000, reason)];
      }));
      for (const result of repaired.flat()) if (result?.data) currentParts[result.section] = result.data;
      lesson = { ...mergeSections(currentParts), generation: { ...(originalLesson.generation || {}), quality: { status: 'pending' } } };
      const deterministic = validateLesson(lesson, ctx.languageCode);
      if (deterministic.valid) {
        assessment = await reviewLesson(currentParts, ctx, Date.now() + 90_000);
      } else {
        currentParts = { ...parts };
        lesson = originalLesson;
        assessment = { valid: false, issues: [{ section: 'core', reason: deterministic.reason }] };
      }
    }
    const quality = {
      status: assessment.valid ? 'verified' : 'needs_review',
      checkedAt: new Date().toISOString(), issues: assessment.issues,
    };
    lesson.generation = { ...(lesson.generation || {}), quality };
    console.log(JSON.stringify({ event: 'lesson_review', status: quality.status, durationMs: Date.now() - startedAt, repaired: lesson !== originalLesson, issueCount: quality.issues.length }));
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && ctx.domainSlug) {
      const query = `lessons?select=id,content&language_code=eq.${encodeURIComponent(ctx.languageCode)}&domain_slug=eq.${encodeURIComponent(ctx.domainSlug)}&topic=eq.${encodeURIComponent(ctx.topicKey || ctx.topic)}&level=eq.${encodeURIComponent(ctx.level)}`;
      const row = (await supabaseServiceRequest(query))[0];
      if (row?.id) await supabaseServiceRequest(`lessons?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH', body: { content: lesson }, prefer: 'return=minimal',
      });
    }
  } catch (error) {
    console.warn(JSON.stringify({ event: 'lesson_review', status: 'unavailable', durationMs: Date.now() - startedAt, reason: error.message }));
  }
}

app.post('/api/lesson', async (req, res) => {
  try {
    const user = await verifySupabaseUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'AI is not configured (GROQ_API_KEY or GEMINI_API_KEY missing)' });
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
      const parts = Object.fromEntries(results.map(r => [r.section, r.data]));
      const lesson = mergeSections(parts);
      lesson.generation = { specVersion: 2, variationId: ctx.variationId, focus: ctx.focus, history: ctx.history, quality: { status: 'pending' } };
      const check = validateLesson(lesson, ctx.languageCode);
      if (!check.valid) throw new Error(check.reason);
      const used = [...new Set(results.map(r => r.model))].join('+');
      console.log(`Lesson ${key} done in ${Math.round((Date.now() - t0) / 1000)}s [${used}].`);
      const cacheInput = {
        languageCode: ctx.languageCode, domainSlug: ctx.domainSlug, topic: ctx.topicKey || ctx.topic,
        level: ctx.level, nativeLanguageCode: req.body.nativeLanguageCode, model: used,
        issuedAt: Date.now(), content: lesson,
      };
      return { lesson, model: used, cacheProof: signLessonCache(user.id, cacheInput), cacheIssuedAt: cacheInput.issuedAt, reviewParts: parts };
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
    const { reviewParts, ...responseBody } = outcome.value;
    res.json(responseBody);
    await verifyAndRepairLesson(reviewParts, ctx, responseBody.lesson);
    return;
  } catch (err) {
    console.error(err);
    if (!res.destroyed && !res.writableEnded) res.status(500).json({ error: 'Internal server error' });
  }
});

const PRACTICE_TURN_LIMIT = 10;

// A focused Q&A practice session, separate from full lesson generation.
app.post('/api/practice', async (req, res) => {
  try {
    const user = await verifySupabaseUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'practice_not_configured' });
    }
    let ctx;
    try { ctx = prepareLessonContext(req.body); }
    catch (err) { return res.status(400).json({ error: err.message }); }
    if (!allowLessonRequest(user.id)) {
      return res.status(429).set('Retry-After', '60').json({ error: 'lesson_rate_limited' });
    }

    const messages = [
      { role: 'system', content: 'You are a skilled language speaking coach. Return only a valid JSON object, with no markdown or commentary.' },
      { role: 'user', content: `Create one short, finite speaking practice lesson for a language learner.
Target language: ${ctx.language}. Interface and explanation language: ${ctx.nativeLanguage}. CEFR level: ${ctx.level}.
Domain: ${ctx.domain}. Exact topic: ${ctx.topic}. Keep every prompt specific to this topic and level.
Return exactly this shape: {"title":"short lesson title in ${ctx.nativeLanguage}","intro":"one short instruction in ${ctx.nativeLanguage}","firstQuestion":{"question":"a natural, open-ended question in ${ctx.language}","translation":"question meaning in ${ctx.nativeLanguage}","criteria":["key idea(s) of a correct answer, in ${ctx.nativeLanguage}"]}}.
Create one engaging opening question that invites the learner to explain or describe something relevant to the exact topic. The learner answers in their own words; do not provide an answer or a sentence to repeat. Make it answerable in one or two spoken sentences at CEFR ${ctx.level}. Include 1-3 concise factual/communicative criteria as guidance for later answer evaluation. No extra fields.` },
    ];
    const result = await requestGroq(messages, 1400, FAST_MODEL, 0.55, null, 45_000);
    if (!result.raw) {
      const quota = Boolean(result.quota || result.quotaSeen);
      return res.status(quota ? 429 : 503).json({ error: quota ? 'practice_quota' : 'practice_unavailable', quota });
    }
    const data = extractJson(result.raw);
    const valid = data && typeof data.title === 'string' && data.title.trim()
      && typeof data.intro === 'string' && data.intro.trim()
      && data.firstQuestion && ['question', 'translation'].every(key => typeof data.firstQuestion[key] === 'string' && data.firstQuestion[key].trim())
      && Array.isArray(data.firstQuestion.criteria) && data.firstQuestion.criteria.length >= 1 && data.firstQuestion.criteria.length <= 3
      && data.firstQuestion.criteria.every(value => typeof value === 'string' && value.trim());
    if (!valid) return res.status(503).json({ error: 'practice_unavailable' });
    console.log(JSON.stringify({ event: 'practice_generated', userId: user.id, durationMs: result.usage?.total_time || null, provider: result.provider || 'groq', model: result.model || FAST_MODEL }));
    return res.json({ practice: { title: data.title, intro: data.intro, firstQuestion: data.firstQuestion, turnLimit: PRACTICE_TURN_LIMIT } });
  } catch (err) {
    console.error('Practice generation failed:', err);
    if (!res.headersSent) res.status(500).json({ error: 'practice_unavailable' });
  }
});

app.post('/api/practice/evaluate', async (req, res) => {
  try {
    const user = await verifySupabaseUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'practice_not_configured' });
    }
    let ctx;
    try { ctx = prepareLessonContext(req.body); }
    catch (err) { return res.status(400).json({ error: err.message }); }
    const { question, criteria, answer, history = [], turn } = req.body || {};
    if (typeof question !== 'string' || !question.trim() || question.length > 1000
      || !Array.isArray(criteria) || criteria.length < 1 || criteria.length > 3
      || !criteria.every(value => typeof value === 'string' && value.trim() && value.length <= 300)
      || typeof answer !== 'string' || !answer.trim() || answer.length > 3000
      || !Number.isInteger(turn) || turn < 1 || turn > PRACTICE_TURN_LIMIT
      || !Array.isArray(history) || history.length !== turn - 1
      || !history.every(entry => entry && typeof entry.question === 'string' && entry.question.length <= 1000
        && typeof entry.answer === 'string' && entry.answer.length <= 3000)) {
      return res.status(400).json({ error: 'invalid_practice_answer' });
    }
    if (!allowLessonRequest(user.id)) {
      return res.status(429).set('Retry-After', '60').json({ error: 'lesson_rate_limited' });
    }
    const messages = [
      { role: 'system', content: 'You are a fair, supportive language tutor and subject-aware answer evaluator. Return only valid JSON, with no markdown or commentary.' },
      { role: 'user', content: `Evaluate the learner's own answer to a question in a language-learning practice session.
Target language: ${ctx.language}. Feedback language: ${ctx.nativeLanguage}. CEFR level: ${ctx.level}.
Domain: ${ctx.domain}. Exact topic: ${ctx.topic}.
Question in the target language: ${question.trim()}
What a good answer should cover (guidance, not an exact-answer checklist): ${JSON.stringify(criteria)}
Learner's answer in the target language: ${answer.trim()}
Earlier turns in this same conversation: ${JSON.stringify(history)}
Judge whether the answer actually responds to the question and covers the key idea(s). Accept different valid answers and wording. Do not require exact phrase matching. If the answer is factually wrong for the topic, explain the issue. Separately consider whether the target-language wording is understandable and appropriate for CEFR ${ctx.level}; do not over-penalize small grammar/spelling errors when meaning is clear.
Give an integer score from 0 to 100: content relevance/correctness is the main factor (about 70%), language clarity is the rest. Empty or unrelated answers score low. In feedback, clearly identify the learner's main grammar, vocabulary, or word-order mistakes when present, explain the correction briefly in ${ctx.nativeLanguage}, and acknowledge what they did well. If there are no meaningful mistakes, say so and offer one natural improvement.
If this is not the final turn (turn ${turn} of ${PRACTICE_TURN_LIMIT}), continue the conversation with one concise, natural follow-up question in ${ctx.language}. It must react to what the learner just said, stay on the selected topic, and invite a little more detail; do not repeat the opening question. If the learner's response is unclear, ask a helpful clarification. Include its translation and 1-3 answer criteria in ${ctx.nativeLanguage}. On the final turn, set followUp to null.
Return exactly: {"score":integer,"feedback":"short, specific feedback with corrections in ${ctx.nativeLanguage}","improvedAnswer":"a natural corrected version of the learner's answer in ${ctx.language}, preserving their meaning; if the original is already correct, provide a more natural alternative","improvedTranslation":"meaning of improvedAnswer in ${ctx.nativeLanguage}","followUp":{"question":"next conversational question in ${ctx.language}","translation":"meaning in ${ctx.nativeLanguage}","criteria":["answer idea in ${ctx.nativeLanguage}"]}}. Use followUp null on the final turn. Do not claim phonetic analysis.` },
    ];
    const result = await requestGroq(messages, 1300, FAST_MODEL, 0.2, null, 45_000);
    if (!result.raw) {
      const quota = Boolean(result.quota || result.quotaSeen);
      return res.status(quota ? 429 : 503).json({ error: quota ? 'practice_quota' : 'practice_unavailable', quota });
    }
    const data = extractJson(result.raw);
    const valid = data && Number.isInteger(data.score) && data.score >= 0 && data.score <= 100
      && ['feedback', 'improvedAnswer', 'improvedTranslation'].every(key => typeof data[key] === 'string' && data[key].trim())
      && (turn === PRACTICE_TURN_LIMIT
        ? data.followUp === null
        : data.followUp && typeof data.followUp.question === 'string' && data.followUp.question.trim()
          && typeof data.followUp.translation === 'string' && data.followUp.translation.trim()
          && Array.isArray(data.followUp.criteria) && data.followUp.criteria.length >= 1 && data.followUp.criteria.length <= 3
          && data.followUp.criteria.every(value => typeof value === 'string' && value.trim()));
    if (!valid) return res.status(503).json({ error: 'practice_unavailable' });
    console.log(JSON.stringify({ event: 'practice_answer_evaluated', userId: user.id, provider: result.provider || 'groq', model: result.model || FAST_MODEL }));
    return res.json({ evaluation: { score: data.score, feedback: data.feedback, improvedAnswer: data.improvedAnswer, improvedTranslation: data.improvedTranslation, followUp: data.followUp } });
  } catch (err) {
    console.error('Practice answer evaluation failed:', err);
    if (!res.headersSent) res.status(500).json({ error: 'practice_unavailable' });
  }
});

// Streaming variant used by the lesson UI. The small core (context + glossary)
// is emitted as soon as it validates; independent sections then arrive as
// they finish. The semantic AI review starts only after the lesson is sent.
function partialLessonFromSections(results) {
  const parts = Object.fromEntries(results.map(result => [result.section, result.data]));
  return {
    ...parts.core,
    phrases: parts.phrases?.phrases || [],
    dialogue: parts.story?.dialogue || { context: '', lines: [] },
    reading: parts.story?.reading || null,
    grammar: parts.practice?.grammar || null,
    listening: parts.practice?.listening || [],
    speaking: parts.practice?.speaking || [],
    quiz: parts.quiz?.quiz || [],
    tips: parts.quiz?.tips || [],
    generation: { partial: true },
  };
}

app.post('/api/lesson/stream', async (req, res) => {
  const user = await verifySupabaseUser(req).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'AI is not configured (GROQ_API_KEY or GEMINI_API_KEY missing)' });
  let ctx;
  try { ctx = prepareLessonContext(req.body); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  if (!allowLessonRequest(user.id)) return res.status(429).set('Retry-After', '60').json({ error: 'lesson_rate_limited' });
  const userActive = activeLessonsByUser.get(user.id) || 0;
  if (activeLessonCount >= MAX_CONCURRENT_LESSONS || userActive >= MAX_CONCURRENT_LESSONS_PER_USER) {
    return res.status(429).set('Retry-After', '10').json({ error: 'lesson_generation_busy' });
  }

  const controller = new AbortController();
  let finished = false;
  const onClose = () => { if (!finished) controller.abort(new Error('Client disconnected')); };
  res.on('close', onClose);
  activeLessonCount++;
  activeLessonsByUser.set(user.id, userActive + 1);
  res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  const send = (event, payload) => { if (!res.destroyed && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); };
  const startedAt = Date.now();
  const deadline = startedAt + LESSON_DEADLINE_MS;
  try {
    const results = await generateLessonParts(ctx, generateSection, deadline, controller.signal, result => {
      if (result.data) send(result.section === 'core' ? 'core' : 'section', { section: result.section, data: result.data });
    }, readyParts => {
      send('ready', { lesson: partialLessonFromSections(readyParts) });
    });
    const failed = results.filter(result => !result.data);
    if (failed.length) {
      const err = new Error(failed.map(result => result.reason).join('; '));
      err.quota = failed.every(result => result.quota);
      throw err;
    }
    const parts = Object.fromEntries(results.map(result => [result.section, result.data]));
    const lesson = mergeSections(parts);
    lesson.generation = { specVersion: 2, variationId: ctx.variationId, focus: ctx.focus, history: ctx.history, quality: { status: 'pending' } };
    const check = validateLesson(lesson, ctx.languageCode);
    if (!check.valid) throw new Error(check.reason);
    const used = [...new Set(results.map(result => result.model))].join('+');
    const cacheInput = {
      languageCode: ctx.languageCode, domainSlug: ctx.domainSlug, topic: ctx.topicKey || ctx.topic,
      level: ctx.level, nativeLanguageCode: req.body.nativeLanguageCode, model: used,
      issuedAt: Date.now(), content: lesson,
    };
    send('lesson', { lesson, model: used, cacheProof: signLessonCache(user.id, cacheInput), cacheIssuedAt: cacheInput.issuedAt });
    console.log(JSON.stringify({ event: 'lesson_generation', durationMs: Date.now() - startedAt, models: used, sections: results.map(result => result.section) }));
    finished = true;
    res.end();

    // Delivery is complete; review and any section repair happen separately.
    await verifyAndRepairLesson(parts, ctx, lesson);
  } catch (error) {
    if (!res.destroyed && !res.writableEnded) {
      send('error', { error: error.quota ? 'quota' : 'lesson_unavailable', reason: error.message });
      res.end();
    }
  } finally {
    finished = true;
    res.off('close', onClose);
    activeLessonCount--;
    const remaining = (activeLessonsByUser.get(user.id) || 1) - 1;
    if (remaining) activeLessonsByUser.set(user.id, remaining); else activeLessonsByUser.delete(user.id);
  }
});

// The React frontend (web/) is the only UI. Serve its production build;
// API routes above take precedence, everything else is a client route.
const webDist = path.join(__dirname, 'web', 'dist');
if (existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*$/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
} else {
  console.warn('web/dist/index.html is missing — run "npm run build:web" to build the frontend.');
  app.get('/', (_req, res) => res.status(503).json({ error: 'frontend_not_built' }));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

export default app;
