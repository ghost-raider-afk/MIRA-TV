export async function migrateAnnouncementTicker(pool) {
  await pool.query("ALTER TABLE animation_settings ADD COLUMN IF NOT EXISTS announcement_json TEXT NOT NULL DEFAULT '{}'");
}
