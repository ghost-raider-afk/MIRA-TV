import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { migrateScreenNumbering } from '../src/db/migrations/screen-numbering.js';

test('screens are numbered independently inside each location and migration is idempotent', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await pool.query(`CREATE TABLE screens (id BIGSERIAL PRIMARY KEY, location_id BIGINT NOT NULL, location_number INTEGER, status TEXT NOT NULL)`);
  await pool.query("INSERT INTO screens (location_id,status) VALUES (10,'draft'),(20,'draft'),(10,'published')");
  await migrateScreenNumbering(pool);
  await migrateScreenNumbering(pool);
  const { rows } = await pool.query('SELECT location_id, location_number FROM screens ORDER BY id');
  assert.deepEqual(rows.map((row) => ({ location:Number(row.location_id), number:Number(row.location_number) })), [
    { location:10, number:1 }, { location:20, number:1 }, { location:10, number:2 }
  ]);
  await pool.end();
});
