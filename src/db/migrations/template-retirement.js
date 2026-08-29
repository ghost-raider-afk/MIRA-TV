function objectValue(raw) {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function arrayValue(raw) {
  try {
    const value = JSON.parse(raw || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function migrateBackgroundUrl(settings) {
  const next = { ...settings };
  if (typeof next.background_image_url === 'string' && next.background_image_url.startsWith('/site-assets/templates/')) {
    next.background_image_url = next.background_image_url.replace('/site-assets/templates/', '/site-assets/screens/');
  }
  return next;
}

async function tableExists(pool, tableName) {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS present`,
    [tableName]
  );
  return rows[0]?.present === true;
}

async function columnExists(pool, tableName, columnName) {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS present`,
    [tableName, columnName]
  );
  return rows[0]?.present === true;
}

async function legacyTemplates(pool) {
  if (!await tableExists(pool, 'templates')) return [];
  const { rows } = await pool.query('SELECT id, rows_json, settings_json FROM templates');
  return rows;
}

async function legacyAssignments(pool) {
  if (!await columnExists(pool, 'screens', 'template_id')) return [];
  const { rows } = await pool.query('SELECT id, template_id FROM screens WHERE template_id IS NOT NULL');
  return rows;
}

export async function retireLegacyTemplates(pool) {
  const templates = new Map((await legacyTemplates(pool)).map((row) => [Number(row.id), row]));
  const assignments = await legacyAssignments(pool);

  for (const assignment of assignments) {
    const template = templates.get(Number(assignment.template_id));
    if (!template) continue;
    const { rows } = await pool.query('SELECT rows_json, settings_json FROM screen_drafts WHERE screen_id = $1', [assignment.id]);
    const draft = rows[0];
    if (!draft) continue;
    const currentRows = arrayValue(draft.rows_json);
    const inheritedRows = arrayValue(template.rows_json);
    const mergedSettings = migrateBackgroundUrl({
      ...objectValue(template.settings_json),
      ...objectValue(draft.settings_json)
    });
    const rowsJson = JSON.stringify(currentRows.length ? currentRows : inheritedRows);
    await pool.query(
      `UPDATE screen_drafts SET rows_json = $1, settings_json = $2, revision = revision + 1, updated_at = NOW()
       WHERE screen_id = $3`,
      [rowsJson, JSON.stringify(mergedSettings), assignment.id]
    );
    await pool.query(
      `UPDATE screens SET prepared_asset_key = NULL, prepared_asset_sha256 = NULL, prepared_asset_size = NULL,
       prepared_draft_revision = NULL, publication_pending_sha256 = NULL, publication_started_at = NULL,
       status = 'draft', updated_at = NOW() WHERE id = $1`,
      [assignment.id]
    );
  }

  await pool.query(`
    ALTER TABLE screens DROP CONSTRAINT IF EXISTS screens_template_id_fkey;
    ALTER TABLE screens DROP COLUMN IF EXISTS template_id;
    DROP TABLE IF EXISTS templates;
  `);
}
