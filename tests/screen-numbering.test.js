import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { migrateScreenNumbering } from '../src/db/migrations/screen-numbering.js';

test('legacy screens are numbered inside each location and all filenames become canonical', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await pool.query(`
    CREATE TABLE screens (
      id BIGSERIAL PRIMARY KEY,
      location_id BIGINT NOT NULL,
      location_number INTEGER,
      status TEXT NOT NULL,
      publication_pending_sha256 TEXT,
      delivery_filename TEXT
    )
  `);
  await pool.query("INSERT INTO screens (location_id,status,delivery_filename) VALUES (10,'draft','monitor-3.jpg')");
  await pool.query("INSERT INTO screens (location_id,status,delivery_filename) VALUES (20,'draft','monitor-4.jpg')");
  await pool.query("INSERT INTO screens (location_id,status,delivery_filename) VALUES (10,'published','monitor-9.jpg')");

  await migrateScreenNumbering(pool);
  await migrateScreenNumbering(pool);

  const { rows } = await pool.query('SELECT id, location_id, location_number, delivery_filename FROM screens ORDER BY id');
  assert.deepEqual(rows.map((row) => ({
    location: Number(row.location_id),
    number: Number(row.location_number),
    filename: row.delivery_filename
  })), [
    { location: 10, number: 1, filename: 'monitor-1.jpg' },
    { location: 20, number: 1, filename: 'monitor-1.jpg' },
    { location: 10, number: 2, filename: 'monitor-2.jpg' }
  ]);
  await pool.end();
});
