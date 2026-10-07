import { createHash, randomUUID } from 'node:crypto';
import catalog from '../public/js/catalog/en.js';
import sourceCatalog from '../public/js/catalog/ro.js';
import { sanitizeLessonHistory } from '../public/js/lesson-variation.js';

// Language difficulty follows the CEFR communicative progression. Technical
// objects can be taught at A1; their sentence structures still stay elementary.
// Reference: https://www.coe.int/en/web/common-european-framework-reference-languages/table-1-cefr-3.3-common-reference-levels-global-scale
export const LEVEL_DESIGNS = Object.freeze({
  A1: 'Name concrete topic-specific tools, objects and actions. Ask for an item, identify a place, follow one simple instruction. Use short independent sentences, basic present forms, simple questions and imperatives appropriate to the target language. Avoid abstract explanations, complex clauses and idioms. Specialist concrete nouns are allowed with simple examples. Reading is a short labelled work note or very simple instructions, split into short sentences. Quiz checks explicit information and direct word meanings.',
  A2: 'Exchange routine work information: quantities, timing, a simple sequence, a short request or a basic problem. Use simple connected sentences, common past/future forms, basic comparisons and polite requests appropriate to the target language. Reading is a routine note, schedule or short instruction sheet. Quiz checks routine exchanges and a clear sequence of actions.',
  B1: 'Describe a familiar work process or incident, explain a cause, give a short reason and propose a practical next step. Use connected paragraphs, time sequencing, common conditionals and cause/effect links appropriate to the target language. Reading is a handover, incident summary or practical procedure. Quiz checks process understanding, causes and straightforward decisions.',
  B2: 'Discuss a technical problem in this specific topic, compare realistic options, justify a decision and clarify constraints. Use precise field terminology, coherent argument, natural professional politeness, complex clauses and conditional/hypothetical forms appropriate to the language. Reading is a technical memo or recommendation. Quiz checks trade-offs, implications and justified decisions, rather than elementary word matching.',
  C1: 'Handle a complex topic-specific case: negotiate constraints, recognise implicit meaning, qualify claims and synthesise a professional recommendation. Use flexible register, precise collocations, cohesive argument and nuanced grammatical choices natural in the language. Reading is an analytical professional brief. Quiz tests inference, stance, register and the strength of an argument.',
  C2: 'Resolve a demanding topic-specific discussion with ambiguity, competing interpretations or subtle distinctions. Use very precise terminology, idiomatic professional register where appropriate, nuanced modality and sophisticated but natural structure. Reading synthesises contrasting evidence into a concise expert brief. Quiz tests fine shades of meaning, implied reservations and reformulation for a particular audience.',
});

