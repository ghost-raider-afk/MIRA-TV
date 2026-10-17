import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateReadableRows } from '../src/db/migrations/readable-manual-columns.js';

function readableSettings() {
  return { table_style:'readable', table_x:56, table_width_px:1374 };
}

test('migration freezes the old two-section visual split as manual columns', () => {
  const rows = [
    { id:'s1', kind:'section', name:'Первый', enabled:true },
    { id:'a1', kind:'item', product_id:1, enabled:true },
    { id:'a2', kind:'item', product_id:2, enabled:true },
    { id:'s2', kind:'section', name:'Второй', enabled:true },
    { id:'b1', kind:'item', product_id:3, enabled:true },
    { id:'b2', kind:'item', product_id:4, enabled:true }
  ];

  const migrated = migrateReadableRows(rows, readableSettings(), '1920×1080');
  assert.equal(migrated.changed, true);
  assert.deepEqual(migrated.rows.map((row) => row.column), [
    'left','left','left','right','right','right'
  ]);
});

test('migration preserves a single readable section in the left column', () => {
  const rows = [
    { id:'s1', kind:'section', name:'Пиво', enabled:true },
    { id:'a1', kind:'item', product_id:1, enabled:true },
    { id:'a2', kind:'item', product_id:2, enabled:true },
    { id:'a3', kind:'packaging', packaging_id:1, enabled:true },
    { id:'a4', kind:'packaging', packaging_id:2, enabled:true }
  ];

  const migrated = migrateReadableRows(rows, readableSettings(), '1920×1080');
  assert.deepEqual(migrated.rows.map((row) => row.column), [
    'left','left','left','left','left'
  ]);
});

test('migration uses the former packaging pairing only to preserve the old section split', () => {
  const rows = [
    { id:'s1', kind:'section', name:'Первый', enabled:true },
    { id:'p1', kind:'packaging', packaging_id:1, enabled:true },
    { id:'p2', kind:'packaging', packaging_id:2, enabled:true },
    { id:'s2', kind:'section', name:'Второй', enabled:true },
    { id:'i1', kind:'item', product_id:1, enabled:true },
    { id:'s3', kind:'section', name:'Третий', enabled:true },
    { id:'i2', kind:'item', product_id:2, enabled:true }
  ];

  const migrated = migrateReadableRows(rows, readableSettings(), '1920×1080');
  assert.deepEqual(migrated.rows.map((row) => row.column), [
    'left','left','left','right','right','right','right'
  ]);
});

test('migration never changes classic rows and never overwrites valid manual placement', () => {
  const classic = [{ id:'s1', kind:'section', name:'Классика', enabled:true }];
  const untouched = migrateReadableRows(classic, { table_style:'legacy' }, '1920×1080');
  assert.equal(untouched.changed, false);
  assert.strictEqual(untouched.rows, classic);

  const manual = [
    { id:'s1', kind:'section', name:'Пиво', column:'full', enabled:true },
    { id:'i1', kind:'item', product_id:1, column:'right', enabled:true }
  ];
  const alreadyManual = migrateReadableRows(manual, readableSettings(), '1920×1080');
  assert.equal(alreadyManual.changed, false);
  assert.strictEqual(alreadyManual.rows, manual);
});
