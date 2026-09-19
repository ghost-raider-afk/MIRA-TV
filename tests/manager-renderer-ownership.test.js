import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Manager cards and fullscreen share PlayerSceneRenderer without parallel scene renderers', async () => {
  const [manager, player, entity] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/manager.js'),
    read('src/web/admin-ui/public/js/player/player-scene-renderer.js'),
    read('src/web/admin-ui/public/js/motion/entity-editor.js')
  ]);

  assert.match(manager, /const previewRenderers = new Set\(\)/);
  assert.match(manager, /new PlayerSceneRenderer\(stage, \{[\s\S]*?autoplay: false/);
  assert.match(manager, /destroyPreviewRenderers\(\);\s*root\.replaceChildren\(\)/);
  assert.match(manager, /fullscreenRenderer = new PlayerSceneRenderer\(stage/);
  assert.doesNotMatch(manager, /renderAnimationScreenPreview|renderSceneEntity|renderAnnouncementLayer|renderBrandTitleLayer|renderEnvironmentLayer|applySceneVisibility/);

  assert.match(player, /constructor\(stage, \{ weatherEndpoint = '\/api\/device\/weather', autoplay = true \} = \{\}\)/);
  assert.match(player, /thumbnail: !this\.autoplay/);
  assert.match(player, /autoplay: this\.autoplay/);
  assert.match(entity, /renderSceneEntity\(stage, source, \{ editable = true, thumbnail = false \} = \{\}\)/);
  assert.match(entity, /createEntityMedia\(entity, \{ thumbnail \}\)/);
});
