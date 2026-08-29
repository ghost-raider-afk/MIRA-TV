import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditorState, markEditorSaved } from '../../../src/web/admin-ui/public/js/editor/state.js';
import { addRow, moveRow, removeRow, updateRow, updateSettings } from '../../../src/web/admin-ui/public/js/editor/commands.js';
import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableSvg, MENU_REFERENCE } from '../../../src/web/admin-ui/public/js/editor/renderer.js';
import { normaliseEditorSettings } from '../../../src/web/admin-ui/public/js/editor/settings.js';

test('editor commands keep the first section pinned while its title stays editable', () => {
  const state = createEditorState();
  addRow(state, { id: 'section-1', kind: 'section', name: 'Пиво', enabled: true });
  addRow(state, { id: 'item-1', kind: 'item', product_id: 1, name: 'Тест', enabled: true });
  assert.equal(state.rows.length, 2);
  assert.equal(state.dirty, true);
  assert.equal(state.revision, 2);
  assert.equal(state.draftRevision, 0);
  updateRow(state, 'item-1', { promotion: true });
  assert.equal(state.rows[1].promotion, true);
  moveRow(state, 'item-1', 0);
  assert.equal(state.rows[0].id, 'section-1');
  assert.equal(state.rows[1].id, 'item-1');
  assert.equal(removeRow(state, 'section-1'), false);
  updateRow(state, 'section-1', { name: 'Пиво светлое', enabled: false });
  assert.equal(state.rows[0].name, 'Пиво светлое');
  assert.equal(state.rows[0].enabled, true);
  updateSettings(state, { table_x: 100 });
  assert.equal(state.settings.table_x, 100);
  markEditorSaved(state);
  assert.equal(state.dirty, false);
  assert.equal(Object.hasOwn(state, 'templateId'), false);
});

test('legacy drafts get a real editable first section independent from monitor name', () => {
  const state = createEditorState({
    screen: { id: 17, name: 'СВЕТЛОЕ ФИЛЬТРОВАННОЕ' },
    rows: [{ id: 'item-1', kind: 'item', product_id: 1, enabled: true }],
    dirty: false
  });
  assert.equal(state.rows[0].kind, 'section');
  assert.equal(state.rows[0].name, 'Новый раздел');
  assert.equal(state.rows[0].id, 'section-primary-17');
  assert.equal(state.dirty, true);

  updateRow(state, state.rows[0].id, { name: 'ПИВО СВЕТЛОЕ' });
  const model = buildRenderModel(state, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model, {
    products: [{ id: 1, name: 'СНЕЖНЫЙ ЭЛЬ', price_primary: '500', price_secondary: '750' }],
    fallbackTitle: 'СВЕТЛОЕ ФИЛЬТРОВАННОЕ'
  });
  assert.equal(lines[0].kind, 'section');
  assert.equal(lines[0].name, 'ПИВО СВЕТЛОЕ');
  assert.equal(lines[0].showPriceLabels, true);
  assert.notEqual(lines[0].name, state.screen.name);
});

test('renderer model filters disabled rows and respects arbitrary monitor aspect ratio', () => {
  const state = createEditorState({ rows: [{ id: 'a', kind: 'section', name: 'A', enabled: true }, { id: 'b', kind: 'section', name: 'B', enabled: false }] });
  const model = buildRenderModel(state, { width: 1024, height: 768 });
  assert.equal(model.viewport.width, 1024);
  assert.equal(model.viewport.height, 768);
  assert.equal(model.viewport.aspectRatio, 4 / 3);
  assert.deepEqual(model.rows.map((row) => row.id), ['a']);
});

