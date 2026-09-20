import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { removeLegacySceneElements } from '../src/db/migrations/scene-legacy-elements-cleanup.js';

test('legacy migrated objects are removed while current scene elements stay intact', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await pool.query(`
    CREATE TABLE screen_drafts (
      screen_id BIGINT PRIMARY KEY,
      scene_json TEXT NOT NULL DEFAULT '{"version":1,"elements":[]}'
    );
  `);

  const scene = {
    version: 1,
    elements: [
      { id:'legacy-brand', type:'text' },
      { id:'legacy-entity', type:'image' },
      { id:'legacy-weather', type:'weather' },
      { id:'legacy-announcement', type:'text' },
      { id:'user-text', type:'text' },
      { id:'user-logo', type:'logo' }
    ]
  };
  await pool.query('INSERT INTO screen_drafts (screen_id, scene_json) VALUES ($1, $2)', [1, JSON.stringify(scene)]);

  await removeLegacySceneElements(pool);
  await removeLegacySceneElements(pool);

  const { rows } = await pool.query('SELECT scene_json FROM screen_drafts WHERE screen_id = 1');
  const saved = JSON.parse(rows[0].scene_json);
  assert.deepEqual(saved.elements.map((element) => element.id), ['user-text', 'user-logo']);
  await pool.end();
});
