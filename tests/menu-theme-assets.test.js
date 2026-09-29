import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const THEME_ASSETS = [
  ['premium','premium-approved-decor.webp','premium-background.svg'],
  ['chalk','chalk-approved-decor.webp','chalk-background.svg'],
  ['brand-premium','brand-premium-approved-decor.webp','brand-premium-background.svg']
];

const ROOT = new URL('../src/web/admin-ui/public/brand/themes/', import.meta.url);

test('approved preset decor assets are valid decodable WebP images', async () => {
  for (const [id,decor] of THEME_ASSETS) {
    const bytes=await readFile(new URL(decor,ROOT));
    assert.ok(bytes.length > 512, `${id}: approved decor asset is unexpectedly small`);
    assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF', `${id}: decor is not RIFF/WebP`);
    assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP', `${id}: decor is not WebP`);
    const riffSize=bytes.readUInt32LE(4);
    const chunkSize=bytes.readUInt32LE(16);
    assert.equal(riffSize,bytes.length-8, `${id}: RIFF size does not match the file length`);
    assert.ok(chunkSize <= bytes.length-20, `${id}: WebP payload is truncated`);
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
