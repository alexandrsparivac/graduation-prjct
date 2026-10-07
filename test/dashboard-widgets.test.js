import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardWidgets, DASHBOARD_WIDGETS, normalizeHiddenWidgets } from '../public/js/dashboard-widgets.js';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const account = (id = 'user-a', metadata = {}) => {
  const user = { id, user_metadata: structuredClone(metadata) };
  const writes = [];
  const sb = { auth: {
    getUser: async () => ({ data: { user: structuredClone(user) } }),
    getSession: async () => ({ data: { session: { user: { id: user.id } } } }),
    updateUser: async ({ data }) => {
      writes.push(structuredClone(data));
      Object.assign(user.user_metadata, data);
      return { data: { user: structuredClone(user) } };
    },
  } };
  return { user, sb, writes };
};

test('new accounts see every widget and invalid saved IDs are ignored', async () => {
  const a = account();
  const widgets = createDashboardWidgets({ ...a, storage: memoryStorage() });
  await widgets.init();
  assert.ok(DASHBOARD_WIDGETS.every(w => widgets.isVisible(w.id)));
  assert.deepEqual(normalizeHiddenWidgets(['activity', 'activity', 'unknown', null, 'words']), ['activity', 'words']);
  assert.deepEqual(normalizeHiddenWidgets({ activity: true }), []);
  assert.equal(await widgets.setVisible('unknown', false), false);
  assert.equal(a.writes.length, 0);
});

test('hidden widgets return on a second device and other account metadata is preserved', async () => {
  const a = account('user-a', { full_name: 'Test user', avatar_url: '/avatar.png' });
  const first = createDashboardWidgets({ ...a, storage: memoryStorage() });
  assert.equal(await first.setVisible('activity', false), true);
  const second = createDashboardWidgets({ ...a, storage: memoryStorage() });
  await second.init();
  assert.equal(second.isVisible('activity'), false);
  assert.equal(second.isVisible('level'), true);
  assert.equal(a.user.user_metadata.full_name, 'Test user');
  assert.equal(a.user.user_metadata.avatar_url, '/avatar.png');
  await second.setVisible('activity', true);
  assert.deepEqual(a.user.user_metadata.dashboard_widgets.hidden, []);
});

test('quick hide and add actions save the final selection even during an earlier save', async () => {
  const a = account();
  const original = a.sb.auth.updateUser;
  let release;
  let blocked = true;
  a.sb.auth.updateUser = async args => {
    if (blocked) { blocked = false; await new Promise(resolve => { release = resolve; }); }
    return original(args);
  };
  const widgets = createDashboardWidgets({ ...a, storage: memoryStorage() });
  const first = widgets.setVisible('activity', false);
  await new Promise(resolve => setImmediate(resolve));
  const second = widgets.setVisible('words', false);
  const third = widgets.setVisible('activity', true);
  release();
  assert.ok((await Promise.all([first, second, third])).every(Boolean));
  assert.deepEqual(a.user.user_metadata.dashboard_widgets.hidden, ['words']);
  assert.equal(a.writes.length, 2);
});

test('offline changes survive a reload and sync without being replaced by stale server preferences', async () => {
  const a = account();
  const storage = memoryStorage();
  const original = a.sb.auth.updateUser;
  a.sb.auth.updateUser = async () => ({ error: { message: 'Offline' } });
  const first = createDashboardWidgets({ ...a, storage });
  assert.equal(await first.setVisible('average', false), false);
  assert.equal(first.getStatus(), 'error');
  assert.equal(first.isVisible('average'), false);
  a.sb.auth.updateUser = original;
  const reloaded = createDashboardWidgets({ ...a, storage });
  assert.equal(reloaded.isVisible('average'), false);
  assert.equal(await reloaded.init(), true);
  assert.equal(reloaded.getStatus(), 'saved');
  assert.deepEqual(a.user.user_metadata.dashboard_widgets.hidden, ['average']);
  assert.equal(JSON.parse(storage.getItem('dashboardWidgets:user-a')).pending, false);
});

test('clean local preferences are refreshed after another device changes the account', async () => {
  const a = account();
  const storage = memoryStorage();
  storage.setItem('dashboardWidgets:user-a', JSON.stringify({ hidden: ['streak'], pending: false }));
  const widgets = createDashboardWidgets({ ...a, storage });
  a.user.user_metadata.dashboard_widgets = { version: 1, hidden: ['recent'] };
  await widgets.init();
  assert.equal(widgets.isVisible('streak'), true);
  assert.equal(widgets.isVisible('recent'), false);
});

test('a choice made while account preferences are loading is not overwritten', async () => {
  const a = account();
  const before = structuredClone(a.user);
  let release;
  a.sb.auth.getUser = () => new Promise(resolve => { release = () => resolve({ data: { user: before } }); });
  const widgets = createDashboardWidgets({ ...a, storage: memoryStorage() });
  const loading = widgets.init();
  await widgets.setVisible('level', false);
  release();
  await loading;
  assert.equal(widgets.isVisible('level'), false);
  assert.deepEqual(a.user.user_metadata.dashboard_widgets.hidden, ['level']);
});

test('preferences are isolated by account and an account switch prevents a write', async () => {
  const storage = memoryStorage();
  const a = account();
  const first = createDashboardWidgets({ ...a, storage });
  await first.setVisible('review', false);
  const b = account('user-b');
  const second = createDashboardWidgets({ ...b, storage });
  assert.equal(second.isVisible('review'), true);
  a.user.id = 'user-b';
  assert.equal(await first.setVisible('words', false), false);
  assert.equal(a.writes.length, 1);
  assert.equal(JSON.parse(storage.getItem('dashboardWidgets:user-a')).pending, true);
});

test('show all restores every widget and still works without browser storage', async () => {
  const a = account('user-a', { dashboard_widgets: { version: 1, hidden: DASHBOARD_WIDGETS.map(w => w.id) } });
  const storage = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } };
  const widgets = createDashboardWidgets({ ...a, storage });
  assert.ok(DASHBOARD_WIDGETS.every(w => !widgets.isVisible(w.id)));
  assert.equal(await widgets.reset(), true);
  assert.ok(DASHBOARD_WIDGETS.every(w => widgets.isVisible(w.id)));
  assert.deepEqual(a.user.user_metadata.dashboard_widgets.hidden, []);
});
