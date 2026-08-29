function catalogNeedles(kind, catalogId) {
  const id = Number(catalogId);
  const snake = kind === 'product' ? 'product_id' : 'packaging_id';
  const camel = kind === 'product' ? 'productId' : 'packagingId';
  return [
    JSON.stringify([{ [snake]: id }]),
    JSON.stringify([{ [camel]: id }]),
    JSON.stringify([{ [snake]: String(id) }]),
    JSON.stringify([{ [camel]: String(id) }])
  ];
}

export function createCatalogUsageRepository(pool) {
  return Object.freeze({
    async screensUsingCatalog(kind, catalogId) {
      if (kind !== 'product' && kind !== 'packaging') throw new TypeError('Неизвестный тип каталога.');
      const [first, second, third, fourth] = catalogNeedles(kind, catalogId);
      const { rows } = await pool.query(
        `SELECT d.screen_id, s.name AS screen_name, l.name AS location_name
         FROM screen_drafts d
         JOIN screens s ON s.id = d.screen_id
         JOIN locations l ON l.id = s.location_id
         WHERE d.rows_json::jsonb @> $1::jsonb
            OR d.rows_json::jsonb @> $2::jsonb
            OR d.rows_json::jsonb @> $3::jsonb
            OR d.rows_json::jsonb @> $4::jsonb`,
        [first, second, third, fourth]
      );
      return rows.map((row) => ({
        screen_id: Number(row.screen_id),
        screen_name: row.screen_name,
        location_name: row.location_name
      }));
    }
  });
}
