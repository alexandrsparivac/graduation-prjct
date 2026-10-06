/**
 * Everything the dashboard computes from raw Supabase rows.
 *
 * Kept free of the DOM so it can be tested in Node: the page passes rows in and
 * gets plain numbers and arrays back. Every function that depends on "today"
 * takes `now` explicitly rather than reading the clock, so a test can pin it.
 *
 * All day arithmetic is LOCAL, not UTC. A streak is about the learner's own
 * days; a lesson finished at 23:30 belongs to that evening, not to tomorrow.
 */

export const PASS = 0.7;

// A level has to be worked for. Finishing the handful of topics you happened to
// pick is not enough, so promotion also needs this many finished lessons; if
// you have fewer topics than that, the dashboard asks you to add some.
export const LESSONS_PER_LEVEL = 20;
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// A completed lesson always carries exactly this much material — the generator
// contract in lib/lesson-prompt.js enforces it — so "words met" is countable
// without fetching the lesson bodies themselves.
export const VOCAB_PER_LESSON = 15;
export const PHRASES_PER_LESSON = 8;

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(date) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Midnight local time, `n` days before `from`. */
export function addDays(from, n) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

const completedRows = progress =>
  (progress || []).filter(p => p.completed && p.completed_at);

/** The set of local days on which at least one lesson was finished. */
export function activeDays(progress) {
  return new Set(completedRows(progress).map(p => dayKey(p.completed_at)));
}

/**
 * Consecutive days up to today with at least one finished lesson.
 * Yesterday still counts: the streak only breaks once a full day is missed,
 * otherwise the number would drop to zero every morning.
 */
