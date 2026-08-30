import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scene Editor exposes active slide properties instead of an empty inspector', async () => {
  const [html, editor, model, contract] = await Promise.all([
    read('src/web/admin-ui/public/scene-editor.html'),
    read('src/web/admin-ui/public/js/scenes/editor.js'),
    read('src/web/admin-ui/public/js/scenes/model.js'),
    read('src/contracts/scene.js')
  ]);

  for (const id of ['slide-inspector-fields', 'slide-name', 'slide-duration', 'slide-transition', 'slide-duplicate', 'slide-delete']) {
    assert.ok(html.includes(`id="${id}"`), `Scene Editor is missing ${id}`);
  }
  assert.doesNotMatch(html, /id="inspector-empty"/);
  assert.match(editor, /duplicateSlide,/);
  assert.match(editor, /function renderSlideInspector\(\)/);
  assert.match(editor, /function bindSlideInspector\(\)/);
  assert.match(editor, /currentSlide\(\)\.duration_ms = duration/);
  assert.match(editor, /currentSlide\(\)\.transition = value/);
  assert.match(editor, /duplicateSlide\(state\.scene, slide\.id\)/);
  assert.match(editor, /removeSlide\(state\.scene, slide\.id\)/);
  assert.match(editor, /recordHistory\('slide-name'\)/);
  assert.match(model, /export function duplicateSlide/);
  assert.match(contract, /const TRANSITIONS = new Set\(\['none', 'fade', 'slide', 'zoom', 'wipe', 'crossfade'\]\)/);
  assert.match(contract, /duration_ms: integer\(value\.duration_ms \?\? 10000, 'slide\.duration_ms', 1000, 3600000\)/);
});

test('slide name cannot autosave an empty transient value and duration is clamped in UI units', async () => {
  const editor = await read('src/web/admin-ui/public/js/scenes/editor.js');
  assert.match(editor, /if \(!value\.trim\(\) \|\| value === currentSlide\(\)\.name\) return/);
  assert.match(editor, /Math\.min\(3600, Math\.max\(1, Math\.round\(Number\(event\.target\.value\) \|\| 1\)\)\)/);
  assert.match(editor, /const duration = seconds \* 1000/);
  assert.match(editor, /document\.querySelector\('#slide-delete'\)\.disabled = state\.scene\.slides\.length <= 1/);
});
