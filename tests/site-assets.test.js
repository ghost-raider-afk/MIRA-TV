import assert from 'node:assert/strict';
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { replaceSiteImage } from '../src/services/site-assets-service.js';

function config(root) {
  return {
    siteAssetsRoot: root,
    siteLogoMaxBytes: 1024 * 1024,
    siteFaviconMaxBytes: 512 * 1024,
    screenMaxWidth: 1920,
    screenMaxHeight: 1080,
    imageMaxPixels: 40_000_000
  };
}

async function pngFor(width, height) {
  return sharp({ create: { width, height, channels: 4, background: { r: 20, g: 30, b: 40, alpha: 1 } } }).png().toBuffer();
}

test('failed database update removes only the new site asset and keeps the previous file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'menu-tv-site-assets-'));
  const oldFile = path.join(root, 'site-logo.png');
  await writeFile(oldFile, await pngFor(100, 50));
  const store = {
    async getSiteSettings() { return { logo_filename: 'site-logo.png', favicon_filename: '' }; },
    async setSiteAsset() { throw new Error('database unavailable'); }
  };
  try {
    await assert.rejects(
      replaceSiteImage({ kind: 'logo', bytes: await pngFor(640, 360), config: config(root), store, username: 'admin' }),
      /database unavailable/
    );
    await access(oldFile);
    assert.deepEqual((await readdir(root)).sort(), ['site-logo.png']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('successful site asset update switches to a unique file then removes the previous asset', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'menu-tv-site-assets-'));
  const oldFile = path.join(root, 'site-logo.png');
  await writeFile(oldFile, await pngFor(100, 50));
  let savedFilename = '';
  const store = {
    async getSiteSettings() { return { logo_filename: 'site-logo.png', favicon_filename: '' }; },
    async setSiteAsset(_kind, filename) {
      savedFilename = filename;
      return { id: 1, logo_filename: filename, favicon_filename: '', updated_at: new Date().toISOString() };
    }
  };
  try {
    const result = await replaceSiteImage({ kind: 'logo', bytes: await pngFor(640, 360), config: config(root), store, username: 'admin' });
    assert.equal(result.logo_filename, savedFilename);
    assert.match(savedFilename, /^site-logo-[0-9a-f-]{36}\.png$/i);
    await access(path.join(root, savedFilename));
    await assert.rejects(access(oldFile));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
