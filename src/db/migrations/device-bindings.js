export async function migrateDeviceBindings(pool) {
  await pool.query(`
    ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS device_key TEXT;
    ALTER TABLE tv_devices ALTER COLUMN screen_id DROP NOT NULL;
    ALTER TABLE tv_device_activations ADD COLUMN IF NOT EXISTS device_key TEXT;

    UPDATE tv_devices
       SET device_key = 'legacy-' || id::text
     WHERE device_key IS NULL OR device_key = '';

    ALTER TABLE tv_devices ALTER COLUMN device_key SET NOT NULL;
    DROP INDEX IF EXISTS tv_devices_active_screen_unique;
    CREATE UNIQUE INDEX IF NOT EXISTS tv_devices_device_key_unique
      ON tv_devices(device_key);

    CREATE TABLE IF NOT EXISTS tv_device_bindings (
      id BIGSERIAL PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES tv_devices(id) ON DELETE CASCADE,
      screen_id BIGINT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      bound_by TEXT NOT NULL DEFAULT '',
      bound_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
  `);

  const { rows: legacyBindings } = await pool.query(`
    SELECT id, screen_id, authorized_by, created_at, updated_at
      FROM tv_devices
     WHERE active = TRUE AND screen_id IS NOT NULL
     ORDER BY updated_at DESC, id DESC
  `);

  const claimedScreens = new Set();
  for (const legacy of legacyBindings) {
    const screenId = Number(legacy.screen_id);
    if (!Number.isSafeInteger(screenId) || claimedScreens.has(screenId)) continue;
    claimedScreens.add(screenId);
    const boundAt = legacy.updated_at || legacy.created_at || new Date().toISOString();
    await pool.query(
      `INSERT INTO tv_device_bindings
        (device_id, screen_id, active, bound_by, bound_at, created_at, updated_at)
       VALUES ($1, $2, TRUE, $3, $4, $4, $4)`,
      [legacy.id, legacy.screen_id, legacy.authorized_by || '', boundAt]
    );
  }

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tv_device_bindings_active_device_unique
      ON tv_device_bindings(device_id) WHERE active = TRUE;
    CREATE UNIQUE INDEX IF NOT EXISTS tv_device_bindings_active_screen_unique
      ON tv_device_bindings(screen_id) WHERE active = TRUE;
    CREATE INDEX IF NOT EXISTS tv_device_bindings_screen_index
      ON tv_device_bindings(screen_id);

    UPDATE tv_devices SET screen_id = NULL WHERE screen_id IS NOT NULL;
  `);
}
