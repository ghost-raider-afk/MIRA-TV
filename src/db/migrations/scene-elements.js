export async function migrateSceneElementsStorage(pool) {
  await pool.query(`
    ALTER TABLE screen_drafts
    ADD COLUMN IF NOT EXISTS scene_json TEXT NOT NULL DEFAULT '{"version":1,"elements":[]}';
  `);
}
