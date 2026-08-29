export function createOverviewRepository(pool) {
  return Object.freeze({
    async overview() {
      const { rows } = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM locations) AS locations,
          (SELECT COUNT(*)::int FROM screens) AS screens,
          (SELECT COUNT(*)::int FROM screens WHERE status = 'published') AS published
      `);
      return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)]));
    }
  });
}
