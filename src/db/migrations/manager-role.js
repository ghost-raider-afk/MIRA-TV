export async function migrateManagerRole(pool) {
  await pool.query('ALTER TABLE web_users DROP CONSTRAINT IF EXISTS web_users_role_check');
  await pool.query("ALTER TABLE web_users ADD CONSTRAINT web_users_role_check CHECK(role IN ('administrator', 'manager'))");
}
