import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Player scene layer stack reserves stable coarse layers for scenes', async () => {
  const [source, player, playerCss] = await Promise.all([
    read('js/player/scene-layer-composer.js'),
    read('js/player/player.js'),
    read('css/player.css')
  ]);
  const expected = ['environment', 'menu', 'fx', 'content', 'entity', 'brand', 'announcement'];
  let last = -1;
  for (const id of expected) {
    const index = source.indexOf(`id: '${id}'`);
    assert.ok(index > last, `scene layer ${id} is missing or out of order`);
    last = index;
  }
  assert.match(source, /layer\.dataset\.sceneLayer = id/);
  assert.match(source, /ensureCore\(\)/);
  assert.doesNotMatch(source, /id:\s*'aquarium'/);
  assert.match(player, /renderEnvironmentLayer\(environmentLayer, context\.environment/);
  assert.doesNotMatch(player, /context\.aquarium/);
  assert.match(playerCss, /\.tv-player-environment-layer/);
  assert.doesNotMatch(playerCss, /\.tv-player-aquarium-layer|\.scene-aquarium-layer/);
});

test('Player scene layer positioning is idempotent once the stack order is correct', async () => {
  const source = await read('js/player/scene-layer-composer.js');
  assert.match(source, /const currentPosition = children\.indexOf\(layer\)/);
  assert.match(source, /const outOfOrder = children\.some/);
  assert.match(source, /if \(!outOfOrder\) return;/);
});
