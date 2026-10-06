/**
 * The vocabulary store: everything that talks to public.user_vocabulary.
 *
 * The scheduling rules live in srs.js and know nothing about the database; this
 * module is the other half -- it knows about rows and nothing about SM-2 beyond
 * handing its output straight through.
 *
 * Every call here degrades rather than throws. The table arrives in migration
 * 005, and an app whose dashboard breaks because one migration has not been run
 * yet is worse than one that quietly shows no vocabulary.
 */

import { newCard, schedule } from './srs.js';

/** Postgres error for "relation does not exist" -- migration 005 not run yet. */
const MISSING_TABLE = '42P01';

export const isMissingTable = error => error?.code === MISSING_TABLE;

/**
 * Store the words and phrases a finished lesson taught.
 *
 * Words already in the deck keep their schedule: redoing a lesson must not
 * reset a word you have been carrying for a month back to day one, so the
 * insert ignores conflicts instead of overwriting.
 *
 * @returns {Promise<{added: number, skipped: boolean}>}
 */
export async function saveLessonVocabulary(sb, { userId, language, domain, topic, content }, today = new Date()) {
  const words = (content?.vocabulary || []).map(v => newCard({
    term: v.term, translation: v.translation, kind: 'word',
    example: v.example || null, domain, topic,
  }, today));
  const phrases = (content?.phrases || []).map(p => newCard({
    term: p.phrase, translation: p.translation, kind: 'phrase',
    example: p.usage || null, domain, topic,
  }, today));

  const rows = [...words, ...phrases]
    .filter(c => c.term && c.translation)
    .map(c => ({ ...c, user_id: userId, language_code: language }));
  if (!rows.length) return { added: 0, skipped: false };

  const { error } = await sb.from('user_vocabulary')
    .upsert(rows, { onConflict: 'user_id,language_code,term', ignoreDuplicates: true });

  if (error) {
    if (isMissingTable(error)) return { added: 0, skipped: true };
    throw error;
  }
  return { added: rows.length, skipped: false };
}

/** Every card the learner holds in one language. */
export async function loadCards(sb, { userId, language }) {
  const { data, error } = await sb.from('user_vocabulary')
    .select('term, translation, kind, example, domain_slug, topic, ease, interval_days, reps, lapses, due_on, last_review_on')
    .eq('user_id', userId)
    .eq('language_code', language);

  if (error) {
    if (isMissingTable(error)) return { cards: [], ready: false };
    throw error;
  }
  return { cards: data || [], ready: true };
}

/** Apply one grade and write the new schedule back. Returns what was stored. */
export async function gradeCard(sb, { userId, language, card, quality }, today = new Date()) {
  const next = schedule(card, quality, today);
  const { error } = await sb.from('user_vocabulary')
    .update(next)
    .eq('user_id', userId)
    .eq('language_code', language)
    .eq('term', card.term);
  if (error) throw error;
  return next;
}
