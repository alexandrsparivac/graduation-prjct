import { lessonCompletion } from './lesson-plan.js';

const storageKey = userId => `lessonDrafts:${userId}`;
const read = userId => {
  try { return JSON.parse(localStorage.getItem(storageKey(userId)) || '{}') || {}; }
  catch { return {}; }
};
const write = (userId, lessonId, draft) => {
  try {
    const drafts = read(userId);
    if (draft) drafts[lessonId] = draft;
    else delete drafts[lessonId];
    localStorage.setItem(storageKey(userId), JSON.stringify(drafts));
  } catch { /* The account copy still works when browser storage is unavailable. */ }
};
export const localLessonDrafts = userId => Object.entries(read(userId))
  .map(([lessonId, draft]) => ({ lessonId, ...draft }));

// JSONB may return object keys in a different order from the generated lesson.
const stableJson = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

export function contentVersion(content) {
  let hash = 2166136261;
  for (const char of stableJson(content)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}

export function restoreLessonDraft(draft, { content, flow, nativeLanguage }) {
  if (draft?.version !== 1 || draft.nativeLanguage !== nativeLanguage
    || draft.contentVersion !== contentVersion(content)
    || !Number.isInteger(draft.stepIdx) || draft.stepIdx < 1 || draft.stepIdx >= flow.length) return null;
  const state = { mcq: {}, gap: {}, deck: { i: 0, flipped: false, flippedCards: [] } };
  for (const step of flow) {
    const prefix = { rmcq: 'r', listen: 'l', quiz: 'q' }[step.kind];
    if (prefix) {
      const key = prefix + step.index;
      const answer = draft.state?.mcq?.[key];
      const options = (step.q || step.it).options;
      if (answer && (answer.selected === null || (Number.isInteger(answer.selected)
        && answer.selected >= 0 && answer.selected < options.length))) {
        state.mcq[key] = { selected: answer.selected, checked: answer.selected !== null && answer.checked === true };
      }
    }
    if (step.kind === 'gap') {
      const key = 'g' + step.index;
      const answer = draft.state?.gap?.[key];
      if (typeof answer?.value === 'string') state.gap[key] = {
        value: answer.value.slice(0, 1000), checked: answer.checked === true, ok: answer.ok === true,
      };
    }
  }
  const deck = draft.state?.deck;
  if (Number.isInteger(deck?.i) && deck.i >= 0 && deck.i < content.vocabulary.length) {
    const flippedCards = Array.isArray(deck.flippedCards)
      ? deck.flippedCards.filter(i => Number.isInteger(i) && i >= 0 && i < content.vocabulary.length)
      : [];
    if (deck.flipped === true) flippedCards.push(deck.i);
    state.deck = { i: deck.i, flipped: false, flippedCards: [...new Set(flippedCards)] };
  }
  return { stepIdx: draft.stepIdx, state };
}

const timestamp = value => Date.parse(value || '') || 0;

async function submitAttempt(sb, { lessonId, attemptId, answers }, fetchImpl) {
  const { data: { session }, error: sessionError } = await sb.auth.getSession();
  if (sessionError) throw Object.assign(new Error(sessionError.message), { code: sessionError.code });
  if (!session?.access_token) throw new Error('An authenticated session is required to save test results');
  const response = await fetchImpl('/api/lesson-attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ lessonId, attemptId, answers }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(result.error || 'Test result could not be saved'), { code: result.error });
  }
  return result;
}

export function draftCompletion(draft) {
  // Older drafts predate exercise counts; their lessons use the same 15-card format.
  const cards = draft.vocabularyCount || 15;
  const total = draft.progress?.total || Math.max(1, draft.totalSteps - 2 + cards - 1);
  const completed = draft.progress?.completed ?? (draft.stepIdx === 1 ? draft.state?.deck?.i || 0
    : Math.max(0, draft.stepIdx - 1) + (draft.stepIdx > 1 ? cards - 1 : 0));
  return { completed: Math.max(0, Math.min(total, completed)), total,
    percent: Math.max(0, Math.min(100, Math.round(completed / total * 100))) };
}

export function latestLessonDrafts(userId, progress = []) {
  const drafts = new Map(localLessonDrafts(userId).map(draft => [draft.lessonId, draft]));
  for (const row of progress) {
    const local = drafts.get(row.lesson_id);
    if (timestamp(local?.updatedAt) > timestamp(row.resume_updated_at)) continue;
    if (row.resume_state) drafts.set(row.lesson_id, { lessonId: row.lesson_id, ...row.resume_state });
    else drafts.delete(row.lesson_id);
  }
  return [...drafts.values()].filter(d => d.version === 1 && d.stepIdx > 0 && d.stepIdx < d.totalSteps)
    .sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
}

export function createLessonResume(sb, {
  userId, lessonId, nativeLanguage, content, flow, params, delay = 600,
  fetchImpl = fetch, attemptSubmit = null,
}) {
  const version = contentVersion(content);
  let timer = null;
  let pending = null;
  let queue = Promise.resolve();
  let finished = false;
  let attemptId = crypto.randomUUID();
  const enqueue = row => {
    queue = queue.catch(() => {}).then(async () => {
      const { error } = await sb.from('user_progress').upsert({ user_id: userId, lesson_id: lessonId, ...row },
        { onConflict: 'user_id,lesson_id' });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
    });
    // Saving in the background must never interrupt an exercise.
    queue.catch(err => console.warn('Lesson position was not synced:', err.message));
    return queue;
  };
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    if (pending) {
      const draft = pending;
      return enqueue({ resume_state: draft, resume_updated_at: draft.updatedAt }).then(() => {
        if (pending === draft) pending = null;
      });
    }
    return queue;
  };
  return {
    async load() {
      const local = read(userId)[lessonId];
      const { data: remote, error } = await sb.from('user_progress').select('resume_state, resume_updated_at')
        .eq('user_id', userId).eq('lesson_id', lessonId).maybeSingle();
      if (error) console.warn('Lesson position was loaded from this browser:', error.message);
      const draft = !error && timestamp(remote?.resume_updated_at) >= timestamp(local?.updatedAt)
        ? remote?.resume_state : local;
      const restored = restoreLessonDraft(draft, { content, flow, nativeLanguage });
      if (restored && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(draft.attemptId || '')) {
        attemptId = draft.attemptId;
      }
      if (!restored) write(userId, lessonId, null);
      return restored;
    },
    checkpoint(stepIdx, state) {
      if (finished || stepIdx === 0) return;
      const draft = { version: 1, attemptId, contentVersion: version, nativeLanguage, params,
        stepIdx, totalSteps: flow.length, vocabularyCount: content.vocabulary.length,
        progress: lessonCompletion(flow, stepIdx, state, content.vocabulary.length),
        state: JSON.parse(JSON.stringify(state)), updatedAt: new Date().toISOString() };
      write(userId, lessonId, draft);
      pending = draft;
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
    async complete(answers) {
      finished = true;
      try {
        await flush();
        const result = attemptSubmit
          ? await attemptSubmit({ lessonId, attemptId, answers })
          : await submitAttempt(sb, { lessonId, attemptId, answers }, fetchImpl);
        write(userId, lessonId, null);
        return result;
      } catch (error) {
        finished = false;
        throw error;
      }
    },
    async discard() {
      finished = true;
      clearTimeout(timer);
      pending = null;
      write(userId, lessonId, null);
      await enqueue({ resume_state: null, resume_updated_at: new Date().toISOString() }).catch(() => {});
    },
  };
}
