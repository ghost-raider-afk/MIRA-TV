import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, publicRoot), 'utf8');

test('SPA navigation mounts and removes page-owned drawer surfaces with each route', async () => {
  const [router, locations, catalog] = await Promise.all([
    read('js/core/router.js'),
    read('locations.html'),
    read('catalog.html')
  ]);

  assert.match(locations, /id="location-drawer"[^>]*data-route-surface/);
  assert.match(catalog, /id="catalog-item-drawer"[^>]*data-route-surface/);
  assert.match(router, /const ROUTE_SURFACE_SELECTOR = '\[data-route-surface\]'/);
  assert.match(router, /surfaceHtml: routeSurfaceHtml\(parsed\)/);
  assert.match(router, /document\.querySelectorAll\(ROUTE_SURFACE_SELECTOR\).*surface\.remove\(\)/);
  assert.match(router, /document\.body\.append\(template\.content\)/);
  assert.match(router, /replaceRouteSurfaces\(view\.surfaceHtml\)/);
});
