export function createOverviewRepository(pool) {
  return Object.freeze({
    async overview() {
      const { rows } = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM locations WHERE deleted_at IS NULL) AS locations,
          (SELECT COUNT(*)::int FROM screens s JOIN locations l ON l.id=s.location_id
             WHERE s.deleted_at IS NULL AND l.deleted_at IS NULL) AS screens,
          (SELECT COUNT(*)::int FROM screens s JOIN locations l ON l.id=s.location_id
             WHERE s.status = 'published' AND s.deleted_at IS NULL AND l.deleted_at IS NULL) AS published
      `);
      return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)]));
    }
  });
}
