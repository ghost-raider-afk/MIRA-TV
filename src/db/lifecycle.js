import { normaliseRow } from './helpers.js';

// One administrative view over three canonical tables. No duplicate entity snapshots.
export function createLifecycleRepository(pool) {
  return Object.freeze({
    async listTrash() {
      const [products, screens, locations] = await Promise.all([
        pool.query(`SELECT id, name, deleted_at, deleted_by FROM catalog_products WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC`),
        pool.query(`SELECT s.id, s.name, s.deleted_at, s.deleted_by, l.name AS location_name, l.deleted_at AS location_deleted_at
                      FROM screens s JOIN locations l ON l.id = s.location_id
                     WHERE s.deleted_at IS NOT NULL ORDER BY s.deleted_at DESC, s.id DESC`),
        pool.query(`SELECT l.id, l.name, l.deleted_at, l.deleted_by,
                           (SELECT COUNT(*)::int FROM screens s WHERE s.location_id=l.id) AS screen_count
                      FROM locations l WHERE l.deleted_at IS NOT NULL ORDER BY l.deleted_at DESC, l.id DESC`)
      ]);
      return [
        ...products.rows.map((row) => ({ ...normaliseRow(row), type: 'product' })),
        ...screens.rows.map((row) => ({ ...normaliseRow(row), type: 'screen' })),
        ...locations.rows.map((row) => ({ ...normaliseRow(row), type: 'location' }))
      ].sort((a, b) => Date.parse(b.deleted_at) - Date.parse(a.deleted_at));
    },
    async restoreTrash(type, id) {
      const queries = {
        product: `UPDATE catalog_products SET deleted_at=NULL, deleted_by=NULL, updated_at=NOW()
                    WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id,name`,
        screen: `UPDATE screens s SET deleted_at=NULL, deleted_by=NULL, updated_at=NOW()
                   FROM locations l WHERE s.id=$1 AND s.location_id=l.id
                     AND l.deleted_at IS NULL AND s.deleted_at IS NOT NULL RETURNING s.id,s.name`,
        location: `UPDATE locations SET deleted_at=NULL, deleted_by=NULL, updated_at=NOW()
                     WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id,name`
      };
      if (!Object.hasOwn(queries, type)) return null;
      const { rows } = await pool.query(queries[type], [id]);
      return normaliseRow(rows[0]);
    }
  });
}
