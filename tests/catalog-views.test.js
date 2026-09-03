import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { catalogViewInput } from '../src/contracts/catalog-view.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('catalog view contract preserves manual order and removes duplicate ids', () => {
  const view = catalogViewInput({ name: 'Бар', item_ids: [8, 3, 8, 12], active: true });
  assert.equal(view.name, 'Бар');
  assert.deepEqual(view.item_ids, [8, 3, 12]);
  assert.throws(() => catalogViewInput({ name: 'Ошибка', item_ids: [0] }), /некорректный идентификатор/);
});

test('catalog view storage uses one ordered relation contract', async () => {
  const [migration, repository] = await Promise.all([
    read('src/db/migrations/catalog-views.js'),
    read('src/db/catalog-views.js')
  ]);
  assert.match(migration, /catalog_view_items/);
  assert.match(migration, /sort_order INTEGER/);
  assert.match(repository, /ORDER BY vi\.sort_order/);
  assert.match(repository, /listCatalogViewsByIds/);
  assert.doesNotMatch(repository, /\bposition\b/);
});

test('catalog view API is mounted and scene menu composer is wired into the editor', async () => {
  const [server, config, application, composer] = await Promise.all([
    read('src/server.js'),
    read('src/web/admin-ui/public/js/core/config.js'),
    read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/js/scenes/menu-composer.js')
  ]);
  assert.match(server, /createCatalogViewsRouter/);
  assert.match(server, /\/api\/catalog\/views/);
  assert.match(config, /catalogViews:\s*'\/api\/catalog\/views'/);
  assert.match(application, /initialiseSceneMenuComposer/);
  assert.match(composer, /Состав меню/);
  assert.match(composer, /item_ids/);
});

test('every production preset artwork is shipped with the application', async () => {
  const names = ['mira-minimal','taproom','modern-bistro','coffee-house','chalk-board','night-neon','premium-black','fresh-market'];
  for (const name of names) {
    const svg = await read(`src/web/admin-ui/public/assets/presets/${name}.svg`);
    assert.match(svg, /<svg[\s>]/);
    assert.ok(svg.length > 250);
  }
});
