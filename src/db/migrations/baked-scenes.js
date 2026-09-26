export async function migrateBakedScenes(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS screen_baked_scenes (
      screen_id BIGINT PRIMARY KEY REFERENCES screens(id) ON DELETE CASCADE,
      source_render_revision BIGINT NOT NULL,
      input_hash TEXT NOT NULL,
      active_url TEXT NOT NULL,
      active_hash TEXT NOT NULL,
      previous_url TEXT NOT NULL DEFAULT '',
      previous_hash TEXT NOT NULL DEFAULT '',
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      fps NUMERIC(8,3) NOT NULL,
      duration_ms INTEGER NOT NULL,
      agent_version TEXT NOT NULL DEFAULT '',
      live_scene_json TEXT NOT NULL DEFAULT '{"version":1,"elements":[]}',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS screen_baked_scenes_input_hash_index
      ON screen_baked_scenes(input_hash);
  `);
}
