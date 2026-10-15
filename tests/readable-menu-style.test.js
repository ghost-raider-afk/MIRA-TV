import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { menuSettingsInput } from '../src/contracts/menu-settings.js';
import {
  buildDisplayLines,
  buildRenderLayout,
  buildRenderModel,
  buildTableSvg
} from '../src/web/admin-ui/public/js/editor/renderer.js';

function product(id, name, primary, secondary) {
  return { id, name, price_primary:primary, price_secondary:secondary, producer:'Производитель', strength:'4,5%' };
}

test('legacy menus stay legacy while readable settings use the new defaults', () => {
  const legacy = menuSettingsInput({});
  assert.equal(legacy.table_style, 'legacy');
  assert.equal(legacy.price_font_size_pt, 27);

  const readable = menuSettingsInput({ table_style:'readable' });
  assert.equal(readable.table_style, 'readable');
  assert.equal(readable.price_font_size_pt, 32);
});

test('new screens explicitly start with readable table style', async () => {
  const source = await readFile(new URL('../src/db/screens.js', import.meta.url), 'utf8');
  assert.match(source, /defaultSettings = JSON\.stringify\(\{ table_style:'readable', font_family:'dejavu-condensed', price_font_size_pt:32 \}\)/);
});

test('readable layout balances complete sections into two columns', () => {
  const rows = [
    { id:'s1', kind:'section', name:'Фильтрованное', enabled:true },
    { id:'a1', kind:'item', product_id:1, enabled:true },
    { id:'a2', kind:'item', product_id:2, enabled:true },
    { id:'a3', kind:'item', product_id:3, enabled:true },
    { id:'s2', kind:'section', name:'Нефильтрованное', enabled:true },
    { id:'b1', kind:'item', product_id:4, enabled:true },
    { id:'b2', kind:'item', product_id:5, enabled:true },
    { id:'b3', kind:'item', product_id:6, enabled:true }
  ];
  const products = [
    product(1,'Алтунин','268','402'), product(2,'Бир Ком','205','307'), product(3,'Двойное золотое','255','382'),
    product(4,'Бавария','187','280'), product(5,'Бланш Бир','313','469'), product(6,'Снежный эль','294','441')
  ];
  const model = buildRenderModel({ settings:{ table_style:'readable' }, rows }, { width:1920, height:1080 });
  const lines = buildDisplayLines(model, { products });
  const layout = buildRenderLayout(model, lines);

  assert.equal(layout.styleId, 'readable');
  assert.equal(layout.columns.length, 2);
  assert.equal(layout.vertical.boxes[0].column, 0);
  assert.equal(layout.vertical.boxes[3].column, 0);
  assert.equal(layout.vertical.boxes[4].column, 1);
  assert.equal(layout.vertical.boxes[7].column, 1);
  assert.ok(layout.horizontals[4].left > layout.horizontals[0].left);
  assert.ok(layout.vertical.effectivePercent >= 99);

  const svg = buildTableSvg(model, lines, layout);
  assert.match(svg, /readable-table-surfaces/);
  assert.equal((svg.match(/>1 л<\/text>/g) || []).length, 2);
  assert.equal((svg.match(/>1,5 л<\/text>/g) || []).length, 2);
  assert.match(svg, />Алтунин</);
  assert.match(svg, />Бавария</);
});

test('packaging remains supported by the same readable table renderer', () => {
  const model = buildRenderModel({
    settings:{ table_style:'readable' },
    rows:[
      { id:'s1', kind:'section', name:'Тара', enabled:true },
      { id:'p1', kind:'packaging', packaging_id:11, enabled:true },
      { id:'p2', kind:'packaging', packaging_id:12, enabled:true }
    ]
  }, { width:1920, height:1080 });
  const lines = buildDisplayLines(model, {
    packaging:[
      { id:11, name:'ПЭТ 1 л', unit_price:'25' },
      { id:12, name:'ПЭТ 1,5 л', unit_price:'30' }
    ]
  });
  const layout = buildRenderLayout(model, lines);
  const svg = buildTableSvg(model, lines, layout);

  assert.equal(layout.styleId, 'readable');
  assert.match(svg, />ПЭТ 1 л</);
  assert.match(svg, />ПЭТ 1,5 л</);
  assert.match(svg, /table-packaging/);
});

test('missing table style keeps the previous single-column geometry', () => {
  const model = buildRenderModel({
    settings:{},
    rows:[
      { id:'s1', kind:'section', name:'Первый', enabled:true },
      { id:'i1', kind:'item', name:'Один', enabled:true },
      { id:'s2', kind:'section', name:'Второй', enabled:true },
      { id:'i2', kind:'item', name:'Два', enabled:true }
    ]
  }, { width:1920, height:1080 });
  const lines = buildDisplayLines(model);
  const layout = buildRenderLayout(model, lines);
  const svg = buildTableSvg(model, lines, layout);

  assert.equal(layout.styleId, 'legacy');
  assert.equal(layout.columns.length, 1);
  assert.doesNotMatch(svg, /readable-table-surfaces/);
});
