const DEFAULT_TABLE_X = 56;
const DEFAULT_TABLE_WIDTH = 1374;
const MIN_TWO_COLUMN_WIDTH = 900;

function jsonValue(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); }
  catch { return fallback; }
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resolutionWidth(value) {
  const match = String(value || '').match(/^(\d{3,5})[×x](\d{3,5})$/);
  return Math.max(1, Number(match?.[1]) || 1920);
}

function readableFrameWidth(settings, resolution) {
  const viewportWidth = resolutionWidth(resolution);
  const x = Math.max(0, Math.min(viewportWidth - 1, Math.round(numberOr(settings?.table_x, DEFAULT_TABLE_X))));
  return Math.max(1, Math.min(
    viewportWidth - x,
    Math.round(numberOr(settings?.table_width_px, DEFAULT_TABLE_WIDTH))
  ));
}

function visibleGroups(rows) {
  const groups = [];
  let current = null;
  let packagingOpen = false;

  rows.forEach((row, index) => {
    if (!row || row.enabled === false) return;
    if (row.kind === 'section' || !current) {
      current = { indexes:[], displayLines:row.kind === 'section' ? 1 : 1 };
      groups.push(current);
      packagingOpen = false;
      if (row.kind === 'section') {
        current.indexes.push(index);
        return;
      }
    }

    current.indexes.push(index);
    if (row.kind === 'packaging') {
      if (!packagingOpen) current.displayLines += 1;
      packagingOpen = !packagingOpen;
      return;
    }
    packagingOpen = false;
    current.displayLines += 1;
  });

  return groups;
}

function bestSequentialSplit(groups) {
  if (groups.length < 2) return null;
  const total = groups.reduce((sum, group) => sum + group.displayLines, 0);
  let left = 0;
  let best = { cut:1, difference:Number.POSITIVE_INFINITY };
  for (let cut = 1; cut < groups.length; cut += 1) {
    left += groups[cut - 1].displayLines;
    const difference = Math.abs(left - (total - left));
    if (difference < best.difference) best = { cut, difference };
  }
  return best.cut;
}

function validColumn(row) {
  const value = row?.column;
  if (value === 'left' || value === 'right') return value;
  if (row?.kind === 'section' && value === 'full') return value;
  return null;
}

export function migrateReadableRows(rows, settings = {}, resolution = '1920×1080') {
  const source = Array.isArray(rows) ? rows : [];
  if (String(settings?.table_style || 'legacy') !== 'readable' || source.length === 0) {
    return { rows:source, changed:false };
  }

  const groups = visibleGroups(source);
  const split = readableFrameWidth(settings, resolution) >= MIN_TWO_COLUMN_WIDTH
    ? bestSequentialSplit(groups)
    : null;
  const assignments = new Map();

  groups.forEach((group, groupIndex) => {
    const column = split !== null && groupIndex >= split ? 'right' : 'left';
    group.indexes.forEach((index) => assignments.set(index, column));
  });

  let carry = 'left';
  let changed = false;
  const migrated = source.map((row, index) => {
    const existing = validColumn(row);
    if (existing) {
      if (existing !== 'full') carry = existing;
      return row;
    }
    const column = assignments.get(index) || carry;
    carry = column;
    changed = true;
    return { ...row, column };
  });

  return { rows:changed ? migrated : source, changed };
}

export async function migrateReadableManualColumns(queryable) {
  const { rows } = await queryable.query(`
    SELECT d.screen_id, d.rows_json, d.settings_json, s.resolution
    FROM screen_drafts d
    JOIN screens s ON s.id = d.screen_id
  `);

  for (const record of rows) {
    const settings = jsonValue(record.settings_json, {});
    const sourceRows = jsonValue(record.rows_json, []);
    const migrated = migrateReadableRows(sourceRows, settings, record.resolution);
    if (!migrated.changed) continue;
    await queryable.query(
      'UPDATE screen_drafts SET rows_json=$1, revision=revision+1, updated_at=NOW() WHERE screen_id=$2',
      [JSON.stringify(migrated.rows), record.screen_id]
    );
  }
}
