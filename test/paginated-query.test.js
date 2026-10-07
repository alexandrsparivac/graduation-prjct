import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows } from '../public/js/paginated-query.js';

test('fetchAllRows retrieves every row even when the server returns shorter pages', async () => {
  const source = ['a', 'b', 'c', 'd', 'e'];
  const offsets = [];
  const query = {
    async range(from, to) {
      offsets.push(from);
      return { data: source.slice(from, Math.min(to + 1, from + 2)), count: source.length, error: null };
    },
  };

  assert.deepEqual(await fetchAllRows(query, 3), source);
  assert.deepEqual(offsets, [0, 2, 4]);
});

test('fetchAllRows reports query errors and incomplete pagination instead of exporting partial data', async () => {
  await assert.rejects(fetchAllRows({ range: async () => ({ error: new Error('read failed') }) }), /read failed/);
  await assert.rejects(fetchAllRows({ range: async () => ({ data: [], count: 1, error: null }) }), /stopped after 0 of 1 rows/);
  await assert.rejects(fetchAllRows({ range: async () => ({ data: [], count: null, error: null }) }), /exact row count/);
});
