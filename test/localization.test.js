import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import base from '../public/js/catalog/ro.js';
import en from '../public/js/catalog/en.js';
import ru from '../public/js/catalog/ru.js';
import { localizedDomain, localizedTopic } from '../public/js/catalog-labels.js';
import { UI_LANGS, getLang, initI18n, setLang, domainName, topicName, languageName, t } from '../public/js/i18n.js';
import { profileLanguage, restoreProfileLanguage, saveProfileLanguage } from '../public/js/profile-language.js';
import { loadLocalizedLesson, saveLocalizedLesson } from '../public/js/lesson-cache.js';

const saved = new Map();
globalThis.localStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value),
  removeItem: key => saved.delete(key),
};
globalThis.document = { documentElement: {}, querySelectorAll: () => [], querySelector: () => null };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'ro' }, configurable: true });

test('every selectable language covers every seeded domain and topic, plus UI error messages', async () => {
  const seed = await fs.readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  for (const { code } of UI_LANGS) {
    const catalog = (await import(`../public/js/catalog/${code}.js`)).default;
    const strings = (await import(`../public/js/i18n/${code}.js`)).default;
    assert.deepEqual(Object.keys(catalog), Object.keys(base), code);
    for (const [slug, d] of Object.entries(base)) {
      assert.ok(seed.includes(`('${slug}', '${d.name}', '', '${d.description}',`), slug);
      assert.equal(catalog[slug].topics.length, d.topics.length, `${code}/${slug}`);
      assert.ok(catalog[slug].name.trim() && catalog[slug].description.trim());
      assert.ok(catalog[slug].topics.every(topic => typeof topic === 'string' && topic.trim()));
    }
    for (const key of ['set.language.hint', 'set.language.saveFailed', 'les.language.needsSetup', 'les.quota']) {
      assert.ok(strings[key]?.trim(), `${code}/${key}`);
    }
  }
});

test('existing Romanian topic keys get localized without modifying learning data', () => {
  const topic = base.it.topics[0];
  const selected = { domain_slug: 'it', topics: [topic] };
  const before = structuredClone(selected);
  assert.match(localizedTopic('it', topic, en), /technical interview/i);
  assert.match(localizedTopic('it', topic, ru), /Техническ/);
  assert.equal(localizedDomain('finance', en), 'Finance & Accounting');
  assert.deepEqual(selected, before);
  assert.equal(localizedTopic('custom', 'New topic', en), 'New topic');
  assert.equal(localizedDomain({ slug: 'custom', name: 'Custom field' }, en), 'Custom field');
  assert.equal(localizedTopic('custom', 'Topic key', { custom: { topics: { 'Topic key': 'Translated' } } }), 'Translated');
});

test('changing the base language updates catalog labels, language names and saved choice', async () => {
  await initI18n();
  for (const code of ['en', 'ru', 'ar', 'ro']) {
    await setLang(code);
    assert.equal(getLang(), code);
    assert.equal(document.documentElement.lang, code);
    assert.equal(document.documentElement.dir, code === 'ar' ? 'rtl' : 'ltr');
    assert.equal(saved.get('uiLang'), code);
    assert.equal(saved.get('uiLangPending'), code);
  }
  await setLang('en');
  assert.equal(domainName('finance'), 'Finance & Accounting');
  assert.match(topicName('it', base.it.topics[0]), /technical interview/i);
  assert.equal(languageName('de'), 'German');
  assert.equal(t('ob.s1.h1'), 'Which language do you want to learn?');
});

const profileClient = (error = null) => {
  const writes = [];
  return { writes, from: table => ({ update: row => ({ eq: async (column, id) => {
    writes.push({ table, row, column, id });
    return { error };
  } }) }) };
};

test('a pre-login choice takes precedence and is saved to the account as a code', async () => {
  await setLang('en');
  const sb = profileClient();
  const profile = { native_language: 'Română', onboarding_done: true };
  await restoreProfileLanguage(sb, 'user-1', profile);
  assert.equal(profile.native_language, 'en');
  assert.equal(sb.writes[0].row.native_language, 'en');
  assert.equal(sb.writes[0].id, 'user-1');
  assert.equal(saved.has('uiLangPending'), false);
});

test('the account preference is restored on another device, including unfinished onboarding', async () => {
  saved.clear();
  await initI18n();
  const sb = profileClient();
  await restoreProfileLanguage(sb, 'user-1', { native_language: 'ru', onboarding_done: false });
  assert.equal(getLang(), 'ru');
  assert.equal(saved.get('uiLang'), 'ru');
  assert.equal(sb.writes.length, 0);
  assert.equal(profileLanguage('Русский'), 'ru');
  assert.equal(profileLanguage('Română'), 'ro');
});

