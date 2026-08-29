import { isoNow, normaliseRow } from './helpers.js';

function normaliseIds(ids) {
  return [...new Set((ids || []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

async function listByIds(pool, table, ids) {
  const normalized = normaliseIds(ids);
  if (!normalized.length) return [];
  const placeholders = normalized.map((_id, index) => `$${index + 1}`).join(', ');
  const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id IN (${placeholders}) ORDER BY name`, normalized);
  return rows.map(normaliseRow);
}

export function createCatalogRepository(pool) {
  async function getProduct(id) {
    const { rows } = await pool.query('SELECT * FROM catalog_products WHERE id = $1', [id]);
    return normaliseRow(rows[0]);
  }
  async function getPackaging(id) {
    const { rows } = await pool.query('SELECT * FROM catalog_packaging WHERE id = $1', [id]);
    return normaliseRow(rows[0]);
  }

  return Object.freeze({
    async listProducts() {
      const { rows } = await pool.query('SELECT * FROM catalog_products ORDER BY name');
      return rows.map(normaliseRow);
    },
    listProductsByIds(ids) {
      return listByIds(pool, 'catalog_products', ids);
    },
    getProduct,
    async createProduct(product) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO catalog_products (name, producer, characteristics, strength, price_primary, price_secondary,
         alcoholic, beverage_color, filtration, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING id`,
        [product.name, product.producer, product.characteristics, product.strength, product.price_primary,
          product.price_secondary, product.alcoholic, product.beverage_color, product.filtration, product.active, now]
      );
      return getProduct(rows[0].id);
    },
    async updateProduct(id, product) {
      const { rowCount } = await pool.query(
        `UPDATE catalog_products SET name = $1, producer = $2, characteristics = $3, strength = $4,
         price_primary = $5, price_secondary = $6, alcoholic = $7, beverage_color = $8,
         filtration = $9, active = $10, updated_at = $11 WHERE id = $12`,
        [product.name, product.producer, product.characteristics, product.strength, product.price_primary,
          product.price_secondary, product.alcoholic, product.beverage_color, product.filtration, product.active, isoNow(), id]
      );
      return rowCount ? getProduct(id) : null;
    },
    async deleteProduct(id) {
      const { rowCount } = await pool.query('DELETE FROM catalog_products WHERE id = $1', [id]);
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
