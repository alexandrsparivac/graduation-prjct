// Canonical lesson contract shared by the generator, validators and UI cache
// checks. Keep quantities here so prompts cannot silently disagree with the
// lesson accepted by the application.
export const LESSON_SPEC = Object.freeze({
  objectives: 3,
  vocabulary: 15,
  phrases: 8,
  dialogueLines: Object.freeze({ min: 12, max: 14 }),
  readingWords: Object.freeze({ min: 90, max: 120 }),
  readingQuestions: 3,
  choiceOptions: 4,
  grammarExamples: 4,
  grammarPractice: 4,
  listening: 5,
  speaking: 6,
  quiz: 8,
  tips: 4,
});

export const LESSON_SPEC_VERSION = 2;
