// Lesson builder: let the learner choose which sections a lesson run holds
// BEFORE it starts ("doar gramatică", "gramatică + ascultare", ...).
//
// Generation and the shared cache always stay full lessons: the builder only
// filters the loaded content down to the chosen sections, so validation,
// caching, scoring and the dashboard keep working on the canonical shape.
// A filtered lesson never reaches the quiz RPC with a partial quiz — the
// quiz section is all 8 questions or nothing, and a run without it ends on a
// practice recap instead of a submitted score.
// Sections in lesson order. `key` matches the SECTIONS keys in
// lesson-plan.js; `tab` is the i18n label shown next to each checkbox.
export const BUILDER_SECTIONS = [
  { key: 'vocab', tab: 'tab.vocab' },
  { key: 'phrases', tab: 'tab.phrases' },
  { key: 'dialogue', tab: 'tab.dialogue' },
  { key: 'reading', tab: 'tab.reading' },
  { key: 'grammar', tab: 'tab.grammar' },
  { key: 'listening', tab: 'tab.listening' },
  { key: 'speaking', tab: 'tab.speaking' },
  { key: 'quiz', tab: 'tab.quiz' },
  { key: 'tips', tab: 'tab.tips' },
];

const ALL_KEYS = BUILDER_SECTIONS.map(s => s.key);
const KNOWN = new Set(ALL_KEYS);

export const BUILDER_PRESETS = [
  { id: 'full', sections: ALL_KEYS },
  { id: 'grammar-only', sections: ['grammar'] },
  { id: 'grammar-listening', sections: ['grammar', 'listening'] },
  { id: 'no-quiz', sections: ALL_KEYS.filter(k => k !== 'quiz') },
];

/** The canonical selection: every section on. */
export const fullSelection = () => new Set(ALL_KEYS);

/**
 * Parse the `custom` URL param back into a Set of section keys.
 * Returns null for "no customization": missing, unknown-only, empty, or a
 * selection that covers every section (keeps shared URLs clean).
 */
export function decodeLessonSelection(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const picked = value.split(',').map(s => s.trim()).filter(s => KNOWN.has(s));
  const unique = [...new Set(picked)];
  if (!unique.length || unique.length >= ALL_KEYS.length) return null;
  return new Set(unique);
}

/** Serialize a selection for the `custom` URL param. Null when it is full. */
export function encodeLessonSelection(selection) {
  if (!(selection instanceof Set)) return null;
  const picked = ALL_KEYS.filter(k => selection.has(k));
  if (!picked.length || picked.length >= ALL_KEYS.length) return null;
  return picked.join(',');
}

/**
 * Narrow a complete lesson to the chosen sections. Unselected sections are
 * emptied (never reshaped), so buildFlow/lessonPlan/estimateMinutes treat
 * them as "the lesson lacks this section" with the code paths they already
 * have for missing data.
 */
export function filterLessonContent(content, selection) {
  if (!(selection instanceof Set)) return content;
  const out = { ...content };
  if (!selection.has('vocab')) out.vocabulary = [];
  if (!selection.has('phrases')) out.phrases = [];
  if (!selection.has('dialogue')) out.dialogue = { ...(content.dialogue || {}), lines: [] };
  if (!selection.has('reading')) out.reading = null;
  if (!selection.has('grammar')) out.grammar = null;
  if (!selection.has('listening')) out.listening = [];
  if (!selection.has('speaking')) out.speaking = [];
  if (!selection.has('quiz')) out.quiz = [];
  if (!selection.has('tips')) out.tips = [];
  return out;
}
