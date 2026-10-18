import assert from 'node:assert/strict';
import test from 'node:test';
import { menuDraftInput } from '../src/contracts/input.js';
import {
  buildDisplayLines,
  buildRenderLayout,
  buildRenderModel,
  buildTableSvg
} from '../src/web/admin-ui/public/js/editor/renderer.js';

const store = {
  async listProducts() {
    return [
      { id:1, name:'Пиво', producer:'Завод', strength:'4,5%', characteristics:'светлое', price_primary:'200', price_secondary:'300', active:true },
      { id:2, name:'Лимонад', producer:'', strength:'', characteristics:'', price_primary:'120', price_secondary:'180', active:true }
    ];
  },
  async listPackaging() { return [{ id:1, name:'ПЭТ 1 л', unit_price:'20', active:true }]; }
};

async function draft(rows) {
  return menuDraftInput({ rows, settings:{ table_style:'readable' }, scene:{ version:1, elements:[] } }, store, 49152);
}

function renderState(tableStyle, fontScalePercent = 100) {
  const rows = [
    { id:'beer', kind:'section', name:'Пиво', section_type:'products', column:'left', enabled:true },
    { id:'beer-item', kind:'item', product_id:1, column:'left', enabled:true },
    { id:'pet', kind:'section', name:'ПЭТ', section_type:'packaging', column:'right', enabled:true },
    { id:'pet-item', kind:'item', product_id:2, column:'right', enabled:true }
  ];
  const settings = {
    table_style:tableStyle,
    font_scale_percent:fontScalePercent,
    table_x:56,
    table_y:15,
    table_width_px:1374,
    table_height_px:925,
    background_color:'#101828',
    accent_color:'#F6C90E',
    text_color:'#F4F7FA',
    font_family:'arial-narrow',
    price_font_size_pt:27
  };
  const model = buildRenderModel({ rows, settings }, { width:1920, height:1080 });
  const products = [
    { id:1, name:'Пиво', producer:'Завод', strength:'4,5%', characteristics:'светлое', price_primary:'200', price_secondary:'300' },
    { id:2, name:'Лимонад', producer:'', strength:'', characteristics:'', price_primary:'120', price_secondary:'180' }
  ];
  const lines = buildDisplayLines(model, { products, packaging:[] });
  const layout = buildRenderLayout(model, lines);
  return { model, lines, layout, svg:buildTableSvg(model, lines, layout) };
}

test('section type is explicit, backward compatible, and validated', async () => {
  const result = await draft([
    { id:'products', kind:'section', name:'Пиво', enabled:true },
    { id:'packaging', kind:'section', name:'ПЭТ', section_type:'packaging', enabled:true }
  ]);
  assert.deepEqual(result.rows.map((row) => row.section_type), ['products','packaging']);
  await assert.rejects(() => draft([{ id:'bad', kind:'section', name:'ПЭТ', section_type:'pet', enabled:true }]), /Тип раздела меню/);
});

test('packaging sections suppress litre headings while product sections keep divider headings', () => {
  const readable = renderState('readable');
  assert.equal(readable.lines.find((line) => line.sourceRowId === 'pet').sectionType, 'packaging');
  assert.match(readable.svg, /class="section-price-divider"/);
  assert.equal((readable.svg.match(/>1 Л<\/text>/g) || []).length, 1);
  assert.doesNotMatch(readable.svg, />1,5 Л<\/text>/);

  const classic = renderState('legacy');
  assert.equal((classic.svg.match(/>1 Л<\/text>/g) || []).length, 1);
  assert.equal((classic.svg.match(/>1,5 Л<\/text>/g) || []).length, 1);
  assert.equal((classic.svg.match(/class="section-price-divider"/g) || []).length, 2);
});

test('rows without secondary metadata are compact in both table styles', () => {
  for (const style of ['legacy','readable']) {
    const { lines, layout } = renderState(style);
    const richIndex = lines.findIndex((line) => line.sourceRowId === 'beer-item');
    const compactIndex = lines.findIndex((line) => line.sourceRowId === 'pet-item');
    const rich = layout.vertical.boxes[richIndex];
    const compact = layout.vertical.boxes[compactIndex];
    assert.ok(compact.height < rich.height * .8, `${style}: compact row must be at least 20% shorter`);
    assert.ok(compact.height > rich.height * .68, `${style}: compact row must remain readable`);
  }
});

test('font scale changes shared table geometry monotonically', () => {
  for (const style of ['legacy','readable']) {
    const small = renderState(style, 80).layout;
    const large = renderState(style, 120).layout;
    assert.ok(large.vertical.scale > small.vertical.scale, `${style}: scale control must change renderer scale`);
    assert.ok(large.vertical.usedHeight > small.vertical.usedHeight, `${style}: scale control must change content size`);
  }
});

test('classic and readable use the same lighter table surface', () => {
  for (const style of ['legacy','readable']) {
    const { svg } = renderState(style);
    assert.match(svg, /fill="#090C10" fill-opacity="\.76"/);
    assert.doesNotMatch(svg, /fill-opacity="\.82"/);
  }
});

test('readable strength prevents compacting', () => {
  const { model, lines } = renderState('readable');
  const rich = lines.map((line) => line.sourceRowId === 'beer-item' ? { ...line, metadataReadable:'' } : line);
  const layout = buildRenderLayout(model, rich);
  const i = rich.findIndex((line) => line.sourceRowId === 'beer-item');
  const j = rich.findIndex((line) => line.sourceRowId === 'pet-item');
  assert.ok(layout.vertical.boxes[i].height > layout.vertical.boxes[j].height);
});
