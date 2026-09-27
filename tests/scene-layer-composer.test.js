import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Player scene stack has only menu and static scene layers', async () => {
  const source = await read('js/player/scene-layer-composer.js');
  const menu = source.indexOf("id: 'menu'");
  const scene = source.indexOf("id: 'scene'");
  assert.ok(menu >= 0 && scene > menu);
  assert.doesNotMatch(source, /id: 'baked'|id: 'fx'|id: 'content'|id: 'environment'|id: 'entity'/);
  assert.match(source, /layer\.dataset\.sceneLayer = id/);
  assert.match(source, /ensureCore\(\)/);
});

test('layer positioning remains idempotent', async () => {
  const source = await read('js/player/scene-layer-composer.js');
  assert.match(source, /const currentPosition = children\.indexOf\(layer\)/);
  assert.match(source, /if \(!outOfOrder\) return;/);
});
