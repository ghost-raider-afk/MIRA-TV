import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scene Editor exposes bounded Undo/Redo without versioning server metadata', async () => {
  const [editor, history, html] = await Promise.all([
    read('src/web/admin-ui/public/js/scenes/editor.js'),
    read('src/web/admin-ui/public/js/scenes/history.js'),
    read('src/web/admin-ui/public/scene-editor.html')
  ]);

  assert.match(editor, /createSceneHistory\(\{ limit: 100 \}\)/);
  assert.match(editor, /recordHistory\(`drag:\$\{element\.id\}`\)/);
  assert.match(editor, /recordHistory\(`resize:\$\{element\.id\}`\)/);
  assert.match(editor, /if \(captured\) scheduleAutosave\(\)/);
  assert.match(editor, /event\.shiftKey\) redoScene\(\)/);
  assert.match(editor, /key === 'd'/);
  assert.match(history, /const SERVER_FIELDS = Object\.freeze\(\['server_revision', 'created_at', 'updated_at'\]\)/);
  assert.match(history, /restored\.id = currentScene\.id/);
  assert.match(html, /id="scene-undo"/);
  assert.match(html, /id="scene-redo"/);
  assert.match(html, /id="element-duplicate"/);
});
