import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { retireLegacySceneOwnership } from '../src/db/migrations/scene-ownership-cleanup.js';

async function columns(pool, table) {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 ORDER BY column_name`,
    [table]
  );
  return rows.map((row) => row.column_name);
}

test('scene ownership cleanup drops old visual columns and separate weather storage', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await pool.query(`
    CREATE TABLE animation_settings (
      id INTEGER PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      profile_json TEXT NOT NULL DEFAULT '{}',
      scene_playlist_json TEXT NOT NULL DEFAULT '{}',
      entity_json TEXT NOT NULL DEFAULT '{}',
      announcement_json TEXT NOT NULL DEFAULT '{}',
      brand_json TEXT NOT NULL DEFAULT '{}',
      environment_json TEXT NOT NULL DEFAULT '{}',
      aquarium_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE screen_animation_settings (
      screen_id BIGINT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      profile_json TEXT NOT NULL DEFAULT '{}',
      scene_playlist_json TEXT NOT NULL DEFAULT '{}',
      entity_json TEXT NOT NULL DEFAULT '{}',
      announcement_json TEXT NOT NULL DEFAULT '{}',
      brand_json TEXT NOT NULL DEFAULT '{}',
      environment_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE weather_settings (id INTEGER PRIMARY KEY, config_json TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE screen_weather_settings (screen_id BIGINT PRIMARY KEY, config_json TEXT NOT NULL DEFAULT '{}');
  `);

  await retireLegacySceneOwnership(pool);
  await retireLegacySceneOwnership(pool);

  const globalColumns = await columns(pool, 'animation_settings');
  const screenColumns = await columns(pool, 'screen_animation_settings');
  for (const legacy of ['entity_json','announcement_json','brand_json','environment_json','aquarium_json']) {
    assert.equal(globalColumns.includes(legacy), false);
    assert.equal(screenColumns.includes(legacy), false);
  }
  assert.equal(globalColumns.includes('profile_json'), true);
  assert.equal(globalColumns.includes('scene_playlist_json'), true);
  const tables = (await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name IN ('weather_settings','screen_weather_settings')`
  )).rows;
  assert.equal(tables.length, 0);
  await pool.end();
});
