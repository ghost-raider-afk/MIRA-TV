export async function migrateMenuThemeTemplates(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu_theme_templates (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      settings_json TEXT NOT NULL DEFAULT '{}',
      scene_json TEXT NOT NULL DEFAULT '{"version":1,"elements":[]}',
      created_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS menu_theme_templates_name_unique
      ON menu_theme_templates (LOWER(name));
  `);
}
