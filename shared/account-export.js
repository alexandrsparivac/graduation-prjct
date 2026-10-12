import { fetchAllRows } from './paginated-query.js';

/** Personal account tables only; shared lesson content and credentials are excluded. */
export const OWNED_TABLES = [
  ['profiles', 'id', 'id, full_name, avatar_url, native_language, onboarding_done, created_at', 'id'],
  ['user_languages', 'user_id', 'language_code, level, created_at', 'language_code'],
  ['user_domains', 'user_id', 'language_code, domain_slug, topics, created_at', 'language_code', 'domain_slug'],
  ['user_progress', 'user_id', 'lesson_id, completed, score, total, completed_at', 'lesson_id'],
  ['lesson_attempts', 'user_id', 'sequence, attempt_id, lesson_id, language_code, level, score, total, completed_at', 'sequence'],
  ['user_vocabulary', 'user_id', 'language_code, term, translation, kind, example, domain_slug, topic, ease, interval_days, reps, lapses, due_on, last_review_on, created_at', 'language_code', 'term'],
];

/** Everything the account holds, as one paginated JSON export. */
export async function buildAccountExport(sb, user) {
  const out = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, created_at: user.created_at },
    data: {},
  };
  for (const [table, column, columns, ...orderBy] of OWNED_TABLES) {
    try {
      let query = sb.from(table).select(columns, { count: 'exact' }).eq(column, user.id);
      for (const key of orderBy) query = query.order(key, { ascending: true });
      out.data[table] = await fetchAllRows(query);
    } catch (error) {
      out.data[table] = { unavailable: error.message };
    }
  }
  return out;
}
