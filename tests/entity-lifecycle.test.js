import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalogRepository } from '../src/db/catalog.js';
import { createScreensRepository } from '../src/db/screens.js';
import { createLocationsRepository } from '../src/db/locations.js';
import { createLifecycleRepository } from '../src/db/lifecycle.js';
import { createDevicesRepository } from '../src/db/devices.js';

function spyPool(rows = [{ id: 1, name: 'Test' }]) {
  const statements = [];
  const pool = {
    statements,
    async query(sql, params = []) {
      statements.push({ sql, params });
      return { rowCount: 1, rows };
    }
  };
  return pool;
}

test('deleting product, TV and location uses reversible updates, never cascade DELETE', async () => {
  const pool = spyPool();
  assert.equal(await createCatalogRepository(pool).deleteProduct(42, 'admin'), true);
  assert.equal(await createScreensRepository(pool).deleteScreen(7, 'admin'), true);
  assert.equal(await createLocationsRepository(pool).deleteLocation(3, 'admin'), true);
  assert.equal(pool.statements.length, 3);
  for (const statement of pool.statements) {
    assert.match(statement.sql, /^UPDATE /);
    assert.match(statement.sql, /SET deleted_at=NOW\(\), deleted_by=\$2/);
    assert.match(statement.sql, /WHERE id=\$1 AND deleted_at IS NULL/);
    assert.deepEqual(statement.params[1], 'admin');
  }
});

test('trash restore keeps same database identity, and TV restore requires active parent', async () => {
  const pool = spyPool([{ id: 7, name: 'TV 1' }]);
  const store = createLifecycleRepository(pool);
  const restored = await store.restoreTrash('screen', 7);
  assert.equal(restored.id, 7);
  assert.match(pool.statements[0].sql, /FROM locations l/);
  assert.match(pool.statements[0].sql, /l\.deleted_at IS NULL/);
  assert.match(pool.statements[0].sql, /deleted_at=NULL/);
  await store.restoreTrash('product', 8);
  await store.restoreTrash('location', 9);
  assert.match(pool.statements[1].sql, /^UPDATE catalog_products /);
  assert.match(pool.statements[2].sql, /^UPDATE locations /);
  assert.equal(await store.restoreTrash('unknown', 1), null);
});

test('list routes hide deleted entities while keeping their original database rows', async () => {
  const pool = spyPool([]);
  await createCatalogRepository(pool).listProducts();
  await createLocationsRepository(pool).listLocations();
  await createScreensRepository(pool).listScreens();
  assert.match(pool.statements[0].sql, /catalog_products WHERE deleted_at IS NULL/);
  assert.match(pool.statements[1].sql, /locations WHERE deleted_at IS NULL/);
  assert.match(pool.statements[2].sql, /s\.deleted_at IS NULL AND l\.deleted_at IS NULL/);
});

test('Player sessions exclude recycled TV and points without revoking persistent device keys', async () => {
  const pool = spyPool([]);
  await createDevicesRepository(pool).getActiveDeviceSessionByHash('hash');
  const sql = pool.statements[0].sql;
  assert.match(sql, /ds\.revoked_at IS NULL/);
  assert.match(sql, /s\.deleted_at IS NULL/);
  assert.match(sql, /l\.deleted_at IS NULL/);
  const api = await readFile(new URL('../src/api/screens/routes.js', import.meta.url), 'utf8');
  assert.doesNotMatch(api.slice(api.indexOf("router.delete('/screens/:id'")), /deleteSceneAsset|deleteScreenBackground/);
});

test('archive preserves previous availability and product history is cursor-paginated', async () => {
  const pool = spyPool([{ id: 19, product_id: 2, action: 'updated' }]);
  const repo = createCatalogRepository(pool);
  assert.equal(await repo.archiveProduct(2, 'admin'), true);
  assert.match(pool.statements[0].sql, /active_before_archive=active, active=FALSE/);
  assert.equal(await repo.unarchiveProduct(2), true);
  assert.match(pool.statements[1].sql, /active=COALESCE\(active_before_archive, TRUE\)/);
  await repo.listProductHistory(2, 19, 100);
  assert.match(pool.statements[2].sql, /product_id=\$1 AND \(\$2::bigint IS NULL OR id < \$2\)/);
  assert.deepEqual(pool.statements[2].params, [2, 19, 101]);
});
