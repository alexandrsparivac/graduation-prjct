import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dayKey, addDays, currentStreak, longestStreak, daysSinceLast, activityGrid,
  meanAccuracy, pacePerWeek, materialMet, favouriteSlot,
  domainRollup, recentlyCompleted, promotionState, PASS
} from '../public/js/dash-stats.js';

// A fixed "today" so none of these tests depend on when they are run.
const NOW = new Date(2026, 8, 27, 14, 0, 0); // 27 Sep 2026, a Sunday, 14:00 local

/** A finished lesson `daysAgo` days before NOW, at `hour` local time. */
const done = (daysAgo, score = 8, total = 8, hour = 12) => {
  const d = addDays(NOW, -daysAgo);
  d.setHours(hour, 0, 0, 0);
  return { lesson_id: `l${daysAgo}-${hour}`, completed: true, score, total, completed_at: d.toISOString() };
};

test('a lesson finished late at night counts for that evening, not the next day', () => {
  const late = addDays(NOW, 0);
  late.setHours(23, 45, 0, 0);
  assert.equal(dayKey(late), dayKey(NOW));
});

test('the streak survives until a whole day is missed', () => {
  // Nothing today, but yesterday and the day before: the streak is still alive.
  assert.equal(currentStreak([done(1), done(2), done(3)], NOW), 3);
  // Two days of silence breaks it.
  assert.equal(currentStreak([done(2), done(3)], NOW), 0);
  // Today alone is a streak of one.
  assert.equal(currentStreak([done(0)], NOW), 1);
  assert.equal(currentStreak([], NOW), 0);
});

test('several lessons on one day do not inflate the streak', () => {
  const rows = [done(0, 8, 8, 9), done(0, 6, 8, 18), done(1)];
  assert.equal(currentStreak(rows, NOW), 2);
});

test('the longest streak is found even when it is not the current one', () => {
  // A five-day run three weeks ago, then a two-day run now.
  const old = [10, 11, 12, 13, 14].map(d => done(d));
  const recent = [done(0), done(1)];
  assert.equal(longestStreak([...old, ...recent]), 5);
  assert.equal(currentStreak([...old, ...recent], NOW), 2);
});

test('unfinished rows are ignored everywhere', () => {
  const rows = [
    { lesson_id: 'x', completed: false, score: null, total: null, completed_at: null },
    done(0),
  ];
  assert.equal(currentStreak(rows, NOW), 1);
  assert.equal(recentlyCompleted(rows).length, 1);
});

test('days since the last lesson', () => {
  assert.equal(daysSinceLast([done(0)], NOW), 0);
  assert.equal(daysSinceLast([done(3), done(9)], NOW), 3);
  assert.equal(daysSinceLast([], NOW), null);
});

test('the activity grid is 7 rows per week, Monday first, and marks the future', () => {
  const grid = activityGrid([done(0), done(0), done(8)], NOW, 16);
  assert.equal(grid.length, 16);
  assert.ok(grid.every(col => col.length === 7));

  // Every column starts on a Monday.
  assert.ok(grid.every(col => col[0].date.getDay() === 1));

  const flat = grid.flat();
  const today = flat.find(c => c.key === dayKey(NOW));
  assert.equal(today.count, 2, 'two lessons today land in one cell');
  assert.equal(today.future, false);

  const eightDaysAgo = flat.find(c => c.key === dayKey(addDays(NOW, -8)));
  assert.equal(eightDaysAgo.count, 1);

  // NOW is a Sunday, so its week has no future days; the grid should still
  // never mark a past day as future.
  assert.equal(flat.filter(c => c.future).length, 0);
  assert.ok(flat.every(c => !c.future || c.count === 0));
});

test('the activity grid leaves room for the rest of the week mid-week', () => {
  const wednesday = new Date(2026, 8, 23, 10, 0, 0);
  const grid = activityGrid([], wednesday, 4);
  const future = grid.flat().filter(c => c.future);
  assert.equal(future.length, 4, 'Thursday to Sunday are still ahead');
});

test('mean accuracy ignores unscored rows and reports null when there are none', () => {
  assert.equal(meanAccuracy([{ score: 8, total: 8 }, { score: 4, total: 8 }]), 0.75);
  assert.equal(meanAccuracy([{ score: null, total: null }]), null);
  assert.equal(meanAccuracy([]), null);
});

test('pace does not punish an account that is only days old', () => {
  // Three lessons, all today, on a brand-new account: that is a fast week so
  // far, not 0.75 lessons/week.
  const pace = pacePerWeek([done(0, 8, 8, 9), done(0, 8, 8, 12), done(0, 8, 8, 20)], NOW);
  assert.ok(pace >= 3, `expected at least 3 lessons/week, got ${pace}`);

  // Four lessons spread over four weeks reads as about one per week.
  const spread = pacePerWeek([done(0), done(7), done(14), done(21)], NOW);
  assert.ok(spread > 0.8 && spread < 1.3, `expected ~1/week, got ${spread}`);

  assert.equal(pacePerWeek([], NOW), 0);
});

