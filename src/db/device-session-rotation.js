import { isoNow } from './helpers.js';

function rotationSession(row) {
  if (!row) return null;
  return {
    ...row,
    device_id: Number(row.device_id)
  };
}

export function createDeviceSessionRotationRepository(pool) {
  return Object.freeze({
    async getRotatableDeviceSessionByHash(tokenHash) {
      const { rows } = await pool.query(
        `SELECT ds.id AS session_id, ds.device_id, ds.expires_at, ds.parent_session_id
           FROM tv_device_sessions ds
           JOIN tv_devices d ON d.id = ds.device_id AND d.active = TRUE
           JOIN tv_device_bindings b ON b.device_id = ds.device_id AND b.active = TRUE
           JOIN screens s ON s.id = b.screen_id AND s.active = TRUE
          WHERE ds.token_hash = $1
            AND ds.revoked_at IS NULL
            AND ds.expires_at > NOW()
          LIMIT 1`,
        [tokenHash]
      );
      return rotationSession(rows[0]);
    },

    async beginOrResumeDeviceSessionRotation({ parentSessionId, deviceId, candidateSessionId, candidateTokenHash, expiresAt }) {
      const parent = await pool.query(
        `SELECT id, device_id
           FROM tv_device_sessions
          WHERE id = $1 AND device_id = $2 AND revoked_at IS NULL AND expires_at > NOW()
          FOR UPDATE`,
        [parentSessionId, deviceId]
      );
      if (!parent.rowCount) return null;

      const existing = await pool.query(
        `SELECT id AS session_id, device_id, expires_at, parent_session_id
           FROM tv_device_sessions
          WHERE parent_session_id = $1
            AND device_id = $2
            AND revoked_at IS NULL
            AND expires_at > NOW()
          ORDER BY created_at DESC
          LIMIT 1`,
        [parentSessionId, deviceId]
      );
      if (existing.rowCount) return rotationSession(existing.rows[0]);

      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO tv_device_sessions
          (id, device_id, token_hash, expires_at, created_at, last_seen_at, parent_session_id)
         VALUES ($1, $2, $3, $4, $5, $5, $6)
         RETURNING id AS session_id, device_id, expires_at, parent_session_id`,
        [candidateSessionId, deviceId, candidateTokenHash, expiresAt, now, parentSessionId]
      );
      return rotationSession(rows[0]);
    },

    async confirmDeviceSessionRotation(sessionId, parentSessionId, deviceId) {
      if (!parentSessionId) return false;
      const child = await pool.query(
        `SELECT id
           FROM tv_device_sessions
          WHERE id = $1
            AND parent_session_id = $2
            AND device_id = $3
            AND revoked_at IS NULL
            AND expires_at > NOW()
          LIMIT 1`,
        [sessionId, parentSessionId, deviceId]
      );
      if (!child.rowCount) return false;
      const { rowCount } = await pool.query(
        `UPDATE tv_device_sessions
            SET revoked_at = $1
          WHERE id = $2
            AND device_id = $3
            AND revoked_at IS NULL`,
        [isoNow(), parentSessionId, deviceId]
      );
      return rowCount > 0;
    }
  });
}
