// The shape of a lesson, worked out from its content alone: the screen-by-screen
// flow, the sections the learner moves through, how far along they are, and
// roughly how long it will take. No DOM and no clock, so it runs under Node.
import { countWords } from './text-segmentation.js';

/**
 * Sections in the order they are taught. `key` doubles as the i18n key of the
 * section name (tab.*) and `unit` names the plural key of what it contains.
 * `seconds` is the time budget per item, for the duration estimate. `tone` is
 * the antd preset palette the section is drawn in, the same on every screen.
 */
export const SECTIONS = [
  { key: 'vocab',     tab: 'tab.vocab',     unit: 'les.cnt.words',     seconds: 20, tone: 'blue' },
  { key: 'phrases',   tab: 'tab.phrases',   unit: 'les.cnt.phrases',   seconds: 15, tone: 'purple' },
  { key: 'dialogue',  tab: 'tab.dialogue',  unit: 'les.cnt.lines',     seconds: 12, tone: 'cyan' },
  { key: 'reading',   tab: 'tab.reading',   unit: 'les.cnt.questions', seconds: 30, tone: 'geekblue' },
  { key: 'grammar',   tab: 'tab.grammar',   unit: 'les.cnt.exercises', seconds: 30, tone: 'orange' },
  { key: 'listening', tab: 'tab.listening', unit: 'les.cnt.clips',     seconds: 40, tone: 'magenta' },
  { key: 'speaking',  tab: 'tab.speaking',  unit: 'les.cnt.sentences', seconds: 45, tone: 'green' },
  { key: 'quiz',      tab: 'tab.quiz',      unit: 'les.cnt.questions', seconds: 30, tone: 'volcano' },
  { key: 'tips',      tab: 'tab.tips',      unit: 'les.cnt.tips',      seconds: 8, tone: 'gold' },
];

export const VOCAB_CARDS_PER_PAGE = 3;

// Reading a passage and a grammar explanation take time of their own, before
// any of their questions. A learner reads a foreign text at roughly 100 words
// a minute; the explanation is budgeted as a flat minute.
const READING_WPM = 100;
const GRAMMAR_INTRO_SECONDS = 60;

const len = a => (Array.isArray(a) ? a.length : 0);
/**
 * One screen per exercise: intro, the study decks, every question, results.
 * Each step names its section, so the progress bar can group them; intro and
 * results belong to none.
 */
export function buildFlow(c) {
  const f = [{ kind: 'intro', section: null }];
  f.push({ kind: 'deck', section: 'vocab' });
  f.push({ kind: 'phrases', section: 'phrases' });
  f.push({ kind: 'dialogue', section: 'dialogue' });
  f.push({ kind: 'reading', section: 'reading' });
  (c.reading?.questions || []).forEach((q, i) => f.push({ kind: 'rmcq', section: 'reading', q, index: i }));
  f.push({ kind: 'grammar', section: 'grammar' });
  (c.grammar?.practice || []).forEach((p, i) => f.push({ kind: 'gap', section: 'grammar', p, index: i }));
  (c.listening || []).forEach((it, i) => f.push({ kind: 'listen', section: 'listening', it, index: i }));
  (c.speaking || []).forEach((it, i) => f.push({ kind: 'speak', section: 'speaking', it, index: i }));
  (c.quiz || []).forEach((q, i) => f.push({ kind: 'quiz', section: 'quiz', q, index: i }));
  f.push({ kind: 'tips', section: 'tips' });
  f.push({ kind: 'results', section: null });
  return f;
}

/** How many items each section holds, i.e. what the learner is about to do. */
function itemCount(key, c) {
  switch (key) {
    case 'vocab': return len(c.vocabulary);
    case 'phrases': return len(c.phrases);
    case 'dialogue': return len(c.dialogue?.lines);
    case 'reading': return len(c.reading?.questions);
    case 'grammar': return len(c.grammar?.practice);
    case 'listening': return len(c.listening);
    case 'speaking': return len(c.speaking);
    case 'quiz': return len(c.quiz);
    case 'tips': return len(c.tips);
    default: return 0;
  }
}

