export async function migratePlayerMetrics(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tv_player_metrics (
      id BIGSERIAL PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES tv_devices(id) ON DELETE CASCADE,
      screen_id BIGINT REFERENCES screens(id) ON DELETE SET NULL,
      sampled_at TIMESTAMPTZ NOT NULL,
      server_received_at TIMESTAMPTZ NOT NULL,
      fps_avg DOUBLE PRECISION,
      player_load_percent DOUBLE PRECISION,
      js_heap_used_bytes BIGINT,
      device_memory_gb DOUBLE PRECISION,
      hardware_concurrency INTEGER,
      uptime_seconds BIGINT
    );

    CREATE INDEX IF NOT EXISTS tv_player_metrics_sampled_index
      ON tv_player_metrics(sampled_at DESC);
    CREATE INDEX IF NOT EXISTS tv_player_metrics_screen_sampled_index
      ON tv_player_metrics(screen_id, sampled_at DESC);
    CREATE INDEX IF NOT EXISTS tv_player_metrics_device_sampled_index
      ON tv_player_metrics(device_id, sampled_at DESC);
  `);
}
