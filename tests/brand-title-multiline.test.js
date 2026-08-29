import test from 'node:test';
import assert from 'node:assert/strict';
import { completeBrandTitle } from '../src/contracts/brand-title.js';

test('Brand title preserves intentional line breaks and canonicalises CRLF', () => {
  const brand = completeBrandTitle({ enabled: true, text: '  БАР\r\nСЕВЕР  ' });
  assert.equal(brand.text, 'БАР\nСЕВЕР');
});

test('Brand title supports reduced multiline spacing without abusing vertical scale', () => {
  assert.equal(completeBrandTitle({ line_spacing: -24 }).line_spacing, -24);
  assert.equal(completeBrandTitle({ line_spacing: -999 }).line_spacing, -60);
  assert.equal(completeBrandTitle({ line_spacing: 999 }).line_spacing, 80);
});
