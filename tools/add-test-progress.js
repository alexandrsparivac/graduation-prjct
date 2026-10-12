// Adds one 100%-correct completed lesson for a real account, so the
// dashboard (streak, activity, weak spots, attempts) has something to show.
//
//   SEED_EMAIL, SEED_PASSWORD  the account to add progress for (required)
//   API_BASE                   default http://localhost:3000
//   SEED_LANG                  language code (default: the account's first language)
//   SEED_LEVEL                 level (default: that language's own level)
//
// It picks an already-cached lesson, reads its answer key, and submits all
// 8 answers correct through /api/lesson-attempt — the same path the app
// uses. The database trigger records the attempt row automatically.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const API = process.env.API_BASE || 'http://localhost:3000';

async function main() {
  const { SEED_EMAIL, SEED_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SEED_EMAIL || !SEED_PASSWORD) throw new Error('Set SEED_EMAIL and SEED_PASSWORD');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY missing from .env');

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: signed, error: signError } = await sb.auth.signInWithPassword({
    email: SEED_EMAIL, password: SEED_PASSWORD,
  });
  if (signError) throw signError;
  const getToken = async () => (await sb.auth.getSession()).data.session?.access_token;

  const { data: langs, error: langError } = await sb.from('user_languages')
    .select('language_code, level').eq('user_id', signed.user.id).order('created_at');
  if (langError) throw langError;
  if (!langs?.length) throw new Error('Account has no study languages — finish onboarding first');
  const lang = process.env.SEED_LANG || langs[0].language_code;
  const level = process.env.SEED_LEVEL
    || (langs.find((l) => l.language_code === lang) || {}).level
    || langs[0].level;

  let query = sb.from('lessons').select('id, domain_slug, topic, level, content')
    .eq('language_code', lang).limit(25);
  if (level) query = query.eq('level', level);
  let { data: lessons, error: lessonError } = await query;
  if (lessonError) throw lessonError;
  if (!lessons?.length) {
    ({ data: lessons } = await sb.from('lessons').select('id, domain_slug, topic, level, content')
      .eq('language_code', lang).limit(25));
  }
  const lesson = (lessons || []).find((l) => Array.isArray(l.content?.quiz) && l.content.quiz.length === 8
    && l.content.quiz.every((q) => Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3));
  if (!lesson) throw new Error(`No cached lesson with a valid quiz for ${lang}${level ? `/${level}` : ''} — open a lesson in the app first`);

  const answers = lesson.content.quiz.map((q) => q.answer);
  const res = await fetch(`${API}/api/lesson-attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
    body: JSON.stringify({ lessonId: lesson.id, attemptId: randomUUID(), answers }),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
  console.log(`Completed 100%: ${lang}/${lesson.level} ${lesson.domain_slug} › ${lesson.topic} — score ${result.score}/${result.total}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
