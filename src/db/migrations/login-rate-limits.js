export async function migrateLoginRateLimits(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_rate_limits (
      scope TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (scope, key_hash),
      CHECK (scope IN ('identity', 'ip')),
      CHECK (attempts > 0)
    );
    CREATE INDEX IF NOT EXISTS login_rate_limits_expires_at_index
      ON login_rate_limits(expires_at);
  `);
}
