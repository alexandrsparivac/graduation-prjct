import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const loginHtml = await readFile(new URL('../public/login.html', import.meta.url), 'utf8');
const loginScript = loginHtml.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const start = loginScript.indexOf("  // --- Resetare parolă: pas 1 ---");
const end = loginScript.indexOf("  // --- Resetare parolă: pas 2 ---", start);
assert.ok(start >= 0 && end > start);
const requestHandler = loginScript.slice(start, end);

function setupRequest({ resetPasswordForEmail }) {
  const listeners = {};
  const messages = [];
  const loading = [];
  const fields = {
    'forgot-form': { addEventListener: (event, handler) => { listeners[event] = handler; } },
    'forgot-msg': {},
    'forgot-submit': {},
    'forgot-email': { value: '  learner@example.com  ' },
  };
  vm.runInNewContext(requestHandler, {
    document: { getElementById: id => fields[id] },
    window: { location: { origin: 'https://learn.example' } },
    URL,
    sb: { auth: { resetPasswordForEmail } },
    hideMsg: () => {},
    setLoading: (button, value) => loading.push([button, value]),
    showMsg: (_element, message, kind) => messages.push({ message, kind }),
    t: key => key,
  });
  return { submit: listeners.submit, fields, messages, loading };
}

test('password recovery sends a normalized email and a same-origin login redirect', async () => {
  const calls = [];
  const ui = setupRequest({
    resetPasswordForEmail: async (...args) => { calls.push(args); return { error: null }; },
  });
  let prevented = false;
  await ui.submit({ preventDefault: () => { prevented = true; } });

  assert.equal(prevented, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'learner@example.com');
  assert.equal(calls[0][1].redirectTo, 'https://learn.example/login');
  assert.deepEqual(ui.messages, [{ message: 'forgot.sent', kind: 'success' }]);
  assert.deepEqual(ui.loading, [[ui.fields['forgot-submit'], true], [ui.fields['forgot-submit'], false]]);
});

test('password recovery reports request failures and always re-enables the submit button', async () => {
  const ui = setupRequest({
    resetPasswordForEmail: async () => { throw new Error('Network unavailable'); },
  });
  await ui.submit({ preventDefault: () => {} });

  assert.deepEqual(ui.messages, [{ message: 'Network unavailable', kind: undefined }]);
  assert.deepEqual(ui.loading, [[ui.fields['forgot-submit'], true], [ui.fields['forgot-submit'], false]]);
});

const bootStart = loginScript.indexOf('  // Capture the callback');
const bootEnd = loginScript.indexOf('  // --- Login e-mail');
const resetHandler = loginScript.slice(end);
const learner = { user: { id: 'learner' } };

async function setupRecovery({ hash = '', stored = null, session = null, eventDuringInit = null, updateError = null } = {}) {
  const messages = [], redirects = [], loading = [], updates = [];
  const storage = new Map(stored ? [['pw-recovery', stored]] : []);
  const fields = Object.fromEntries(['login-msg', 'forgot-msg', 'reset-msg', 'reset-submit',
    'reset-new-password', 'reset-new-password-confirm', 'forgot-step-request', 'forgot-step-reset']
    .map(id => [id, { id, value: '', style: {} }]));
  let submit, authListener;
  fields['reset-form'] = {
    addEventListener: (_event, handler) => { submit = handler; },
    reset: () => {
      fields['reset-new-password'].value = '';
      fields['reset-new-password-confirm'].value = '';
    },
  };
  fields['forgot-step-reset'].style.display = 'none';
  const state = { session, error: null };
  const location = { href: `https://learn.example/login${hash}`, hash, search: '', replace: url => redirects.push(url) };
  const auth = {
    onAuthStateChange: listener => { authListener = listener; },
    getSession: async () => {
      if (eventDuringInit) {
        authListener(eventDuringInit, state.session);
        eventDuringInit = null;
      }
      return { data: { session: state.session }, error: state.error };
    },
    updateUser: async data => { updates.push(data); return { error: updateError }; },
  };
  await vm.runInNewContext(`(async () => {${loginScript.slice(bootStart, bootEnd)}\n${resetHandler}\n})()`, {
    URL, URLSearchParams,
    window: { location },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    // Supabase may clear the callback URL before getSession resolves.
    getSupabase: async () => { location.hash = ''; return { auth }; },
    getProfile: async () => ({ onboarding_done: true }),
    document: { getElementById: id => fields[id], querySelectorAll: () => [] },
    showView: name => {
      if (name === 'forgot') {
        fields['forgot-step-request'].style.display = '';
        fields['forgot-step-reset'].style.display = 'none';
      }
    },
    hideMsg: () => {}, hidePageLoader: () => {},
    showMsg: (element, message, kind) => messages.push({ id: element.id, message, kind }),
    setLoading: (_button, value) => loading.push(value),
    t: key => key, setTimeout: fn => fn(),
  });
  return { fields, storage, state, messages, redirects, loading, updates,
    emit: (event, s) => authListener(event, s),
    submit: async () => {
      fields['reset-new-password'].value = 'test-password-only';
      fields['reset-new-password-confirm'].value = 'test-password-only';
      await submit({ preventDefault() {} });
    },
  };
}

