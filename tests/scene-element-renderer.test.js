import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('generic scene elements use keyed DOM ownership and preserve media nodes', async () => {
  const [renderer, preview, player] = await Promise.all([
    read('js/player/scene-element-renderer.js'),
    read('js/editor/preview.js'),
    read('js/player/player-scene-renderer.js')
  ]);

  assert.match(renderer, /this\.entries = new Map\(\)/);
  assert.match(renderer, /this\.entries\.get\(id\)/);
  assert.match(renderer, /if \(entry\.type !== element\.type/);
  assert.match(renderer, /if \(node\.dataset\.sceneSource !== source\)/);
  assert.match(renderer, /video\.pause\(\)/);
  assert.match(renderer, /document\.addEventListener\('visibilitychange'/);
  assert.match(renderer, /activityTarget\?\.addEventListener\('mira:player-active'/);
  assert.match(renderer, /return this\.autoplay && this\.active && this\.sceneVisible && document\.visibilityState !== 'hidden'/);
  assert.match(renderer, /video\.preload = 'metadata'/);
  assert.match(renderer, /mira:scene-playlist-mode/);
  assert.match(renderer, /flow\.dataset\.sceneTextFlow/);
  assert.match(renderer, /span\.style\.display = scaleX === 1 && scaleY === 1 \? 'inline' : 'inline-block'/);
  assert.match(renderer, /element\.enabled === false \? 'none' : 'block'/);
  assert.match(renderer, /element\.type === 'text' \? 'visible' : 'hidden'/);
  assert.match(renderer, /function contentScaleFactor\(element\)/);
  assert.match(renderer, /content_auto_scale === false/);
  assert.match(renderer, /content_scale_percent/);
  assert.match(renderer, /content_reference_width/);
  assert.match(renderer, /content_reference_height/);
  assert.match(renderer, /translate\(-50%, -50%\) scale/);
  assert.match(renderer, /applyContentGeometry\(entry\.content, element, this\.sceneScale\(\)\)/);
  assert.match(renderer, /weatherPreviewEndpoint/);
  assert.match(renderer, /\/api\/weather\/preview/);
  assert.match(renderer, /weatherPreviewFallback/);
  assert.match(renderer, /weatherPreviewStates = new Map/);
  assert.match(renderer, /refreshGeometry\(\)/);
  assert.match(renderer, /--weather-embedded-width/);
  assert.doesNotMatch(renderer, /innerHTML/);

  assert.match(preview, /menuLayer\.innerHTML = buildTableSvg/);
  assert.doesNotMatch(preview, /SceneElementRenderer|sceneRenderer|data-scene-elements-layer|weatherPreview/);
  assert.match(preview, /target\.append\(menuLayer, editorLayer\)/);
  assert.doesNotMatch(preview, /target\.innerHTML\s*=/);

  assert.match(player, /new SceneElementRenderer\(this\.sceneLayers\.ensure\('scene'/);
  assert.match(player, /activityTarget: stage/);
  assert.match(player, /autoplay: this\.autoplay/);
  assert.match(player, /this\.sceneElementRenderer\.render\(context\.scene\)/);
});
