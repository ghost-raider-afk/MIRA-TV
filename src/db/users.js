import { isoNow, normaliseRow } from './helpers.js';

export function createUsersRepository(pool) {
  async function getUserPreferences(username) {
    const now = isoNow();
    await pool.query(
      'INSERT INTO user_preferences (username, display_name, created_at, updated_at) VALUES ($1, $1, $2, $2) ON CONFLICT (username) DO NOTHING',
      [username, now]
    );
    const { rows } = await pool.query('SELECT * FROM user_preferences WHERE username = $1', [username]);
    return normaliseRow(rows[0]);
  }

  return Object.freeze({
    async ensureInitialAdministrator({ username, passwordHash } = {}) {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM web_users');
      if (Number(rows[0].count) > 0) return false;
      if (!username || !passwordHash) throw new Error('В базе нет пользователей. Для первого запуска укажите временные BOOTSTRAP_ADMIN_USERNAME и BOOTSTRAP_ADMIN_PASSWORD.');
      const now = isoNow();
      await pool.query(
        `INSERT INTO web_users (username, password_hash, role, active, session_version, password_changed_at, created_at, updated_at)
         VALUES ($1, $2, 'administrator', TRUE, 1, $3, $3, $3)`,
        [username, passwordHash, now]
      );
      await getUserPreferences(username);
      return true;
    },

    async getActiveUser(username) {
      const { rows } = await pool.query(
        `SELECT username, password_hash, role, active, session_version, password_changed_at, created_at, updated_at
         FROM web_users WHERE username = $1 AND active = TRUE`,
        [username]
      );
      return normaliseRow(rows[0]);
    },

    async listActiveAdministrators() {
      const { rows } = await pool.query(
        `SELECT username, role, active, session_version, password_changed_at, created_at, updated_at
         FROM web_users WHERE role = 'administrator' AND active = TRUE ORDER BY username`
      );
      return rows.map(normaliseRow);
    },

    async updateUserPassword(username, passwordHash) {
      const { rows } = await pool.query(
        `UPDATE web_users SET password_hash = $1, session_version = session_version + 1,
         password_changed_at = $2, updated_at = $2 WHERE username = $3 AND active = TRUE
         RETURNING username, password_hash, role, active, session_version, password_changed_at, created_at, updated_at`,
        [passwordHash, isoNow(), username]
      );
      return normaliseRow(rows[0]);
    },

    getUserPreferences,

    async updateUserPreferences(username, { display_name, email, phone, job_title, theme, notifications_enabled }) {
      await getUserPreferences(username);
      const { rows } = await pool.query(
        `UPDATE user_preferences SET display_name = $1, email = $2, phone = $3, job_title = $4,
         theme = $5, notifications_enabled = $6, updated_at = $7 WHERE username = $8 RETURNING *`,
        [display_name, email, phone, job_title, theme, notifications_enabled, isoNow(), username]
      );
      return normaliseRow(rows[0]);
    }
  });
}
