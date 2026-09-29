import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const THEME_ASSETS = [
  ['premium','premium-side.svg','premium-background.svg'],
  ['chalk','chalk-side.svg','chalk-background.svg'],
  ['brand-premium','brand-premium-side.svg','brand-premium-background.svg']
];

const ROOT = new URL('../src/web/admin-ui/public/brand/themes/', import.meta.url);

test('approved preset decor assets remain self-contained SVG files', async () => {
  for (const [id,decor] of THEME_ASSETS) {
    const source=await readFile(new URL(decor,ROOT),'utf8');
    assert.match(source,/^<svg\b|<svg\b/,`${id}: decor is not SVG`);
    assert.doesNotMatch(source,/(?:href|xlink:href)\s*=\s*["']https?:\/\//i,`${id}: decor must not load remote linked assets`);
    assert.doesNotMatch(source,/url\(\s*["']?https?:\/\//i,`${id}: decor must not load remote CSS assets`);
    assert.ok(source.length > 500,`${id}: decor asset is unexpectedly empty`);
  }
});

test('approved preset background assets remain self-contained SVG files', async () => {
  for (const [id,,background] of THEME_ASSETS) {
    const source=await readFile(new URL(background,ROOT),'utf8');
    assert.match(source,/^<svg\b|<svg\b/, `${id}: background is not SVG`);
    assert.doesNotMatch(source,/(?:href|xlink:href)\s*=\s*["']https?:\/\//i, `${id}: background must not load remote linked assets`);
    assert.doesNotMatch(source,/url\(\s*["']?https?:\/\//i, `${id}: background must not load remote CSS assets`);
    assert.ok(source.length > 300, `${id}: background asset is unexpectedly empty`);
  }
});
