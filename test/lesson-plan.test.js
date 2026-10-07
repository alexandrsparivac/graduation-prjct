import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlow, lessonPlan, estimateMinutes, sectionProgress, currentSection, cleanTitle, lessonCompletion, SECTIONS } from '../public/js/lesson-plan.js';

// A lesson in the exact shape the generator is held to (isCompleteLesson).
const words = n => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const LESSON = {
  title: 'Personal training', intro: 'x', objectives: ['a', 'b', 'c'],
  vocabulary: Array(15).fill({}), phrases: Array(8).fill({}),
  dialogue: { context: 'x', lines: Array(14).fill({}) },
  reading: { title: 'x', passage: words(150), translation: 'x', questions: Array(3).fill({}) },
  grammar: { title: 'x', explanation: 'x', examples: Array(4).fill('x'), practice: Array(4).fill({}) },
  listening: Array(5).fill({}), speaking: Array(6).fill({}), quiz: Array(8).fill({}), tips: Array(4).fill('x'),
};

test('the flow is the 34 screens the lesson page has always shown, in order', () => {
  const f = buildFlow(LESSON);
  assert.equal(f.length, 34);
  assert.equal(f[0].kind, 'intro');
  assert.equal(f.at(-1).kind, 'results');
  assert.deepEqual(f.slice(1, 5).map(s => s.kind), ['deck', 'phrases', 'dialogue', 'reading']);
  assert.equal(f.filter(s => s.kind === 'quiz').length, 8);
  // Question steps keep their payload and position, which the renderer reads.
  const gap = f.find(s => s.kind === 'gap' && s.index === 2);
  assert.equal(gap.p, LESSON.grammar.practice[2]);
});

test('intro and results belong to no section; every other screen does', () => {
  const f = buildFlow(LESSON);
  assert.equal(f[0].section, null);
  assert.equal(f.at(-1).section, null);
  const keys = new Set(SECTIONS.map(s => s.key));
  f.slice(1, -1).forEach(s => assert.ok(keys.has(s.section), `${s.kind} -> ${s.section}`));
});

test('the plan lists what each section holds', () => {
  const plan = Object.fromEntries(lessonPlan(LESSON).map(s => [s.key, s.count]));
  assert.deepEqual(plan, { vocab: 15, phrases: 8, dialogue: 14, reading: 3, grammar: 4, listening: 5, speaking: 6, quiz: 8, tips: 4 });
});

test('a section the lesson lacks is left out, not listed as zero', () => {
  const plan = lessonPlan({ ...LESSON, tips: [], speaking: undefined });
  assert.ok(!plan.some(s => s.key === 'tips' || s.key === 'speaking'));
  assert.ok(plan.every(s => s.count > 0));
});

test('the duration is a round, plausible number of minutes', () => {
  const m = estimateMinutes(LESSON);
  assert.equal(m % 5, 0);
  assert.ok(m >= 20 && m <= 40, `a full lesson should take 20-40 min, got ${m}`);
});

test('the estimate grows with the lesson and never drops below five', () => {
  const longer = { ...LESSON, reading: { ...LESSON.reading, passage: words(1500) } };
  assert.ok(estimateMinutes(longer) > estimateMinutes(LESSON));
  assert.equal(estimateMinutes({}), 5);
});

test('progress is empty on the intro and full on the results screen', () => {
  const f = buildFlow(LESSON);
  assert.ok(sectionProgress(f, 0).every(s => s.done === 0));
  assert.ok(sectionProgress(f, f.length - 1).every(s => s.done === s.steps));
});

test('completion counts each vocabulary card and checked exercises, without counting intro or results', () => {
  const f = buildFlow(LESSON);
  const state = { deck: { i: 0 }, mcq: {}, gap: {} };
  assert.deepEqual(lessonCompletion(f, 0, state, 15), { completed: 0, total: 46 });
  assert.deepEqual(lessonCompletion(f, 1, { ...state, deck: { i: 7 } }, 15), { completed: 7, total: 46 });
  assert.deepEqual(lessonCompletion(f, 2, state, 15), { completed: 15, total: 46 });
  const gap = f.findIndex(step => step.kind === 'gap');
  const before = lessonCompletion(f, gap, state, 15);
  assert.equal(lessonCompletion(f, gap, { ...state, gap: { g0: { checked: true } } }, 15).completed, before.completed + 1);
  assert.deepEqual(lessonCompletion(f, f.length - 1, state, 15), { completed: 46, total: 46 });
});

test('segments are sized by screens and fill as the learner moves through one', () => {
  const f = buildFlow(LESSON);
  const segs = sectionProgress(f, 0);
  assert.equal(segs.reduce((n, s) => n + s.steps, 0), 32); // all but intro and results
  assert.equal(segs.find(s => s.key === 'reading').steps, 4); // passage + 3 questions

  const secondReadingQuestion = f.findIndex(s => s.kind === 'rmcq' && s.index === 1);
  const reading = sectionProgress(f, secondReadingQuestion).find(s => s.key === 'reading');
  assert.equal(reading.done, 2); // the passage and the first question are behind
  assert.equal(currentSection(f, secondReadingQuestion), 'reading');
  assert.equal(currentSection(f, 0), null);
});

test('a trailing level tag is dropped from the title', () => {
  assert.equal(cleanTitle('Antrenament personal – lecție B2', 'B2'), 'Antrenament personal');
  assert.equal(cleanTitle('Personal training - B2 lesson', 'B2'), 'Personal training');
  assert.equal(cleanTitle('Contracts (B2)', 'B2'), 'Contracts');
  assert.equal(cleanTitle('Verträge: Niveau b2', 'B2'), 'Verträge');
});

test('the title is left alone when the level is not a short trailing tag', () => {
  // The level inside the title proper, not tacked on.
  assert.equal(cleanTitle('B2 contracts for freelancers', 'B2'), 'B2 contracts for freelancers');
  // A long subtitle is content, even if it mentions the level.
  assert.equal(cleanTitle('Negotiation – how to argue your case at B2 and beyond', 'B2'), 'Negotiation – how to argue your case at B2 and beyond');
  // Another level, or a code that only contains the letters.
  assert.equal(cleanTitle('Contracts – lesson C1', 'B2'), 'Contracts – lesson C1');
  assert.equal(cleanTitle('Hotel check-in – AB2X', 'B2'), 'Hotel check-in – AB2X');
  // Nothing left: keep it whole.
  assert.equal(cleanTitle('B2', 'B2'), 'B2');
  assert.equal(cleanTitle('– B2', 'B2'), '– B2');
});

test('a hyphen inside a word is not a separator', () => {
  assert.equal(cleanTitle('Check-in B2', 'B2'), 'Check-in B2');
  assert.equal(cleanTitle('Hotel check-in – B2', 'B2'), 'Hotel check-in');
  assert.equal(cleanTitle('Cross-border trade - B2 lesson', 'B2'), 'Cross-border trade');
});

test('a level range is never split in the middle', () => {
  // Splitting at the unspaced dash would leave "nivel B1": the title would
  // name B1 while the facts strip says B2.
  assert.equal(cleanTitle('Negocieri – nivel B1–B2', 'B2'), 'Negocieri');
  assert.equal(cleanTitle('Negocieri–B2', 'B2'), 'Negocieri–B2');
});
