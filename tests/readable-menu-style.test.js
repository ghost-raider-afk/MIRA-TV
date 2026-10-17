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

const TABLE_SURFACE_PATTERN = /<rect x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" rx="10" fill="#090C10" fill-opacity="\.82" stroke="#FFFFFF" stroke-opacity="\.12" stroke-width="1"\/>/g;

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

test('readable layout follows persisted manual columns without automatic balancing', () => {
  const rows = [
    { id:'s1', kind:'section', name:'Фильтрованное', column:'left', enabled:true },
    { id:'a1', kind:'item', product_id:1, column:'left', enabled:true },
    { id:'a2', kind:'item', product_id:2, column:'left', enabled:true },
    { id:'a3', kind:'item', product_id:3, column:'left', enabled:true },
    { id:'s2', kind:'section', name:'Нефильтрованное', column:'right', enabled:true },
    { id:'b1', kind:'item', product_id:4, column:'right', enabled:true },
    { id:'b2', kind:'item', product_id:5, column:'right', enabled:true },
    { id:'b3', kind:'item', product_id:6, column:'right', enabled:true }
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
  assert.equal(layout.vertical.boxes[0].top, layout.vertical.boxes[4].top);
  assert.ok(layout.horizontals[4].left > layout.horizontals[0].left);
  assert.ok(layout.vertical.effectivePercent >= 99);

  const svg = buildTableSvg(model, lines, layout);
  assert.match(svg, /readable-table-surfaces/);
  assert.equal((svg.match(TABLE_SURFACE_PATTERN) || []).length, 2);
  assert.equal((svg.match(/>1 л<\/text>/g) || []).length, 2);
  assert.equal((svg.match(/>1,5 л<\/text>/g) || []).length, 0);
  assert.match(svg, />Алтунин</);
  assert.match(svg, />Бавария</);
});

test('one readable section can span both columns while its products are placed manually', () => {
  const rows = [
    { id:'s1', kind:'section', name:'Пиво', column:'full', enabled:true },
    { id:'a1', kind:'item', product_id:1, column:'left', enabled:true },
    { id:'a2', kind:'item', product_id:2, column:'left', enabled:true },
    { id:'b1', kind:'item', product_id:3, column:'right', enabled:true },
    { id:'b2', kind:'item', product_id:4, column:'right', enabled:true }
  ];
  const products = [
    product(1,'Один','100','150'), product(2,'Два','110','165'),
    product(3,'Три','120','180'), product(4,'Четыре','130','195')
  ];
  const model = buildRenderModel({ settings:{ table_style:'readable' }, rows }, { width:1920, height:1080 });
  const lines = buildDisplayLines(model, { products });
  const layout = buildRenderLayout(model, lines);

  assert.equal(layout.columns.length, 2);
  assert.equal(layout.vertical.boxes[0].column, 'full');
  assert.equal(layout.vertical.boxes[1].column, 0);
  assert.equal(layout.vertical.boxes[3].column, 1);
  assert.equal(layout.vertical.boxes[1].top, layout.vertical.boxes[3].top);
  assert.equal(layout.horizontals[0].tableWidth, layout.frame.width);
  assert.ok(layout.horizontals[3].left > layout.horizontals[1].left);
});

test('readable packaging is one ordinary visual row per entry and uses manual columns', () => {
  const model = buildRenderModel({
    settings:{ table_style:'readable' },
    rows:[
      { id:'s1', kind:'section', name:'Тара', column:'left', enabled:true },
      { id:'p1', kind:'packaging', packaging_id:11, column:'left', enabled:true },
      { id:'p2', kind:'packaging', packaging_id:12, column:'right', enabled:true }
    ]
  }, { width:1920, height:1080 });
  const lines = buildDisplayLines(model, {
    packaging:[
      { id:11, name:'ПЭТ 1 л', unit_price:'25' },
      { id:12, name:'ПЭТ 1,5 л', unit_price:'30' }
    ]
  });
  const layout = buildRenderLayout(model, lines);
  const packagingLines = lines.filter((line) => line.kind === 'packaging');
  const svg = buildTableSvg(model, lines, layout);

  assert.equal(packagingLines.length, 2);
  assert.equal(packagingLines[0].items.length, 1);
  assert.equal(packagingLines[1].items.length, 1);
  assert.equal(layout.vertical.boxes[1].column, 0);
  assert.equal(layout.vertical.boxes[2].column, 1);
  assert.match(svg, />ПЭТ 1 л</);
  assert.match(svg, />ПЭТ 1,5 л</);
  assert.match(svg, /table-packaging/);
});

test('classic style keeps single-column geometry and reuses the readable table surface', () => {
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
  assert.match(svg, /classic-table-surface/);
  assert.doesNotMatch(svg, /readable-table-surfaces/);
  assert.equal((svg.match(TABLE_SURFACE_PATTERN) || []).length, 1);
});


test('readable rows reuse classic alternating tones and keep address out of TV metadata', () => {
  const model = buildRenderModel({
    settings:{ table_style:'readable' },
    rows:[
      { id:'s1', kind:'section', name:'Раздел', column:'left', enabled:true },
      { id:'i1', kind:'item', product_id:1, column:'left', enabled:true },
      { id:'i2', kind:'item', product_id:2, column:'left', enabled:true }
    ]
  }, { width:1920, height:1080 });
  const products = [
    { id:1, name:'Первый', producer:'Завод 1', address:'Адрес не для ТВ', characteristics:'светлое, фильтрованное', strength:'4,5%', price_primary:'100', price_secondary:'150' },
    { id:2, name:'Второй', producer:'Завод 2', address:'Другой адрес', characteristics:'тёмное, нефильтрованное', strength:'5%', price_primary:'200', price_secondary:'300' }
  ];
  const lines = buildDisplayLines(model, { products });
  const layout = buildRenderLayout(model, lines);
  const svg = buildTableSvg(model, lines, layout);

  assert.equal(layout.themeTableStyle.item_tone_mode, 'alternating');
  assert.equal(layout.themeTableStyle.price_mode, 'alternating');
  assert.equal(lines[1].metadata, 'Завод 1 · 4,5% · светлое, фильтрованное');
  assert.equal(lines[1].metadataReadable, 'Завод 1 · светлое, фильтрованное');
  assert.equal(lines[1].strength, '4,5%');
  assert.match(svg, />Первый<tspan class="item-strength"> · 4,5%<\/tspan>/);
  assert.match(svg, /section-title-zone/);
  assert.match(svg, /mira-item-content-clip-/);
  assert.doesNotMatch(svg, /Адрес не для ТВ|Другой адрес/);
  const lightStart = svg.indexOf('tone-light');
  const accentStart = svg.indexOf('tone-accent');
  const lightRow = svg.slice(lightStart, accentStart);
  const accentRow = svg.slice(accentStart);
  assert.match(lightRow, new RegExp(`class=\"item-name\"[^>]*fill=\"${layout.palette.primaryText}\"`));
  assert.match(lightRow, new RegExp(`class=\"item-meta\"[^>]*fill=\"${layout.palette.secondaryText}\"`));
  assert.equal((lightRow.match(new RegExp(`class=\"price\"[^>]*fill=\"${layout.palette.primaryText}\"`, 'g')) || []).length, 1);
  assert.match(accentRow, new RegExp(`class=\"item-name\"[^>]*fill=\"${layout.palette.accentText}\"`));
  assert.match(accentRow, new RegExp(`class=\"item-meta\"[^>]*fill=\"${layout.palette.accentSecondaryText}\"`));
  assert.equal((accentRow.match(new RegExp(`class=\"price\"[^>]*fill=\"${layout.palette.accentText}\"`, 'g')) || []).length, 1);
  assert.ok(layout.columns[0].priceZoneLeft < layout.columns[0].primaryPriceX);
  assert.equal(layout.columns[0].secondaryPriceX, layout.columns[0].primaryPriceX);
});
