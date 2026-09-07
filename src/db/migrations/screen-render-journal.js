export async function migrateScreenRenderJournal(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS screen_render_state (
      screen_id BIGINT PRIMARY KEY REFERENCES screens(id) ON DELETE CASCADE,
      revision BIGINT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS screen_render_events (
      id BIGSERIAL PRIMARY KEY,
      screen_id BIGINT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
      revision BIGINT NOT NULL,
      components_json TEXT NOT NULL DEFAULT '[]',
      reason TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT 'system',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (screen_id, revision)
    );

    CREATE INDEX IF NOT EXISTS screen_render_events_screen_created_index
      ON screen_render_events(screen_id, created_at DESC, id DESC);

    INSERT INTO screen_render_state (screen_id, revision)
    SELECT id, 1 FROM screens
    ON CONFLICT (screen_id) DO NOTHING;
  `);
}
