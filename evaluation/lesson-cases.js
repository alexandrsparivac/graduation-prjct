const choices = (question, extra = {}) => ({
  question,
  options: ['A', 'B', 'C', 'D'],
  answer: 0,
  ...extra,
});

export function completeLessonFixture() {
  return {
    title: 'O lecție completă',
    intro: 'Vei putea folosi expresii utile. Vei înțelege un dialog. Vei exersa cu încredere.',
    objectives: ['Obiectiv unu', 'Obiectiv doi', 'Obiectiv trei'],
    scenario: 'Doi colegi verifică instrumentele necesare pentru sarcina lor și confirmă că pot începe lucrul.',
    vocabulary: Array.from({ length: 15 }, (_, i) => ({
      term: `termen ${i}`, translation: `traducere ${i}`, partOfSpeech: 'substantiv',
      example: `Exemplu ${i}.`, exampleTranslation: `Traducere exemplu ${i}.`,
    })),
    phrases: Array.from({ length: 8 }, (_, i) => ({
      phrase: `Expresie ${i}`, translation: `Traducere ${i}`, usage: `Se folosește în situația ${i}.`,
    })),
    dialogue: {
      context: 'Doi colegi discută la birou.',
      lines: Array.from({ length: 12 }, (_, i) => ({
        speaker: i % 2 ? 'Mara' : 'Alex', text: `Replica ${i}.`, translation: `Traducerea replicii ${i}.`,
      })),
    },
    reading: {
      title: 'Mesaj scurt',
      passage: Array.from({ length: 120 }, (_, i) => `cuvânt${i}`).join(' '),
      translation: 'Traducerea textului de citire.',
      questions: Array.from({ length: 3 }, (_, i) => choices(`Întrebarea ${i}`)),
    },
    grammar: {
      title: 'Timpul prezent',
      explanation: 'Explicație clară pentru elev.',
      examples: ['Exemplu unu.', 'Exemplu doi.', 'Exemplu trei.', 'Exemplu patru.'],
      practice: Array.from({ length: 4 }, (_, i) => ({
        sentence: `Eu ___ propoziția ${i}.`, answer: 'completez', hint: 'Verbul potrivit.',
      })),
    },
    listening: Array.from({ length: 5 }, (_, i) => choices(`Ce ai auzit la ${i}?`, { text: `Fragmentul audio ${i}.` })),
    speaking: Array.from({ length: 6 }, (_, i) => ({
      text: `Spun propoziția ${i}.`, translation: `Traducerea ${i}.`, tip: 'Accentuează ultimul cuvânt.',
    })),
    quiz: Array.from({ length: 8 }, (_, i) => choices(`Test ${i}`, { explanation: 'Aceasta este explicația corectă.' })),
    tips: ['Primul sfat practic.', 'Al doilea sfat practic.', 'Al treilea sfat practic.', 'Al patrulea sfat practic.'],
  };
}

export function lessonEvaluationCases() {
  const validRomanian = completeLessonFixture();
  const invalidAnswer = structuredClone(validRomanian);
  invalidAnswer.quiz[3].answer = '2';
  const incompleteVocabulary = structuredClone(validRomanian);
  incompleteVocabulary.vocabulary.pop();
  const validChinese = structuredClone(validRomanian);
  validChinese.reading.passage = '我喜欢学习中文。'.repeat(20);
  const shortChinese = structuredClone(validChinese);
  shortChinese.reading.passage = '我喜欢学习中文。'.repeat(5);

  return [
    { id: 'complete-ro-lesson', languageCode: 'ro', lesson: validRomanian, expectedValid: true },
    { id: 'invalid-answer-index', languageCode: 'ro', lesson: invalidAnswer, expectedValid: false },
    { id: 'missing-vocabulary-item', languageCode: 'ro', lesson: incompleteVocabulary, expectedValid: false },
    { id: 'cjk-reading-length', languageCode: 'zh', lesson: validChinese, expectedValid: true },
    { id: 'short-cjk-reading', languageCode: 'zh', lesson: shortChinese, expectedValid: false },
  ];
}
