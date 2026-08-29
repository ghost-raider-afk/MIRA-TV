import { isoNow, normaliseRow } from './helpers.js';

export function createSftpRepository(pool, { getLocation }) {
  async function getSftpDirectory(id) {
    const { rows } = await pool.query(
      `SELECT d.*, l.id AS bound_location_id, l.name AS bound_location_name
       FROM sftp_directories d LEFT JOIN locations l ON l.sftp_directory_id = d.id WHERE d.id = $1`,
      [id]
    );
    return normaliseRow(rows[0]);
  }

  return Object.freeze({
    async listSftpDirectories() {
      const { rows } = await pool.query(
        `SELECT d.*, l.id AS bound_location_id, l.name AS bound_location_name
         FROM sftp_directories d LEFT JOIN locations l ON l.sftp_directory_id = d.id ORDER BY d.name`
      );
      return rows.map(normaliseRow);
    },
    getSftpDirectory,
    async createSftpDirectory({ name }) {
      const now = isoNow();
      const { rows } = await pool.query(
        'INSERT INTO sftp_directories (name, created_at, updated_at) VALUES ($1, $2, $2) RETURNING id',
        [name, now]
      );
      return getSftpDirectory(rows[0].id);
    },
    async markSftpDirectoryProvisioned(id) {
      const { rowCount } = await pool.query(
        'UPDATE sftp_directories SET provisioned_at = $1, updated_at = $1 WHERE id = $2',
        [isoNow(), id]
      );
      return rowCount ? getSftpDirectory(id) : null;
    },
    async deleteSftpDirectory(id) {
      const { rowCount } = await pool.query('DELETE FROM sftp_directories WHERE id = $1', [id]);
      return rowCount > 0;
    },
    async getLocationBySftpUsername(username) {
      const { rows } = await pool.query('SELECT id FROM locations WHERE sftp_username = $1 LIMIT 1', [username]);
      return rows[0] ? getLocation(rows[0].id) : null;
    },
    async bindLocationSftp(locationId, { directoryId, username }) {
      const { rowCount } = await pool.query(
        `UPDATE locations SET sftp_directory_id = $1, sftp_username = $2,
         sftp_password_issued_at = $3, updated_at = $3 WHERE id = $4 AND sftp_directory_id IS NULL`,
        [directoryId, username, isoNow(), locationId]
      );
      return rowCount ? getLocation(locationId) : null;
    },
    async touchLocationSftpPassword(locationId) {
      const { rowCount } = await pool.query(
        'UPDATE locations SET sftp_password_issued_at = $1, updated_at = $1 WHERE id = $2 AND sftp_username IS NOT NULL',
        [isoNow(), locationId]
      );
      return rowCount ? getLocation(locationId) : null;
    },
    async unbindLocationSftp(locationId) {
      const { rowCount } = await pool.query(
        `UPDATE locations SET sftp_directory_id = NULL, sftp_username = NULL,
         sftp_password_issued_at = NULL, updated_at = $1 WHERE id = $2 AND sftp_directory_id IS NOT NULL`,
        [isoNow(), locationId]
      );
      return rowCount ? getLocation(locationId) : null;
    }
  });
}
