function canonicalFilename(number) {
  return `monitor-${number}.jpg`;
}

export async function migrateScreenNumbering(pool) {
  const { rows } = await pool.query(
    `SELECT id, location_id, location_number
     FROM screens ORDER BY location_id, id`
  );

  const nextByLocation = new Map();
  for (const row of rows) {
    const locationId = Number(row.location_id);
    const current = Number(row.location_number);
    if (Number.isSafeInteger(current) && current > 0) {
      nextByLocation.set(locationId, Math.max(nextByLocation.get(locationId) || 0, current));
    }
  }

  for (const row of rows) {
    const id = Number(row.id);
    const locationId = Number(row.location_id);
    let number = Number(row.location_number);
    if (!Number.isSafeInteger(number) || number < 1) {
      number = (nextByLocation.get(locationId) || 0) + 1;
      nextByLocation.set(locationId, number);
    }

    await pool.query(
      'UPDATE screens SET location_number = $1, delivery_filename = $2 WHERE id = $3',
      [number, canonicalFilename(number), id]
    );
  }

  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS screens_location_number_unique ON screens(location_id, location_number)');
  await pool.query('ALTER TABLE screens ALTER COLUMN location_number SET NOT NULL');
}
