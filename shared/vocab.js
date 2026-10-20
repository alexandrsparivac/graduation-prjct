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
import { fetchAllRows } from './paginated-query.js';

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
  const base = columns => sb.from('user_vocabulary')
    .select(columns, { count: 'exact' })
    .eq('user_id', userId)
    .eq('language_code', language)
    .order('term', { ascending: true });
  try {
    const query = base('term, translation, kind, example, domain_slug, topic, ease, interval_days, reps, lapses, due_on, last_review_on, is_saved');
    return { cards: await fetchAllRows(query), ready: true };
  } catch (error) {
    if (isMissingTable(error)) return { cards: [], ready: false };
    // Keep older deployments usable until migration 020 is applied.
    if (isMissingSavedColumn(error)) {
      const query = base('term, translation, kind, example, domain_slug, topic, ease, interval_days, reps, lapses, due_on, last_review_on');
      return { cards: (await fetchAllRows(query)).map(card => ({ ...card, is_saved: false })), ready: true };
    }
    throw error;
  }
}

const isMissingSavedColumn = error => error?.code === '42703'
  || error?.code === 'PGRST204'
  || /is_saved/i.test(error?.message || '');

/** Save a lesson word immediately without changing an existing SRS schedule. */
export async function saveMarkedWord(sb, { userId, language, domain, topic, word }) {
  const { data: existing, error: lookupError } = await sb.from('user_vocabulary')
    .select('term').eq('user_id', userId).eq('language_code', language).eq('term', word.term).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    const { error } = await sb.from('user_vocabulary').update({ is_saved: true })
      .eq('user_id', userId).eq('language_code', language).eq('term', word.term);
    if (error) throw error;
    return;
  }
  const row = newCard({ term: word.term, translation: word.translation, kind: 'word', example: word.example || null, domain, topic });
  const { error } = await sb.from('user_vocabulary').insert({ ...row, user_id: userId, language_code: language, is_saved: true });
  if (error) throw error;
}

/** Toggle the independent saved flag; unsaving never removes a review card. */
export async function setCardSaved(sb, { userId, language, term, saved }) {
  const { error } = await sb.from('user_vocabulary').update({ is_saved: !!saved })
    .eq('user_id', userId).eq('language_code', language).eq('term', term);
  if (error) throw error;
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