function sectionSeconds(s, c, languageCode) {
  let secs = itemCount(s.key, c) * s.seconds;
  if (s.key === 'reading') secs += countWords(c.reading?.passage, languageCode) / READING_WPM * 60;
  if (s.key === 'grammar' && c.grammar) secs += GRAMMAR_INTRO_SECONDS;
  return secs;
}

/**
 * The table of contents shown before the lesson starts. A section the lesson
 * does not have is left out rather than listed as zero.
 */
export function lessonPlan(c, languageCode = c.language_code || 'en') {
  return SECTIONS
    .map(s => ({ key: s.key, tab: s.tab, unit: s.unit, tone: s.tone, count: itemCount(s.key, c) }))
    .filter(s => s.count > 0);
}

/**
 * Minutes the lesson should take, rounded to the nearest five: an estimate
 * that claims to know "27 minutes" is pretending. Never less than five.
 */
export function estimateMinutes(c, languageCode = c.language_code || 'en') {
  const secs = SECTIONS.reduce((sum, s) => sum + sectionSeconds(s, c, languageCode), 0);
  return Math.max(5, Math.round(secs / 60 / 5) * 5);
}

/**
 * The progress bar, one segment per section, sized by how many screens it has.
 * `done` counts the screens of that section already left behind, so the
 * segment the learner is in fills as they go. On the results screen every
 * segment is full.
 */
export function sectionProgress(flow, stepIdx) {
  const segs = [];
  const at = {};
  flow.forEach((st, i) => {
    if (!st.section) return;
    let seg = at[st.section];
    if (!seg) { seg = at[st.section] = { key: st.section, steps: 0, done: 0 }; segs.push(seg); }
    seg.steps++;
    if (i < stepIdx) seg.done++;
  });
  return segs;
}

/** The section the current screen belongs to, or null on intro and results. */
export function currentSection(flow, stepIdx) {
  return flow[stepIdx]?.section ?? null;
}

/** Count exercises completed, including individual cards inside the vocabulary deck. */
export function lessonCompletion(flow, stepIdx, state, vocabularyCount) {
  const weight = step => ['intro', 'results'].includes(step.kind) ? 0
    : step.kind === 'deck' ? vocabularyCount : 1;
  const total = flow.reduce((sum, step) => sum + weight(step), 0);
  let completed = flow.slice(0, stepIdx).reduce((sum, step) => sum + weight(step), 0);
  const step = flow[stepIdx];
  if (step?.kind === 'deck') completed += Math.max(0, Math.min(vocabularyCount, state.deck?.i || 0));
  const prefix = { rmcq: 'r', listen: 'l', quiz: 'q' }[step?.kind];
  if ((prefix && state.mcq?.[prefix + step.index]?.checked)
    || (step?.kind === 'gap' && state.gap?.['g' + step.index]?.checked)) completed++;
  return { completed: Math.min(total, completed), total };
}

/**
 * The generator likes to append the level to the title — "Personal training –
 * B2 lesson", "Contracts (B2)" — which the intro already shows on its own.
 * Drop a short trailing part that names the level; keep anything longer, and
 * keep the title whole if nothing would be left of it.
 */
export function cleanTitle(title, level, languageCode = 'en') {
  const s = String(title ?? '').trim();
  if (!level) return s;
  const lv = String(level).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = part => new RegExp(`(^|[^\\p{L}\\p{N}])${lv}($|[^\\p{L}\\p{N}])`, 'iu').test(part);
  const short = part => countWords(part, languageCode) <= 4;

  // "(B2)" or "[B2 lesson]" at the end.
  let m = s.match(/^(.*?)\s*[([]([^()[\]]*)[)\]]\s*$/u);
  if (m && m[1].trim() && named(m[2]) && short(m[2])) return m[1].trim();
  // " – lecție B2", " - Level B2", ": B2" at the end. Every dash only counts
  // with spaces round it, so neither "check-in" nor a range like "B1–B2" is
  // split in the middle.
  m = s.match(/^(.*\S)(?:\s+[-–—|]\s+|:\s+)(.+)$/u);
  if (m && m[1].trim() && named(m[2]) && short(m[2])) return m[1].trim();
  return s;
}

/** The palette a section is drawn in, or null for intro and results. */
export const sectionTone = key => SECTIONS.find(s => s.key === key)?.tone ?? null;
