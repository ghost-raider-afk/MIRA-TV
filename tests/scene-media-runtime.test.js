import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scene Editor uses first-class Media Library instead of arbitrary asset URLs', async () => {
  const [model, editor, media, html, config] = await Promise.all([
    read('src/web/admin-ui/public/js/scenes/model.js'),
    read('src/web/admin-ui/public/js/scenes/editor.js'),
    read('src/web/admin-ui/public/js/scenes/media-library.js'),
    read('src/web/admin-ui/public/scene-editor.html'),
    read('src/web/admin-ui/public/js/core/config.js')
  ]);

  assert.match(config, /media: '\/api\/media'/);
  assert.match(model, /asset_id: ''/);
  assert.doesNotMatch(model, /asset_url/);
  assert.match(editor, /fetchMediaAssets/);
  assert.match(editor, /uploadMediaAsset/);
  assert.match(editor, /element\.asset_id = asset\.id/);
  assert.match(editor, /slide\.background\.asset_id = asset\.id/);
  assert.match(media, /X-Mira-File-Name/);
  assert.match(media, /image\/jpeg/);
  assert.match(media, /video\/webm/);
  assert.match(html, /id="media-settings"/);
  assert.match(html, /id="slide-background-type"/);
  assert.match(html, /id="slide-background-upload"/);
});

test('Shared Scene Renderer owns image, logo, video and media background rendering', async () => {
  const [renderer, styles, playerRuntime] = await Promise.all([
    read('src/web/admin-ui/public/js/scene-runtime/renderer.js'),
    read('src/web/admin-ui/public/css/scene-renderer.css'),
    read('src/web/admin-ui/public/js/player/published-scene-runtime.js')
  ]);

  assert.match(renderer, /document\.createElement\('img'\)/);
  assert.match(renderer, /document\.createElement\('video'\)/);
  assert.match(renderer, /mediaAsset\(context, element\.asset_id, 'image'\)/);
  assert.match(renderer, /mediaAsset\(context, element\.asset_id, 'video'\)/);
  assert.match(renderer, /createSceneBackgroundNode/);
  assert.match(styles, /\.scene-media-logo \{ object-fit: contain; \}/);
  assert.match(styles, /\.scene-render-background/);
  assert.match(playerRuntime, /mediaAssets: this\.component\?\.media_assets \|\| \[\]/);
  assert.match(playerRuntime, /video\.pause\(\)/);
  assert.match(playerRuntime, /document\.visibilityState !== 'hidden'/);
});

test('Published Scene assets are prepared before LKG activation and cached offline', async () => {
  const [sync, worker] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player-state-sync.js'),
    read('src/web/admin-ui/public/player-sw.js')
  ]);

  assert.match(sync, /function sceneAssetManifest\(context\)/);
  assert.match(sync, /context\?\.scene\?\.media_assets/);
  assert.match(sync, /for \(const asset of sceneAssetManifest\(context\)\)/);
  assert.match(sync, /await fetchCriticalAsset\(asset, 'Critical Published Scene asset'\)/);
  assert.match(sync, /await prepareCriticalAssets\(context, changedNames\);[\s\S]*await applyContext/);
  assert.match(worker, /mira-tv-player-shell-v16-scene4/);
  assert.match(worker, /\(\?:entities\|media\)/);
  assert.match(worker, /ensureActiveAssets/);
});
