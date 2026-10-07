import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountExport, OWNED_TABLES } from '../public/js/account-export.js';

test('account export includes every owned row and only the documented personal tables', async () => {
  const user = { id: 'learner-1', email: 'learner@example.test', created_at: '2026-01-01T00:00:00Z' };
  const progress = Array.from({ length: 1105 }, (_, index) => ({
    user_id: user.id, lesson_id: `lesson-${String(index).padStart(4, '0')}`,
  }));
  const source = {
    profiles: [{ id: user.id, full_name: 'Learner' }, { id: 'other-user', full_name: 'Other' }],
    user_languages: [], user_domains: [], user_progress: progress, lesson_attempts: [],
    user_vocabulary: [{ user_id: user.id, term: 'bonjour' }],
  };
  const calls = [];
  const sb = {
    from(table) {
      return {
        select(columns, options) {
          const query = {
            filter: null,
            eq(column, value) { this.filter = [column, value]; return this; },
            order(column, orderOptions) { calls.push({ table, order: [column, orderOptions] }); return this; },
            async range(from, to) {
              calls.push({ table, range: [from, to], columns, options, filter: this.filter });
              const rows = (source[table] || []).filter(row => !this.filter || row[this.filter[0]] === this.filter[1]);
              return { data: rows.slice(from, Math.min(to + 1, from + 137)), count: rows.length, error: null };
            },
          };
          return query;
        },
      };
    },
  };

  const result = await buildAccountExport(sb, user);
  assert.equal(result.account.id, user.id);
  assert.equal(result.data.user_progress.length, 1105);
  assert.equal(result.data.profiles.length, 1);
  assert.deepEqual(Object.keys(result.data), OWNED_TABLES.map(([table]) => table));
  assert.equal(Object.hasOwn(result.data, 'lessons'), false);
  assert.equal(calls.filter(call => call.table === 'user_progress' && call.range).length, 9);
  assert.ok(calls.every(call => !call.filter || call.filter[1] === user.id));
  assert.ok(calls.filter(call => call.range).every(call => call.options.count === 'exact'));
});

test('account export marks failed tables as unavailable without returning partial rows', async () => {
  const sb = {
    from: table => ({
      select: () => ({
        eq() { return this; },
        order() { return this; },
        async range() {
          return table === 'user_vocabulary'
            ? { error: { message: 'permission denied' } }
            : { data: [], count: 0, error: null };
        },
      }),
    }),
  };
  const result = await buildAccountExport(sb, { id: 'learner-1' });
  assert.deepEqual(result.data.user_vocabulary, { unavailable: 'permission denied' });
});
