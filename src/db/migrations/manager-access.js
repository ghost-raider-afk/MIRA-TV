// Existing manager grants migrate intact; new managers are restricted by default.
export async function migrateManagerAccess(queryable) {
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS manager_access (
      username TEXT PRIMARY KEY REFERENCES web_users(username) ON DELETE CASCADE,
      all_locations BOOLEAN NOT NULL DEFAULT FALSE,
      catalog_enabled BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS manager_location_access (
      username TEXT NOT NULL REFERENCES manager_access(username) ON DELETE CASCADE,
      location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      PRIMARY KEY (username, location_id)
    );
    CREATE INDEX IF NOT EXISTS manager_location_access_location_idx ON manager_location_access(location_id);
    INSERT INTO manager_access (username, all_locations, catalog_enabled)
    SELECT username, TRUE, TRUE FROM web_users WHERE role='manager'
    ON CONFLICT (username) DO NOTHING;
  `);
}
