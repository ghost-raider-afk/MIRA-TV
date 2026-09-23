export async function migrateWeatherSnapshots(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weather_snapshots (
      source_key TEXT PRIMARY KEY,
      location_name TEXT NOT NULL DEFAULT '',
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      timezone TEXT NOT NULL,
      provider TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL,
      fresh_until TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS weather_snapshots_fresh_until_index
      ON weather_snapshots(fresh_until);

    CREATE TABLE IF NOT EXISTS weather_provider_status (
      provider TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK(status IN ('healthy', 'failed')),
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      last_checked_at TIMESTAMPTZ,
      last_success_at TIMESTAMPTZ,
      cooldown_until TIMESTAMPTZ,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
