function normaliseCatalogIds(catalogIds) {
  return [...new Set((catalogIds || []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

function catalogFields(kind) {
  if (kind === 'product') return ['product_id', 'productId'];
  if (kind === 'packaging') return ['packaging_id', 'packagingId'];
  throw new TypeError('Неизвестный тип каталога.');
}

export function createCatalogUsageRepository(pool) {
  async function screensUsingCatalogIds(kind, catalogIds) {
    const ids = normaliseCatalogIds(catalogIds);
    if (!ids.length) return [];
    const [snake, camel] = catalogFields(kind);
    const { rows } = await pool.query(
      `SELECT DISTINCT d.screen_id, s.name AS screen_name, l.name AS location_name
         FROM screen_drafts d
         JOIN screens s ON s.id = d.screen_id
         JOIN locations l ON l.id = s.location_id
         WHERE EXISTS (
           SELECT 1
             FROM jsonb_array_elements(d.rows_json::jsonb) AS item
            WHERE COALESCE(item->>$2, item->>$3, '') ~ '^[0-9]+$'
              AND (COALESCE(item->>$2, item->>$3))::bigint = ANY($1::bigint[])
         )`,
      [ids, snake, camel]
    );
    return rows.map((row) => ({
      screen_id: Number(row.screen_id),
      screen_name: row.screen_name,
      location_name: row.location_name
    }));
  }

  return Object.freeze({
    screensUsingCatalogIds,
    async screensUsingCatalog(kind, catalogId) {
      return screensUsingCatalogIds(kind, [catalogId]);
    }
  });
}
