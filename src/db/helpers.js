export function isoNow() {
  return new Date().toISOString();
}

function numericField(row, field) {
  return row[field] === undefined || row[field] === null ? {} : { [field]: Number(row[field]) };
}

export function normaliseRow(row) {
  if (!row) return null;
  return {
    ...row,
    ...numericField(row, 'id'),
    ...numericField(row, 'location_id'),
    ...numericField(row, 'location_number'),
    ...numericField(row, 'screen_id'),
    ...numericField(row, 'template_id'),
    ...numericField(row, 'session_version'),
    ...numericField(row, 'screen_count'),
    ...numericField(row, 'sftp_directory_id'),
    ...numericField(row, 'bound_location_id'),
    ...numericField(row, 'prepared_asset_size'),
    ...numericField(row, 'prepared_draft_revision'),
    ...numericField(row, 'published_draft_revision')
  };
}

export function jsonValue(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  try { return JSON.parse(value); }
  catch { return fallback; }
}

export function normaliseMenuRecord(row) {
  const record = normaliseRow(row);
  if (!record) return null;
  return {
    ...record,
    rows: jsonValue(record.rows_json, []),
    settings: jsonValue(record.settings_json, {})
  };
}

export function normaliseActivityEvent(row) {
  const event = normaliseRow(row);
  if (!event) return null;
  return { ...event, metadata: jsonValue(event.metadata, {}) };
}
