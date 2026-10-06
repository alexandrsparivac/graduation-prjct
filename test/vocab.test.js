import test from 'node:test';
import assert from 'node:assert/strict';
import { saveLessonVocabulary, loadCards, gradeCard, isMissingTable } from '../public/js/vocab.js';
import { START_EASE, GOOD, AGAIN } from '../public/js/srs.js';

const TODAY = new Date(2026, 8, 10, 12, 0, 0);

/** A Supabase stand-in that records what it was asked to do. */
function stubClient({ upsertError = null, selectError = null, rows = [], updateError = null } = {}) {
  const calls = { upsert: null, update: null, filters: [] };
  const api = {
    upsert(payload, options) { calls.upsert = { payload, options }; return Promise.resolve({ error: upsertError }); },
    select() { return { eq(col, val) { calls.filters.push([col, val]); return this; }, then(res) { return Promise.resolve({ data: rows, error: selectError }).then(res); } }; },
    update(patch) { calls.update = patch; return { eq(col, val) { calls.filters.push([col, val]); return this; }, then(res) { return Promise.resolve({ error: updateError }).then(res); } }; },
  };
  return { from: () => api, calls };
}

const LESSON = {
  vocabulary: [
    { term: 'der Vertrag', translation: 'contract', partOfSpeech: 'noun', example: 'Der Vertrag gilt.', exampleTranslation: '...' },
    { term: '', translation: 'missing term', example: 'x' },
  ],
  phrases: [{ phrase: 'in Kraft treten', translation: 'to come into force', usage: 'formal' }],
};

test('a finished lesson stores its words and phrases, tagged and dated', async () => {
  const sb = stubClient();
  const out = await saveLessonVocabulary(sb, {
    userId: 'u1', language: 'de', domain: 'legal', topic: 'Contracte', content: LESSON,
  }, TODAY);

  assert.equal(out.added, 2);           // the blank term is dropped
  assert.equal(out.skipped, false);

  const rows = sb.calls.upsert.payload;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.kind), ['word', 'phrase']);
  assert.equal(rows[0].term, 'der Vertrag');
  assert.equal(rows[0].example, 'Der Vertrag gilt.');
  assert.equal(rows[1].term, 'in Kraft treten');
  for (const r of rows) {
    assert.equal(r.user_id, 'u1');
    assert.equal(r.language_code, 'de');
    assert.equal(r.domain_slug, 'legal');
    assert.equal(r.topic, 'Contracte');
    assert.equal(r.ease, START_EASE);
    assert.equal(r.due_on, '2026-09-11');  // tomorrow, not today
  }
});

test('redoing a lesson must not reset a word you have been carrying', async () => {
  const sb = stubClient();
  await saveLessonVocabulary(sb, { userId: 'u1', language: 'de', domain: 'legal', topic: 'x', content: LESSON }, TODAY);
  assert.deepEqual(sb.calls.upsert.options, { onConflict: 'user_id,language_code,term', ignoreDuplicates: true });
});

test('an empty lesson body writes nothing at all', async () => {
  const sb = stubClient();
  assert.deepEqual(await saveLessonVocabulary(sb, { userId: 'u1', language: 'de', content: {} }, TODAY), { added: 0, skipped: false });
  assert.equal(sb.calls.upsert, null);
});

test('a missing table is reported, not thrown, so a finished lesson still counts', async () => {
  const sb = stubClient({ upsertError: { code: '42P01', message: 'relation does not exist' } });
  assert.deepEqual(
    await saveLessonVocabulary(sb, { userId: 'u1', language: 'de', content: LESSON }, TODAY),
    { added: 0, skipped: true });
  assert.ok(isMissingTable({ code: '42P01' }));
  assert.ok(!isMissingTable({ code: '23505' }));
});

test('any other write failure is surfaced', async () => {
  const sb = stubClient({ upsertError: { code: '23505', message: 'duplicate' } });
  await assert.rejects(() => saveLessonVocabulary(sb, { userId: 'u1', language: 'de', content: LESSON }, TODAY));
});

test('loading returns the deck, or an empty one flagged not-ready', async () => {
  const cards = [{ term: 'a', due_on: '2026-09-01' }];
  assert.deepEqual(await loadCards(stubClient({ rows: cards }), { userId: 'u1', language: 'de' }), { cards, ready: true });

  const notMigrated = stubClient({ selectError: { code: '42P01' }, rows: null });
  assert.deepEqual(await loadCards(notMigrated, { userId: 'u1', language: 'de' }), { cards: [], ready: false });
});

test('grading writes back exactly the fields SM-2 produced, for that one row', async () => {
  const sb = stubClient();
  const card = { term: 'der Vertrag', ease: START_EASE, interval_days: 0, reps: 0, lapses: 0 };
  const patch = await gradeCard(sb, { userId: 'u1', language: 'de', card, quality: GOOD }, TODAY);

  assert.deepEqual(Object.keys(patch).sort(), ['due_on', 'ease', 'interval_days', 'lapses', 'last_review_on', 'reps']);
  assert.equal(patch.interval_days, 1);
  assert.equal(patch.last_review_on, '2026-09-10');
  assert.deepEqual(sb.calls.update, patch);
  // Scoped to the user, the language and the term -- never a blanket update.
  assert.deepEqual(sb.calls.filters, [['user_id', 'u1'], ['language_code', 'de'], ['term', 'der Vertrag']]);
});

test('a failed grade write is raised so the page can say the answer was lost', async () => {
  const sb = stubClient({ updateError: { code: '500', message: 'boom' } });
  await assert.rejects(() => gradeCard(sb, { userId: 'u1', language: 'de', card: { term: 'a' }, quality: AGAIN }, TODAY));
});
