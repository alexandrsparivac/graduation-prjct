import test from 'node:test';
import assert from 'node:assert/strict';
import { contentVersion, restoreLessonDraft, latestLessonDrafts, createLessonResume, localLessonDrafts, draftCompletion } from '../public/js/lesson-resume.js';
import { buildFlow } from '../public/js/lesson-plan.js';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
const question = { question: 'Question?', options: ['a', 'b', 'c', 'd'], answer: 2 };
const content = {
  title: 'A lesson', vocabulary: [{ term: 'one' }, { term: 'two' }],
  reading: { questions: [question] }, grammar: { practice: [{ sentence: '___', answer: 'yes' }] },
  listening: [question], speaking: [{ text: 'hello' }], quiz: [question],
};
const flow = buildFlow(content);
const params = { lang: 'de', domain: 'it', topic: 'Interviu tehnic', level: 'A1' };
const state = { mcq: { r0: { selected: 2, checked: true }, q0: { selected: 1, checked: false } },
  gap: { g0: { value: 'yes', checked: true, ok: true } }, deck: { i: 1, flipped: true } };
const draft = (changes = {}) => ({ version: 1, contentVersion: contentVersion(content), nativeLanguage: 'ro',
  params, stepIdx: 5, totalSteps: flow.length, state, updatedAt: '2026-10-06T12:00:00Z', ...changes });
const options = { userId: 'learner', lessonId: 'lesson', nativeLanguage: 'ro', content, flow, params, delay: 60_000 };

function client(remote = null, handler = null) {
  const rows = [];
  return { rows, from(table) {
    assert.equal(table, 'user_progress');
    const q = {
      select() { return q; }, eq() { return q; }, maybeSingle: async () => ({ data: remote, error: null }),
      upsert(row) { rows.push(row); return handler ? handler(row, rows.length) : Promise.resolve({ error: null }); },
    };
    return q;
  } };
}

test('restores position, vocabulary card, checked answers and unfinished quiz selection', () => {
  assert.deepEqual(restoreLessonDraft(draft(), { content, flow, nativeLanguage: 'ro' }), {
    stepIdx: 5,
    state: { ...state, deck: { i: 1, flipped: false, flippedCards: [1] } }
  });
  assert.equal(contentVersion(content), contentVersion({ quiz: content.quiz, ...content, title: 'A lesson' }));
  const reversed = Object.fromEntries(Object.entries(content).reverse());
  assert.equal(contentVersion(content), contentVersion(reversed));
});

test('resume bars include vocabulary progress in older drafts and exact counts in new drafts', () => {
  assert.equal(draftCompletion({ stepIdx: 1, totalSteps: 34, state: { deck: { i: 7 } } }).percent, 15);
  assert.equal(draftCompletion({ stepIdx: 9, totalSteps: 34 }).percent, 48);
  assert.equal(draftCompletion({ progress: { completed: 23, total: 46 } }).percent, 50);
  assert.equal(draftCompletion({ progress: { completed: 90, total: 46 } }).percent, 100);
});

test('regenerated content, a different base language and malformed positions cannot reuse answers', () => {
  for (const d of [draft({ stepIdx: -1 }), draft({ stepIdx: flow.length }), draft({ stepIdx: 1.5 }),
    draft({ nativeLanguage: 'ru' }), draft({ contentVersion: 'old' }), draft({ version: 0 })]) {
    assert.equal(restoreLessonDraft(d, { content, flow, nativeLanguage: 'ro' }), null);
  }
  assert.equal(restoreLessonDraft(draft(), { content: { ...content, title: 'New lesson' }, flow, nativeLanguage: 'ro' }), null);
  const restored = restoreLessonDraft(draft({ state: { mcq: { r0: { selected: 99, checked: true } }, deck: { i: -5 } } }),
    { content, flow, nativeLanguage: 'ro' });
  assert.deepEqual(restored.state, { mcq: {}, gap: {}, deck: { i: 0, flipped: false, flippedCards: [] } });
});

test('restores only valid flipped vocabulary card indices', () => {
  const restored = restoreLessonDraft(draft({ state: { deck: {
    i: 0, flippedCards: [1, 1, -1, 9, '2']
  } } }), { content, flow, nativeLanguage: 'ro' });
  assert.deepEqual(restored.state.deck, { i: 0, flipped: false, flippedCards: [1] });
});

test('local checkpoints are immediate, account-isolated and newer than a delayed network copy', async () => {
  storage.clear();
  const sb = client({ resume_state: draft({ stepIdx: 2 }), resume_updated_at: '2020-01-01T00:00:00Z' });
  const store = createLessonResume(sb, options);
  store.checkpoint(5, state);
  assert.equal(localLessonDrafts('learner')[0].stepIdx, 5);
  assert.equal(localLessonDrafts('someone-else').length, 0);
  assert.equal((await store.load()).stepIdx, 5);
  await store.flush();
  assert.equal(sb.rows[0].resume_state.state.deck.i, 1);
  assert.equal('completed' in sb.rows[0], false, 'saving a repeat attempt preserves existing completion');
  assert.equal('score' in sb.rows[0], false);
});

