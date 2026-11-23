import { isoNow, normaliseRow } from './helpers.js';

function normaliseIds(ids) {
  return [...new Set((ids || []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

async function listByIds(pool, table, ids) {
  const normalized = normaliseIds(ids);
  if (!normalized.length) return [];
  const placeholders = normalized.map((_id, index) => `$${index + 1}`).join(', ');
  const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id IN (${placeholders})${table === 'catalog_products' ? ' AND deleted_at IS NULL' : ''} ORDER BY name`, normalized);
  return rows.map(normaliseRow);
}

export function createCatalogRepository(pool) {
  async function getProduct(id, { forUpdate = false } = {}) {
    const { rows } = await pool.query(`SELECT * FROM catalog_products WHERE id = $1 AND deleted_at IS NULL${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
    return normaliseRow(rows[0]);
  }
  async function getPackaging(id, { forUpdate = false } = {}) {
    const { rows } = await pool.query(`SELECT * FROM catalog_packaging WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
    return normaliseRow(rows[0]);
  }

  return Object.freeze({
    async setProductHistoryActor(username) {
      // Called only inside store.transaction: SET LOCAL never leaks across pooled sessions.
      await pool.query("SELECT set_config('mira.actor_username', $1, true)", [String(username || 'система')]);
    },
    async listProductHistory(id, beforeId = null, limit = 100) {
      const size = Math.min(Math.max(Number(limit) || 100, 1), 100);
      const { rows } = await pool.query(
        `SELECT id, product_id, action, actor_username, changes, occurred_at
           FROM catalog_product_history
          WHERE product_id=$1 AND ($2::bigint IS NULL OR id < $2)
          ORDER BY id DESC LIMIT $3`,
        [id, beforeId, size + 1]
      );
      const items = rows.slice(0, size).map(normaliseRow);
      return { items, next_cursor: rows.length > size ? items.at(-1).id : null };
    },
    async listProducts() {
      const { rows } = await pool.query('SELECT * FROM catalog_products WHERE deleted_at IS NULL ORDER BY name');
      return rows.map(normaliseRow);
    },
    listProductsByIds(ids) {
      return listByIds(pool, 'catalog_products', ids);
    },
    getProduct,
    getProductForUpdate(id) { return getProduct(id, { forUpdate:true }); },
    async createProduct(product) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO catalog_products (name, producer, address, characteristics, strength, price_primary, price_secondary,
         alcoholic, beverage_color, filtration, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12) RETURNING id`,
        [product.name, product.producer, product.address, product.characteristics, product.strength, product.price_primary,
          product.price_secondary, product.alcoholic, product.beverage_color, product.filtration, product.active, now]
      );
      return getProduct(rows[0].id);
    },
    async updateProduct(id, product) {
      const { rowCount } = await pool.query(
        `UPDATE catalog_products SET name = $1, producer = $2, address = $3, characteristics = $4, strength = $5,
         price_primary = $6, price_secondary = $7, alcoholic = $8, beverage_color = $9,
         filtration = $10, active = CASE WHEN archived_at IS NULL THEN $11 ELSE FALSE END, updated_at = $12 WHERE id = $13 AND deleted_at IS NULL`,
        [product.name, product.producer, product.address, product.characteristics, product.strength, product.price_primary,
          product.price_secondary, product.alcoholic, product.beverage_color, product.filtration, product.active, isoNow(), id]
      );
      return rowCount ? getProduct(id) : null;
    },
    async archiveProduct(id, actor) {
      const { rowCount } = await pool.query(
        `UPDATE catalog_products
           SET archived_at=NOW(), archived_by=$2, active_before_archive=active, active=FALSE, updated_at=NOW()
         WHERE id=$1 AND archived_at IS NULL AND deleted_at IS NULL`, [id, actor]
      );
      return rowCount > 0;
    },
    async unarchiveProduct(id) {
      const { rowCount } = await pool.query(
        `UPDATE catalog_products
           SET archived_at=NULL, archived_by=NULL, active=COALESCE(active_before_archive, TRUE),
               active_before_archive=NULL, updated_at=NOW()
         WHERE id=$1 AND archived_at IS NOT NULL AND deleted_at IS NULL`, [id]
      );
      return rowCount > 0;
    },
    async deleteProduct(id, actor = 'система') {
      const { rowCount } = await pool.query(
        `UPDATE catalog_products SET deleted_at=NOW(), deleted_by=$2, updated_at=NOW()
         WHERE id=$1 AND deleted_at IS NULL`, [id, actor]
      );
      return rowCount > 0;
    },

    async listPackaging() {
      const { rows } = await pool.query('SELECT * FROM catalog_packaging ORDER BY name');
      return rows.map(normaliseRow);
    },
    listPackagingByIds(ids) {
      return listByIds(pool, 'catalog_packaging', ids);
    },
    getPackaging,
    getPackagingForUpdate(id) { return getPackaging(id, { forUpdate:true }); },
    async createPackaging(packaging) {
      const now = isoNow();
      const { rows } = await pool.query(
        'INSERT INTO catalog_packaging (name, unit_price, active, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING id',
        [packaging.name, packaging.unit_price, packaging.active, now]
      );
      return getPackaging(rows[0].id);
    },
    async updatePackaging(id, packaging) {
      const { rowCount } = await pool.query(
        'UPDATE catalog_packaging SET name = $1, unit_price = $2, active = $3, updated_at = $4 WHERE id = $5',
        [packaging.name, packaging.unit_price, packaging.active, isoNow(), id]
      );
      return rowCount ? getPackaging(id) : null;
    },
    async deletePackaging(id) {
      const { rowCount } = await pool.query('DELETE FROM catalog_packaging WHERE id = $1', [id]);
      return rowCount > 0;
    }
  });
}
