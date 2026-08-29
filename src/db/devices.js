import crypto from 'node:crypto';
import { isoNow } from './helpers.js';

function deviceRecord(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    screen_id: row.screen_id === null || row.screen_id === undefined ? null : Number(row.screen_id)
  };
}

function activationRecord(row) {
  if (!row) return null;
  return {
    ...row,
    approved_screen_id: row.approved_screen_id === null ? null : Number(row.approved_screen_id),
    device_id: row.device_id === null ? null : Number(row.device_id)
  };
}

function bindingRecord(row) {
  if (!row) return null;
  return {
    ...row,
    binding_id: Number(row.binding_id ?? row.id),
    device_id: Number(row.device_id),
    screen_id: Number(row.screen_id),
    location_id: row.location_id === undefined ? undefined : Number(row.location_id),
    location_number: row.location_number === undefined ? undefined : Number(row.location_number)
  };
}

function sessionRecord(row) {
  if (!row) return null;
  return {
    ...row,
    device_id: Number(row.device_id),
    binding_id: Number(row.binding_id),
    screen_id: Number(row.screen_id),
    location_id: Number(row.location_id),
    location_number: Number(row.location_number)
  };
}

export function createDevicesRepository(pool) {
  async function getOrCreateDevice({ deviceKey, label = '', userAgent = '', remoteAddress = '', authorizedBy = '' }) {
    const key = String(deviceKey || '').trim();
    if (!key) throw new TypeError('TV binding requires a persistent device key.');
    const now = isoNow();
    const { rows } = await pool.query(
      `INSERT INTO tv_devices
        (device_key, label, user_agent, remote_address, authorized_by, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, $6)
       ON CONFLICT (device_key) DO UPDATE SET
         label = EXCLUDED.label,
         user_agent = EXCLUDED.user_agent,
         remote_address = EXCLUDED.remote_address,
         authorized_by = EXCLUDED.authorized_by,
         active = TRUE,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [key, label, userAgent, remoteAddress, authorizedBy, now]
    );
    return deviceRecord(rows[0]);
  }

  async function activeBindingByScreen(screenId, { lock = false } = {}) {
    const { rows } = await pool.query(
      `SELECT b.id AS binding_id, b.device_id, b.screen_id, b.active, b.bound_by, b.bound_at,
              d.device_key, d.label, d.last_seen_at AS device_last_seen_at
         FROM tv_device_bindings b
         JOIN tv_devices d ON d.id = b.device_id
        WHERE b.screen_id = $1 AND b.active = TRUE
        LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
      [screenId]
    );
    const binding = bindingRecord(rows[0]);
    if (!binding) return null;
    const sessionActivity = await pool.query(
      `SELECT MAX(last_seen_at) AS session_last_seen_at
         FROM tv_device_sessions
        WHERE device_id = $1 AND revoked_at IS NULL`,
      [binding.device_id]
    );
    return {
      ...binding,
      session_last_seen_at: sessionActivity.rows[0]?.session_last_seen_at ?? null
    };
  }

  async function activeBindingByKey(deviceKey, { lock = false } = {}) {
    const { rows } = await pool.query(
      `SELECT b.id AS binding_id, b.device_id, b.screen_id, b.active, b.bound_by, b.bound_at,
              d.device_key, d.label, d.last_seen_at AS device_last_seen_at
         FROM tv_device_bindings b
         JOIN tv_devices d ON d.id = b.device_id
        WHERE d.device_key = $1 AND b.active = TRUE
        LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
      [deviceKey]
    );
    return bindingRecord(rows[0]);
  }

  async function revokeBindingForScreen(screenId) {
    const now = isoNow();
    const binding = await activeBindingByScreen(screenId);
    if (!binding) return null;
    await pool.query(
      `UPDATE tv_device_sessions SET revoked_at = $1
       WHERE revoked_at IS NULL AND device_id = $2`,
      [now, binding.device_id]
    );
    await pool.query(
      `UPDATE tv_device_bindings
          SET active = FALSE, revoked_at = $1, updated_at = $1
        WHERE id = $2 AND active = TRUE`,
      [now, binding.binding_id]
    );
    return binding;
  }

  async function bindDevice({ deviceKey, screenId, label = '', userAgent = '', remoteAddress = '', authorizedBy = '' }) {
    const device = await getOrCreateDevice({ deviceKey, label, userAgent, remoteAddress, authorizedBy });
    const now = isoNow();

    await pool.query(
      `UPDATE tv_device_sessions SET revoked_at = $1
       WHERE revoked_at IS NULL
         AND device_id IN (
           SELECT device_id FROM tv_device_bindings
            WHERE active = TRUE AND (device_id = $2 OR screen_id = $3)
         )`,
      [now, device.id, screenId]
    );

    await pool.query(
      `UPDATE tv_device_bindings
          SET active = FALSE, revoked_at = $1, updated_at = $1
        WHERE active = TRUE AND (device_id = $2 OR screen_id = $3)`,
      [now, device.id, screenId]
    );

    const { rows } = await pool.query(
      `INSERT INTO tv_device_bindings
        (device_id, screen_id, active, bound_by, bound_at, created_at, updated_at)
       VALUES ($1, $2, TRUE, $3, $4, $4, $4)
       RETURNING id AS binding_id, device_id, screen_id, active, bound_by, bound_at, revoked_at, created_at, updated_at`,
      [device.id, screenId, authorizedBy, now]
    );
    return { ...device, screen_id: screenId, binding_id: Number(rows[0].binding_id) };
  }

  return Object.freeze({
    async createDeviceActivation({
      id,
      deviceKey = '',
      scanTokenHash,
      pollSecretHash,
      reserveCodeHash,
      expiresAt,
      userAgent = '',
      remoteAddress = ''
    }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO tv_device_activations
          (id, device_key, scan_token_hash, poll_secret_hash, reserve_code_hash, status, user_agent, remote_address, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $9)
         RETURNING *`,
        [id, deviceKey, scanTokenHash, pollSecretHash, reserveCodeHash, userAgent, remoteAddress, expiresAt, now]
      );
      return activationRecord(rows[0]);
    },

    async deleteExpiredDeviceActivations(before) {
      const { rowCount } = await pool.query('DELETE FROM tv_device_activations WHERE expires_at < $1', [before]);
      return rowCount;
    },

    async getDeviceActivation(id, { lock = false } = {}) {
      const { rows } = await pool.query(
        `SELECT * FROM tv_device_activations WHERE id = $1 LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
        [id]
      );
      return activationRecord(rows[0]);
    },

    async getDeviceActivationByScanTokenHash(hash) {
      const { rows } = await pool.query(
        `SELECT * FROM tv_device_activations
         WHERE scan_token_hash = $1 AND status = 'pending' AND expires_at > NOW()
         LIMIT 1`,
        [hash]
      );
      return activationRecord(rows[0]);
    },

    async getDeviceActivationByReserveCodeHash(hash) {
      const { rows } = await pool.query(
        `SELECT * FROM tv_device_activations
         WHERE reserve_code_hash = $1 AND status = 'pending' AND expires_at > NOW()
         LIMIT 1`,
        [hash]
      );
      return activationRecord(rows[0]);
    },

    async getDeviceActivationForPoll(id, pollSecretHash, { lock = false } = {}) {
      const { rows } = await pool.query(
        `SELECT * FROM tv_device_activations
         WHERE id = $1 AND poll_secret_hash = $2
         LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
        [id, pollSecretHash]
      );
      return activationRecord(rows[0]);
    },

    async approveDeviceActivation(id, screenId, approvedBy) {
      const now = isoNow();
      const { rows } = await pool.query(
        `UPDATE tv_device_activations
         SET status = 'approved', approved_screen_id = $1, approved_by = $2, approved_at = $3, updated_at = $3
         WHERE id = $4 AND status = 'pending' AND expires_at > NOW()
         RETURNING *`,
        [screenId, approvedBy, now, id]
      );
      return activationRecord(rows[0]);
    },

    async markDeviceActivationConsumed(id, deviceId, sessionId) {
      const now = isoNow();
      const { rows } = await pool.query(
        `UPDATE tv_device_activations
         SET status = 'consumed', device_id = $1, session_id = $2, consumed_at = $3, updated_at = $3
         WHERE id = $4 AND status = 'approved'
         RETURNING *`,
        [deviceId, sessionId, now, id]
      );
      return activationRecord(rows[0]);
    },

    getActiveDeviceBindingByScreen: activeBindingByScreen,
    getActiveDeviceBindingByKey: activeBindingByKey,
    bindDevice,

    async createDevice({ deviceKey = crypto.randomUUID(), screenId, label = '', userAgent = '', remoteAddress = '', authorizedBy = '' }) {
      return bindDevice({ deviceKey, screenId, label, userAgent, remoteAddress, authorizedBy });
    },

    async deactivateDevicesForScreen(screenId) {
      const binding = await revokeBindingForScreen(screenId);
      if (!binding) return [];
      const { rows } = await pool.query('SELECT * FROM tv_devices WHERE id = $1', [binding.device_id]);
      return rows.map(deviceRecord);
    },

    async createDeviceSession({ id, deviceId, tokenHash, expiresAt }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO tv_device_sessions
          (id, device_id, token_hash, expires_at, created_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING *`,
        [id, deviceId, tokenHash, expiresAt, now]
      );
      return rows[0] || null;
    },

    async getActiveDeviceSessionByHash(hash) {
      const { rows } = await pool.query(
        `SELECT ds.id AS session_id, ds.device_id, ds.expires_at, ds.last_seen_at AS session_last_seen_at,
                b.id AS binding_id, b.screen_id,
                d.device_key, d.label AS device_label, d.last_seen_at AS device_last_seen_at,
                s.name AS screen_name, s.location_number, s.resolution, s.status AS screen_status,
                l.id AS location_id, l.name AS location_name
           FROM tv_device_sessions ds
           JOIN tv_devices d ON d.id = ds.device_id
           JOIN tv_device_bindings b ON b.device_id = d.id AND b.active = TRUE
           JOIN screens s ON s.id = b.screen_id
           JOIN locations l ON l.id = s.location_id
          WHERE ds.token_hash = $1
            AND ds.revoked_at IS NULL
            AND ds.expires_at > NOW()
            AND d.active = TRUE
            AND s.active = TRUE
          LIMIT 1`,
        [hash]
      );
      return sessionRecord(rows[0]);
    },

    async touchDeviceSession(sessionId, deviceId, observedAt, staleBefore) {
      await pool.query(
        `UPDATE tv_device_sessions SET last_seen_at = $1
         WHERE id = $2 AND (last_seen_at IS NULL OR last_seen_at < $3)`,
        [observedAt, sessionId, staleBefore]
      );
      await pool.query(
        `UPDATE tv_devices SET last_seen_at = $1, updated_at = $1
         WHERE id = $2 AND active = TRUE AND (last_seen_at IS NULL OR last_seen_at < $3)`,
        [observedAt, deviceId, staleBefore]
      );
    },

    async listDeviceBindings() {
      const { rows } = await pool.query(
        `SELECT b.id AS binding_id, b.device_id, b.screen_id, b.bound_by, b.bound_at,
                d.device_key, d.label, d.user_agent, d.remote_address, d.last_seen_at AS device_last_seen_at,
                s.name AS screen_name, s.location_number, l.id AS location_id, l.name AS location_name,
                sessions.session_last_seen_at, sessions.session_expires_at
           FROM tv_device_bindings b
           JOIN tv_devices d ON d.id = b.device_id
           JOIN screens s ON s.id = b.screen_id
           JOIN locations l ON l.id = s.location_id
           LEFT JOIN (
             SELECT device_id,
                    MAX(last_seen_at) AS session_last_seen_at,
                    MAX(expires_at) AS session_expires_at
               FROM tv_device_sessions
              WHERE revoked_at IS NULL
              GROUP BY device_id
           ) sessions ON sessions.device_id = b.device_id
          WHERE b.active = TRUE
          ORDER BY l.name, s.location_number, b.id`
      );
      return rows.map(bindingRecord);
    },

    async revokeDeviceByScreen(screenId) {
      return Boolean(await revokeBindingForScreen(screenId));
    }
  });
}
