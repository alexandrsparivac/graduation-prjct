import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareLessonContext, lessonRequestKey, validateCoreNovelty, generateLessonParts, refineLessonParts, DOMAIN_DESIGNS, LEVEL_DESIGNS, normalizeMaterial } from '../lib/lesson-design.js';
import { buildSectionPrompt, parseLessonReview } from '../lib/lesson-prompt.js';
import { previousLessonMaterial, sanitizeLessonHistory } from '../public/js/lesson-variation.js';
import catalog from '../public/js/catalog/en.js';

const request = { language: 'English', languageCode: 'en', domain: 'Agricultură', domainSlug: 'agriculture',
  topic: 'Viticultură', topicKey: 'Viticultură', level: 'A1', nativeLanguage: 'Română', variationId: 'variant-two' };
const core = {
  scenario: 'Preparing equipment for a grapevine inspection.', objectives: ['Check equipment'],
  vocabulary: ['ladder', 'secateurs', 'trellis', 'tendril', 'rootstock', 'twine', 'gloves', 'clip',
    'hook', 'basket', 'spade', 'mulch', 'shade', 'sunlight', 'drainage'].map(term => ({ term })),
  phrases: ['Bring the ladder here.', 'These gloves are wet.', 'Cut this twine carefully.',
    'The basket is full.', 'We need a longer hook.', 'There is shade near the gate.',
    'Keep the secateurs clean.', 'Is the drainage open?'].map(phrase => ({ phrase })),
};

test('every catalog domain has a workplace brief and every CEFR level has a different teaching design', () => {
  assert.deepEqual(Object.keys(DOMAIN_DESIGNS).sort(), Object.keys(catalog).sort());
  assert.equal(new Set(Object.values(LEVEL_DESIGNS)).size, 6);
  const profiles = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(level => prepareLessonContext({ ...request, level }));
  assert.match(profiles[0].levelBrief, /short independent sentences/);
  assert.match(profiles[3].levelBrief, /justify a decision/);
  assert.match(profiles[5].levelBrief, /subtle distinctions/);
  assert.match(profiles[0].domainBrief, /vineyard operations only/);
});

test('generation resolves stable domain/topic keys to English while keeping explanations in the base language', () => {
  const ctx = prepareLessonContext(request);
  assert.equal(ctx.topic, 'Viticulture');
  assert.equal(ctx.domain, 'Agriculture');
  assert.equal(ctx.nativeLanguage, 'Română');
  assert.throws(() => prepareLessonContext({ ...request, level: 'X3' }), /CEFR/);
  assert.throws(() => prepareLessonContext({ ...request, level: 'toString' }), /CEFR/);
  assert.throws(() => prepareLessonContext({ ...request, topic: {} }), /invalid/);
});

test('request sharing distinguishes users, variants and exclusion lists, while preserving identical retries', () => {
  const ctx = prepareLessonContext(request);
  assert.equal(lessonRequestKey('one', ctx), lessonRequestKey('one', prepareLessonContext(request)));
  assert.notEqual(lessonRequestKey('one', ctx), lessonRequestKey('two', ctx));
  assert.notEqual(lessonRequestKey('one', ctx), lessonRequestKey('one', prepareLessonContext({ ...request, variationId: 'another' })));
  assert.notEqual(lessonRequestKey('one', ctx), lessonRequestKey('one', prepareLessonContext({ ...request, avoid: { terms: ['vine'] } })));
});

test('new vocabulary rejects repeats, plurals, inflections and renamed terms before the rest of the lesson is generated', () => {
  const ctx = prepareLessonContext({ ...request, avoid: { terms: ['grape', 'prune'], phrases: ['Please check the grape crates.'] } });
  assert.deepEqual(validateCoreNovelty(core, ctx), { valid: true });
  for (const term of ['grapes', 'The grape', 'red grape', 'pruning', 'PRUNE']) {
    const repeated = { ...core, vocabulary: [{ term }] };
    assert.equal(validateCoreNovelty(repeated, ctx).valid, false, term);
  }
  assert.equal(normalizeMaterial('Berries', 'en'), normalizeMaterial('berry', 'en'));
  assert.equal(validateCoreNovelty({ ...core, vocabulary: [{ term: 'ladder' }, { term: 'ladders' }] }, ctx).valid, false);
  const nearPhrase = { ...core, phrases: [{ phrase: 'Do check these grape crates, please.' }] };
  assert.equal(validateCoreNovelty(nearPhrase, ctx).valid, false);
});

test('past vocabulary survives successive saved variants and newest material is retained at the history limit', () => {
  const first = { title: 'Inspecting vines', vocabulary: [{ term: 'vine' }], phrases: [{ phrase: 'Check the vine.' }] };
  const history = previousLessonMaterial(first);
  const next = previousLessonMaterial({ ...core, generation: { history, focus: 'Inspecting supports' } });
  assert.ok(next.terms.includes('vine') && next.terms.includes('ladder'));
  assert.ok(next.phrases.includes('Check the vine.'));
  assert.ok(next.scenarios.includes('Inspecting vines'));
  const bounded = previousLessonMaterial({ vocabulary: [{ term: 'most recent' }],
    generation: { history: { terms: Array.from({ length: 240 }, (_, i) => `old ${i}`) } } });
  assert.equal(bounded.terms.length, 240);
  assert.equal(bounded.terms.at(-1), 'most recent');
  assert.deepEqual(sanitizeLessonHistory({ terms: {}, phrases: [null, 3, ' valid '] }).phrases, ['valid']);
});

