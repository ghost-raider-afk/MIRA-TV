import { isoNow } from './helpers.js';

const REQUEST_STATUSES = new Set(['pending', 'approved', 'rejected', 'conflict']);

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '{}')); }
  catch { return {}; }
}

function normaliseRequest(row) {
  if (!row) return null;
  return {
    ...row,
    id:Number(row.id),
    entity_id:row.entity_id === null || row.entity_id === undefined ? null : Number(row.entity_id),
    before:parseJson(row.before_json),
    proposed:parseJson(row.proposed_json)
  };
}

function safeLimit(value, fallback = 200) {
  return Math.max(1, Math.min(Number.parseInt(value, 10) || fallback, 500));
}

export function createCatalogChangeRequestsRepository(pool) {
  async function getCatalogChangeRequest(id, { forUpdate = false } = {}) {
    const { rows } = await pool.query(
      `SELECT * FROM catalog_change_requests WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [id]
    );
    return normaliseRequest(rows[0]);
  }

  return Object.freeze({
    async createCatalogChangeRequest({ requesterUsername, entityType, entityId, operation = 'update', before, proposed, baseUpdatedAt }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO catalog_change_requests (
          requester_username, entity_type, entity_id, operation, before_json, proposed_json,
          base_updated_at, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $8)
        RETURNING *`,
        [
          requesterUsername,
          entityType,
          entityId === null || entityId === undefined ? null : Number(entityId),
          operation,
          JSON.stringify(before || {}),
          JSON.stringify(proposed || {}),
          baseUpdatedAt || null,
          now
        ]
      );
      return normaliseRequest(rows[0]);
    },

    async listCatalogChangeRequests({ requesterUsername = '', status = '', limit = 200 } = {}) {
      const values = [];
      const where = [];
      if (requesterUsername) {
        values.push(String(requesterUsername));
        where.push(`requester_username = $${values.length}`);
      }
      if (status && status !== 'all') {
        if (!REQUEST_STATUSES.has(status)) throw new TypeError('Unsupported catalog change request status.');
        values.push(status);
        where.push(`status = $${values.length}`);
      }
      values.push(safeLimit(limit));
      const { rows } = await pool.query(
        `SELECT * FROM catalog_change_requests
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY created_at DESC, id DESC
         LIMIT $${values.length}`,
        values
      );
      return rows.map(normaliseRequest);
    },

    getCatalogChangeRequest,

    getCatalogChangeRequestForUpdate(id) {
      return getCatalogChangeRequest(id, { forUpdate:true });
    },

    async resolveCatalogChangeRequest(id, { status, reviewerUsername, reviewComment = '' }) {
      if (!REQUEST_STATUSES.has(status) || status === 'pending') throw new TypeError('Unsupported catalog change request resolution.');
      const now = isoNow();
      const { rows } = await pool.query(
        `UPDATE catalog_change_requests
         SET status = $1, reviewer_username = $2, review_comment = $3, reviewed_at = $4, updated_at = $4
         WHERE id = $5
         RETURNING *`,
        [status, String(reviewerUsername || ''), String(reviewComment || ''), now, id]
      );
      return normaliseRequest(rows[0]);
    }
  });
}
