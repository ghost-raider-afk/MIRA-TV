import assert from 'node:assert/strict';
import test from 'node:test';
import { menuDraftInput } from '../src/contracts/input.js';

const store = {
  async listProducts() { return [{ id:1, name:'Товар', price_primary:'100', price_secondary:'150', active:true }]; },
  async listPackaging() { return [{ id:1, name:'ПЭТ 1 л', unit_price:'20', active:true }]; }
};

async function draft(rows) {
  return menuDraftInput({
    rows,
    settings:{ table_style:'readable' },
    scene:{ version:1, elements:[] }
  }, store, 49152);
}

test('menu draft persists manual left/right placement and full-width sections', async () => {
  const result = await draft([
    { id:'section', kind:'section', name:'Пиво', column:'full', enabled:true },
    { id:'item', kind:'item', product_id:1, column:'right', enabled:true },
    { id:'pack', kind:'packaging', packaging_id:1, column:'left', enabled:true }
  ]);

  assert.deepEqual(result.rows.map((row) => row.column), ['full','right','left']);
});

test('missing column remains backward compatible and defaults to left', async () => {
  const result = await draft([
    { id:'section', kind:'section', name:'Пиво', enabled:true },
    { id:'item', kind:'item', product_id:1, enabled:true }
  ]);
  assert.deepEqual(result.rows.map((row) => row.column), ['left','left']);
});

test('full width placement is valid only for sections', async () => {
  await assert.rejects(() => draft([
    { id:'section', kind:'section', name:'Пиво', enabled:true },
    { id:'item', kind:'item', product_id:1, column:'full', enabled:true }
  ]), /Колонка строки меню/);
});