test('the next workflow focus differs from recent variants and all section prompts retain the exact topic and level', () => {
  const first = prepareLessonContext(request);
  const next = prepareLessonContext({ ...request, avoid: { focuses: [first.focus], terms: ['vine'], phrases: ['Check the vine.'] } });
  assert.notEqual(next.focus, first.focus);
  const corePrompt = buildSectionPrompt('core', next)[1].content;
  assert.match(corePrompt, /Excluded vocabulary: \["vine"\]/);
  const storyPrompt = buildSectionPrompt('story', { ...next, lessonCore: core })[1].content;
  assert.match(storyPrompt, /Viticulture/);
  assert.match(storyPrompt, /CEFR A1 TEACHING DESIGN/);
  assert.ok(storyPrompt.includes(core.scenario));
  assert.ok(storyPrompt.includes('secateurs'));
});

test('story, practice and quiz wait for the new core and then share its concrete scenario and vocabulary', async () => {
  const calls = [];
  let release;
  const ctx = prepareLessonContext(request);
  const pending = generateLessonParts(ctx, async (section, context, deadline) => {
    calls.push({ section, context, deadline });
    if (section === 'core') await new Promise(resolve => { release = resolve; });
    return { section, data: section === 'core' ? core : {}, model: 'test' };
  }, 1234);
  assert.deepEqual(calls.map(call => call.section), ['core']);
  release();
  const results = await pending;
  assert.equal(results.length, 4);
  assert.deepEqual(calls.slice(1).map(call => call.section), ['story', 'practice', 'quiz']);
  for (const call of calls.slice(1)) {
    assert.equal(call.context.lessonCore, core);
    assert.equal(call.context.focus, ctx.focus);
    assert.equal(call.deadline, 1234);
  }
});

test('a failed core does not waste calls on unrelated remaining sections', async () => {
  const calls = [];
  const results = await generateLessonParts(prepareLessonContext(request), async section => {
    calls.push(section); return { section, data: null, quota: true };
  }, 1234);
  assert.deepEqual(calls, ['core']);
  assert.equal(results[0].quota, true);
});

test('correctness review rejects contradictory or malformed assessments', () => {
  assert.equal(parseLessonReview('{"valid":true,"issues":[{"section":"story","reason":"Wrong instrument"}]}'), null);
  assert.equal(parseLessonReview('{"valid":false,"issues":[]}'), null);
  assert.equal(parseLessonReview('{"valid":false,"issues":[{"section":"unknown","reason":"No"}]}'), null);
  assert.deepEqual(parseLessonReview('{"valid":false,"issues":[{"section":"practice","reason":"Answer does not follow transcript"}]}'),
    { valid: false, issues: [{ section: 'practice', reason: 'Answer does not follow transcript' }] });
});

const initial = () => ['core', 'story', 'practice', 'quiz'].map(section => ({ section, data: section === 'core' ? core : {}, model: 'test' }));

test('a wrong answer or factual error repairs only its section using the same lesson plan', async () => {
  const generated = [], reviews = [];
  const fixed = await refineLessonParts(prepareLessonContext(request), initial(), async (section, ctx, deadline, feedback) => {
    generated.push({ section, ctx, deadline, feedback });
    return { section, data: { fixed: true }, model: 'test' };
  }, async parts => {
    reviews.push(parts);
    return parts.practice.fixed ? { valid: true, issues: [] }
      : { valid: false, issues: [{ section: 'practice', reason: 'The transcript says slowly, so option 1 is correct.' }] };
  }, 1234);
  assert.equal(reviews.length, 2);
  assert.deepEqual(generated.map(call => call.section), ['practice']);
  assert.equal(generated[0].ctx.lessonCore, core);
  assert.match(generated[0].feedback, /option 1/);
  assert.equal(fixed.find(result => result.section === 'practice').data.fixed, true);
});

test('a weak domain-specific plan is replaced together with all dependent sections', async () => {
  const calls = [];
  let count = 0;
  const replacement = { ...core, scenario: 'Checking grapevine trellis wires.' };
  await refineLessonParts(prepareLessonContext(request), initial(), async (section, ctx, _deadline, feedback) => {
    calls.push({ section, ctx, feedback });
    return { section, data: section === 'core' ? replacement : {}, model: 'test' };
  }, async () => ++count === 1
    ? { valid: false, issues: [{ section: 'core', reason: 'Generic warehouse vocabulary; teach actual grapevine cultivation.' }] }
    : { valid: true, issues: [] }, 1234);
  assert.deepEqual(calls.map(call => call.section), ['core', 'story', 'practice', 'quiz']);
  assert.match(calls[0].feedback, /grapevine cultivation/);
  calls.slice(1).forEach(call => assert.equal(call.ctx.lessonCore, replacement));
});