export const DOMAIN_DESIGNS = Object.freeze({
  it: 'Software developers, support engineers or product teams working with code, tickets, logs, deployments, requirements and technical decisions.',
  medical: 'Healthcare staff communicating about patients, symptoms, observations, care processes, appointments, handovers and clinical documentation.',
  business: 'Managers, colleagues and clients handling a concrete meeting, proposal, negotiation, team decision, plan or business deliverable.',
  finance: 'Accountants, banking staff, auditors and analysts working with transactions, invoices, reconciliations, budgets, financial statements or financial controls.',
  legal: 'Legal professionals and clients working with clauses, legal documents, evidence, rights, obligations or a specific procedural step.',
  marketing: 'Marketing and sales staff handling campaign briefs, audiences, positioning, customer objections, channels and measurable results.',
  tourism: 'Travel staff, guides and travellers dealing with actual bookings, itineraries, transport, destinations and service requests.',
  horeca: 'Restaurant, kitchen, hotel and bar staff dealing with orders, ingredients, preparation, dietary needs, service or hospitality operations.',
  engineering: 'Engineers and site staff working with drawings, specifications, tools, materials, measurements, construction processes or inspections.',
  automotive: 'Mechanics, drivers, logistics staff and customers working with vehicle components, diagnostics, repairs, routes, loads or deliveries.',
  education: 'Teachers, learners and academic staff dealing with teaching tasks, assessments, course requirements, feedback or research communication.',
  science: 'Researchers and laboratory staff dealing with experiments, equipment, samples, measurements, methods, results and interpretation.',
  agriculture: 'Farm and vineyard workers dealing with crop-specific plants, cultivation, tools, irrigation, plant condition, seasonal work and harvest handling. For viticulture, use grapevine cultivation and vineyard operations only: planting, propagation, trellising, shoot/leaf management, vine condition or harvest decisions. Do not drift into unrelated crops, generic warehouse packing or wine production.',
  retail: 'Shop staff and customers dealing with specific products, stock, purchases, checkout, returns or online orders.',
  realestate: 'Property agents, buyers, tenants and owners dealing with viewings, features, leases, financing, renovation or utilities.',
  sports: 'Coaches, athletes and gym staff dealing with particular exercises, equipment, technique, training plans, performance or recovery.',
  gaming: 'Players, teams, developers and streamers dealing with a specific match, game mechanic, team call, hardware issue or gaming community task.',
  arts: 'Artists, performers and audiences dealing with a particular work, technique, rehearsal, performance, exhibition or creative critique.',
  media: 'Journalists, editors and media producers dealing with interviews, sources, verification, editing, recording, publishing or reporting.',
  psychology: 'Psychology and social-work contexts involving feelings, support conversations, relationships, observation, boundaries and a specific support task.',
  beauty: 'Beauty professionals and clients dealing with consultation, hair, skin, products, tools, treatment steps or a desired appearance.',
  aviation: 'Pilots, cabin staff, ground staff and passengers dealing with flight stages, airport operations, equipment and clear aviation-related communication.',
  military: 'Military personnel dealing with routine organisation, roles, equipment checks, briefings, logistics and professional communication.',
  everyday: 'People carrying out the selected real-life task with concrete objects, places, needs and interactions.',
  religion: 'Participants in religious and community life discussing the selected practice, event, text, belief or respectful interfaith conversation.',
});

const FOCUSES = [
  'Preparing the tools or materials for one specific task',
  'Checking condition or quality before starting the task',
  'Performing a different concrete stage of the selected process',
  'Spotting a small problem and arranging the next action',
  'Handing over work and reporting what has been done',
  'Organising quantities, timing or supplies for the task',
  'Comparing suitable ways to perform the task at the learner level',
  'Recording observations and confirming a practical result',
];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function prepareLessonContext(input) {
  const fields = ['language', 'domain', 'topic', 'level'];
  if (fields.some(key => typeof input?.[key] !== 'string' || !input[key].trim() || input[key].length > 200)) {
    throw new Error('Missing or invalid lesson fields');
  }
  if (!Object.hasOwn(LEVEL_DESIGNS, input.level)) throw new Error('Invalid CEFR level');
  if (input.variationId != null && (typeof input.variationId !== 'string' || input.variationId.length > 100)) {
    throw new Error('Invalid variation identifier');
  }
  const selected = Object.hasOwn(catalog, input.domainSlug) ? catalog[input.domainSlug] : null;
  const topicIndex = selected ? sourceCatalog[input.domainSlug].topics.indexOf(input.topicKey) : -1;
  const history = sanitizeLessonHistory(input.avoid);
  const variationId = input.variationId || randomUUID();
  const available = FOCUSES.filter(focus => !history.focuses.includes(focus));
  const focus = available[parseInt(digest(variationId).slice(0, 8), 16) % available.length];
  return {
    language: input.language.trim(), languageCode: typeof input.languageCode === 'string' ? input.languageCode.slice(0, 8) : '',
    domain: selected?.name || input.domain.trim(), domainSlug: selected ? input.domainSlug : '',
    topic: topicIndex >= 0 ? selected.topics[topicIndex] : input.topic.trim(),
    topicKey: topicIndex >= 0 ? input.topicKey : input.topic.trim(), level: input.level,
    nativeLanguage: typeof input.nativeLanguage === 'string' ? input.nativeLanguage.slice(0, 100) : 'Romanian',
    domainBrief: selected ? DOMAIN_DESIGNS[input.domainSlug] : input.domain.trim(),
    levelBrief: LEVEL_DESIGNS[input.level], history, variationId, focus,
    requestVariation: input.variationId || '',
  };
}

