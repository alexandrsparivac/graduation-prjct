import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const publicDir = new URL('../public/', import.meta.url);
const lessonHtml = await readFile(new URL('lesson.html', publicDir), 'utf8');
const lessonScript = lessonHtml.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const dashboardHtml = await readFile(new URL('dashboard.html', publicDir), 'utf8');
const onboardingHtml = await readFile(new URL('onboarding.html', publicDir), 'utf8');
const reviewHtml = await readFile(new URL('review.html', publicDir), 'utf8');

function scriptBlock(html, startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Could not find script block ${startMarker}`);
  return html.slice(start, end);
}

function queryResult(result) {
  const builder = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return builder;
}

function runBlock(source, context) {
  return vm.runInNewContext(`(async () => { ${source}\n})()`, context);
}

test('every inline page script parses before navigation or startup runs', async () => {
  for (const page of (await readdir(publicDir)).filter(file => file.endsWith('.html'))) {
    const html = await readFile(new URL(page, publicDir), 'utf8');
    for (const [, attrs, source] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      const args = ['--check'];
      if (/type=["']module["']/.test(attrs)) args.push('--input-type=module');
      const result = spawnSync(process.execPath, args, { input: source, encoding: 'utf8' });
      assert.equal(result.status, 0, `${page}: ${result.stderr}`);
    }
  }
});

test('missing lesson parameters redirect to the dashboard and stop execution', () => {
  const redirects = [];
  const start = lessonScript.indexOf('  const q = new URLSearchParams(location.search);');
  const end = lessonScript.indexOf('  const locale =', start);
  assert.ok(start >= 0 && end > start);
  assert.throws(() => vm.runInNewContext(lessonScript.slice(start, end), {
    URLSearchParams, location: { search: '?lang=en&level=A1', replace: url => redirects.push(url) },
  }), /redirect/);
  assert.deepEqual(redirects, ['/dashboard']);
});

test('dashboard redirects for an empty language list only after successful reads', async () => {
  const block = scriptBlock(dashboardHtml, '  const [userLangsResult, languagesResult, domainsResult]', '\n\n  const langByCode');
  const redirected = [];
  const readError = { message: 'database unavailable' };
  const failed = {
    sb: { from: table => queryResult(table === 'user_languages' ? { data: null, error: readError } : { data: [], error: null }) },
    user: { id: 'user-1' }, location: { replace: url => redirected.push(url) },
    failRead: error => { throw new Error(`read-failure:${error.message}`); },
  };
  await assert.rejects(runBlock(block, failed), /read-failure:database unavailable/);
  assert.deepEqual(redirected, []);

  const empty = {
    ...failed,
    sb: { from: () => queryResult({ data: [], error: null }) },
  };
  await assert.rejects(runBlock(block, empty), /redirect/);
  assert.deepEqual(redirected, ['/onboarding']);
});

test('onboarding catalog read failures are not reported as an empty database', async () => {
  const block = scriptBlock(onboardingHtml, '  const [languagesResult, domainsResult]', '\n\n  let selectionLoadError');
  const messages = [];
  const context = {
    sb: { from: () => queryResult({ data: null, error: { message: 'catalog unavailable' } }) },
    msg: {}, showMsg: (_element, message) => messages.push(message), t: key => key,
  };
  await assert.rejects(runBlock(block, context), /page-data-unavailable/);
  assert.deepEqual(messages, ['catalog unavailable']);
});

test('review shows a language query failure instead of redirecting to onboarding', async () => {
  const block = scriptBlock(reviewHtml, '  const { data: userLangs, error: userLangsError }', '\n\n  let language =');
  const redirected = [];
  const messages = [];
  const context = {
    sb: { from: () => queryResult({ data: null, error: { message: 'language read failed' } }) },
    user: { id: 'user-1' }, stage: {}, location: { replace: url => redirected.push(url) },
    showMsg: (_element, message) => messages.push(message), hidePageLoader() {},
    document: { getElementById: () => ({}) },
  };
  await assert.rejects(runBlock(block, context), /page-data-unavailable/);
  assert.deepEqual(messages, ['language read failed']);
  assert.deepEqual(redirected, []);
});

for (const expiredBeforeRequest of [true, false]) {
  test(`lesson generation redirects to login when ${expiredBeforeRequest ? 'the session is missing' : 'the API rejects the session'}`, async () => {
    const redirects = [];
    let requests = 0;
    const start = lessonScript.indexOf('  async function askForLesson()');
    const end = lessonScript.indexOf('  async function generate()', start);
    assert.ok(start >= 0 && end > start);
    const context = {
      sb: { auth: { getSession: async () => ({ data: { session: expiredBeforeRequest ? null : { access_token: 'test-token' } } }) } },
      withTimeout: promise => promise,
      location: { replace: url => redirects.push(url) },
      params: { lang: 'en', domain: 'agriculture', topic: 'Horticultură', level: 'A1' },
      contentLang: 'ro', content: null, D: null,
      t: key => key, languageName: value => value, domainName: value => value,
      topicName: (_domain, topic) => topic, langMeta: () => ({ label: 'Română' }),
      previousLessonMaterial: () => ({}), crypto: { randomUUID: () => 'test-attempt' },
      AbortSignal,
      fetch: async () => { requests++; return { status: 401, ok: false, json: async () => ({}) }; },
    };
    await assert.rejects(vm.runInNewContext(`${lessonScript.slice(start, end)}\naskForLesson();`, context), /redirect/);
    assert.deepEqual(redirects, ['/login']);
    assert.equal(requests, expiredBeforeRequest ? 0 : 1);
  });
}
