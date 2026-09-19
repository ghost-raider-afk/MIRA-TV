import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Manager cards and fullscreen share the generic PlayerSceneRenderer', async () => {
  const [manager, player] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/manager.js'),
    read('src/web/admin-ui/public/js/player/player-scene-renderer.js')
  ]);

  assert.match(manager, /const previewRenderers = new Set\(\)/);
  assert.match(manager, /new PlayerSceneRenderer\(stage, \{[\s\S]*?autoplay: false/);
  assert.match(manager, /destroyPreviewRenderers\(\);\s*root\.replaceChildren\(\)/);
  assert.match(manager, /fullscreenRenderer = new PlayerSceneRenderer\(stage/);
  assert.doesNotMatch(manager, /renderAnimationScreenPreview|renderSceneEntity|renderAnnouncementLayer|renderBrandTitleLayer|renderEnvironmentLayer|applySceneVisibility/);

  assert.match(player, /constructor\(stage, \{ weatherEndpoint = '\/api\/device\/weather', autoplay = true \} = \{\}\)/);
  assert.match(player, /new SceneElementRenderer/);
  assert.match(player, /autoplay: this\.autoplay/);
  assert.doesNotMatch(player, /thumbnail: !this\.autoplay|renderSceneEntity|context\.entity/);
});
