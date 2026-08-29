export async function migrateScenePlaylist(pool) {
  await pool.query("ALTER TABLE animation_settings ADD COLUMN IF NOT EXISTS scene_playlist_json TEXT NOT NULL DEFAULT '{}'");
  await pool.query("ALTER TABLE screen_animation_settings ADD COLUMN IF NOT EXISTS scene_playlist_json TEXT NOT NULL DEFAULT '{}'");
}
