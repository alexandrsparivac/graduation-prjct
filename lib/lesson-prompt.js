import { lessonDesignPrompt } from './lesson-design.js';
import { countWords, isCjkLanguage } from '../public/js/text-segmentation.js';

const REQUIRED_COUNTS = Object.freeze({
  objectives: 3,
  vocabulary: 15,
  phrases: 8,
  readingQuestions: 3,
  grammarExamples: 4,
  grammarPractice: 4,
  listening: 5,
  speaking: 6,
  quiz: 8,
  tips: 4
});

const isText = value => typeof value === 'string' && value.trim().length > 0;
const hasExactLength = (value, length) => Array.isArray(value) && value.length === length;
const hasTextFields = (value, fields) => value && typeof value === 'object'
  && fields.every(field => isText(value[field]));

export function buildLessonPrompt({ language, languageCode, domain, topic, level, nativeLanguage }) {
  const readingMeasure = isCjkLanguage(languageCode)
    ? '120-180 language-aware word segments; do not count spaces or individual characters as words'
    : '120-180 language-aware words, excluding punctuation';
  const system = `You are an experienced language teacher who has worked for years with professionals in the field being taught.
You write like a good human teacher, not like a textbook or an AI assistant: warm, direct, concrete, occasionally a bit informal.
Rules for tone:
- Never use phrases like "In this lesson we will...", "Welcome to...", "Let's dive in", "It is important to note", "In conclusion".
- Explanations speak to the learner as "tu" (informal you), in short sentences, with real-world reasons ("clients say this when...", "you'll hear this in meetings when...").
- Dialogues sound like real people: hesitations, short replies, small talk, names instead of "Person A / Person B".
- Tips are things a colleague would actually tell you, not generic advice.
- Vary sentence length. Avoid lists of adjectives. Avoid exclamation marks except where a real person would use one.
Work through the lesson plan internally before answering. Then verify every required field, item count, option and answer index against the requested JSON contract. Do not reveal your reasoning.
Respond ONLY with a valid JSON object. No text outside the JSON, no markdown fences.`;

  const user = `Create a complete ${language} lesson for the domain "${domain}", topic "${topic}", CEFR level ${level}.
The learner's native language is ${nativeLanguage}. All explanations, translations, questions and tips must be written in ${nativeLanguage}.
All "text", "term", "example", "phrase", "sentence" and "passage" fields must be in ${language}.

Required JSON structure:
{
  "title": "lesson title in ${nativeLanguage}",
  "intro": "3-4 sentences in ${nativeLanguage}: what the learner will be able to do after this lesson",
  "objectives": ["objective 1 in ${nativeLanguage}", "objective 2", "objective 3"],
  "vocabulary": [
    { "term": "word or phrase in ${language}", "translation": "in ${nativeLanguage}", "partOfSpeech": "noun/verb/adjective/phrase", "example": "example sentence in ${language}", "exampleTranslation": "in ${nativeLanguage}" }
  ],
  "phrases": [
    { "phrase": "useful ready-to-use expression in ${language}", "translation": "in ${nativeLanguage}", "usage": "when to use it, in ${nativeLanguage}" }
  ],
  "dialogue": {
    "context": "description of the situation in ${nativeLanguage}",
    "lines": [ { "speaker": "role name", "text": "line in ${language}", "translation": "in ${nativeLanguage}" } ]
  },
  "reading": {
    "title": "short title in ${language}",
    "passage": "a realistic text in ${language} from this domain (e-mail, report, notice, article excerpt). THIS MUST BE LONG: 12-16 full sentences, ${readingMeasure}. A short paragraph is a failure — keep writing until the situation is fully described.",
    "translation": "translation of the passage in ${nativeLanguage}",
    "questions": [ { "question": "comprehension question in ${nativeLanguage}", "options": ["A", "B", "C", "D"], "answer": 0 } ]
  },
  "grammar": {
    "title": "a grammar point that appears in the lesson",
    "explanation": "clear explanation in ${nativeLanguage}",
    "examples": ["example in ${language}", "example 2", "example 3", "example 4"],
    "practice": [ { "sentence": "sentence in ${language} with ___ for the gap", "answer": "the missing word(s)", "hint": "hint in ${nativeLanguage}" } ]
  },
  "listening": [
    { "text": "a sentence or two in ${language} that will be read aloud", "question": "comprehension question in ${nativeLanguage}", "options": ["A", "B", "C", "D"], "answer": 0 }
  ],
  "speaking": [
    { "text": "a sentence in ${language} for the learner to say aloud", "translation": "in ${nativeLanguage}", "tip": "pronunciation or intonation tip in ${nativeLanguage}" }
  ],
  "quiz": [
    { "question": "question in ${nativeLanguage} or ${language}", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "why, in ${nativeLanguage}" }
  ],
  "tips": ["practical tip in ${nativeLanguage}", "tip 2", "tip 3", "tip 4"]
}

Quantities are mandatory, not suggestions: exactly 3 objectives, 15 vocabulary items, 8 phrases, dialogue of 12-14 lines, a reading passage of 12-16 sentences (${readingMeasure}) with exactly 3 questions, grammar with exactly 4 examples and 4 practice gaps, exactly 5 listening items, 6 speaking items, 8 quiz questions, and 4 tips. Count reading length using the target language's word boundaries, not whitespace or individual characters. Every option list has exactly 4 non-empty choices. Every "answer" is an integer from 0 to 3 that points to the correct option. Every string in the JSON must be non-empty. Adapt vocabulary and sentence complexity to level ${level}. Make everything specific to "${topic}" in the "${domain}" domain.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

function extractJson(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  if (!text.startsWith('{')) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const wordCount = (text, languageCode) => countWords(text, languageCode);

function validChoice(item, withText = []) {
  return hasTextFields(item, ['question', ...withText])
    && hasExactLength(item.options, 4)
    && item.options.every(isText)
    && Number.isInteger(item.answer)
    && item.answer >= 0
    && item.answer <= 3;
}

/**
 * Validates the full lesson contract used by the UI. Keeping this strict means
 * incomplete AI output is retried on the server instead of becoming a broken tab.
 */
export function validateLesson(obj, languageCode = 'en') {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { valid: false, reason: 'root must be an object' };
  if (!hasTextFields(obj, ['title', 'intro'])) return { valid: false, reason: 'title or intro is missing' };
  if (!hasExactLength(obj.objectives, REQUIRED_COUNTS.objectives) || !obj.objectives.every(isText)) return { valid: false, reason: 'objectives must contain exactly 3 items' };
  if (!hasExactLength(obj.vocabulary, REQUIRED_COUNTS.vocabulary) || !obj.vocabulary.every(item => hasTextFields(item, ['term', 'translation', 'partOfSpeech', 'example', 'exampleTranslation']))) return { valid: false, reason: 'vocabulary must contain exactly 15 complete items' };
  if (!hasExactLength(obj.phrases, REQUIRED_COUNTS.phrases) || !obj.phrases.every(item => hasTextFields(item, ['phrase', 'translation', 'usage']))) return { valid: false, reason: 'phrases must contain exactly 8 complete items' };

  if (!obj.dialogue || !isText(obj.dialogue.context) || !Array.isArray(obj.dialogue.lines)
    || obj.dialogue.lines.length < 12 || obj.dialogue.lines.length > 14
    || !obj.dialogue.lines.every(item => hasTextFields(item, ['speaker', 'text', 'translation']))) return { valid: false, reason: 'dialogue must contain 12-14 complete lines' };

  const readingWords = wordCount(obj.reading?.passage || '', languageCode);
  if (!obj.reading || !hasTextFields(obj.reading, ['title', 'passage', 'translation'])
    || readingWords < 80 || readingWords > 220
    || !hasExactLength(obj.reading.questions, REQUIRED_COUNTS.readingQuestions)
    || !obj.reading.questions.every(item => validChoice(item))) return { valid: false, reason: `reading must contain a passage of 80-220 words (yours had ${readingWords}) and exactly 3 valid questions` };

  if (!obj.grammar || !hasTextFields(obj.grammar, ['title', 'explanation'])
    || !hasExactLength(obj.grammar.examples, REQUIRED_COUNTS.grammarExamples) || !obj.grammar.examples.every(isText)
    || !hasExactLength(obj.grammar.practice, REQUIRED_COUNTS.grammarPractice)
    || !obj.grammar.practice.every(item => hasTextFields(item, ['sentence', 'answer', 'hint']) && /_{3,}/u.test(item.sentence))) return { valid: false, reason: 'grammar must contain 4 examples and 4 complete gap exercises' };

  if (!hasExactLength(obj.listening, REQUIRED_COUNTS.listening) || !obj.listening.every(item => validChoice(item, ['text']))) return { valid: false, reason: 'listening must contain exactly 5 valid items' };
  if (!hasExactLength(obj.speaking, REQUIRED_COUNTS.speaking) || !obj.speaking.every(item => hasTextFields(item, ['text', 'translation', 'tip']))) return { valid: false, reason: 'speaking must contain exactly 6 complete items' };
  if (!hasExactLength(obj.quiz, REQUIRED_COUNTS.quiz) || !obj.quiz.every(item => validChoice(item, ['explanation']))) return { valid: false, reason: 'quiz must contain exactly 8 valid questions' };
  if (!hasExactLength(obj.tips, REQUIRED_COUNTS.tips) || !obj.tips.every(isText)) return { valid: false, reason: 'tips must contain exactly 4 items' };
  return { valid: true };
}

export function parseLesson(raw, languageCode = 'en') {
  const lesson = extractJson(raw);
  return validateLesson(lesson, languageCode).valid ? lesson : null;
}

/**
 * Same as parseLesson, but also says what was wrong. The reason is fed back to
 * the model on the next attempt, which fixes far more often than a blind retry.
 */
export function parseLessonResult(raw, languageCode = 'en') {
  const lesson = extractJson(raw);
  if (!lesson) return { lesson: null, reason: 'the response was not valid JSON' };
  const check = validateLesson(lesson, languageCode);
  return check.valid ? { lesson, reason: null } : { lesson: null, reason: check.reason };
}

// ---------------------------------------------------------------------------
// Sectional generation (fast path).
//
// The old single-prompt format (~6000 completion tokens) was slow for two
// reasons: LLM latency grows with output length, and ONE invalid field
// discarded the whole lesson. Splitting the same contract into 4 independent
// sections means each Groq call is ~4x shorter and a retry only regenerates
// the failed section. The merged result satisfies validateLesson() above.
// ---------------------------------------------------------------------------

export const SECTIONS = Object.freeze(['core', 'story', 'practice', 'quiz']);

export const SECTION_TOKENS = Object.freeze({
  core: 2500,
  story: 2500,
  practice: 2500,
  quiz: 2000
});
export const SECTION_MIN_TOKENS = 1000;

const SECTION_SYSTEM = `You are an experienced language teacher for professionals. Warm, direct, concrete tone. No clichés ("Welcome to...", "Let's dive in", "In conclusion"). Respond ONLY with a valid JSON object. No markdown, no commentary.`;

function sectionContext({ language, languageCode, domain, topic, level, nativeLanguage }) {
  const readingMeasure = isCjkLanguage(languageCode)
    ? 'Use 120-180 language-aware word segments; do not count spaces or individual characters as words.'
    : 'Count 120-180 language-aware words, excluding punctuation.';
  return `Create part of a ${language} lesson for the domain "${domain}", topic "${topic}", CEFR level ${level}.
The learner's native language is ${nativeLanguage}. All explanations, translations, questions and tips are in ${nativeLanguage}.
All "text", "term", "example", "phrase", "sentence" and "passage" fields are in ${language}.
${readingMeasure}
Adapt everything to level ${level} and keep it specific to "${topic}".`;
}

const SECTION_SPECS = Object.freeze({
  core: {
    shape: `{
  "title": "lesson title in {NL}",
  "intro": "3-4 sentences in {NL}: what the learner will do after this lesson",
  "objectives": ["objective 1 in {NL}", "objective 2", "objective 3"],
  "scenario": "one precise task, workplace setting, roles and intended result in {NL}, kept strictly inside the selected topic",
  "vocabulary": [
    { "term": "word in {L}", "translation": "in {NL}", "partOfSpeech": "noun/verb/adjective/phrase", "example": "sentence in {L}", "exampleTranslation": "in {NL}" }
  ],
  "phrases": [
    { "phrase": "ready-to-use expression in {L}", "translation": "in {NL}", "usage": "when to use it, in {NL}" }
  ]
}`,
    quantities: 'exactly 3 objectives, 15 vocabulary items, 8 phrases. Every string non-empty.'
  },
  story: {
    shape: `{
  "dialogue": {
    "context": "situation description in {NL}",
    "lines": [ { "speaker": "first name / role", "text": "line in {L}", "translation": "in {NL}" } ]
  },
  "reading": {
    "title": "short title in {L}",
    "passage": "realistic text in {L} (e-mail, report, notice, article excerpt). LENGTH IS MANDATORY: write at least 130 words (aim for ~150, never under 120 or over 180). Count the words before responding — a short paragraph is rejected, keep writing until the situation is fully described.",
    "translation": "translation in {NL}",
    "questions": [ { "question": "in {NL}", "options": ["A", "B", "C", "D"], "answer": 0 } ]
  }
}`,
    quantities: 'dialogue of 12-14 complete lines (real names, short natural replies), reading passage of at least 130 words (hard minimum 120) with exactly 3 questions. Every option list has exactly 4 non-empty choices, every "answer" is an integer 0-3.'
  },
  practice: {
    shape: `{
  "grammar": {
    "title": "a grammar point from this topic",
    "explanation": "clear explanation in {NL}",
    "examples": ["example in {L}", "example 2", "example 3", "example 4"],
    "practice": [ { "sentence": "sentence in {L} with ___ for the gap", "answer": "missing word(s)", "hint": "hint in {NL}" } ]
  },
  "listening": [
    { "text": "one or two sentences in {L} to read aloud", "question": "in {NL}", "options": ["A", "B", "C", "D"], "answer": 0 }
  ],
  "speaking": [
    { "text": "sentence in {L} to say aloud", "translation": "in {NL}", "tip": "pronunciation tip in {NL}" }
  ]
}`,
    quantities: 'grammar with exactly 4 examples and 4 gap exercises (each sentence contains ___), exactly 5 listening items, 6 speaking items. Every option list has exactly 4 non-empty choices, every "answer" is an integer 0-3.'
  },
  quiz: {
    shape: `{
  "quiz": [
    { "question": "question in {NL} or {L}", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "why, in {NL}" }
  ],
  "tips": ["practical tip in {NL}", "tip 2", "tip 3", "tip 4"]
}`,
    quantities: 'exactly 8 quiz questions and 4 practical tips (things a colleague would say, not generic advice). Every option list has exactly 4 non-empty choices, every "answer" is an integer 0-3.'
  }
});

export function buildSectionPrompt(section, ctx) {
  const { language, languageCode, domain, topic, level, nativeLanguage } = ctx;
  if (!SECTION_SPECS[section]) throw new Error(`Unknown section: ${section}`);
  const nl = nativeLanguage || 'Romanian';
  const spec = SECTION_SPECS[section];
  const fill = s => s.replaceAll('{NL}', nl).replaceAll('{L}', language);
  const user = `${sectionContext({ language, languageCode, domain, topic, level, nativeLanguage: nl })}\n\n${lessonDesignPrompt(ctx, section)}\n\nReturn ONLY this JSON shape for the "${section}" section:\n${fill(spec.shape)}\n\nQuantities are mandatory: ${spec.quantities}`;
  return [
    { role: 'system', content: SECTION_SYSTEM },
    { role: 'user', content: user }
  ];
}

export const sectionRetryPrompt = (section, reason) =>
  `The previous "${section}" JSON was rejected: ${reason}. Regenerate the "${section}" section from scratch with the same shape and fix exactly that. Return one complete valid JSON object only.`;

export function buildLessonReviewPrompt(ctx, parts) {
  const { core, story, practice, quiz } = parts;
  const compact = {
    core,
    story: { dialogue: { context: story.dialogue.context, lines: story.dialogue.lines.map(({ speaker, text }) => ({ speaker, text })) },
      reading: { title: story.reading.title, passage: story.reading.passage, questions: story.reading.questions } },
    practice: { grammar: practice.grammar, listening: practice.listening, speaking: practice.speaking.map(item => item.text) },
    quiz,
  };
  return [
    { role: 'system', content: 'You are a strict reviewer of professional language lessons. Check the actual lesson independently. Return only JSON: {"valid":true,"issues":[]} or {"valid":false,"issues":[{"section":"core|story|practice|quiz","reason":"precise error and required correction"}]}. Report up to 4 material errors, grouped by section. Do not rewrite the lesson.' },
    { role: 'user', content: `Review this ${ctx.language} lesson, explained in ${ctx.nativeLanguage}, for ${ctx.domain} / ${ctx.topic}, CEFR ${ctx.level}.
Domain scope: ${ctx.domainBrief}. Level design: ${ctx.levelBrief}.
Reject material failures in these checks:
1. The exact topic drives the actual task and teaching material. At least 10 target vocabulary items are distinctive tools/actions/concepts in this topic. Generic warehouse or office words with a topic label do not suffice. A1 may teach concrete professional objects using simple sentences; higher levels must actually require the communicative skills of their level.
2. Tool functions, terminology and professional facts are correct and consistent with the core glossary. Do not accept invented universal thresholds or procedures presented as professional facts. All sections follow the same feasible scenario.
3. Each question has exactly one correct option; its answer index points to that option. Reading/listening answers follow the supplied passage/transcript, not an unstated inference. Equivalent correct distractors are a failure.
4. The grammar title/explanation accurately describe the examples and gap answers in the target language (for example, commands are imperatives, not declarative present-simple sentences). Quiz content was taught in this lesson.
5. Translations and target expressions have the intended meaning. Flag serious errors, not stylistic preferences.
Only mark valid after checking all questions and the domain/level fit.
Lesson JSON: ${JSON.stringify(compact)}` },
  ];
}

export function parseLessonReview(raw) {
  const assessment = extractJson(raw);
  if (!assessment || typeof assessment.valid !== 'boolean' || !Array.isArray(assessment.issues)) return null;
  if (!assessment.issues.every(issue => SECTIONS.includes(issue.section) && isText(issue.reason))) return null;
  if (assessment.valid !== (assessment.issues.length === 0)) return null;
  return { valid: assessment.valid, issues: assessment.issues.slice(0, 4) };
}

/** Validate one section. Mirrors the corresponding slice of validateLesson(). */
export function validateSection(section, obj, languageCode = 'en') {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { valid: false, reason: `${section}: root must be an object` };
  switch (section) {
    case 'core':
      if (!hasTextFields(obj, ['title', 'intro'])) return { valid: false, reason: 'title or intro is missing' };
      if (!isText(obj.scenario)) return { valid: false, reason: 'scenario must describe one specific task, setting, roles and result in the exact topic' };
      if (!hasExactLength(obj.objectives, REQUIRED_COUNTS.objectives) || !obj.objectives.every(isText)) return { valid: false, reason: 'objectives must contain exactly 3 items' };
      if (!hasExactLength(obj.vocabulary, REQUIRED_COUNTS.vocabulary) || !obj.vocabulary.every(item => hasTextFields(item, ['term', 'translation', 'partOfSpeech', 'example', 'exampleTranslation']))) return { valid: false, reason: 'vocabulary must contain exactly 15 complete items' };
      if (!hasExactLength(obj.phrases, REQUIRED_COUNTS.phrases) || !obj.phrases.every(item => hasTextFields(item, ['phrase', 'translation', 'usage']))) return { valid: false, reason: 'phrases must contain exactly 8 complete items' };
      return { valid: true };
    case 'story': {
      const readingWords = wordCount(obj.reading?.passage || '', languageCode);
      if (!obj.dialogue || !isText(obj.dialogue.context) || !Array.isArray(obj.dialogue.lines)
        || obj.dialogue.lines.length < 12 || obj.dialogue.lines.length > 14
        || !obj.dialogue.lines.every(item => hasTextFields(item, ['speaker', 'text', 'translation']))) return { valid: false, reason: 'dialogue must contain 12-14 complete lines' };
      if (!obj.reading || !hasTextFields(obj.reading, ['title', 'passage', 'translation'])
        || readingWords < 80 || readingWords > 220
        || !hasExactLength(obj.reading.questions, REQUIRED_COUNTS.readingQuestions)
        || !obj.reading.questions.every(item => validChoice(item))) return { valid: false, reason: `reading must contain a passage of 80-220 words (yours had ${readingWords}) and exactly 3 valid questions` };
      return { valid: true };
    }
    case 'practice':
      if (!obj.grammar || !hasTextFields(obj.grammar, ['title', 'explanation'])
        || !hasExactLength(obj.grammar.examples, REQUIRED_COUNTS.grammarExamples) || !obj.grammar.examples.every(isText)
        || !hasExactLength(obj.grammar.practice, REQUIRED_COUNTS.grammarPractice)
        || !obj.grammar.practice.every(item => hasTextFields(item, ['sentence', 'answer', 'hint']) && /_{3,}/u.test(item.sentence))) return { valid: false, reason: 'grammar must contain 4 examples and 4 complete gap exercises' };
      if (!hasExactLength(obj.listening, REQUIRED_COUNTS.listening) || !obj.listening.every(item => validChoice(item, ['text']))) return { valid: false, reason: 'listening must contain exactly 5 valid items' };
      if (!hasExactLength(obj.speaking, REQUIRED_COUNTS.speaking) || !obj.speaking.every(item => hasTextFields(item, ['text', 'translation', 'tip']))) return { valid: false, reason: 'speaking must contain exactly 6 complete items' };
      return { valid: true };
    case 'quiz':
      if (!hasExactLength(obj.quiz, REQUIRED_COUNTS.quiz) || !obj.quiz.every(item => validChoice(item, ['explanation']))) return { valid: false, reason: 'quiz must contain exactly 8 valid questions' };
      if (!hasExactLength(obj.tips, REQUIRED_COUNTS.tips) || !obj.tips.every(isText)) return { valid: false, reason: 'tips must contain exactly 4 items' };
      return { valid: true };
    default:
      return { valid: false, reason: `unknown section: ${section}` };
  }
}

export function parseSectionResult(section, raw, languageCode = 'en') {
  const data = extractJson(raw);
  if (!data) return { data: null, reason: `"${section}": response was not valid JSON` };
  const check = validateSection(section, data, languageCode);
  return check.valid ? { data, reason: null } : { data: null, reason: check.reason };
}

/** Merge the 4 validated sections into the full lesson object the UI renders. */
export function mergeSections(parts) {
  return { ...parts.core, ...parts.story, ...parts.practice, ...parts.quiz };
}
