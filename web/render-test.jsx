import React from 'react';
import { renderToString } from 'react-dom/server';
import { StepBody } from './src/pages/Lesson.jsx';

const noop = () => {};
const S = { current: { mcq: {}, gap: {}, deck: { i: 0, flipped: false, flippedCards: [] } } };
const base = {
  params: { lang: 'en', domain: 'it', topic: 'Code review', level: 'B1' },
  locale: 'en-US',
  contentLang: 'en',
  flowLen: 30,
  S,
  next: noop,
  rerender: noop,
  checkpoint: noop,
  toast: noop,
  onExit: noop,
  onCustomize: noop,
  regen: noop,
  rowRef: { current: { localOnly: true } },
  savedRef: { current: false },
  resumeRef: { current: null },
  user: { id: 'test' },
  saveFailed: false,
  retrySave: noop,
};

const vocab = (i) => ({ term: `Term${i}`, translation: `Trad${i}`, partOfSpeech: 'noun', example: `Ex${i}`, exampleTranslation: `ExTr${i}` });
const content = {
  title: 'Preparing a Film Set Lighting Plan',
  intro: 'Intro text here.',
  objectives: ['O1', 'O2', 'O3'],
  vocabulary: Array.from({ length: 15 }, (_, i) => vocab(i)),
  phrases: Array.from({ length: 8 }, (_, i) => ({ phrase: `P${i}`, translation: `PT${i}`, usage: `U${i}` })),
  dialogue: {
    context: 'Ctx',
    lines: Array.from({ length: 12 }, (_, i) => ({ speaker: i % 2 ? 'B' : 'A', text: `Line${i}`, translation: `LT${i}` })),
  },
  reading: {
    title: 'R',
    passage: Array.from({ length: 100 }, () => 'word').join(' '),
    translation: 'RT',
    questions: [0, 1, 2].map((i) => ({ question: `Q${i}`, options: ['a', 'b', 'c', 'd'], answer: 0 })),
  },
  grammar: {
    title: 'G',
    explanation: 'E',
    examples: ['e1', 'e2', 'e3', 'e4'],
    practice: [0, 1, 2, 3].map((i) => ({ sentence: `Fill ___ ${i}`, answer: `ans${i}`, hint: `h${i}` })),
  },
  listening: [0, 1, 2, 3, 4].map((i) => ({ text: `T${i}`, question: `Q${i}`, options: ['a', 'b', 'c', 'd'], answer: 1 })),
  speaking: [0, 1, 2, 3, 4, 5].map((i) => ({ text: `S${i}`, translation: `ST${i}`, tip: `tip${i}` })),
  quiz: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ question: `QZ${i}`, options: ['a', 'b', 'c', 'd'], answer: 2, explanation: `E${i}` })),
  tips: ['t1', 't2', 't3', 't4'],
};

const kinds = [
  { kind: 'intro' },
  { kind: 'deck' },
  { kind: 'phrases' },
  { kind: 'dialogue' },
  { kind: 'reading' },
  { kind: 'rmcq', index: 0, q: content.reading.questions[0] },
  { kind: 'grammar' },
  { kind: 'gap', index: 0, p: content.grammar.practice[0] },
  { kind: 'listen', index: 0, it: content.listening[0] },
  { kind: 'speak', index: 0, it: content.speaking[0] },
  { kind: 'quiz', index: 0, q: content.quiz[0] },
  { kind: 'tips' },
  { kind: 'results' },
];

let failures = 0;
for (const st of kinds) {
  try {
    const html = renderToString(React.createElement(StepBody, { ...base, st, content }));
    console.log(`OK   ${st.kind} (${html.length} chars)`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${st.kind}: ${err.constructor.name}: ${err.message}`);
    console.log(String(err.stack).split('\n').slice(0, 4).join('\n'));
  }
}
process.exit(failures ? 1 : 0);
