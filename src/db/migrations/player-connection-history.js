export async function migratePlayerConnectionHistory(pool) {
  await pool.query(`
    CREATE INDEX IF NOT EXISTS tv_player_logs_device_received_index
      ON tv_player_logs(device_id, server_received_at DESC);
  `);
}
