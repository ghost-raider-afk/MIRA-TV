export async function migrateScreenliteDownloadLink(pool) {
  await pool.query(`
    ALTER TABLE site_settings
      ADD COLUMN IF NOT EXISTS show_screenlite_download_link BOOLEAN NOT NULL DEFAULT FALSE;
  `);
}