export const lessonRequestKey = (userId, ctx) => digest([userId, ctx.language, ctx.domain, ctx.topic,
  ctx.level, ctx.nativeLanguage, ctx.requestVariation, ctx.history]);

export function lessonDesignPrompt(ctx, section) {
  const design = `DOMAIN AND TOPIC BOUNDARY: ${ctx.domainBrief || ctx.domain}.
The exact topic "${ctx.topic}" is narrower than the domain. Every target term, example, phrase, dialogue line, reading detail, grammar exercise and test question must serve an authentic task in that topic. No generic office conversation or everyday filler. A sentence must lose its practical meaning if moved to an unrelated profession. Do not expand into other topics in the same domain.
CEFR ${ctx.level} TEACHING DESIGN: ${ctx.levelBrief || LEVEL_DESIGNS[ctx.level] || ''}
WORKFLOW FOCUS: ${ctx.focus || 'One concrete task in the selected topic'}. Interpret this only inside the exact topic and at this CEFR level. Choose a specific workplace situation with roles, tools/materials, an action and an observable outcome. Carry that same situation through every section.
Previous situations to avoid repeating: ${JSON.stringify(ctx.history?.scenarios || [])}. Change the actual task and communicative goal, not just names, numbers or the title.`;
  if (section === 'core') return `${design}
FRESH MATERIAL: All 15 target vocabulary items and all 8 target phrases must be new, mutually distinct and useful in this specific situation. Do not reuse an excluded target term, a plural/inflection of it, or the same term with an added adjective. Do not merely paraphrase a prior phrase. Common grammatical words may naturally recur inside sentences; the taught target material must change.
At least 10 of the 15 vocabulary items must name tools, objects, actions or concepts distinctive to this exact topic. At most 5 may be general words essential to this particular task. Avoid filling the list with generic words such as good, clean, dry, work or load. At A1 prefer concrete topic-specific objects/actions with very simple example sentences, rather than abstract jargon.
Check factual meanings and actual tool functions. Each translation and example must use the term correctly. Do not invent standard procedures, ideal measurements or universal thresholds.
Excluded vocabulary: ${JSON.stringify(ctx.history?.terms || [])}
Excluded phrases: ${JSON.stringify(ctx.history?.phrases || [])}`;
  const core = ctx.lessonCore;
  return `${design}
TEACH ONLY THE MATERIAL FROM THIS LESSON PLAN:
${JSON.stringify(core ? { scenario: core.scenario, objectives: core.objectives,
    vocabulary: core.vocabulary.map(({ term, translation, example }) => ({ term, translation, example })),
    phrases: core.phrases.map(({ phrase, translation }) => ({ phrase, translation })) } : {})}
Reuse this new vocabulary and these new phrases naturally to reinforce them. Each listening/speaking item and grammar example must have a concrete connection to the scenario. The quiz tests this lesson's new words, expressions and communicative objectives; do not test unexplained material from a previous lesson.`;
}

export function normalizeMaterial(text, languageCode = '') {
  let words = String(text).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/u);
  if (languageCode === 'en') {
    words = words.filter(word => !['a', 'an', 'the'].includes(word)).map(word => {
      if (word.endsWith('ies') && word.length > 4) word = word.slice(0, -3) + 'y';
      else if (/(ches|shes|xes|zes|sses)$/.test(word)) word = word.slice(0, -2);
      else if (word.endsWith('s') && word.length > 3 && !/(ss|us|is)$/.test(word)) word = word.slice(0, -1);
      if (word.length > 5 && /(ing|ed)$/.test(word)) {
        word = word.replace(/(ing|ed)$/, '').replace(/([b-df-hj-np-tv-z])\1$/, '$1');
      }
      if (word.length >= 5 && word.endsWith('e')) word = word.slice(0, -1);
      return word;
    });
  }
  return words.join(' ');
}

