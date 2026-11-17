import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditorState, markEditorSaved } from '../../../src/web/admin-ui/public/js/editor/state.js';
import { addRow, changeRowColumn, moveRow, removeRow, sortSectionItems, updateRow, updateSettings } from '../../../src/web/admin-ui/public/js/editor/commands.js';
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

test('section alphabet sort is stable, Russian-aware and never crosses section boundaries', () => {
  const state = createEditorState({
    rows: [
      { id: 'section-1', kind: 'section', name: 'Светлое', enabled: true },
      { id: 'item-z', kind: 'item', product_id: 1, enabled: true },
      { id: 'pack-1', kind: 'packaging', packaging_id: 10, enabled: true },
      { id: 'item-a-1', kind: 'item', product_id: 2, enabled: true },
      { id: 'item-a-2', kind: 'item', product_id: 3, enabled: true },
      { id: 'section-2', kind: 'section', name: 'Тёмное', enabled: true },
      { id: 'item-other', kind: 'item', product_id: 4, enabled: true }
    ],
    dirty: false
  });
  markEditorSaved(state);
  const names = new Map([
    [1, 'Янтарное'],
    [2, 'альфа'],
    [3, 'Альфа'],
    [4, 'Борей']
  ]);

  assert.equal(sortSectionItems(state, 'section-1', (productId) => names.get(Number(productId))), true);
  assert.deepEqual(state.rows.map((row) => row.id), [
    'section-1',
    'item-a-1',
    'pack-1',
    'item-a-2',
    'item-z',
    'section-2',
    'item-other'
  ]);
  assert.equal(state.dirty, true);
  assert.equal(state.rows[5].id, 'section-2');
  assert.equal(state.rows[6].id, 'item-other');
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

test('display lines retain stable source row identity for direct Preview editing', () => {
  const state = createEditorState({
    rows: [
      { id: 'section-source', kind: 'section', name: 'Светлое', enabled: true },
      { id: 'item-source', kind: 'item', product_id: 1, enabled: true },
      { id: 'pack-source-1', kind: 'packaging', packaging_id: 10, enabled: true },
      { id: 'pack-source-2', kind: 'packaging', packaging_id: 11, enabled: true }
    ]
  });
  const model = buildRenderModel(state, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model, {
    products: [{ id: 1, name: 'Бавария', price_primary: '179' }],
    packaging: [{ id: 10, name: 'ПЭТ 1 л', unit_price: '10' }, { id: 11, name: 'ПЭТ 1,5 л', unit_price: '12' }]
  });
  assert.equal(lines[0].sourceRowId, 'section-source');
  assert.equal(lines[1].sourceRowId, 'item-source');
  assert.deepEqual(lines[2].sourceRowIds, ['pack-source-1', 'pack-source-2']);
  assert.deepEqual(lines[2].items.map((item) => item.sourceRowId), ['pack-source-1', 'pack-source-2']);
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

test('default board geometry is MIRA-TV 1 and can be moved per monitor', () => {
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


test('readable A→Я sorts each column inside its section without moving rows between columns', () => {
  const state = createEditorState({
    settings:{ table_style:'readable' },
    rows:[
      { id:'section-full', kind:'section', name:'Пиво', column:'full', enabled:true },
      { id:'left-z', kind:'item', product_id:1, column:'left', enabled:true },
      { id:'right-z', kind:'item', product_id:2, column:'right', enabled:true },
      { id:'left-a', kind:'item', product_id:3, column:'left', enabled:true },
      { id:'pack-left', kind:'packaging', packaging_id:90, column:'left', enabled:true },
      { id:'right-a', kind:'item', product_id:4, column:'right', enabled:true },
      { id:'section-right', kind:'section', name:'Другой раздел', column:'right', enabled:true },
      { id:'other', kind:'item', product_id:5, column:'right', enabled:true }
    ]
  });
  const names = new Map([[1,'Ячменное'],[2,'Янтарное'],[3,'Альфа'],[4,'Бавария'],[5,'Гранат']]);
  const name = (id) => names.get(Number(id));
  assert.equal(sortSectionItems(state, 'section-full', name), true);
  assert.deepEqual(state.rows.map((r) => r.id), [
    'section-full','left-a','right-a','left-z','pack-left','right-z','section-right','other'
  ]);
  assert.deepEqual(state.rows.map((r) => r.column), [
    'full','left','right','left','left','right','right','right'
  ]);
  // Moving a product only changes its column; subsequent sorting cannot swap its neighbours' columns.
  updateRow(state, 'left-z', { column:'right' });
  assert.equal(sortSectionItems(state, 'section-full', name), true);
  assert.deepEqual(state.rows.map((r) => r.id), [
    'section-full','left-a','right-a','right-z','pack-left','left-z','section-right','other'
  ]);
  assert.deepEqual(state.rows.filter((r) => r.kind === 'item' && r.column === 'left').map((r) => r.id), ['left-a']);
  assert.deepEqual(state.rows.filter((r) => r.kind === 'item' && r.column === 'right').map((r) => r.id), [
    'right-a','right-z','left-z','other'
  ]);
  const stableRevision = state.revision;
  assert.equal(sortSectionItems(state, 'section-full', name), true);
  assert.equal(state.revision, stableRevision, 'sorting an already sorted section makes no new revision');
});

test('legacy A→Я keeps its historical single-column sort behaviour', () => {
  const state = createEditorState({
    settings:{ table_style:'legacy' },
    rows:[
      { id:'section', kind:'section', name:'P', column:'full', enabled:true },
      { id:'right-z', kind:'item', product_id:1, column:'right', enabled:true },
      { id:'left-a', kind:'item', product_id:2, column:'left', enabled:true }
    ]
  });
  assert.equal(sortSectionItems(state, 'section', (id) => Number(id) === 1 ? 'Янтарное' : 'Альфа'), true);
  assert.deepEqual(state.rows.map((r) => r.id), ['section','left-a','right-z']);
});


test('readable sorting ignores other-column headers and stops only at its own next header', () => {
  const state = createEditorState({
    settings:{ table_style:'readable' },
    rows:[
      { id:'s-left', kind:'section', name:'Светлое', column:'left', enabled:true },
      { id:'l-z', kind:'item', product_id:1, column:'left', enabled:true },
      { id:'s-right', kind:'section', name:'Тёмное', column:'right', enabled:true },
      { id:'r-z', kind:'item', product_id:2, column:'right', enabled:true },
      { id:'l-a', kind:'item', product_id:3, column:'left', enabled:true },
      { id:'r-a', kind:'item', product_id:4, column:'right', enabled:true },
      { id:'s-left-next', kind:'section', name:'Тара', column:'left', enabled:true },
      { id:'l-other', kind:'item', product_id:5, column:'left', enabled:true },
      { id:'r-b', kind:'item', product_id:6, column:'right', enabled:true }
    ]
  });
  const names = new Map([[1,'Янтарное'],[2,'Ячменное'],[3,'Алтунин'],[4,'Арфа'],[5,'Бавария'],[6,'Барное']]);
  const lookup = (id) => names.get(Number(id));
  assert.equal(sortSectionItems(state, 's-left', lookup), true);
  assert.deepEqual(state.rows.map((r) => r.id), [
    's-left','l-a','s-right','r-z','l-z','r-a','s-left-next','l-other','r-b'
  ], 'left sort crosses right header without reordering any right column item');
  assert.equal(sortSectionItems(state, 's-right', lookup), true);
  assert.deepEqual(state.rows.map((r) => r.id), [
    's-left','l-a','s-right','r-a','l-z','r-b','s-left-next','l-other','r-z'
  ], 'right sort crosses the following left header and does not touch left rows');
  const revision = state.revision;
  assert.equal(sortSectionItems(state, 's-left-next', lookup), true);
  assert.equal(state.revision, revision, 'a one-item section does not write an unnecessary revision');
});


test('transferred readable product joins a later target-column header before A→Я and preserves both sections', () => {
  const state = createEditorState({
    settings:{ table_style:'readable' },
    rows:[
      { id:'left-header', kind:'section', name:'Светлое', column:'left', enabled:true },
      { id:'left-a', kind:'item', product_id:1, column:'left', enabled:true },
      { id:'moving', kind:'item', product_id:2, column:'left', enabled:true },
      { id:'right-header', kind:'section', name:'Тёмное', column:'right', enabled:true },
      { id:'right-z', kind:'item', product_id:3, column:'right', enabled:true },
      { id:'right-a', kind:'item', product_id:4, column:'right', enabled:true }
    ]
  });
  assert.equal(changeRowColumn(state, 'moving', 'right'), true);
  assert.deepEqual(state.rows.map((row) => row.id),
    ['left-header','left-a','right-header','moving','right-z','right-a']);
  assert.equal(state.rows[3].column, 'right');
  const names = new Map([[1,'Альфа'],[2,'Бавария'],[3,'Янтарное'],[4,'Арфа']]);
  assert.equal(sortSectionItems(state, 'right-header', (id) => names.get(Number(id))), true);
  assert.deepEqual(state.rows.map((row) => row.id),
    ['left-header','left-a','right-header','right-a','moving','right-z']);
  assert.deepEqual(state.rows.map((row) => row.column),
    ['left','left','right','right','right','right']);
  const model = buildRenderModel(state, { width:1920, height:1080 });
  const lines = buildDisplayLines(model, {
    products:[...[1,2,3,4].map((id) => ({ id, name:names.get(id), price_primary:'200' }))]
  });
  assert.deepEqual(lines.filter((line) => line.kind === 'item' && line.column === 'right').map((line) => line.tone),
    ['light','accent','light']);
  const beforeNoop = state.revision;
  assert.equal(changeRowColumn(state, 'moving', 'right'), true);
  assert.equal(state.revision, beforeNoop);
});

test('column change keeps rows inside their full-width section and leaves classic mode order unchanged', () => {
  const rows = [
    { id:'full', kind:'section', name:'Меню', column:'full', enabled:true },
    { id:'item', kind:'item', product_id:1, column:'left', enabled:true },
    { id:'other', kind:'section', name:'Следующий', column:'right', enabled:true }
  ];
  const state = createEditorState({ settings:{ table_style:'readable' }, rows });
  assert.equal(changeRowColumn(state, 'item', 'right'), true);
  assert.deepEqual(state.rows.map((row) => row.id), ['full','other','item'],
    'a later right header is the target for an item moved out of the full-width header section');
  const classic = createEditorState({ settings:{ table_style:'legacy' }, rows });
  assert.equal(changeRowColumn(classic, 'item', 'right'), true);
  assert.deepEqual(classic.rows.map((row) => row.id), ['full','item','other']);
});
