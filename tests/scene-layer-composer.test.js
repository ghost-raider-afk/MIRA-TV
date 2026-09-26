import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Player scene layer stack contains only canonical generic layers', async () => {
  const [source, player, sceneRenderer] = await Promise.all([
    read('js/player/scene-layer-composer.js'),
    read('js/player/player.js'),
    read('js/player/player-scene-renderer.js')
  ]);
  const expected = ['baked', 'menu', 'fx', 'content', 'scene'];
  let last = -1;
  for (const id of expected) {
    const index = source.indexOf(`id: '${id}'`);
    assert.ok(index > last, `scene layer ${id} is missing or out of order`);
    last = index;
  }
  for (const legacy of ['environment','entity','weather','brand','announcement','aquarium']) {
    assert.doesNotMatch(source, new RegExp(`id: '${legacy}'`));
  }
  assert.match(source, /layer\.dataset\.sceneLayer = id/);
  assert.match(source, /ensureCore\(\)/);
  assert.match(player, /new PlayerSceneRenderer\(playerStage\)/);
  assert.match(sceneRenderer, /sceneElementRenderer\.render\(bakedActive \? weatherOnlyScene\(context\.scene\) : context\.scene\)/);
  assert.match(sceneRenderer, /SceneVideoRuntime/);
  assert.doesNotMatch(sceneRenderer, /renderEnvironmentLayer|renderSceneEntity|renderBrandTitleLayer|renderAnnouncementLayer/);
});

test('Player scene layer positioning is idempotent once the stack order is correct', async () => {
  const source = await read('js/player/scene-layer-composer.js');
  assert.match(source, /const currentPosition = children\.indexOf\(layer\)/);
  assert.match(source, /const outOfOrder = children\.some/);
  assert.match(source, /if \(!outOfOrder\) return;/);
});
