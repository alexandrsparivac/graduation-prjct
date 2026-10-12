import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlow } from '../shared/lesson-plan.js';
import {
  BUILDER_SECTIONS,
  decodeLessonSelection,
  encodeLessonSelection,
  filterLessonContent,
  fullSelection,
} from '../shared/lesson-builder.js';

const words = n => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const LESSON = {
  title: 'T', intro: 'x', objectives: ['a', 'b', 'c'],
  vocabulary: Array(15).fill({}), phrases: Array(8).fill({}),
  dialogue: { context: 'x', lines: Array(14).fill({}) },
  reading: { title: 'x', passage: words(150), translation: 'x', questions: Array(3).fill({}) },
  grammar: { title: 'x', explanation: 'x', examples: Array(4).fill('x'), practice: Array(4).fill({}) },
  listening: Array(5).fill({}), speaking: Array(6).fill({}), quiz: Array(8).fill({}), tips: Array(4).fill('x'),
};

test('the builder lists the nine practicable sections in lesson order', () => {
  assert.deepEqual(BUILDER_SECTIONS.map(s => s.key),
    ['vocab', 'phrases', 'dialogue', 'reading', 'grammar', 'listening', 'speaking', 'quiz', 'tips']);
});

test('decoding is null unless the param names a strict subset', () => {
  assert.equal(decodeLessonSelection(null), null);
  assert.equal(decodeLessonSelection(''), null);
  assert.equal(decodeLessonSelection('nope,alsono'), null);
  assert.equal(decodeLessonSelection('vocab,phrases,dialogue,reading,grammar,listening,speaking,quiz,tips'), null);
  const sel = decodeLessonSelection('grammar,listening,grammar, nope');
  assert.ok(sel instanceof Set);
  assert.deepEqual([...sel].sort(), ['grammar', 'listening']);
});

test('encoding round-trips a partial selection and is null when full', () => {
  const sel = new Set(['listening', 'grammar']);
  assert.equal(encodeLessonSelection(sel), 'grammar,listening');
  assert.deepEqual([...decodeLessonSelection(encodeLessonSelection(sel))].sort(), ['grammar', 'listening']);
  assert.equal(encodeLessonSelection(fullSelection()), null);
  assert.equal(encodeLessonSelection(new Set()), null);
});

test('filtering empties unselected sections without reshaping the rest', () => {
  const filtered = filterLessonContent(LESSON, new Set(['grammar']));
  assert.equal(filtered.vocabulary.length, 0);
  assert.equal(filtered.phrases.length, 0);
  assert.equal(filtered.dialogue.lines.length, 0);
  assert.equal(filtered.reading, null);
  assert.equal(filtered.grammar.practice.length, 4);
  assert.equal(filtered.listening.length, 0);
  assert.equal(filtered.quiz.length, 0);
  // The source lesson is untouched, still cacheable as a full lesson.
  assert.equal(LESSON.vocabulary.length, 15);
  assert.equal(LESSON.quiz.length, 8);
});

test('the flow skips filtered sections but keeps every step of the rest', () => {
  const filtered = filterLessonContent(LESSON, new Set(['grammar', 'listening']));
  const f = buildFlow(filtered);
  assert.deepEqual(f.map(s => s.kind),
    ['intro', 'grammar', 'gap', 'gap', 'gap', 'gap',
      'listen', 'listen', 'listen', 'listen', 'listen', 'results']);
  assert.ok(f.slice(1, -1).every(s => ['grammar', 'listening'].includes(s.section)));
});

test('a full lesson still builds the 34 screens it always had', () => {
  assert.equal(buildFlow(LESSON).length, 34);
  assert.equal(buildFlow(filterLessonContent(LESSON, fullSelection())).length, 34);
});
