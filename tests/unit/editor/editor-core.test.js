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


test('readable A→Я sorts one logical section across both visual columns', () => {
  const state = createEditorState({
    settings:{ table_style:'readable' },
    rows:[
      { id:'section', kind:'section', name:'Разливное', column:'left', enabled:true },
      { id:'left-z', kind:'item', product_id:1, column:'left', enabled:true },
      { id:'right-b', kind:'item', product_id:2, column:'right', enabled:true },
      { id:'left-a', kind:'item', product_id:3, column:'left', enabled:true },
      { id:'pack', kind:'packaging', packaging_id:9, column:'left', enabled:true },
      { id:'right-y', kind:'item', product_id:4, column:'right', enabled:true },
      { id:'next', kind:'section', name:'Следующий', column:'right', enabled:true },
      { id:'unrelated', kind:'item', product_id:5, column:'right', enabled:true }
    ]
  });
  const names = new Map([[1,'Ячменное'],[2,'Бавария'],[3,'Альфа'],[4,'Янтарное'],[5,'Тёмное']]);
  const lookup = (id) => names.get(Number(id));
  assert.equal(sortSectionItems(state, 'section', lookup), true);
  assert.deepEqual(state.rows.map((r) => r.id), [
    'section','left-a','right-b','right-y','pack','left-z','next','unrelated'
  ]);
  assert.deepEqual(state.rows.map((r) => r.column), [
    'left','left','left','right','left','right','right','right'
  ]);
  assert.deepEqual(state.rows.slice(1,6).filter((r) => r.kind === 'item' && r.column === 'left').map((r) => names.get(r.product_id)), ['Альфа','Бавария']);
  assert.deepEqual(state.rows.slice(1,6).filter((r) => r.kind === 'item' && r.column === 'right').map((r) => names.get(r.product_id)), ['Янтарное','Ячменное']);
  assert.deepEqual(state.rows.slice(1,6).filter((r) => r.kind === 'item').map((r) => names.get(r.product_id)),
    ['Альфа','Бавария','Янтарное','Ячменное'],
    'persisted linear section order must be sorted, not merely its visual columns');
  const classicModel = buildRenderModel({
    ...state, settings:{ ...state.settings, table_style:'legacy' }
  });
  const classicLines = buildDisplayLines(classicModel, { products:[...names].map(([id, name]) => ({ id, name })) });
  assert.deepEqual(classicLines.filter((line) => line.kind === 'item').slice(0,4).map((line) => line.name),
    ['Альфа','Бавария','Янтарное','Ячменное'],
    'switching to the classic renderer preserves the same logical A→Я order');
  const revision = state.revision;
  assert.equal(sortSectionItems(state, 'section', lookup), true);
  assert.equal(state.revision, revision, 'already sorted visual columns must be idempotent');
  assert.equal(state.rows[4].id, 'pack', 'packaging remains anchored');
  assert.equal(state.rows[6].id, 'next', 'the next section remains anchored');

  assert.equal(changeRowColumn(state, 'left-a', 'right'), true);
  assert.equal(state.rows[1].id, 'left-a', 'column transfer never changes logical row order');
  assert.equal(sortSectionItems(state, 'section', lookup), true);
  const products = state.rows.slice(1,6).filter((r) => r.kind === 'item');
  assert.deepEqual(products.filter((r) => r.column === 'left').map((r) => names.get(r.product_id)), ['Альфа']);
  assert.deepEqual(products.filter((r) => r.column === 'right').map((r) => names.get(r.product_id)), ['Бавария','Янтарное','Ячменное']);
});

