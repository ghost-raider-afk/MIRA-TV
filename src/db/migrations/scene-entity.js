export async function migrateSceneEntity(pool) {
  await pool.query("ALTER TABLE animation_settings ADD COLUMN IF NOT EXISTS entity_json TEXT NOT NULL DEFAULT '{}'");
}