test('material met follows the generator contract', () => {
  assert.deepEqual(materialMet(4), { words: 60, phrases: 32 });
  assert.deepEqual(materialMet(0), { words: 0, phrases: 0 });
});

test('a habit is only claimed once there is enough evidence', () => {
  assert.equal(favouriteSlot([done(0, 8, 8, 20), done(1, 8, 8, 21)]), null, 'two lessons is not a habit');

  const evenings = [0, 1, 2, 3, 4].map(d => done(d, 8, 8, 20));
  const slot = favouriteSlot(evenings);
  assert.equal(slot.slot, 'evening');
  assert.equal(slot.share, 1);

  const mixed = [...[0, 1, 2].map(d => done(d, 8, 8, 9)), ...[3, 4].map(d => done(d, 8, 8, 20))];
  assert.equal(favouriteSlot(mixed).slot, 'morning');
});

test('the domain roll-up ranks the weakest domain first and parks the unscored last', () => {
  const userDomains = [
    { domain_slug: 'it', topics: ['a', 'b'] },
    { domain_slug: 'medical', topics: ['c', 'd'] },
    { domain_slug: 'legal', topics: ['e'] },
  ];
  const rows = {
    'it|a': { completed: true, score: 8, total: 8 },
    'it|b': { completed: true, score: 7, total: 8 },
    'medical|c': { completed: true, score: 4, total: 8 },   // 50% — under the pass mark
    'medical|d': { completed: true, score: 5, total: 8 },   // 62.5% — also under
    // legal has nothing done at all
  };
  const progressOf = (d, t) => rows[`${d}|${t}`];
  const out = domainRollup(userDomains, progressOf, s => s.toUpperCase());

  assert.deepEqual(out.map(r => r.slug), ['medical', 'it', 'legal']);
  assert.equal(out[0].name, 'MEDICAL');
  assert.deepEqual(out[0].weak, ['c', 'd']);
  assert.equal(out[0].done, 2);
  assert.ok(out[0].accuracy < PASS);
  assert.deepEqual(out[1].weak, [], 'IT is all above the pass mark');
  assert.equal(out[2].accuracy, null, 'a domain with nothing done has no accuracy');
  assert.equal(out[2].done, 0);
});

test('recently completed is newest first and capped', () => {
  const rows = [done(5), done(0), done(2), done(9)];
  const recent = recentlyCompleted(rows, 2);
  assert.equal(recent.length, 2);
  assert.equal(recent[0].completed_at, done(0).completed_at);
  assert.equal(recent[1].completed_at, done(2).completed_at);
});

test('promotion state mirrors the SQL rule, including the pass mark', () => {
  // Twenty finished lessons at the level, not merely every topic you picked.
  const allDoneGoodScore = promotionState({ level: 'A1', doneCount: 20, totalTopics: 20, accuracy: 0.8, weakCount: 0 });
  assert.equal(allDoneGoodScore.ready, true);
  assert.equal(allDoneGoodScore.next, 'A2');
  assert.equal(allDoneGoodScore.percent, 100);

  // Everything finished but sitting under 70% is NOT a promotion.
  const allDoneLowScore = promotionState({ level: 'A1', doneCount: 20, totalTopics: 20, accuracy: 0.5, weakCount: 2 });
  assert.equal(allDoneLowScore.ready, false);
  assert.equal(allDoneLowScore.accuracyOk, false);

  // Three topics used to clear a level. Now it cannot, however good the scores,
  // and the learner is told the real blocker: too few topics.
  const tooFewTopics = promotionState({ level: 'A1', doneCount: 3, totalTopics: 3, accuracy: 1, weakCount: 0 });
  assert.equal(tooFewTopics.ready, false);
  assert.equal(tooFewTopics.required, 20);
  assert.equal(tooFewTopics.needMoreTopics, true);
  assert.equal(tooFewTopics.topicsShort, 17);
  assert.equal(tooFewTopics.lessonsLeft, 17);

  // Past the minimum, the bar is the learner's own topic count again.
  const manyTopics = promotionState({ level: 'B1', doneCount: 20, totalTopics: 30, accuracy: 0.9, weakCount: 0 });
  assert.equal(manyTopics.required, 30);
  assert.equal(manyTopics.ready, false);
  assert.equal(manyTopics.lessonsLeft, 10);
  assert.equal(manyTopics.needMoreTopics, false);

  const partway = promotionState({ level: 'B1', doneCount: 5, totalTopics: 20, accuracy: 0.9, weakCount: 0 });
  assert.equal(partway.ready, false);
  assert.equal(partway.lessonsLeft, 15);
  assert.equal(partway.percent, 25);

  // C2 is the ceiling: there is nothing to be promoted to.
  const top = promotionState({ level: 'C2', doneCount: 20, totalTopics: 20, accuracy: 1, weakCount: 0 });
  assert.equal(top.next, null);
  assert.equal(top.ready, false);

  // A fresh account has no topics at all and must not read as ready.
  const empty = promotionState({ level: 'A1', doneCount: 0, totalTopics: 0, accuracy: null, weakCount: 0 });
  assert.equal(empty.ready, false);
  assert.equal(empty.percent, 0);
});
