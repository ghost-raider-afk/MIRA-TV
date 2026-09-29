import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';

const THEME_ASSETS = [
  ['premium','premium-approved-decor.webp','premium-background.svg'],
  ['chalk','chalk-approved-decor.webp','chalk-background.svg'],
  ['brand-premium','brand-premium-approved-decor.webp','brand-premium-background.svg']
];

const ROOT = new URL('../src/web/admin-ui/public/brand/themes/', import.meta.url);

test('approved preset decor assets are valid decodable WebP images', async () => {
  for (const [id,decor] of THEME_ASSETS) {
    const bytes=await readFile(new URL(decor,ROOT));
    assert.ok(bytes.length > 10_000, `${id}: approved decor asset is unexpectedly small`);
    assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF', `${id}: decor is not RIFF/WebP`);
    assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP', `${id}: decor is not WebP`);
    const metadata=await sharp(bytes).metadata();
    assert.equal(metadata.format,'webp', `${id}: sharp cannot decode decor as WebP`);
    assert.ok((metadata.width || 0) >= 240, `${id}: decor width is too small`);
    assert.ok((metadata.height || 0) >= 240, `${id}: decor height is too small`);
  }
});

test('approved preset background assets remain self-contained SVG files', async () => {
  for (const [id,,background] of THEME_ASSETS) {
    const source=await readFile(new URL(background,ROOT),'utf8');
    assert.match(source,/^<svg\b|<svg\b/, `${id}: background is not SVG`);
    assert.doesNotMatch(source,/https?:\/\//i, `${id}: background must not depend on remote assets`);
    assert.ok(source.length > 300, `${id}: background asset is unexpectedly empty`);
  }
});
