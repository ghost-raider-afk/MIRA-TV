export async function migrateCatalogProductAddress(queryable) {
  await queryable.query("ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';");
}