function assertExpired(ui) {
  assert.equal(ui.fields['forgot-step-reset'].style.display, 'none');
  assert.equal(ui.fields['forgot-step-request'].style.display, '');
  assert.equal(ui.storage.has('pw-recovery'), false);
  assert.equal(ui.messages.at(-1).message, 'reset.expired');
  assert.equal(ui.updates.length, 0);
}

test('a stale recovery flag without a session returns to the email request form', async () => {
  assertExpired(await setupRecovery({ stored: '1' }));
});

test('a recovery hash alone cannot authorize a password change', async () => {
  const ui = await setupRecovery({ hash: '#type=recovery' });
  assertExpired(ui);
  await ui.submit();
  assertExpired(ui);
  assert.deepEqual(ui.loading, [true, false]);
});

test('a valid recovery callback survives URL cleanup and completes with its own session', async () => {
  const ui = await setupRecovery({ hash: '#type=recovery', session: learner });
  assert.equal(ui.fields['forgot-step-reset'].style.display, '');
  assert.equal(ui.storage.get('pw-recovery'), 'learner');
  assert.deepEqual(ui.redirects, []);
  await ui.submit();
  assert.equal(ui.updates.length, 1);
  assert.equal(ui.messages.at(-1).message, 'reset.done');
  assert.equal(ui.storage.has('pw-recovery'), false);
  assert.equal(ui.fields['reset-new-password'].value, '');
  assert.deepEqual(ui.redirects, ['/dashboard']);
  assert.deepEqual(ui.loading, [true, false]);
});

test('PASSWORD_RECOVERY is handled during client initialization before any dashboard redirect', async () => {
  const ui = await setupRecovery({ session: learner, eventDuringInit: 'PASSWORD_RECOVERY' });
  assert.equal(ui.fields['forgot-step-reset'].style.display, '');
  assert.deepEqual(ui.redirects, []);
});

test('reloading a recovery form requires the same authenticated account', async () => {
  const valid = await setupRecovery({ stored: 'learner', session: learner });
  assert.equal(valid.fields['forgot-step-reset'].style.display, '');
  assertExpired(await setupRecovery({ stored: 'someone-else', session: learner }));
});

test('a fresh recovery link replaces a stale marker for a different account', async () => {
  const ui = await setupRecovery({ hash: '#type=recovery', stored: 'someone-else', session: learner });
  assert.equal(ui.fields['forgot-step-reset'].style.display, '');
  assert.equal(ui.storage.get('pw-recovery'), 'learner');
});

test('expired email links show a new-link request even with an unrelated live session', async () => {
  assertExpired(await setupRecovery({ hash: '#error=access_denied&error_code=otp_expired', session: learner }));
});

for (const session of [null, { user: { id: 'another-account' } }]) {
  test(`a ${session ? 'changed' : 'missing'} session at submit cannot change a password`, async () => {
    const ui = await setupRecovery({ hash: '#type=recovery', session: learner });
    ui.state.session = session;
    await ui.submit();
    assertExpired(ui);
    assert.deepEqual(ui.loading, [true, false]);
  });
}

test('signing out while the reset form is open clears it immediately', async () => {
  const ui = await setupRecovery({ hash: '#type=recovery', session: learner });
  ui.emit('SIGNED_OUT', null);
  assertExpired(ui);
});

test('a session rejected during update returns to the new-link request', async () => {
  const ui = await setupRecovery({ hash: '#type=recovery', session: learner,
    updateError: { name: 'AuthSessionMissingError', message: 'Auth session missing!' } });
  await ui.submit();
  assert.equal(ui.updates.length, 1);
  assert.equal(ui.messages.at(-1).message, 'reset.expired');
  assert.equal(ui.fields['forgot-step-reset'].style.display, 'none');
  assert.deepEqual(ui.redirects, []);
  assert.deepEqual(ui.loading, [true, false]);
});

test('temporary refresh failures keep the form available for retry', async () => {
  const ui = await setupRecovery({ hash: '#type=recovery', session: learner });
  ui.state.error = new Error('Network unavailable');
  await ui.submit();
  assert.equal(ui.updates.length, 0);
  assert.equal(ui.messages.at(-1).message, 'Network unavailable');
  assert.equal(ui.fields['forgot-step-reset'].style.display, '');
  assert.deepEqual(ui.loading, [true, false]);
});

test('ordinary authenticated visits still redirect to the dashboard', async () => {
  const ui = await setupRecovery({ session: learner });
  assert.deepEqual(ui.redirects, ['/dashboard']);
  assert.equal(ui.fields['forgot-step-reset'].style.display, 'none');
});
