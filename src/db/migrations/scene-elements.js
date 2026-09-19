export async function migrateSceneElementsStorage(pool) {
  await pool.query(`
    ALTER TABLE screen_drafts
    ADD COLUMN IF NOT EXISTS scene_json TEXT NOT NULL DEFAULT '{"version":1,"elements":[]}';
  `);
  await pool.query(
    "UPDATE screen_drafts SET scene_json = $1 WHERE scene_json IS NULL OR BTRIM(scene_json) = ''",
    [JSON.stringify({ version: 1, elements: [] })]
  );
}
