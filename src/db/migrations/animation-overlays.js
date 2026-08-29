export async function migrateAnimationOverlays(pool) {
  await pool.query("ALTER TABLE animation_settings ADD COLUMN IF NOT EXISTS brand_json TEXT NOT NULL DEFAULT '{}'");
  await pool.query("ALTER TABLE animation_settings ADD COLUMN IF NOT EXISTS aquarium_json TEXT NOT NULL DEFAULT '{}'");
}
