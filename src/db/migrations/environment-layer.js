async function hasColumn(pool, table, column) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rowCount > 0;
}

async function retireLegacyEnvironmentColumn(pool, table) {
  if (await hasColumn(pool, table, 'aquarium_json')) {
    await pool.query(`ALTER TABLE ${table} DROP COLUMN aquarium_json`);
  }
}

export async function migrateEnvironmentLayer(pool) {
  await retireLegacyEnvironmentColumn(pool, 'animation_settings');
  await retireLegacyEnvironmentColumn(pool, 'screen_animation_settings');
}
