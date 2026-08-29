export async function migrateDevicePlayer(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tv_devices (
      id BIGSERIAL PRIMARY KEY,
      screen_id BIGINT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      remote_address TEXT NOT NULL DEFAULT '',
      authorized_by TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tv_device_sessions (
      id TEXT PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES tv_devices(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tv_device_activations (
      id TEXT PRIMARY KEY,
      scan_token_hash TEXT NOT NULL UNIQUE,
      poll_secret_hash TEXT NOT NULL UNIQUE,
      reserve_code_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'consumed')),
      user_agent TEXT NOT NULL DEFAULT '',
      remote_address TEXT NOT NULL DEFAULT '',
      approved_screen_id BIGINT REFERENCES screens(id) ON DELETE SET NULL,
      approved_by TEXT NOT NULL DEFAULT '',
      approved_at TIMESTAMPTZ,
      device_id BIGINT REFERENCES tv_devices(id) ON DELETE SET NULL,
      session_id TEXT,
      consumed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS tv_devices_active_screen_unique
      ON tv_devices(screen_id) WHERE active = TRUE;
    CREATE INDEX IF NOT EXISTS tv_device_sessions_device_index
      ON tv_device_sessions(device_id);
    CREATE INDEX IF NOT EXISTS tv_device_sessions_expiry_index
      ON tv_device_sessions(expires_at) WHERE revoked_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS tv_device_activations_pending_reserve_unique
      ON tv_device_activations(reserve_code_hash) WHERE status IN ('pending', 'approved');
    CREATE INDEX IF NOT EXISTS tv_device_activations_expiry_index
      ON tv_device_activations(expires_at);
  `);
}
