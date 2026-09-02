import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normaliseTableConfig } from '../src/web/admin-ui/public/js/scenes/catalog-table.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scene Inspector is split into contextual authoring tabs', async () => {
  const [html, editor] = await Promise.all([
    read('src/web/admin-ui/public/scene-editor.html'),
    read('src/web/admin-ui/public/js/scenes/editor.js')
  ]);

  for (const tab of ['object', 'format', 'data', 'animation']) {
    assert.match(html, new RegExp(`data-inspector-tab="${tab}"`));
    assert.match(html, new RegExp(`data-inspector-panel="${tab}"`));
  }
  assert.match(editor, /function inspectorTabsForElement\(element\)/);
  assert.match(editor, /DATA_ELEMENT_TYPES/);
  assert.match(editor, /renderInspectorTabs\(element\)/);
  assert.match(html, /id="element-radius"/);
  assert.match(html, /id="element-blur"/);
});

test('table appearance has safe defaults and configurable presentation', () => {
  const defaults = normaliseTableConfig({}).appearance;
  assert.deepEqual(defaults, {
    preset: 'clean',
    density: 'comfortable',
    header_style: 'subtle',
    price_style: 'accent',
    accent_color: '#f4c915',
    show_title: true,
    row_dividers: true,
    zebra: false
  });

  const configured = normaliseTableConfig({
    appearance: {
      preset: 'glass',
      density: 'compact',
      header_style: 'accent',
      price_style: 'bold',
      accent_color: '#ff5500',
      show_title: false,
      row_dividers: false,
      zebra: true
    }
  }).appearance;
  assert.equal(configured.preset, 'glass');
  assert.equal(configured.density, 'compact');
  assert.equal(configured.header_style, 'accent');
  assert.equal(configured.price_style, 'bold');
  assert.equal(configured.accent_color, '#ff5500');
  assert.equal(configured.show_title, false);
  assert.equal(configured.row_dividers, false);
  assert.equal(configured.zebra, true);
});

test('shared renderer owns table appearance so Preview and Player stay identical', async () => {
  const [renderer, css, contract] = await Promise.all([
    read('src/web/admin-ui/public/js/scene-runtime/renderer.js'),
    read('src/web/admin-ui/public/css/scene-renderer.css'),
    read('src/contracts/scene.js')
  ]);

  assert.match(renderer, /table\.dataset\.preset = appearance\.preset/);
  assert.match(renderer, /table\.dataset\.density = appearance\.density/);
  assert.match(renderer, /table\.dataset\.headerStyle = appearance\.header_style/);
  assert.match(renderer, /--scene-table-accent/);
  assert.match(css, /data-header-style="accent"/);
  assert.match(css, /data-zebra="true"/);
  assert.match(contract, /table\.appearance\.preset/);
  assert.match(contract, /table\.appearance\.accent_color/);
});
