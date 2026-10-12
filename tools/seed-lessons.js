// Seed the shared lesson cache: one full lesson per catalog topic, so opening
// a lesson shows it instantly while the app rotates a fresh one in background.
//
//   SEED_EMAIL, SEED_PASSWORD  account to seed for (required)
//   API_BASE                   default http://localhost:3000
//   SEED_LANGS                 csv of language codes (default: the account's own)
//   SEED_LEVELS                csv like A1,B2 (default: each language's own level)
//   SEED_NATIVE                native language code for explanations (default ro)
//   SEED_LIMIT                 max lessons this run (default: no limit)
//   SEED_SLEEP_MS              pause between lessons (default 2000)
//
// Resumable: combos already cached are skipped. Stop any time with Ctrl-C;
// rerunning continues where it stopped. Only run ONE instance at a time per
// account — the server serializes generations per user anyway.
//
// Honest math: the free tier allows ~5-10 lessons a day. A full matrix takes
// weeks in the background; the in-app rotation covers studied topics first.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const API = process.env.API_BASE || 'http://localhost:3000';
const NATIVE = process.env.SEED_NATIVE || 'ro';
const LIMIT = Number(process.env.SEED_LIMIT || '0') || Infinity;
const SLEEP_MS = Number(process.env.SEED_SLEEP_MS || '2000');
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
  console.log('\nStopping after the current lesson…');
});

const displayNameEn = (code) => {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
    if (name && name !== code) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch { /* fall through */ }
  return code;
};

async function api(path, token, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, retryAfter: Number(r.headers.get('retry-after') || '0'), data };
}

async function main() {
  const { SEED_EMAIL, SEED_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SEED_EMAIL || !SEED_PASSWORD) throw new Error('Set SEED_EMAIL and SEED_PASSWORD');
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: signed, error: signError } = await sb.auth.signInWithPassword({
    email: SEED_EMAIL, password: SEED_PASSWORD,
  });
  if (signError) throw signError;
  const user = signed.user;
  const token = () => sb.auth.getSession().then(({ data }) => data.session?.access_token);

  const { data: userLangs } = await sb.from('user_languages').select('language_code, level').eq('user_id', user.id);
  const wantedLangs = (process.env.SEED_LANGS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const langs = (wantedLangs.length ? wantedLangs : (userLangs || []).map((l) => l.language_code));
  if (!langs.length) throw new Error('No languages: pass SEED_LANGS or finish onboarding first');
  const levelFor = (code) => {
    const forced = (process.env.SEED_LEVELS || '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => LEVELS.includes(s));
    if (forced.length) return forced;
    const own = (userLangs || []).find((l) => l.language_code === code)?.level;
    return own && LEVELS.includes(own) ? [own] : LEVELS;
  };

  const { data: domains, error: domError } = await sb.from('domains').select('slug, name, topics').order('slug');
  if (domError) throw domError;

  const combos = [];
  for (const lang of langs) {
    for (const level of levelFor(lang)) {
      for (const d of domains || []) {
        for (const topic of d.topics || []) combos.push({ lang, level, domain: d.slug, topic });
      }
    }
  }
  console.log(`${combos.length} combos in scope (native: ${NATIVE}). Checking cache…`);

  let done = 0, skipped = 0, failed = 0;
  for (const combo of combos) {
    if (stopped || done >= LIMIT) break;
    const { data: existing } = await sb.from('lessons').select('id')
      .eq('language_code', combo.lang).eq('domain_slug', combo.domain)
      .eq('topic', combo.topic).eq('level', combo.level).maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }
    const label = `${combo.lang}/${combo.level} ${combo.domain} › ${combo.topic}`;
    try {
      // eslint-disable-next-line no-await-in-loop
      const body = await generateWithRetry(combo);
      // eslint-disable-next-line no-await-in-loop
      await saveCache(combo, body);
      done++;
      console.log(`[${done}] cached ${label}`);
    } catch (err) {
      failed++;
      console.warn(`[${label}] FAILED: ${err.message}`);
      if (err.quota) {
        console.warn('Daily quota exhausted — rerun tomorrow to continue.');
        break;
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(SLEEP_MS);
  }
  console.log(`Done: ${done} cached, ${skipped} already had lessons, ${failed} failed.`);

  async function generateWithRetry(combo) {
    for (let round = 1; ; round++) {
      const t = await token();
      const { status, retryAfter, data } = await api('/api/lesson', t, {
        language: displayNameEn(combo.lang),
        domain: (domains.find((d) => d.slug === combo.domain) || {}).name || combo.domain,
        topic: combo.topic,
        level: combo.level,
        nativeLanguage: combo.lang,
        languageCode: combo.lang,
        domainSlug: combo.domain,
        topicKey: combo.topic,
        nativeLanguageCode: NATIVE,
        variationId: randomUUID(),
        avoid: [],
      });
      if (status === 401) {
        await sb.auth.refreshSession();
        continue;
      }
      if (status === 200 && data.lesson) return data;
      if (data.quota) {
        const err = new Error('quota');
        err.quota = true;
        throw err;
      }
      if (status === 429 && round <= 6) {
        await sleep(Math.min(Math.max(retryAfter, 5), 120) * 1000);
        continue;
      }
      throw new Error(data.error || `HTTP ${status}`);
    }
  }

  async function saveCache(combo, body) {
    const t = await token();
    const { status, data } = await api('/api/lesson-cache', t, {
      kind: 'lesson',
      languageCode: combo.lang,
      domainSlug: combo.domain,
      topic: combo.topic,
      level: combo.level,
      nativeLanguageCode: NATIVE,
      content: body.lesson,
      model: body.model,
      cacheProof: body.cacheProof,
      issuedAt: body.cacheIssuedAt,
    });
    if (status !== 200) throw new Error(data.error || `cache HTTP ${status}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
