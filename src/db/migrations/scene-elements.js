const EMPTY_SCENE = Object.freeze({ version: 1, elements: [] });
const EMPTY_SCENE_JSON = JSON.stringify(EMPTY_SCENE);

async function hasColumn(pool, table, column) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rowCount > 0;
}

function hasValidScene(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const scene = JSON.parse(value);
    return Boolean(
      scene
      && typeof scene === 'object'
      && !Array.isArray(scene)
      && Number(scene.version) === 1
      && Array.isArray(scene.elements)
    );
  } catch {
    return false;
  }
}

export async function migrateSceneElementsStorage(pool) {
  if (!await hasColumn(pool, 'screen_drafts', 'scene_json')) {
    await pool.query('ALTER TABLE screen_drafts ADD COLUMN scene_json TEXT');
  }

  const { rows } = await pool.query('SELECT screen_id, scene_json FROM screen_drafts');
  for (const row of rows) {
    if (hasValidScene(row.scene_json)) continue;
    await pool.query(
      'UPDATE screen_drafts SET scene_json = $1 WHERE screen_id = $2',
      [EMPTY_SCENE_JSON, row.screen_id]
    );
  }

  await pool.query(`ALTER TABLE screen_drafts ALTER COLUMN scene_json SET DEFAULT '{"version":1,"elements":[]}'`);
  await pool.query('ALTER TABLE screen_drafts ALTER COLUMN scene_json SET NOT NULL');
}