test('monitor background and table geometry survive settings normalization', () => {
  const url = '/site-assets/screens/background-123e4567-e89b-12d3-a456-426614174000.webp';
  const settings = normaliseEditorSettings({ background_image_url: url, table_x: 80, table_y: 40, table_width_px: 1100, table_height_px: 700 });
  assert.equal(settings.background_image_url, url);
  assert.equal(settings.accent_color, '#F4C915');
  assert.equal(settings.font_scale_percent, 100);
  assert.equal(settings.font_family, 'arial-narrow');
  assert.equal(settings.table_x, 80);
  assert.equal(settings.table_y, 40);
  assert.equal(settings.table_width_px, 1100);
  assert.equal(settings.table_height_px, 700);
  assert.equal(normaliseEditorSettings({ background_image_url: '/site-assets/templates/background-123e4567-e89b-12d3-a456-426614174000.webp' }).background_image_url, '');
});

test('canonical table keeps prices separate and builds second line only from catalog fields', () => {
  const state = createEditorState({
    settings: { font_scale_percent: 100, font_family: 'arial-narrow' },
    rows: [{ id: 'product-1', kind: 'item', product_id: 1, enabled: true }, { id: 'pack-1', kind: 'packaging', packaging_id: 10, enabled: true }, { id: 'pack-2', kind: 'packaging', packaging_id: 11, enabled: true }]
  });
  const model = buildRenderModel(state, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model, {
    products: [{ id: 1, name: 'Бавария', strength: '4,6°', producer: 'ООО «Портал»', beverage_color: 'light', filtration: 'unfiltered', price_primary: '179.00', price_secondary: '268.50' }],
    packaging: [{ id: 10, name: 'ПЭТ 1 л', unit_price: '10' }, { id: 11, name: 'ПЭТ 1,5 л', unit_price: '12' }]
  });
  assert.equal(lines[0].kind, 'section');
  assert.equal(lines[0].name, 'Новый раздел');
  assert.equal(lines[1].name, 'Бавария');
  assert.equal(lines[1].metadata, 'ООО «Портал» · 4,6% · светлое · нефильтрованное');
  assert.equal(lines[1].pricePrimary, '179.00');
  assert.equal(lines[1].priceSecondary, '268.50');
  assert.equal(lines[2].kind, 'packaging');
  assert.equal(lines[2].items.length, 2);
  const layout = buildRenderLayout(model, lines);
  const svg = buildTableSvg(model, lines, layout);
  assert.match(svg, /class="item-name"[^>]*>Бавария<\/text>/);
  assert.doesNotMatch(svg, /class="item-name"[^>]*4,6%/);
  assert.match(svg, /ООО «Портал» · 4,6% · светлое · нефильтрованное/);
  assert.doesNotMatch(svg, /°/);
  assert.match(svg, /class="price"[^>]*text-anchor="end"/);
});

test('default board geometry is TV Menu 1 and can be moved per monitor', () => {
  assert.equal(MENU_REFERENCE.width, 1920);
  assert.equal(MENU_REFERENCE.tableX, 56);
  assert.equal(MENU_REFERENCE.tableWidth, 1374);
  assert.equal(MENU_REFERENCE.tableHeight, 925);
  const model = buildRenderModel(createEditorState({ settings: { table_x: 120, table_y: 70, table_width_px: 1000, table_height_px: 600 }, rows: [{ id: 's', kind: 'section', name: 'S', enabled: true }] }), { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model);
  const layout = buildRenderLayout(model, lines);
  assert.deepEqual(layout.frame, { x: 120, y: 70, width: 1000, height: 600 });
});

test('automatic font fitting reduces scale and refuses silent clipping', () => {
  const state = createEditorState({ settings: { font_scale_percent: 100, font_family: 'arial-narrow' }, rows: Array.from({ length: 32 }, (_, index) => ({ id: `section-${index}`, kind: 'section', name: `Раздел ${index}`, enabled: true })) });
  const model = buildRenderModel(state, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model);
  const layout = buildRenderLayout(model, lines);
  assert.equal(layout.vertical.effectivePercent, MENU_REFERENCE.fontScaleMinPercent);
  assert.equal(layout.vertical.autoReduced, true);
  assert.equal(layout.vertical.fits, false);
});
