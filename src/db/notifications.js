import { isoNow, normaliseActivityEvent } from './helpers.js';

const SEVERITIES = new Set(['success', 'warning', 'error', 'info']);
const CATEGORY_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/;

function severity(value, fallback = 'info') {
  const normalized = String(value || fallback).toLowerCase();
  return SEVERITIES.has(normalized) ? normalized : fallback;
}

function category(value, fallback = 'system') {
  const normalized = String(value || fallback).toLowerCase();
  return CATEGORY_PATTERN.test(normalized) ? normalized : fallback;
}

function categoryFromAction(action) {
  const source = String(action || '').toLowerCase();
  if (source.startsWith('auth.')) return 'auth';
  if (source.startsWith('catalog.')) return 'catalog';
  if (source.startsWith('sftp.')) return 'sftp';
  if (source.startsWith('screen.') || source.startsWith('location.')) return 'monitors';
  if (source.startsWith('device.')) return 'tv';
  if (source.startsWith('settings.') || source.startsWith('profile.')) return 'settings';
  if (source.startsWith('frontend.') || source.startsWith('ui.')) return 'interface';
  return 'system';
}

function safeLimit(value, fallback = 20) {
  return Math.max(1, Math.min(Number.parseInt(value, 10) || fallback, 500));
}

export function createNotificationsRepository(pool) {
  return Object.freeze({
    async recordActivity({
      actor_username,
      action,
      entity_type,
      entity_id = null,
      message,
      metadata = {},
      severity: eventSeverity = null,
      category: eventCategory = null,
      details = ''
    }) {
      const resolvedSeverity = eventSeverity === null || eventSeverity === undefined ? 'success' : severity(eventSeverity);
      const resolvedCategory = eventCategory === null || eventCategory === undefined ? categoryFromAction(action) : category(eventCategory);
      const { rows } = await pool.query(
        `INSERT INTO activity_events (
          actor_username, action, entity_type, entity_id, message, metadata, created_at, severity, category, details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [
          actor_username,
          action,
          entity_type,
          entity_id === null ? null : String(entity_id),
          message,
          JSON.stringify(metadata),
          isoNow(),
          resolvedSeverity,
          resolvedCategory,
          String(details || '').slice(0, 12000)
        ]
      );
      return normaliseActivityEvent(rows[0]);
    },

    async listEvents({ limit = 100, severity: severityFilter = '', category: categoryFilter = '', query = '' } = {}) {
      const values = [];
      const where = [];
      if (severityFilter) {
        values.push(severity(severityFilter));
        where.push(`severity = $${values.length}`);
      }
      if (categoryFilter) {
        values.push(category(categoryFilter));
        where.push(`category = $${values.length}`);
      }
      const search = String(query || '').trim();
      if (search) {
        values.push(`%${search}%`);
        where.push(`(message ILIKE $${values.length} OR actor_username ILIKE $${values.length} OR action ILIKE $${values.length} OR details ILIKE $${values.length})`);
      }
      values.push(safeLimit(limit, 100));
      const { rows } = await pool.query(
        `SELECT * FROM activity_events ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY created_at DESC, id DESC LIMIT $${values.length}`,
        values
      );
      return rows.map(normaliseActivityEvent);
    },

    async listNotifications(limit = 20) {
      const [items, unread] = await Promise.all([
        this.listEvents({ limit: safeLimit(limit) }),
        pool.query('SELECT COUNT(*)::int AS count FROM activity_events WHERE read_at IS NULL')
      ]);
      return { items, unread_count: Number(unread.rows[0].count) };
    },

    async eventJournalStats() {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE read_at IS NULL)::int AS unread,
          COUNT(*) FILTER (WHERE severity = 'error')::int AS errors,
          COUNT(*) FILTER (WHERE severity = 'warning')::int AS warnings
        FROM activity_events
      `);
      return rows[0];
    },

    async markNotificationsRead() {
      const { rowCount } = await pool.query('UPDATE activity_events SET read_at = $1 WHERE read_at IS NULL', [isoNow()]);
      return rowCount;
    },

    async pruneEvents({ retentionDays, maxEntries }) {
      const days = Math.max(1, Number.parseInt(retentionDays, 10) || 30);
      const maximum = Math.max(100, Number.parseInt(maxEntries, 10) || 5000);
      const expired = await pool.query(
        `DELETE FROM activity_events WHERE created_at < NOW() - ($1::text || ' days')::interval`,
        [days]
      );
      const overflow = await pool.query(
        `DELETE FROM activity_events
         WHERE id IN (
           SELECT id FROM activity_events ORDER BY created_at DESC, id DESC OFFSET $1
         )`,
        [maximum]
      );
      return Number(expired.rowCount || 0) + Number(overflow.rowCount || 0);
    },

    async clearEvents() {
      const { rowCount } = await pool.query('DELETE FROM activity_events');
      return rowCount;
    }
  });
}
