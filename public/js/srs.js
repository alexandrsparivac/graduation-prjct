/**
 * Spaced repetition: when a word should come back.
 *
 * This is SM-2 (Wozniak & Gorzelanczyk, 1990), the algorithm behind SuperMemo
 * and, in modified form, Anki. It is kept whole and unclever on purpose: the
 * grade-to-interval rule is the part of the app most worth being able to point
 * at and check against the published description.
 *
 * Like dash-stats.js this module never touches the DOM and never reads the
 * clock -- "today" is always passed in -- so every rule below is testable.
 */

import { dayKey, addDays } from './dash-stats.js';

/** E-Factor floor from the original algorithm: no card may be scheduled harder. */
export const MIN_EASE = 1.3;
/** E-Factor a brand new card starts at. */
export const START_EASE = 2.5;

/**
 * Grades, as the four buttons on the review card. SM-2 defines quality 0-5 and
 * treats anything under 3 as a failure; there is no point offering a learner
 * six shades of wrong, so the card asks for four and maps them here.
 */
export const AGAIN = 2;
export const HARD = 3;
export const GOOD = 4;
export const EASY = 5;
export const GRADES = [AGAIN, HARD, GOOD, EASY];

/**
 * How many cards one sitting holds. Finishing a lesson adds 23 words at once,
 * so without a cap a few days away turns into a hundred-card wall that is
 * easier to abandon than to start.
 */
export const SESSION_SIZE = 20;

/**
 * Anki's threshold for a card being known rather than merely seen. Used for the
 * "learned" figure, so that number means something stronger than "met once".
 */
export const MATURE_DAYS = 21;

/** Beyond this the exact date stops mattering and the number just looks absurd. */
export const MAX_INTERVAL = 365;

const clampEase = value => Math.max(MIN_EASE, Math.round(value * 100) / 100);

/** A word that has never been graded. Due the day after it was taught. */
export function newCard({ term, translation, kind = 'word', example = null, domain = null, topic = null }, today = new Date()) {
  return {
    term, translation, kind, example,
    domain_slug: domain, topic,
    ease: START_EASE, interval_days: 0, reps: 0, lapses: 0,
    // Not today: the lesson just taught it, and a review five minutes later
    // measures short-term memory, which is the thing spacing exists to avoid.
    due_on: dayKey(addDays(today, 1)),
    last_review_on: null,
  };
}

/**
 * The SM-2 step. Returns only the scheduling fields, so the caller can write
 * them straight back to the row.
 *
 * Two details worth naming, because both are easy to get subtly wrong:
 *  - the new interval uses the ease the card had *before* this grade, which is
 *    the order the original algorithm specifies;
 *  - the E-Factor is updated on every grade, including failures. A card you
 *    keep forgetting gets permanently easier to trigger, which is the point.
 */
export function schedule(card, quality, today = new Date()) {
  if (!GRADES.includes(quality)) throw new Error(`srs: unknown grade ${quality}`);

  const prevEase = Number.isFinite(card?.ease) ? card.ease : START_EASE;
  const prevReps = Number.isFinite(card?.reps) ? card.reps : 0;
  const prevInterval = Number.isFinite(card?.interval_days) ? card.interval_days : 0;
  const prevLapses = Number.isFinite(card?.lapses) ? card.lapses : 0;

  let reps, intervalDays, lapses = prevLapses;
  if (quality >= HARD) {
    reps = prevReps + 1;
    intervalDays = reps === 1 ? 1
      : reps === 2 ? 6
      : Math.round(prevInterval * prevEase);
  } else {
    // Forgotten: back to the start of the ladder, and counted as a lapse so the
    // dashboard can tell "never learned" from "learned and lost".
    reps = 0;
    intervalDays = 1;
    lapses = prevLapses + 1;
  }
  intervalDays = Math.min(Math.max(intervalDays, 1), MAX_INTERVAL);

  return {
    ease: clampEase(prevEase + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))),
    reps,
    lapses,
    interval_days: intervalDays,
    due_on: dayKey(addDays(today, intervalDays)),
    last_review_on: dayKey(today),
  };
}

/** Cards due on or before today, oldest debt first. */
export function dueCards(cards, today = new Date()) {
  const cutoff = dayKey(today);
  return (cards || [])
    .filter(c => c && c.due_on && c.due_on <= cutoff)
    .sort((a, b) => (a.due_on < b.due_on ? -1 : a.due_on > b.due_on ? 1 : 0));
}

/** One sitting's worth, and how many are left over after it. */
export function session(cards, today = new Date(), size = SESSION_SIZE) {
  const due = dueCards(cards, today);
  return { cards: due.slice(0, size), remaining: Math.max(0, due.length - size) };
}

/** The three figures the dashboard shows about vocabulary. */
export function vocabStats(cards, today = new Date()) {
  const list = cards || [];
  return {
    total: list.length,
    due: dueCards(list, today).length,
    learned: list.filter(c => (c?.interval_days ?? 0) >= MATURE_DAYS).length,
  };
}
