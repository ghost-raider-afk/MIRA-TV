import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSceneAssetStream } from '../src/services/scene-assets-service.js';
import { createScreenBackground } from '../src/services/screen-background-service.js';
import { deleteContentAsset } from '../src/services/content-addressed-assets.js';
import { menuSettingsInput } from '../src/contracts/menu-settings.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

function config(root) {
  return {
    siteAssetsRoot: root,
    screenBackgroundMaxBytes: 2 * 1024 * 1024,
    sceneAssetMaxBytes: 10 * 1024 * 1024,
    screenMaxWidth: 1920,
    screenMaxHeight: 1080,
    imageMaxPixels: 40_000_000
  };
}

test('background and scene image uploads deduplicate into one global content asset', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mira-content-assets-'));
  try {
    const cfg = config(root);
    const background = await createScreenBackground(PNG, cfg);
    const scene = await createSceneAssetStream({
      stream: Readable.from([PNG]),
      contentLength: PNG.length,
      contentType: 'image/png',
      config: cfg
    });

    assert.match(background.publicUrl, /^\/site-assets\/content\/asset-[0-9a-f]{64}\.png$/);
    assert.equal(scene.source_url, background.publicUrl);
    assert.equal(scene.content_hash, background.contentHash);

    const files = (await readdir(path.join(root, 'content'))).filter((name) => name.startsWith('asset-'));
    assert.equal(files.length, 1);

    const settings = menuSettingsInput({ background_image_url:background.publicUrl }, { allowBackgroundImage:true });
    assert.equal(settings.background_image_url, background.publicUrl);
  } finally {
    await rm(root, { recursive:true, force:true });
  }
});


test('shared content asset is never force-deleted by a failed background save cleanup', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mira-shared-background-'));
  try {
    const cfg = config(root);
    const asset = await createScreenBackground(PNG, cfg);
    const store = { async isContentAssetReferenced(url) { return url === asset.publicUrl; } };

    assert.equal(await deleteContentAsset(asset.publicUrl, { store, config:cfg }), false);
    await access(path.join(root, 'content', path.basename(asset.publicUrl)));

    const routes = await readFile(new URL('../src/api/screens/routes.js', import.meta.url), 'utf8');
    assert.doesNotMatch(routes, /deleteScreenBackground\(asset\.publicUrl, \{ store, config, force: true \}\)/);
  } finally {
    await rm(root, { recursive:true, force:true });
  }
});