test('a different device restores the account draft and a completed account copy removes a stale local one', async () => {
  storage.clear();
  const sb = client({ resume_state: draft(), resume_updated_at: draft().updatedAt });
  assert.equal((await createLessonResume(sb, options).load()).stepIdx, 5);
  storage.set('lessonDrafts:learner', JSON.stringify({ lesson: draft() }));
  const finished = client({ resume_state: null, resume_updated_at: '2026-10-07T00:00:00Z' });
  assert.equal(await createLessonResume(finished, options).load(), null);
  assert.deepEqual(localLessonDrafts('learner'), []);
});

test('writes keep click order and final completion cannot be overwritten by a pending draft', async () => {
  storage.clear();
  let release;
  const sb = client(null, (_row, count) => count === 1
    ? new Promise(resolve => { release = () => resolve({ error: null }); }) : Promise.resolve({ error: null }));
  const submissions = [];
  const store = createLessonResume(sb, { ...options, attemptSubmit: async result => {
    submissions.push(result);
    return { score: 1, total: 8 };
  } });
  store.checkpoint(2, state);
  const first = store.flush();
  await new Promise(resolve => setImmediate(resolve));
  store.checkpoint(5, state);
  const completed = store.complete(Array(8).fill(2));
  store.checkpoint(6, state);
  release();
  await first;
  assert.deepEqual(await completed, { score: 1, total: 8 });
  assert.deepEqual(sb.rows.map(row => row.resume_state.stepIdx), [2, 5]);
  assert.equal(submissions.length, 1);
  assert.deepEqual(submissions[0].answers, Array(8).fill(2));
  assert.equal(submissions[0].lessonId, options.lessonId);
  assert.deepEqual(localLessonDrafts('learner'), []);
  assert.equal('score' in sb.rows.at(-1), false, 'the browser may save drafts but not test scores');
});

test('offline syncing keeps the last position for retry, including a failed completion', async () => {
  storage.clear();
  let offline = true;
  const sb = client(null, () => Promise.resolve({ error: offline ? { message: 'Offline' } : null }));
  const store = createLessonResume(sb, { ...options, attemptSubmit: async () => ({ score: 1, total: 8 }) });
  store.checkpoint(flow.length - 1, state);
  await assert.rejects(store.complete(Array(8).fill(2)), /Offline/);
  assert.equal(localLessonDrafts('learner')[0].stepIdx, flow.length - 1);
  offline = false;
  await store.complete(Array(8).fill(2));
  assert.deepEqual(localLessonDrafts('learner'), []);
});

test('a missing server-side scoring migration fails closed and does not store client-supplied scores', async () => {
  storage.clear();
  const sb = client();
  const store = createLessonResume(sb, { ...options, attemptSubmit: async () => {
    throw new Error('submit_lesson_attempt function does not exist');
  } });
  store.checkpoint(flow.length - 1, state);
  await assert.rejects(store.complete(Array(8).fill(2)), /does not exist/);
  assert.equal(sb.rows[0].resume_state.stepIdx, flow.length - 1);
  assert.equal(sb.rows.some(row => row.completed || 'score' in row), false);
  assert.equal(localLessonDrafts('learner').length, 1);
});

test('the dashboard resumes the latest unfinished lesson and respects remote completion tombstones', () => {
  storage.clear();
  storage.set('lessonDrafts:learner', JSON.stringify({ first: draft(), second: draft({ updatedAt: '2026-10-06T13:00:00Z' }) }));
  assert.deepEqual(latestLessonDrafts('learner').map(d => d.lessonId), ['second', 'first']);
  const rows = [{ lesson_id: 'second', resume_state: null, resume_updated_at: '2026-10-06T14:00:00Z' },
    { lesson_id: 'third', resume_state: draft({ updatedAt: '2026-10-06T15:00:00Z' }), resume_updated_at: '2026-10-06T15:00:00Z' }];
  assert.deepEqual(latestLessonDrafts('learner', rows).map(d => d.lessonId), ['third', 'first']);
});

test('regenerating clears only the unfinished state and leaves past scores alone', async () => {
  storage.clear();
  const sb = client();
  const store = createLessonResume(sb, options);
  store.checkpoint(5, state);
  await store.discard();
  assert.equal(sb.rows.length, 1);
  assert.equal(sb.rows[0].resume_state, null);
  assert.equal('completed' in sb.rows[0], false);
  assert.equal('score' in sb.rows[0], false);
  assert.deepEqual(localLessonDrafts('learner'), []);
});

test('all base languages have a translated resume action', async () => {
  const { UI_LANGS } = await import('../public/js/i18n.js');
  for (const { code } of UI_LANGS) {
    const strings = (await import(`../public/js/i18n/${code}.js`)).default;
    assert.ok(strings['dash.resume']?.trim(), code);
  }
});
