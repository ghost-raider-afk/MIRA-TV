export async function migrateDeviceIdentification(pool) {
  await pool.query(`
    ALTER TABLE tv_devices
      ADD COLUMN IF NOT EXISTS manufacturer TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT '';

    ALTER TABLE tv_device_activations
      ADD COLUMN IF NOT EXISTS manufacturer TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT '';
  `);
}
