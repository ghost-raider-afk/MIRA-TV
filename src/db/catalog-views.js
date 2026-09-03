import { isoNow } from './helpers.js';

function normaliseIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

function viewRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    item_ids: Array.isArray(row.item_ids) ? row.item_ids.map(Number).filter(Number.isSafeInteger) : []
  };
}

async function replaceItems(pool, viewId, itemIds) {
  const ids = normaliseIds(itemIds);
  await pool.query('DELETE FROM catalog_view_items WHERE view_id = $1', [viewId]);
  if (!ids.length) return;
  const values = [];
  const tuples = ids.map((itemId, index) => {
    values.push(viewId, itemId, index);
    const offset = index * 3;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
  });
  await pool.query(
    `INSERT INTO catalog_view_items (view_id, item_id, sort_order) VALUES ${tuples.join(', ')}`,
    values
  );
}

const VIEW_SELECT = `
  SELECT v.*,
         COALESCE(
           (SELECT json_agg(vi.item_id ORDER BY vi.sort_order, vi.item_id)
              FROM catalog_view_items vi
             WHERE vi.view_id = v.id),
           '[]'::json
         ) AS item_ids
    FROM catalog_views v
`;

export function createCatalogViewsRepository(pool) {
  async function getCatalogView(id) {
    const { rows } = await pool.query(`${VIEW_SELECT} WHERE v.id = $1`, [id]);
    return viewRow(rows[0]);
  }

  return Object.freeze({
    async listCatalogViews({ activeOnly = false } = {}) {
      const where = activeOnly ? 'WHERE v.active = TRUE' : '';
      const { rows } = await pool.query(`${VIEW_SELECT} ${where} ORDER BY v.name, v.id`);
      return rows.map(viewRow);
    },

    async listCatalogViewsByIds(ids) {
      const normalized = normaliseIds(ids);
      if (!normalized.length) return [];
      const { rows } = await pool.query(
        `${VIEW_SELECT} WHERE v.id = ANY($1::bigint[]) ORDER BY v.name, v.id`,
        [normalized]
      );
      return rows.map(viewRow);
    },

    getCatalogView,

    async createCatalogView(view) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO catalog_views (name, description, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)
         RETURNING id`,
        [view.name, view.description, view.active !== false, now]
      );
      const id = Number(rows[0].id);
      await replaceItems(pool, id, view.item_ids);
      return getCatalogView(id);
    },

    async updateCatalogView(id, view) {
      const { rowCount } = await pool.query(
        `UPDATE catalog_views
            SET name = $1, description = $2, active = $3, updated_at = $4
          WHERE id = $5`,
        [view.name, view.description, view.active !== false, isoNow(), id]
      );
      if (!rowCount) return null;
      await replaceItems(pool, id, view.item_ids);
      return getCatalogView(id);
    },

    async deleteCatalogView(id) {
      const { rowCount } = await pool.query('DELETE FROM catalog_views WHERE id = $1', [id]);
      return rowCount > 0;
    }
  });
}
