async function ensureMigrationTable(queryable) {
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function runMigrations(pool, migrations) {
  const client = typeof pool.connect === 'function' ? await pool.connect() : pool;
  const release = typeof client.release === 'function' ? () => client.release() : () => {};
  try {
    await ensureMigrationTable(client);
    for (const migration of migrations) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [migration.name]);
      if (applied.rowCount) continue;
      await client.query('BEGIN');
      try {
        await migration.run(client);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    }
  } finally {
    release();
  }
}