const reusedTerm = (term, old, lang) => {
  const value = normalizeMaterial(term, lang);
  return old.some(item => {
    const previous = normalizeMaterial(item, lang);
    return value === previous || ` ${value} `.includes(` ${previous} `);
  });
};
const phraseTokens = (phrase, lang) => new Set(normalizeMaterial(String(phrase).replace(/\p{N}+/gu, ''), lang).split(' ')
  .filter(word => lang !== 'en' || !['i', 'you', 'we', 'it', 'is', 'are', 'to', 'do', 'can', 'please', 'my', 'your', 'this', 'that'].includes(word)));
const reusedPhrase = (phrase, old, lang) => old.some(item => {
  if (normalizeMaterial(phrase, lang) === normalizeMaterial(item, lang)) return true;
  const a = phraseTokens(phrase, lang), b = phraseTokens(item, lang);
  const common = [...a].filter(word => b.has(word)).length;
  return Math.min(a.size, b.size) >= 2 && common / Math.min(a.size, b.size) >= 0.8;
});

export function validateCoreNovelty(core, ctx) {
  const terms = [...(ctx.history?.terms || [])], phrases = [...(ctx.history?.phrases || [])];
  for (const { term } of core.vocabulary) {
    if (reusedTerm(term, terms, ctx.languageCode)) return { valid: false, reason: `Repeated target vocabulary "${term}". Choose an entirely different topic-specific word, not an inflection or renamed old term.` };
    terms.push(term);
  }
  for (const { phrase } of core.phrases) {
    if (reusedPhrase(phrase, phrases, ctx.languageCode)) return { valid: false, reason: `Repeated or near-duplicate target phrase "${phrase}". Choose a different communicative expression in this topic.` };
    phrases.push(phrase);
  }
  return { valid: true };
}

/** Build the vocabulary plan first, then reinforce it in the three remaining sections. */
export async function generateLessonParts(ctx, generateSection, deadline, signal = null) {
  const core = await generateSection('core', ctx, deadline, null, signal);
  if (!core.data) return [core];
  const grounded = { ...ctx, lessonCore: core.data };
  const rest = await Promise.all(['story', 'practice', 'quiz']
    .map(section => generateSection(section, grounded, deadline, null, signal)));
  return [core, ...rest];
}

/** Repair only rejected sections; a changed vocabulary plan rebuilds its dependants. */
export async function refineLessonParts(ctx, initial, generateSection, review, deadline, maxReviews = 2, signal = null) {
  let results = initial;
  for (let round = 0; round < maxReviews; round++) {
    const failed = results.filter(result => !result.data);
    if (failed.length) {
      const err = new Error(failed.map(result => result.reason).join('; '));
      err.quota = failed.every(result => result.quota);
      throw err;
    }
    const parts = Object.fromEntries(results.map(result => [result.section, result.data]));
    const assessment = await review(parts, ctx, deadline, signal);
    if (assessment.valid) return results;
    if (round === maxReviews - 1) throw new Error(assessment.issues.map(issue => issue.reason).join('; '));
    const coreIssue = assessment.issues.find(issue => issue.section === 'core');
    if (coreIssue) {
      results = await generateLessonParts(ctx, (section, scope, end) =>
        generateSection(section, scope, end, section === 'core' ? coreIssue.reason : null, signal), deadline, signal);
    } else {
      const fixes = new Map();
      for (const issue of assessment.issues) fixes.set(issue.section, [fixes.get(issue.section), issue.reason].filter(Boolean).join('; '));
      const replacements = await Promise.all([...fixes].map(([section, reason]) =>
        generateSection(section, { ...ctx, lessonCore: parts.core }, deadline, reason, signal)));
      results = results.map(result => replacements.find(replacement => replacement.section === result.section) || result);
    }
  }
  throw new Error('Lesson quality could not be verified');
}
