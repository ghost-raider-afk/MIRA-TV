const EMPTY_SCENE_JSON = JSON.stringify({ version: 1, elements: [] });

async function hasColumn(pool, table, column) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rowCount > 0;
}

export async function migrateSceneElementsStorage(pool) {
  if (!await hasColumn(pool, 'screen_drafts', 'scene_json')) {
    await pool.query(`
      ALTER TABLE screen_drafts
      ADD COLUMN scene_json TEXT NOT NULL DEFAULT '{"version":1,"elements":[]}';
    `);
  }

  const { rows } = await pool.query('SELECT screen_id, scene_json FROM screen_drafts');
  for (const row of rows) {
    if (typeof row.scene_json === 'string' && row.scene_json.trim()) continue;
    await pool.query(
      'UPDATE screen_drafts SET scene_json = $1 WHERE screen_id = $2',
      [EMPTY_SCENE_JSON, row.screen_id]
    );
  }
}