export function currentStreak(progress, now = new Date()) {
  const days = activeDays(progress);
  if (!days.size) return 0;
  let cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** The longest run of consecutive active days ever recorded. */
export function longestStreak(progress) {
  const days = [...activeDays(progress)].sort();
  if (!days.length) return 0;
  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = addDays(new Date(days[i] + 'T00:00:00'), -1);
    run = dayKey(prev) === days[i - 1] ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** Whole days since the last finished lesson; null when there is none. */
export function daysSinceLast(progress, now = new Date()) {
  const rows = completedRows(progress);
  if (!rows.length) return null;
  const last = rows.reduce((a, b) => (new Date(a.completed_at) > new Date(b.completed_at) ? a : b));
  const from = addDays(new Date(last.completed_at), 0);
  const to = addDays(now, 0);
  return Math.round((to - from) / 86400000);
}

/**
 * A calendar grid for the activity heatmap: `weeks` columns of 7 days, ending
 * on the week that contains today. Monday-first, which is what a Romanian
 * calendar looks like.
 */
export function activityGrid(progress, now = new Date(), weeks = 16) {
  const counts = new Map();
  for (const p of completedRows(progress)) {
    const k = dayKey(p.completed_at);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  // Walk back to the Monday of the current week, then back `weeks - 1` more.
  const today = addDays(now, 0);
  const isoDow = (today.getDay() + 6) % 7; // 0 = Monday
  const lastMonday = addDays(today, -isoDow);
  const start = addDays(lastMonday, -(weeks - 1) * 7);

  const cells = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const key = dayKey(date);
      col.push({
        date,
        key,
        count: counts.get(key) || 0,
        future: date > today,
      });
    }
    cells.push(col);
  }
  return cells;
}

/** Mean accuracy 0..1 over rows that actually have a score. Null when none do. */
export function meanAccuracy(rows) {
  const scored = (rows || []).filter(p => p && p.total);
  if (!scored.length) return null;
  return scored.reduce((s, p) => s + p.score / p.total, 0) / scored.length;
}

/**
 * Finished lessons per week over the last `weeks` weeks — the honest version of
 * "your pace", averaged only over weeks that have actually elapsed since the
 * first lesson, so a new account does not read as slow.
 */
export function pacePerWeek(progress, now = new Date(), weeks = 4) {
  const rows = completedRows(progress);
  if (!rows.length) return 0;
  const first = rows.reduce((a, b) => (new Date(a.completed_at) < new Date(b.completed_at) ? a : b));
  const spanDays = Math.max(1, Math.round((addDays(now, 0) - addDays(new Date(first.completed_at), 0)) / 86400000) + 1);
  const windowDays = Math.min(spanDays, weeks * 7);
  const since = addDays(now, -(windowDays - 1));
  const inWindow = rows.filter(p => new Date(p.completed_at) >= since).length;
  return inWindow / (windowDays / 7);
}

/** How many distinct vocabulary items and phrases the finished lessons carried. */
export function materialMet(completedCount) {
  return {
    words: completedCount * VOCAB_PER_LESSON,
    phrases: completedCount * PHRASES_PER_LESSON,
  };
}

/**
 * Which hour band the learner actually works in. Returns null below `minRows`,
 * because calling three lessons a "habit" would be a lie.
 */
export function favouriteSlot(progress, minRows = 5) {
  const rows = completedRows(progress);
  if (rows.length < minRows) return null;
  const bands = { morning: 0, day: 0, evening: 0, night: 0 };
  for (const p of rows) {
    const h = new Date(p.completed_at).getHours();
    if (h < 6) bands.night++;
    else if (h < 12) bands.morning++;
    else if (h < 18) bands.day++;
    else bands.evening++;
  }
  const [name, n] = Object.entries(bands).sort((a, b) => b[1] - a[1])[0];
  return { slot: name, share: n / rows.length };
}

/**
 * Per-domain roll-up: how many of the chosen topics are done, the mean score,
 * and which topics fell under the pass mark. Sorted worst-accuracy first so the
 * caller can show a ranking without re-sorting.
 *
 * `userDomains` are user_domains rows, `progressOf(domainSlug, topic)` returns
 * the user_progress row for a topic, or undefined.
 */
export function domainRollup(userDomains, progressOf, domainName = s => s) {
  const rows = (userDomains || []).map(d => {
    const topics = d.topics || [];
    const entries = topics.map(topic => ({ topic, p: progressOf(d.domain_slug, topic) }));
    const done = entries.filter(e => e.p?.completed);
    const scored = done.map(e => e.p).filter(p => p.total);
    const weak = done.filter(e => e.p.total && e.p.score / e.p.total < PASS).map(e => e.topic);
    return {
      slug: d.domain_slug,
      name: domainName(d.domain_slug),
      total: topics.length,
      done: done.length,
      accuracy: meanAccuracy(scored),
      weak,
    };
  });
  // Domains with no score yet sort last: there is nothing to rank them by.
  return rows.sort((a, b) => {
    if (a.accuracy === null && b.accuracy === null) return b.done - a.done;
    if (a.accuracy === null) return 1;
    if (b.accuracy === null) return -1;
    return a.accuracy - b.accuracy;
  });
}

/** Finished lessons, most recent first. */
export function recentlyCompleted(progress, limit = 5) {
  return completedRows(progress)
    .slice()
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
    .slice(0, limit);
}

/**
 * What still stands between the learner and the next CEFR level.
 * Mirrors the rule in the try_promote SQL function so the page never promises
 * a promotion the database would refuse.
 */
export function promotionState({ level, doneCount, totalTopics, accuracy, weakCount }) {
  const idx = LEVELS.indexOf(level);
  const next = LEVELS[idx + 1] || null;
  const required = Math.max(LESSONS_PER_LEVEL, totalTopics);
  const lessonsLeft = Math.max(0, required - doneCount);
  const accuracyOk = accuracy !== null && accuracy >= PASS;
  // You cannot finish more lessons than you have topics, so too few topics is
  // its own blocker rather than a target that never comes closer.
  const needMoreTopics = totalTopics < LESSONS_PER_LEVEL;
  const ready = !!next && totalTopics > 0 && lessonsLeft === 0 && accuracyOk;
  return {
    next,
    ready,
    required,
    lessonsLeft,
    accuracyOk,
    needMoreTopics,
    topicsShort: Math.max(0, LESSONS_PER_LEVEL - totalTopics),
    weakCount,
    // Progress toward promotion, not merely toward finishing: a learner who has
    // done everything but sits under the pass mark is not at 100%.
    percent: required ? Math.round((doneCount / required) * 100) : 0,
  };
}
