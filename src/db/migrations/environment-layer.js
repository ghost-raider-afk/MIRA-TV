import { environmentFromLegacyAquarium } from '../../contracts/environment.js';

async function hasColumn(pool, table, column) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rowCount > 0;
}

async function migrateTable(pool, table, keyColumn) {
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS environment_json TEXT NOT NULL DEFAULT '{}'`);
  if (!await hasColumn(pool, table, 'aquarium_json')) return;

  const { rows } = await pool.query(`SELECT ${keyColumn} AS record_key, aquarium_json, environment_json FROM ${table}`);
  for (const row of rows) {
    let current = {};
    let legacy = {};
    try { current = JSON.parse(row.environment_json || '{}'); } catch {}
    try { legacy = JSON.parse(row.aquarium_json || '{}'); } catch {}
    if (!current?.effect) {
      await pool.query(
        `UPDATE ${table} SET environment_json = $1 WHERE ${keyColumn} = $2`,
        [JSON.stringify(environmentFromLegacyAquarium(legacy)), row.record_key]
      );
    }
  }
  await pool.query(`ALTER TABLE ${table} DROP COLUMN aquarium_json`);
}

export async function migrateEnvironmentLayer(pool) {
  await migrateTable(pool, 'animation_settings', 'id');
  await migrateTable(pool, 'screen_animation_settings', 'screen_id');
}
