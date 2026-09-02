import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { scenePayloadInput } from '../src/contracts/scene.js';
import { catalogTableColumns, normaliseTableConfig } from '../src/web/admin-ui/public/js/scenes/catalog-table.js';
import { createElement, createScene } from '../src/web/admin-ui/public/js/scenes/model.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const menuPresets = ['menu-board', 'bistro', 'cafe', 'chalkboard'];

test('new menu table presets survive client normalisation and the server Scene contract', () => {
  for (const preset of menuPresets) {
    assert.equal(normaliseTableConfig({ appearance: { preset } }).appearance.preset, preset);

    const scene = createScene();
    const table = createElement('table', scene, scene.slides[0]);
    table.table.appearance.preset = preset;
    scene.slides[0].elements.push(table);
    const persisted = scenePayloadInput(scene);
    assert.equal(persisted.slides[0].elements[0].table.appearance.preset, preset);
  }
});

test('menu table presets keep descriptions with product names and prices in aligned columns', () => {
  for (const preset of menuPresets) {
    const columns = catalogTableColumns({
      price_layout: 'single',
      show_metadata: true,
      appearance: { preset }
    });
    assert.deepEqual(columns.map((column) => column.key), ['product', 'price']);
  }
});

test('unsupported table presets still fail safely on both trust boundaries', () => {
  assert.equal(normaliseTableConfig({ appearance: { preset: 'unknown' } }).appearance.preset, 'clean');
  const scene = createScene();
  const table = createElement('table', scene, scene.slides[0]);
  table.table.appearance.preset = 'unknown';
  scene.slides[0].elements.push(table);
  assert.throws(() => scenePayloadInput(scene), /table\.appearance\.preset.*неподдерживаемое значение/);
});

test('Inspector, Ribbon and shared renderer stylesheet expose all menu presets', async () => {
  const [html, ribbon, renderer, tableCss, indexCss, player, worker] = await Promise.all([
    read('src/web/admin-ui/public/scene-editor.html'),
    read('src/web/admin-ui/public/js/scenes/ribbon.js'),
    read('src/web/admin-ui/public/js/scene-runtime/renderer.js'),
    read('src/web/admin-ui/public/css/scene-table-main.css'),
    read('src/web/admin-ui/public/css/index.css'),
    read('src/web/admin-ui/public/player.html'),
    read('src/web/admin-ui/public/player-sw.js')
  ]);

  for (const preset of menuPresets) {
    assert.match(html, new RegExp(`<option value="${preset}">`));
    assert.match(ribbon, new RegExp(`\\['${preset}',`));
    assert.match(tableCss, new RegExp(`data-preset="${preset}"`));
  }
  assert.match(renderer, /table\.dataset\.priceLayout = config\.price_layout/);
  assert.match(renderer, /scene-catalog-product-name/);
  assert.match(renderer, /scene-catalog-product-meta/);
  assert.match(renderer, /scene-catalog-product-leader/);
  assert.match(tableCss, /data-preset="clean"\] \.scene-catalog-product-name/);
  assert.match(tableCss, /data-preset="clean"\] \.scene-catalog-product-meta/);
  assert.match(indexCss, /scene-table-main\.css/);
  assert.match(player, /\/css\/scene-table-main\.css/);
  assert.match(worker, /mira-tv-player-shell-v16-scene10/);
  assert.match(worker, /'\/css\/scene-table-main\.css'/);
});
