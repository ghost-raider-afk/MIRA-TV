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
  assert.match(renderer, /element\.enabled === false \? 'none' : 'block'/);
  assert.doesNotMatch(renderer, /innerHTML/);

  assert.match(preview, /new SceneElementRenderer\(sceneLayer\)/);
  assert.match(preview, /menuLayer\.innerHTML = buildTableSvg/);
  assert.match(preview, /sceneRenderer\.render\(editorState\.scene\)/);
  assert.doesNotMatch(preview, /target\.innerHTML\s*=/);

  assert.match(player, /new SceneElementRenderer\(this\.sceneLayers\.ensure\('scene'/);
  assert.match(player, /this\.sceneElementRenderer\.render\(context\.scene\)/);
});
