import test from 'node:test';
import assert from 'node:assert/strict';
import {
  schedule, newCard, dueCards, session, vocabStats,
  MIN_EASE, START_EASE, AGAIN, HARD, GOOD, EASY, MAX_INTERVAL, MATURE_DAYS,
} from '../public/js/srs.js';

// A fixed local noon, so nothing here depends on when the suite runs.
const DAY = d => new Date(2026, 8, d, 12, 0, 0); // September 2026, local time
const TODAY = DAY(10);

test('a new card waits until tomorrow, not until later today', () => {
  const c = newCard({ term: 'Vertrag', translation: 'contract' }, TODAY);
  assert.equal(c.due_on, '2026-09-11');
  assert.equal(c.ease, START_EASE);
  assert.equal(c.reps, 0);
  assert.equal(c.last_review_on, null);
});

test('the first three correct answers follow SM-2: 1, 6, then interval x ease', () => {
  let card = newCard({ term: 'Frist', translation: 'deadline' }, TODAY);

  const first = schedule(card, GOOD, TODAY);
  assert.equal(first.interval_days, 1);
  assert.equal(first.reps, 1);

  const second = schedule({ ...card, ...first }, GOOD, DAY(11));
  assert.equal(second.interval_days, 6);
  assert.equal(second.reps, 2);

  // 6 days at the ease the card held *before* this grade (2.5 after two GOODs
  // that each nudged it), not the ease it ends up with.
  const third = schedule({ ...card, ...second }, GOOD, DAY(17));
  assert.equal(third.interval_days, Math.round(6 * second.ease));
  assert.equal(third.reps, 3);
});

test('"again" drops the card back to one day and counts a lapse', () => {
  const grown = { ease: 2.5, interval_days: 30, reps: 5, lapses: 1 };
  const out = schedule(grown, AGAIN, TODAY);
  assert.equal(out.interval_days, 1);
  assert.equal(out.reps, 0);
  assert.equal(out.lapses, 2);
  assert.equal(out.due_on, '2026-09-11');
});

test('ease falls on failure but never below the SM-2 floor', () => {
  let card = { ease: START_EASE, interval_days: 10, reps: 4, lapses: 0 };
  for (let i = 0; i < 12; i++) card = { ...card, ...schedule(card, AGAIN, TODAY) };
  assert.equal(card.ease, MIN_EASE);
  assert.ok(card.ease >= MIN_EASE);
});

test('ease rises on "easy" and falls on "hard"', () => {
  const base = { ease: 2.5, interval_days: 6, reps: 2, lapses: 0 };
  assert.ok(schedule(base, EASY, TODAY).ease > 2.5);
  assert.ok(schedule(base, HARD, TODAY).ease < 2.5);
  // HARD is still a pass: the card moves forward rather than resetting.
  assert.equal(schedule(base, HARD, TODAY).reps, 3);
});

test('intervals are capped so a well-known word does not vanish for years', () => {
  const ancient = { ease: 2.5, interval_days: 5000, reps: 20, lapses: 0 };
  assert.equal(schedule(ancient, EASY, TODAY).interval_days, MAX_INTERVAL);
});

test('the due date is a local calendar day, not a UTC one', () => {
  // 23:30 local. Adding one day must land on the next local date whatever the
  // machine's offset from UTC is.
  const lateEvening = new Date(2026, 8, 10, 23, 30, 0);
  assert.equal(schedule({ reps: 0 }, GOOD, lateEvening).due_on, '2026-09-11');
});

test('an unknown grade is rejected rather than silently rescheduled', () => {
  assert.throws(() => schedule({ reps: 0 }, 1, TODAY), /unknown grade/);
});

test('due cards include overdue ones, oldest debt first', () => {
  const cards = [
    { term: 'c', due_on: '2026-09-10' },
    { term: 'a', due_on: '2026-09-01' },
    { term: 'future', due_on: '2026-09-30' },
    { term: 'b', due_on: '2026-09-05' },
  ];
  assert.deepEqual(dueCards(cards, TODAY).map(c => c.term), ['a', 'b', 'c']);
});

test('a sitting is capped and reports what is left', () => {
  const many = Array.from({ length: 53 }, (_, i) => ({ term: `w${i}`, due_on: '2026-09-09' }));
  const s = session(many, TODAY);
  assert.equal(s.cards.length, 20);
  assert.equal(s.remaining, 33);

  const few = session(many.slice(0, 4), TODAY);
  assert.equal(few.cards.length, 4);
  assert.equal(few.remaining, 0);
});

test('"learned" means mature, not merely met once', () => {
  const cards = [
    { due_on: '2026-09-01', interval_days: MATURE_DAYS },     // learned, and due
    { due_on: '2026-12-01', interval_days: 40 },              // learned, not due
    { due_on: '2026-09-10', interval_days: 1 },               // met, due today
    { due_on: '2026-11-01', interval_days: 0 },               // never graded
  ];
  assert.deepEqual(vocabStats(cards, TODAY), { total: 4, due: 2, learned: 2 });
});

test('missing or malformed rows do not crash the counters', () => {
  assert.deepEqual(vocabStats(null, TODAY), { total: 0, due: 0, learned: 0 });
  assert.deepEqual(dueCards([null, {}, { due_on: '2026-09-01' }], TODAY).length, 1);
  // A row written before a column existed still schedules from the defaults.
  assert.equal(schedule({}, GOOD, TODAY).interval_days, 1);
});
