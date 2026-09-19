import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { migrateSceneElementsStorage } from '../src/db/migrations/scene-elements.js';

test('scene migration adds independent scene_json storage to existing screen drafts', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await pool.query("CREATE TABLE screen_drafts (screen_id BIGINT PRIMARY KEY, rows_json TEXT NOT NULL DEFAULT '[]', settings_json TEXT NOT NULL DEFAULT '{}')");
  await pool.query("INSERT INTO screen_drafts (screen_id) VALUES (1)");

  await migrateSceneElementsStorage(pool);
  await migrateSceneElementsStorage(pool);

  const row = (await pool.query('SELECT scene_json FROM screen_drafts WHERE screen_id = 1')).rows[0];
  assert.deepEqual(JSON.parse(row.scene_json), { version: 1, elements: [] });
  await pool.end();
});
