import assert from 'node:assert/strict';
import test from 'node:test';
import { MiraTvStore } from '../src/db/index.js';

function transactionHarness() {
  const queries = [];
  let released = 0;
  const client = {
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      if (/SELECT id FROM screens WHERE id = \$1 FOR UPDATE/.test(String(sql))) return { rowCount: 1, rows: [{ id: params[0] }] };
      return { rowCount: 0, rows: [] };
    },
    release() { released += 1; }
  };
  const pool = {
    async connect() { return client; },
    async query() { throw new Error('transaction must use acquired client'); },
    async end() {}
  };
  return { pool, queries, released: () => released };
}

test('transaction commits work performed through repositories bound to one acquired client', async () => {
  const harness = transactionHarness();
  const store = new MiraTvStore({}, { pool: harness.pool });
  const result = await store.transaction(async (tx) => {
    assert.equal(await tx.lockScreen(7), true);
    return 'done';
  });
  assert.equal(result, 'done');
  assert.equal(harness.queries[0].sql, 'BEGIN');
  assert.match(harness.queries[1].sql, /FOR UPDATE/);
  assert.equal(harness.queries.at(-1).sql, 'COMMIT');
  assert.equal(harness.released(), 1);
});

test('transaction always rolls back and releases the same client after a later failure', async () => {
  const harness = transactionHarness();
  const store = new MiraTvStore({}, { pool: harness.pool });
  await assert.rejects(
    store.transaction(async (tx) => {
      assert.equal(await tx.lockScreen(11), true);
      throw new Error('forced failure');
    }),
    /forced failure/
  );
  assert.equal(harness.queries[0].sql, 'BEGIN');
  assert.match(harness.queries[1].sql, /FOR UPDATE/);
  assert.equal(harness.queries.at(-1).sql, 'ROLLBACK');
  assert.equal(harness.released(), 1);
});

test('manager creation transaction rolls back if access provisioning fails', async () => {
  const harness = transactionHarness();
  const store = new MiraTvStore({}, { pool:harness.pool });
  const client = await harness.pool.connect();
  const query = client.query;
  client.query = async (sql, params = []) => {
    if (String(sql).includes('INSERT INTO web_users')) {
      harness.queries.push({ sql:String(sql), params });
      return { rowCount:1, rows:[{ username:'manager-test', role:'manager', active:true }] };
    }
    if (String(sql).includes('INSERT INTO manager_access')) {
      harness.queries.push({ sql:String(sql), params });
      throw new Error('injected permissions failure');
    }
    return query(sql, params);
  };
  await assert.rejects(store.transaction((tx) =>
    tx.createManager({ username:'manager-test', passwordHash:'hash' })
  ), /injected permissions failure/);
  assert.equal(harness.queries[0].sql, 'BEGIN');
  assert.ok(harness.queries.some(({ sql }) => sql.includes('INSERT INTO web_users')));
  assert.ok(harness.queries.some(({ sql }) => sql.includes('INSERT INTO manager_access')));
  assert.equal(harness.queries.at(-1).sql, 'ROLLBACK');
  assert.equal(harness.released(), 1);
});
