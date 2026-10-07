import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseLesson, validateLesson,
  buildSectionPrompt, validateSection, parseSectionResult, mergeSections, SECTIONS
} from '../lib/lesson-prompt.js';
import { completeLessonFixture as completeLesson } from '../evaluation/lesson-cases.js';

test('accepts a complete lesson that the UI can render safely', () => {
  const lesson = completeLesson();
  assert.deepEqual(validateLesson(lesson), { valid: true });
  assert.deepEqual(parseLesson(JSON.stringify(lesson)), lesson);
});

test('rejects a lesson with an invalid multiple-choice answer', () => {
  const lesson = completeLesson();
  lesson.quiz[3].answer = '2';
  assert.equal(validateLesson(lesson).valid, false);
  assert.equal(parseLesson(JSON.stringify(lesson)), null);
});

test('rejects a partial lesson instead of allowing empty lesson tabs', () => {
  const lesson = completeLesson();
  lesson.speaking.pop();
  assert.equal(validateLesson(lesson).valid, false);
});

test('section prompts cover the full lesson contract without overlap', () => {
  const ctx = { language: 'Engleză', domain: 'IT', topic: 'Code review', level: 'A2', nativeLanguage: 'Română' };
  assert.deepEqual([...SECTIONS].sort(), ['core', 'practice', 'quiz', 'story']);
  const seen = new Set();
  for (const s of SECTIONS) {
    const msgs = buildSectionPrompt(s, ctx);
    assert.equal(msgs.length, 2);
    assert.match(JSON.stringify(msgs), /JSON/);
    const topKeys = Object.keys(JSON.parse(JSON.stringify(completeLessonSection(s))));
    for (const k of topKeys) {
      assert.ok(!seen.has(k), `key "${k}" in two sections`);
      seen.add(k);
    }
  }
  assert.ok(seen.has('vocabulary') && seen.has('quiz') && seen.has('dialogue') && seen.has('grammar'));
});

function completeLessonSection(section) {
  const full = completeLesson();
  switch (section) {
    case 'core': return { title: full.title, intro: full.intro, objectives: full.objectives, scenario: full.scenario, vocabulary: full.vocabulary, phrases: full.phrases };
    case 'story': return { dialogue: full.dialogue, reading: full.reading };
    case 'practice': return { grammar: full.grammar, listening: full.listening, speaking: full.speaking };
    case 'quiz': return { quiz: full.quiz, tips: full.tips };
    default: throw new Error(section);
  }
}

test('each section validates on its own and merges into a valid lesson', () => {
  const parts = Object.fromEntries(SECTIONS.map(s => [s, completeLessonSection(s)]));
  for (const s of SECTIONS) {
    assert.deepEqual(validateSection(s, parts[s]), { valid: true });
    assert.deepEqual(parseSectionResult(s, JSON.stringify(parts[s])).data, parts[s]);
  }
  assert.deepEqual(validateLesson(mergeSections(parts)), { valid: true });
});

test('story passage validation uses target-language word boundaries for Chinese', () => {
  const story = completeLessonSection('story');
  story.reading.passage = '我喜欢学习中文。'.repeat(20);
  assert.deepEqual(validateSection('story', story, 'zh'), { valid: true });
  const lesson = completeLesson();
  lesson.reading.passage = story.reading.passage;
  assert.deepEqual(validateLesson(lesson, 'zh'), { valid: true });
});

test('a broken section fails alone without invalidating the others', () => {
  const good = completeLessonSection('quiz');
  assert.equal(validateSection('quiz', good).valid, true);
  const bad = { ...good, quiz: good.quiz.slice(0, 7) };
  const res = parseSectionResult('quiz', JSON.stringify(bad));
  assert.equal(res.data, null);
  assert.match(res.reason, /quiz/);
});
