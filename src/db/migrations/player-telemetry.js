export async function migratePlayerTelemetry(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tv_player_logs (
      device_id BIGINT NOT NULL REFERENCES tv_devices(id) ON DELETE CASCADE,
      boot_id TEXT NOT NULL,
      seq BIGINT NOT NULL,
      device_timestamp TIMESTAMPTZ,
      server_received_at TIMESTAMPTZ NOT NULL,
      level TEXT NOT NULL CHECK(level IN ('info', 'warn', 'error')),
      event_type TEXT NOT NULL,
      context_revision TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY(device_id, boot_id, seq)
    );
    CREATE INDEX IF NOT EXISTS tv_player_logs_received_index
      ON tv_player_logs(server_received_at DESC);
  `);
}
