export async function migratePlayerCacheStatus(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tv_player_cache_status (
      device_id BIGINT PRIMARY KEY REFERENCES tv_devices(id) ON DELETE CASCADE,
      screen_id BIGINT REFERENCES screens(id) ON DELETE SET NULL,
      reported_at TIMESTAMPTZ NOT NULL,
      server_received_at TIMESTAMPTZ NOT NULL,
      status_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS tv_player_cache_status_screen_index
      ON tv_player_cache_status(screen_id);
    CREATE INDEX IF NOT EXISTS tv_player_cache_status_received_index
      ON tv_player_cache_status(server_received_at DESC);
  `);
}
