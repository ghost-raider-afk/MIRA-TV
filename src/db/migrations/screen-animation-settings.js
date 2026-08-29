export async function migrateScreenAnimationSettings(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS screen_animation_settings (
      screen_id BIGINT PRIMARY KEY REFERENCES screens(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      preset_id TEXT NOT NULL DEFAULT 'cinematic-live-menu',
      profile_json TEXT NOT NULL DEFAULT '{}',
      entity_json TEXT NOT NULL DEFAULT '{}',
      announcement_json TEXT NOT NULL DEFAULT '{}',
      brand_json TEXT NOT NULL DEFAULT '{}',
      aquarium_json TEXT NOT NULL DEFAULT '{}',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const animationResult = await pool.query(`
    SELECT enabled, preset_id, profile_json, entity_json, announcement_json, brand_json, aquarium_json, updated_by, updated_at
    FROM animation_settings WHERE id = 1
  `);
  const animation = animationResult.rows[0];
  if (!animation) return;

  const screenResult = await pool.query('SELECT id FROM screens ORDER BY id');
  for (const screen of screenResult.rows) {
    await pool.query(
      `INSERT INTO screen_animation_settings (
         screen_id, enabled, preset_id, profile_json, entity_json, announcement_json, brand_json, aquarium_json, updated_by, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (screen_id) DO NOTHING`,
      [
        Number(screen.id),
        animation.enabled === true,
        animation.preset_id || 'cinematic-live-menu',
        animation.profile_json || '{}',
        animation.entity_json || '{}',
        animation.announcement_json || '{}',
        animation.brand_json || '{}',
        animation.aquarium_json || '{}',
        animation.updated_by || '',
        animation.updated_at || new Date().toISOString()
      ]
    );
  }
}
