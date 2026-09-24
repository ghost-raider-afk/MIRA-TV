export async function migrateSiteUiScale(pool) {
  await pool.query(`
    ALTER TABLE site_settings
      ADD COLUMN IF NOT EXISTS ui_scale_percent SMALLINT NOT NULL DEFAULT 100;
    UPDATE site_settings
      SET ui_scale_percent = 100
      WHERE ui_scale_percent IS NULL OR ui_scale_percent < 70 OR ui_scale_percent > 140;
  `);
}
