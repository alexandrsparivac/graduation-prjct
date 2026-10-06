import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSectionPrompt, parseSectionResult, validateLesson, mergeSections, SECTIONS, SECTION_TOKENS, SECTION_MIN_TOKENS, sectionRetryPrompt } from './lib/lesson-prompt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

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

// The old monolith needed up to 4 minutes because one bad field discarded
// ~6000 tokens. With 4 parallel sections a retry costs one small section,
// so 2 minutes is a generous ceiling — typical lessons finish in 15-40s.
const LESSON_DEADLINE_MS = Number(process.env.LESSON_DEADLINE_MS || 120_000);

// Coalesce identical concurrent requests (double-click on regen, two tabs).
// The second caller awaits the first instead of doubling the Groq burst.
const inflight = new Map();

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** How long Groq wants us to wait, from the header or the message it returns. */
function retryDelayMs(status, headers, body) {
  const header = Number(headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return header * 1000 + 250;
  const match = /try again in ([\d.]+)\s*s/i.exec(body || '');
  if (match) return Math.ceil(Number(match[1]) * 1000) + 500;
  return status === 429 ? 15_000 : 2_000;
}

app.use(express.json({ limit: '1mb' }));

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
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  return r.json();
}

async function requestGroq(messages, maxTokens, model) {
  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      // Sections are short; a healthy one answers well under this.
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
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
      return { error: true, status: groqRes.status };
    }
    const data = await groqRes.json();
    return { raw: data.choices?.[0]?.message?.content || '' };
  } catch (err) {
    console.error('Groq request failed:', err.name, err.message);
    return { error: true };
  }
}

/** Generate one section, retrying only that section until it validates. */
async function generateSection(section, ctx, deadline) {
  const base = buildSectionPrompt(section, ctx);
  let maxTokens = sectionBudget(section);
  let modelIdx = 0;
  let lastReason = null;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    const model = GROQ_MODELS[modelIdx];
    const messages = lastReason
      ? [...base, { role: 'user', content: sectionRetryPrompt(section, lastReason) }]
      : base;

    const result = await requestGroq(messages, maxTokens, model);

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
      await sleep(wait);
      continue;
    }

    if (result.error) {
      await sleep(1500);
      continue;
    }

    const { data, reason } = parseSectionResult(section, result.raw);
    if (data) {
      if (attempt > 1) console.log(`[${section}] valid after ${attempt} attempts.`);
      return { section, data, reason: null, model };
    }
    lastReason = reason;
    console.warn(`[${section}] attempt ${attempt} rejected: ${reason}`);
  }

  return { section, data: null, reason: lastReason || `"${section}": deadline exceeded` };
}

function lessonKey({ language, domain, topic, level, nativeLanguage }) {
  return [language, domain, topic, level, nativeLanguage].join('|').toLowerCase();
}

app.post('/api/lesson', async (req, res) => {
  try {
    const user = await verifySupabaseUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: 'AI is not configured (GROQ_API_KEY missing)' });
    }

    const { language, domain, topic, level, nativeLanguage } = req.body || {};
    if (!language || !domain || !topic || !level) {
      return res.status(400).json({ error: 'Missing fields: language, domain, topic, level' });
    }

    const ctx = { language, domain, topic, level, nativeLanguage: nativeLanguage || 'Romanian' };
    const key = lessonKey(ctx);

    // Reuse an identical request that is already generating.
    if (inflight.has(key)) {
      try {
        const shared = await inflight.get(key);
        return res.json(shared);
      } catch (err) {
        return res.status(503).json({ error: 'lesson_unavailable', reason: err?.message || null });
      }
    }

    const deadline = Date.now() + LESSON_DEADLINE_MS;
    const t0 = Date.now();

    // The 4 sections are independent JSON shapes, so they generate in
    // parallel. Wall-clock time is the slowest section, not the sum, and a
    // validation failure retries one small section instead of the lesson.
    const job = (async () => {
      const results = await Promise.all(
        SECTIONS.map(section => generateSection(section, ctx, deadline))
      );
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
      const check = validateLesson(lesson);
      if (!check.valid) throw new Error(check.reason);
      const used = [...new Set(results.map(r => r.model))].join('+');
      console.log(`Lesson ${key} done in ${Math.round((Date.now() - t0) / 1000)}s [${used}].`);
      return { lesson, model: used };
    })();

    inflight.set(key, job);
    try {
      const out = await job;
      return res.json(out);
    } catch (err) {
      return res.status(503).json({ error: 'lesson_unavailable', reason: err?.message || null, quota: !!err?.quota });
    } finally {
      inflight.delete(key);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/', (_req, res) => res.redirect('/login'));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
