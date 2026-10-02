export async function migrateDeviceSessionRotation(pool) {
  await pool.query(`
    ALTER TABLE tv_device_sessions
      ADD COLUMN IF NOT EXISTS parent_session_id TEXT REFERENCES tv_device_sessions(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS tv_device_sessions_parent_index
      ON tv_device_sessions(parent_session_id) WHERE parent_session_id IS NOT NULL;
  `);
}
