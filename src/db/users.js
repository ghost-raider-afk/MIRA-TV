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

    async createWebSession({ tokenHash, username, sessionVersion, expiresAt }) {
      const { rows } = await pool.query(
        `INSERT INTO web_sessions (token_hash, username, session_version, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING token_hash, username, session_version, expires_at, created_at, revoked_at`,
        [tokenHash, username, sessionVersion, expiresAt, isoNow()]
      );
      return normaliseRow(rows[0]);
    },

    async getActiveWebSessionByHash(tokenHash) {
      const { rows } = await pool.query(
        `SELECT token_hash, username, session_version, expires_at, created_at, revoked_at
         FROM web_sessions
         WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
         LIMIT 1`,
        [tokenHash]
      );
      return normaliseRow(rows[0]);
    },

    async revokeWebSessionByHash(tokenHash) {
      const { rowCount } = await pool.query(
        'UPDATE web_sessions SET revoked_at = $1 WHERE token_hash = $2 AND revoked_at IS NULL',
        [isoNow(), tokenHash]
      );
      return rowCount > 0;
    },

    async revokeWebSessionsForUser(username) {
      const { rowCount } = await pool.query(
        'UPDATE web_sessions SET revoked_at = $1 WHERE username = $2 AND revoked_at IS NULL',
        [isoNow(), username]
      );
      return rowCount;
    },

    async deleteExpiredWebSessions(before) {
      const { rowCount } = await pool.query('DELETE FROM web_sessions WHERE expires_at <= $1', [before]);
      return rowCount;
    },

    async listActiveAdministrators() {
      const { rows } = await pool.query(
        `SELECT username, role, active, session_version, password_changed_at, created_at, updated_at
         FROM web_users WHERE role = 'administrator' AND active = TRUE ORDER BY username`
      );
      return rows.map(normaliseRow);
    },

    async listManagers() {
      const { rows } = await pool.query(
        `SELECT u.username,u.role,u.active,u.session_version,u.password_changed_at,u.created_at,u.updated_at,
                COALESCE(p.display_name,u.username) AS display_name,
                COALESCE(a.all_locations,FALSE) AS all_locations,
                COALESCE(a.catalog_enabled,FALSE) AS catalog_enabled,
                COALESCE((SELECT array_agg(l.location_id ORDER BY l.location_id)
                          FROM manager_location_access l WHERE l.username=u.username), '{}'::bigint[]) AS location_ids
         FROM web_users u LEFT JOIN manager_access a ON a.username=u.username
         LEFT JOIN user_preferences p ON p.username=u.username
         WHERE u.role='manager' ORDER BY u.username`
      );
      return rows.map((row) => ({ ...normaliseRow(row), location_ids:row.location_ids.map(Number) }));
    },

    async getManagerAccess(username) {
      const { rows } = await pool.query(
        `SELECT a.all_locations,a.catalog_enabled,
                COALESCE((SELECT array_agg(l.location_id ORDER BY l.location_id)
                          FROM manager_location_access l WHERE l.username=a.username), '{}'::bigint[]) AS location_ids
         FROM manager_access a WHERE a.username=$1`, [username]
      );
      const row=rows[0];
      return row ? { all_locations:row.all_locations,catalog_enabled:row.catalog_enabled,
        location_ids:row.location_ids.map(Number) } : { all_locations:false,catalog_enabled:false,location_ids:[] };
    },

    async setManagerAccess(username, { all_locations,catalog_enabled,location_ids }) {
      const { rows } = await pool.query(
        `INSERT INTO manager_access (username,all_locations,catalog_enabled)
         SELECT username,$2,$3 FROM web_users WHERE username=$1 AND role='manager'
         ON CONFLICT (username) DO UPDATE SET all_locations=EXCLUDED.all_locations,catalog_enabled=EXCLUDED.catalog_enabled
         RETURNING username`, [username,all_locations,catalog_enabled]
      );
      if (!rows.length) return null;
      await pool.query('DELETE FROM manager_location_access WHERE username=$1', [username]);
      if (!all_locations && location_ids.length) await pool.query(
        `INSERT INTO manager_location_access (username,location_id)
         SELECT $1,id FROM locations WHERE id=ANY($2::bigint[])`, [username,location_ids]
      );
      return this.getManagerAccess(username);
    },

    async createManager({ username, passwordHash, displayName = username }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO web_users (username, password_hash, role, active, session_version, password_changed_at, created_at, updated_at)
         VALUES ($1, $2, 'manager', TRUE, 1, $3, $3, $3)
         RETURNING username, role, active, session_version, password_changed_at, created_at, updated_at`,
        [username, passwordHash, now]
      );
      await pool.query('INSERT INTO manager_access(username) VALUES ($1)', [username]);
      await getUserPreferences(username);
      if (displayName !== username) await pool.query(
        'UPDATE user_preferences SET display_name=$2, updated_at=$3 WHERE username=$1',
        [username, displayName, now]
      );
      return { ...normaliseRow(rows[0]), display_name:displayName };
    },

    async setManagerDisplayName(username, displayName) {
      const { rows } = await pool.query(
        `UPDATE user_preferences p SET display_name=$2, updated_at=$3
         WHERE p.username=$1 AND EXISTS(
           SELECT 1 FROM web_users u WHERE u.username=p.username AND u.role='manager'
         ) RETURNING p.display_name`,
        [username, displayName, isoNow()]
      );
      return normaliseRow(rows[0]);
    },

    async setManagerActive(username, active) {
      const { rows } = await pool.query(
        `UPDATE web_users SET active = $1, session_version = session_version + 1, updated_at = $2
         WHERE username = $3 AND role = 'manager'
         RETURNING username, role, active, session_version, password_changed_at, created_at, updated_at`,
        [active === true, isoNow(), username]
      );
      return normaliseRow(rows[0]);
    },

    async updateManagerPassword(username, passwordHash) {
      const now = isoNow();
      const { rows } = await pool.query(
        `UPDATE web_users SET password_hash = $1, session_version = session_version + 1,
         password_changed_at = $2, updated_at = $2 WHERE username = $3 AND role = 'manager'
         RETURNING username, role, active, session_version, password_changed_at, created_at, updated_at`,
        [passwordHash, now, username]
      );
      return normaliseRow(rows[0]);
    },

    async deleteManager(username) {
      const result = await pool.query("DELETE FROM web_users WHERE username = $1 AND role = 'manager'", [username]);
      if (!result.rowCount) return false;
      await pool.query('DELETE FROM user_preferences WHERE username = $1', [username]);
      return true;
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
