const LEGACY_FONT_SCALE = Object.freeze({ small: 88, medium: 100, large: 115 });

function migrateSettings(raw) {
  let settings;
  try { settings = JSON.parse(raw || '{}'); }
  catch { settings = {}; }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = {};

  const next = { ...settings };
  let changed = false;
  if (!Number.isFinite(Number(next.font_scale_percent))) {
    next.font_scale_percent = LEGACY_FONT_SCALE[next.font_scale] || 100;
    changed = true;
  }
  for (const key of ['font_scale', 'title']) {
    if (Object.hasOwn(next, key)) {
      delete next[key];
      changed = true;
    }
  }
  if (Object.hasOwn(next, 'table_width') && !Object.hasOwn(next, 'table_width_px')) {
    const width = Number(next.table_width);
    if (Number.isFinite(width) && width > 0) next.table_width_px = Math.round(width);
    delete next.table_width;
    changed = true;
  }
  return changed ? JSON.stringify(next) : null;
}

export async function migrateLegacyMenuSettings(pool) {
  const result = await pool.query('SELECT screen_id, settings_json FROM screen_drafts');
  for (const row of result.rows) {
    const settingsJson = migrateSettings(row.settings_json);
    if (settingsJson === null) continue;
    await pool.query('UPDATE screen_drafts SET settings_json = $1 WHERE screen_id = $2', [settingsJson, row.screen_id]);
  }
}