test('four readable sections, two on each side, sort only their own logical products', () => {
  const specs = [
    ['s1','left','Первый'], ['s2','left','Второй'], ['s3','right','Третий'], ['s4','right','Четвёртый']
  ];
  const rows = [];
  const names = new Map();
  for (let i = 0; i < specs.length; i += 1) {
    const [id, column, name] = specs[i];
    rows.push({ id, kind:'section', name, column, enabled:true });
    const products = [
      { id:`${id}-z`, name:'Янтарное', column:'left' },
      { id:`${id}-a`, name:'Альфа', column:'right' },
      { id:`${id}-b`, name:'Бавария', column:'left' },
      { id:`${id}-c`, name:'Варяг', column:'right' }
    ];
    for (const [n, item] of products.entries()) {
      const product_id = i * 10 + n + 1;
      names.set(product_id, item.name);
      rows.push({ id:item.id, kind:'item', product_id, column:item.column, enabled:true });
    }
  }
  const state = createEditorState({ settings:{ table_style:'readable' }, rows });
  const sectionProducts = (index) => state.rows.slice(index*5+1, index*5+5);
  for (const [index, [sectionId]] of specs.entries()) {
    const before = sectionProducts(index).map((row) => row.id).sort();
    assert.equal(sortSectionItems(state, sectionId, (id) => names.get(id)), true);
    const after = sectionProducts(index);
    assert.deepEqual(after.map((row) => row.id).sort(), before);
    const visualNames = [...after.filter((row) => row.column !== 'right'), ...after.filter((row) => row.column === 'right')]
      .map((row) => names.get(row.product_id));
    assert.deepEqual(visualNames, ['Альфа','Бавария','Варяг','Янтарное']);
  }
  assert.deepEqual(state.rows.filter((row) => row.kind === 'section').map((row) => row.column), ['left','left','right','right']);
  assert.equal(changeRowColumn(state, 's2', 'right'), true);
  assert.deepEqual(state.rows.map((row) => row.id).filter((id) => id.startsWith('s2-')), ['s2-a','s2-b','s2-c','s2-z'],
    'moving a section header does not reparent its products');
  const revision = state.revision;
  assert.equal(sortSectionItems(state, 's2', (id) => names.get(id)), true);
  assert.equal(state.revision, revision);
});

test('column transfer does not move a product under a different logical header', () => {
  const state = createEditorState({
    settings:{ table_style:'readable' },
    rows:[
      { id:'left-header', kind:'section', name:'Первый', column:'left', enabled:true },
      { id:'moving', kind:'item', product_id:1, column:'left', enabled:true },
      { id:'stable', kind:'item', product_id:2, column:'left', enabled:true },
      { id:'right-header', kind:'section', name:'Второй', column:'right', enabled:true },
      { id:'other', kind:'item', product_id:3, column:'right', enabled:true }
    ]
  });
  const original = state.rows.map((row) => row.id);
  assert.equal(changeRowColumn(state, 'moving', 'right'), true);
  assert.deepEqual(state.rows.map((row) => row.id), original);
  assert.equal(state.rows[1].column, 'right');
  assert.equal(sortSectionItems(state, 'right-header', (id) => ({1:'Янтарное',2:'Алтунин',3:'Бавария'})[id]), true);
  assert.deepEqual(state.rows.map((row) => row.id), original, 'sorting right section cannot absorb moved product from previous section');
  assert.equal(sortSectionItems(state, 'left-header', (id) => ({1:'Янтарное',2:'Алтунин',3:'Бавария'})[id]), true);
  assert.deepEqual(state.rows.map((row) => row.id), original, 'visual left Алтунин and right Янтарное are already sorted');
  assert.equal(changeRowColumn(state, 'left-header', 'right'), true);
  assert.deepEqual(state.rows.map((row) => row.id), original, 'moving section title is only a visual change');
  assert.equal(changeRowColumn(state, 'moving', 'right'), true);
});

test('readable Russian collation stays stable for equal names across visual columns', () => {
  const state = createEditorState({
    settings:{ table_style:'readable' },
    rows:[
      { id:'header', kind:'section', name:'Пиво', column:'full', enabled:true },
      { id:'z', kind:'item', product_id:1, column:'right', enabled:true },
      { id:'a1', kind:'item', product_id:2, column:'left', enabled:true },
      { id:'a2', kind:'item', product_id:3, column:'right', enabled:true },
      { id:'b', kind:'item', product_id:4, column:'left', enabled:true }
    ]
  });
  const names = new Map([[1,'Янтарное'],[2,'альфа'],[3,'Альфа'],[4,'Бавария']]);
  assert.equal(sortSectionItems(state, 'header', (id) => names.get(id)), true);
  assert.deepEqual(state.rows.filter((row) => row.column === 'left').map((row) => row.id), ['a1','a2']);
  assert.deepEqual(state.rows.filter((row) => row.column === 'right').map((row) => row.id), ['b','z']);
  const revision = state.revision;
  assert.equal(sortSectionItems(state, 'header', (id) => names.get(id)), true);
  assert.equal(state.revision, revision, 'stable equal names must never flip between columns on repeat');
});

test('legacy A→Я retains its existing single-column ordering', () => {
  const state = createEditorState({
    settings:{ table_style:'legacy' },
    rows:[
      { id:'header', kind:'section', name:'Раздел', column:'left', enabled:true },
      { id:'last', kind:'item', product_id:1, column:'right', enabled:true },
      { id:'first', kind:'item', product_id:2, column:'left', enabled:true }
    ]
  });
  assert.equal(sortSectionItems(state, 'header', (id) => ({1:'Янтарное',2:'Альфа'})[id]), true);
  assert.deepEqual(state.rows.map((row) => row.id), ['header','first','last']);
});
