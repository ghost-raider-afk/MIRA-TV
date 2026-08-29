export async function migrateEventJournal(pool) {
  await pool.query(`
    ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info';
    ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'system';
    ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS details TEXT NOT NULL DEFAULT '';

    UPDATE activity_events
    SET
      severity = 'success',
      category = CASE
        WHEN action LIKE 'auth.%' THEN 'auth'
        WHEN action LIKE 'catalog.%' THEN 'catalog'
        WHEN action LIKE 'sftp.%' THEN 'sftp'
        WHEN action LIKE 'screen.%' OR action LIKE 'location.%' THEN 'monitors'
        WHEN action LIKE 'device.%' THEN 'tv'
        WHEN action LIKE 'settings.%' OR action LIKE 'profile.%' THEN 'settings'
        ELSE 'system'
      END;
  `);

  const legacy = await pool.query(`
    SELECT id, error_type, message, stack, page, source, line_number, column_number, user_agent, username, created_at
    FROM frontend_error_events
    ORDER BY id
  `);
  for (const row of legacy.rows) {
    await pool.query(
      `INSERT INTO activity_events (
        actor_username, action, entity_type, entity_id, message, metadata, read_at, created_at, severity, category, details
      ) VALUES ($1, $2, 'frontend_error', $3, $4, $5, NULL, $6, 'error', 'interface', $7)`,
      [
        String(row.username || '').trim() || 'system',
        `frontend.${row.error_type}`,
        String(row.id),
        row.message,
        JSON.stringify({
          page: row.page || '',
          source: row.source || '',
          line_number: row.line_number ?? null,
          column_number: row.column_number ?? null,
          user_agent: row.user_agent || ''
        }),
        row.created_at,
        row.stack || ''
      ]
    );
  }

  await pool.query(`
    DROP TABLE IF EXISTS frontend_error_events;

    CREATE INDEX IF NOT EXISTS activity_events_severity_created_at_index
      ON activity_events(severity, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS activity_events_category_created_at_index
      ON activity_events(category, created_at DESC, id DESC);
  `);
}
