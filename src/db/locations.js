import { isoNow, normaliseRow } from './helpers.js';

export function createLocationsRepository(pool) {
  async function withScreenCount(row) {
    const location = normaliseRow(row);
    if (!location) return null;
    const { rows } = await pool.query('SELECT COUNT(*)::int AS screen_count FROM screens WHERE location_id = $1', [location.id]);
    return { ...location, screen_count: Number(rows[0].screen_count) };
  }

  async function getLocation(id) {
    const { rows } = await pool.query(
      `SELECT l.*, d.name AS sftp_directory_name
       FROM locations l LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
       WHERE l.id = $1`,
      [id]
    );
    return withScreenCount(rows[0]);
  }

  return Object.freeze({
    async listLocations() {
      const { rows } = await pool.query(
        `SELECT l.*, d.name AS sftp_directory_name
         FROM locations l LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
         ORDER BY l.name`
      );
      return Promise.all(rows.map(withScreenCount));
    },

    getLocation,

    async createLocation({ name, address = '', active = true }) {
      const now = isoNow();
      const { rows } = await pool.query(
        'INSERT INTO locations (name, address, active, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING id',
        [name, address, active, now]
      );
      return getLocation(rows[0].id);
    },

    async updateLocation(id, { name, address = '', active = true }) {
      const { rowCount } = await pool.query(
        'UPDATE locations SET name = $1, address = $2, active = $3, updated_at = $4 WHERE id = $5',
        [name, address, active, isoNow(), id]
      );
      return rowCount ? getLocation(id) : null;
    },

    async deleteLocation(id) {
      const { rowCount } = await pool.query('DELETE FROM locations WHERE id = $1', [id]);
      return rowCount > 0;
    }
  });
}
