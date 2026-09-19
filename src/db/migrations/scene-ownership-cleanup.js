const LEGACY_VISUAL_COLUMNS = Object.freeze([
  'entity_json',
  'announcement_json',
  'brand_json',
  'environment_json',
  'aquarium_json'
]);

async function dropVisualColumns(pool, table) {
  for (const column of LEGACY_VISUAL_COLUMNS) {
    await pool.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column}`);
  }
}

export async function retireLegacySceneOwnership(pool) {
  await dropVisualColumns(pool, 'animation_settings');
  await dropVisualColumns(pool, 'screen_animation_settings');
  await pool.query('DROP TABLE IF EXISTS screen_weather_settings');
  await pool.query('DROP TABLE IF EXISTS weather_settings');
}
