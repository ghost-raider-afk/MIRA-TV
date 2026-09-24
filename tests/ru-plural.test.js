import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRussianCount, russianCountForm } from '../src/web/admin-ui/public/js/core/ru-plural.js';

const forms = ['телевизор', 'телевизора', 'телевизоров'];

test('Russian count formatter handles singular, paucal and plural television forms', () => {
  assert.equal(formatRussianCount(1, forms), '1 телевизор');
  assert.equal(formatRussianCount(2, forms), '2 телевизора');
  assert.equal(formatRussianCount(4, forms), '4 телевизора');
  assert.equal(formatRussianCount(5, forms), '5 телевизоров');
  assert.equal(formatRussianCount(11, forms), '11 телевизоров');
  assert.equal(formatRussianCount(21, forms), '21 телевизор');
  assert.equal(formatRussianCount(22, forms), '22 телевизора');
  assert.equal(formatRussianCount(25, forms), '25 телевизоров');
});

test('Russian count form also handles zero and negative counts deterministically', () => {
  assert.equal(russianCountForm(0, forms), 'телевизоров');
  assert.equal(russianCountForm(-2, forms), 'телевизора');
});