test('a language choice made in the previous app version survives the first login after upgrading', async () => {
  saved.clear();
  saved.set('uiLang', 'en');
  await initI18n();
  const sb = profileClient();
  await restoreProfileLanguage(sb, 'user-1', { native_language: 'Română', onboarding_done: true });
  assert.equal(getLang(), 'en');
  assert.equal(sb.writes[0].row.native_language, 'en');
});

test('rapid language choices finish with the last choice in both the UI and the account', async () => {
  await Promise.all([setLang('fi'), setLang('ru')]);
  assert.equal(getLang(), 'ru');
  const writes = [];
  let release;
  const sb = { from: () => ({ update: row => ({ eq: async () => {
    writes.push(row.native_language);
    if (writes.length === 1) await new Promise(resolve => { release = resolve; });
    return { error: null };
  } }) }) };
  const first = saveProfileLanguage(sb, 'rapid-user', 'en');
  const last = saveProfileLanguage(sb, 'rapid-user', 'ru');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(writes, ['en']);
  release();
  await Promise.all([first, last]);
  assert.deepEqual(writes, ['en', 'ru']);
});

test('failed preference saves retain the choice for a later retry', async () => {
  await setLang('en');
  const sb = profileClient({ message: 'Offline' });
  await assert.rejects(saveProfileLanguage(sb, 'user-1'), /Offline/);
  assert.equal(saved.get('uiLangPending'), 'en');
});

function cacheClient(responses) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, filters: [] };
    calls.push(call);
    const q = {
      select() { return q; },
      eq(key, value) { call.filters.push([key, value]); return q; },
      insert(row) { call.action = 'insert'; call.row = row; return q; },
      update(row) { call.action = 'update'; call.row = row; return q; },
      upsert(row) { call.action = 'upsert'; call.row = row; return q; },
      maybeSingle() { return q; }, single() { return q; },
      then(resolve, reject) { return Promise.resolve(responses.shift() || { data: null, error: null }).then(resolve, reject); },
    };
    return q;
  } };
}

const params = { lang: 'de', domain: 'it', topic: base.it.topics[0], level: 'A1' };
const original = { id: 'lesson-1', native_language: 'ro', content: { title: 'Română' }, model: 'old' };

test('a cached lesson in another base language preserves the original lesson id', async () => {
  const sb = cacheClient([{ data: original }, { data: { content: { title: 'English' }, model: 'new' } }]);
  const row = await loadLocalizedLesson(sb, params, 'en');
  assert.equal(row.id, original.id);
  assert.equal(row.native_language, 'ro');
  assert.equal(row.content.title, 'English');
  assert.deepEqual(sb.calls[1].filters, [['lesson_id', 'lesson-1'], ['native_language', 'en']]);
  assert.equal(original.content.title, 'Română');
});

test('a missing localized version does not display the Romanian cached content', async () => {
  const sb = cacheClient([{ data: original }, { data: null }]);
  const row = await loadLocalizedLesson(sb, params, 'en');
  assert.equal(row.id, original.id);
  assert.equal(row.content, null);
  const missingTable = cacheClient([{ data: original }, { error: { code: 'PGRST205', message: 'Missing table' } }]);
  await assert.rejects(loadLocalizedLesson(missingTable, params, 'en'), err => err.code === 'localization_setup');
});

test('saving a language variant writes to its own cache and leaves the base lesson untouched', async () => {
  const sb = cacheClient([{ error: null }]);
  const row = await saveLocalizedLesson(sb, { params, nativeLanguage: 'en', content: { title: 'English' },
    model: 'new', userId: 'user-1', baseRow: original });
  assert.equal(row.id, original.id);
  assert.equal(sb.calls.length, 1);
  assert.equal(sb.calls[0].table, 'lesson_localizations');
  assert.equal(sb.calls[0].row.native_language, 'en');
  assert.equal(sb.calls[0].row.lesson_id, original.id);
  assert.equal(original.content.title, 'Română');
});

test('a new base lesson records the language and a concurrent insert shares the existing id', async () => {
  const sb = cacheClient([{ data: { ...original, native_language: 'en' } }]);
  await saveLocalizedLesson(sb, { params, nativeLanguage: 'en', content: {}, model: 'new', userId: 'user-1' });
  assert.equal(sb.calls[0].row.native_language, 'en');
  const concurrent = cacheClient([
    { error: { code: '23505', message: 'Duplicate' } }, { data: original }, { data: null }, { error: null },
  ]);
  const row = await saveLocalizedLesson(concurrent, { params, nativeLanguage: 'en', content: { title: 'English' }, model: 'new', userId: 'user-1' });
  assert.equal(row.id, original.id);
  assert.equal(concurrent.calls.at(-1).table, 'lesson_localizations');
});
