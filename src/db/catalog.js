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

function catalogClassRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    parent_id: row.parent_id === null ? null : Number(row.parent_id),
    sort_order: Number(row.sort_order) || 0,
    field_schema: Array.isArray(row.field_schema) ? row.field_schema : []
  };
}

function catalogItemRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    class_id: Number(row.class_id),
    legacy_source_id: row.legacy_source_id === null || row.legacy_source_id === undefined ? null : Number(row.legacy_source_id),
    attributes: row.attributes && typeof row.attributes === 'object' && !Array.isArray(row.attributes) ? row.attributes : {},
    base_price: String(row.base_price ?? '0'),
    base_quantity: String(row.base_quantity ?? '1')
  };
}

function mergeClassSchema(rows) {
  const fields = new Map();
  for (const row of rows) {
    for (const field of Array.isArray(row.field_schema) ? row.field_schema : []) {
      if (!field || typeof field !== 'object' || Array.isArray(field) || typeof field.key !== 'string') continue;
      fields.set(field.key, field);
    }
  }
  return [...fields.values()];
}

const CATALOG_ITEM_SELECT = `
  SELECT i.*, c.code AS class_code, c.name AS class_name,
         c.pricing_model, c.default_unit, c.parent_id AS class_parent_id
  FROM catalog_items i
  JOIN catalog_classes c ON c.id = i.class_id
`;

export function createCatalogRepository(pool) {
  async function getProduct(id) {
    const { rows } = await pool.query('SELECT * FROM catalog_products WHERE id = $1', [id]);
    return normaliseRow(rows[0]);
  }
  async function getPackaging(id) {
    const { rows } = await pool.query('SELECT * FROM catalog_packaging WHERE id = $1', [id]);
    return normaliseRow(rows[0]);
  }
  async function getCatalogItem(id) {
    const { rows } = await pool.query(`${CATALOG_ITEM_SELECT} WHERE i.id = $1`, [id]);
    return catalogItemRow(rows[0]);
  }

  return Object.freeze({
    async listCatalogClasses() {
      const { rows } = await pool.query(`
        SELECT c.*, p.code AS parent_code, p.name AS parent_name
        FROM catalog_classes c
        LEFT JOIN catalog_classes p ON p.id = c.parent_id
        ORDER BY c.sort_order, c.name
      `);
      return rows.map(catalogClassRow);
    },
    async getCatalogClass(id) {
      const { rows } = await pool.query('SELECT * FROM catalog_classes WHERE id = $1', [id]);
      return catalogClassRow(rows[0]);
    },
    async getCatalogClassByCode(code) {
      const { rows } = await pool.query('SELECT * FROM catalog_classes WHERE code = $1', [code]);
      return catalogClassRow(rows[0]);
    },
    async getCatalogClassWithSchema(id) {
      const { rows } = await pool.query(`
        WITH RECURSIVE lineage AS (
          SELECT c.*, 0 AS depth
          FROM catalog_classes c
          WHERE c.id = $1
          UNION ALL
          SELECT parent.*, lineage.depth + 1
          FROM catalog_classes parent
          JOIN lineage ON lineage.parent_id = parent.id
        )
        SELECT * FROM lineage ORDER BY depth DESC
      `, [id]);
      if (!rows.length) return null;
      const ordered = rows.map(catalogClassRow);
      const leaf = ordered[ordered.length - 1];
      return {
        ...leaf,
        resolved_field_schema: mergeClassSchema(ordered),
        lineage: ordered.map((item) => ({ id: item.id, code: item.code, name: item.name }))
      };
    },
    async listCatalogItems() {
      const { rows } = await pool.query(`${CATALOG_ITEM_SELECT} ORDER BY c.sort_order, i.name`);
      return rows.map(catalogItemRow);
    },
    async listCatalogItemsByIds(ids) {
      const normalized = normaliseIds(ids);
      if (!normalized.length) return [];
      const placeholders = normalized.map((_id, index) => `$${index + 1}`).join(', ');
      const { rows } = await pool.query(`${CATALOG_ITEM_SELECT} WHERE i.id IN (${placeholders}) ORDER BY c.sort_order, i.name`, normalized);
      return rows.map(catalogItemRow);
    },
    getCatalogItem,
    async createCatalogItem(item) {
      const now = isoNow();
      const { rows } = await pool.query(`
        INSERT INTO catalog_items (
          class_id, name, description, base_price, base_quantity, unit, attributes, active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $9)
        RETURNING id
      `, [item.class_id, item.name, item.description, item.base_price, item.base_quantity, item.unit, JSON.stringify(item.attributes), item.active, now]);
      return getCatalogItem(rows[0].id);
    },
    async updateCatalogItem(id, item) {
      const { rowCount } = await pool.query(`
        UPDATE catalog_items SET
          class_id = $1, name = $2, description = $3, base_price = $4, base_quantity = $5,
          unit = $6, attributes = $7::jsonb, active = $8, updated_at = $9
        WHERE id = $10
      `, [item.class_id, item.name, item.description, item.base_price, item.base_quantity, item.unit, JSON.stringify(item.attributes), item.active, isoNow(), id]);
      return rowCount ? getCatalogItem(id) : null;
    },
    async deleteCatalogItem(id) {
      const { rowCount } = await pool.query('DELETE FROM catalog_items WHERE id = $1', [id]);
      return rowCount > 0;
    },

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
