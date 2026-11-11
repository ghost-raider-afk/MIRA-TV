import { isoNow } from './helpers.js';
import { ValidationError } from '../shared/errors.js';

function deviceIds(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0))];
}

function readConnectionCursor(value) {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ValidationError('Некорректный указатель журнала связи.');
  }
  try {
    const data = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!Array.isArray(data) || data.length !== 3 ||
      !Number.isFinite(Date.parse(data[0])) ||
      typeof data[1] !== 'string' || data[1].length > 64 ||
      !Number.isSafeInteger(data[2]) || data[2] < 1) throw new Error('Invalid connection cursor');
    return data;
  } catch {
    throw new ValidationError('Некорректный указатель журнала связи.');
  }
}

function rowMetadata(row) {
  let metadata = {};
  try {
    metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {});
  } catch {}
  return {
    device_id: Number(row.device_id),
    boot_id: row.boot_id,
    seq: Number(row.seq),
    level: row.level,
    event_type: row.event_type,
    context_revision: row.context_revision || '',
    device_timestamp: row.device_timestamp || null,
    server_received_at: row.server_received_at,
    metadata
  };
}

export function createPlayerTelemetryRepository(pool) {
  return Object.freeze({
    async insertPlayerLogBatch(deviceId, bootId, events) {
      if (!events.length) return 0;
      const receivedAt = isoNow();
      let acceptedThrough = 0;
      for (const event of events) {
        await pool.query(
          `INSERT INTO tv_player_logs
             (device_id, boot_id, seq, device_timestamp, server_received_at, level, event_type, context_revision, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (device_id, boot_id, seq) DO NOTHING`,
          [
            deviceId,
            bootId,
            event.seq,
            event.device_timestamp || null,
            receivedAt,
            event.level,
            event.type,
            event.revision || '',
            JSON.stringify(event.data || {})
          ]
        );
        acceptedThrough = Math.max(acceptedThrough, event.seq);
      }
      return acceptedThrough;
    },

    async listLatestPlayerLogsByDeviceIds(deviceIdsValue) {
      const ids = deviceIds(deviceIdsValue);
      if (!ids.length) return [];
      const { rows } = await pool.query(
        `SELECT DISTINCT ON (device_id)
                device_id, boot_id, seq, level, event_type, context_revision, server_received_at, metadata
           FROM tv_player_logs
          WHERE device_id = ANY($1::bigint[])
            AND event_type <> 'fullscreen.state'
          ORDER BY device_id, server_received_at DESC, seq DESC`,
        [ids]
      );
      return rows.map(rowMetadata);
    },

    async listLatestPlayerFullscreenByDeviceIds(deviceIdsValue) {
      const ids = deviceIds(deviceIdsValue);
      if (!ids.length) return [];
      const { rows } = await pool.query(
        `SELECT DISTINCT ON (device_id)
                device_id, boot_id, seq, level, event_type, context_revision, server_received_at, metadata
           FROM tv_player_logs
          WHERE device_id = ANY($1::bigint[])
            AND event_type = 'fullscreen.state'
          ORDER BY device_id, server_received_at DESC, seq DESC`,
        [ids]
      );
      return rows.map(rowMetadata);
    },

    async getDeviceConnectionHistory(deviceId, { since, limit = 150, cursor = '' } = {}) {
      const id = Number(deviceId);
      if (!Number.isSafeInteger(id) || id < 1 || !Number.isFinite(Date.parse(since))) {
        throw new ValidationError('Некорректные параметры журнала связи.');
      }
      const pageSize = Math.max(1, Math.min(200, Number(limit) || 150));
      const boundary = readConnectionCursor(cursor);
      const args = [id, since];
      let before = '';
      if (boundary) {
        args.push(...boundary);
        before = 'AND (server_received_at, boot_id, seq) < ($3::timestamptz, $4::text, $5::bigint)';
      }
      args.push(pageSize + 1);
      const [page, summary] = await Promise.all([
        pool.query(
          `SELECT device_id, boot_id, seq, device_timestamp, server_received_at,
                  level, event_type, context_revision, metadata
             FROM tv_player_logs
            WHERE device_id = $1 AND server_received_at >= $2::timestamptz
              ${before}
            ORDER BY server_received_at DESC, boot_id DESC, seq DESC
            LIMIT ${args.length}`,
          args
        ),
        pool.query(
          `SELECT COUNT(*)::int AS outages
             FROM tv_player_logs
            WHERE device_id = $1 AND server_received_at >= $2::timestamptz
              AND event_type = 'connection.offline'`,
          [id, since]
        )
      ]);
      const rows = page.rows.slice(0, pageSize);
      const last = rows.at(-1);
      const nextCursor = page.rows.length > pageSize && last
        ? Buffer.from(JSON.stringify([new Date(last.server_received_at).toISOString(), last.boot_id, Number(last.seq)])).toString('base64url')
        : null;
      return {
        events:rows.map(rowMetadata),
        outages:Number(summary.rows[0]?.outages) || 0,
        next_cursor:nextCursor
      };
    },

    async prunePlayerLogs(retentionDays) {
      const { rowCount } = await pool.query(
        `DELETE FROM tv_player_logs
          WHERE server_received_at < NOW() - ($1::int * INTERVAL '1 day')`,
        [retentionDays]
      );
      return rowCount;
    }
  });
}
