import { isoNow } from '../helpers.js';

export async function seedDemoData(pool) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM locations');
  if (Number(rows[0].count) > 0) return false;
  const now = isoNow();
  const location = await pool.query(
    'INSERT INTO locations (name, address, active, created_at, updated_at) VALUES ($1, $2, TRUE, $3, $3) RETURNING id',
    ['Демонстрационная точка', 'Пример адреса', now]
  );
  const screen = await pool.query(
    `INSERT INTO screens (location_id, location_number, name, resolution, status, active, delivery_filename, created_at, updated_at)
     VALUES ($1, 1, $2, $3, $4, TRUE, $5, $6, $6) RETURNING id`,
    [location.rows[0].id, 'Экран у кассы', '1920×1080', 'draft', 'monitor-1.jpg', now]
  );
  await pool.query(
    'INSERT INTO screen_drafts (screen_id, rows_json, settings_json, revision, updated_at) VALUES ($1, $2, $3, 1, $4)',
    [screen.rows[0].id, '[]', '{}', now]
  );
  return true;
}
