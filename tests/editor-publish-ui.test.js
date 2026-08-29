import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('editor removes delivery tab and keeps save then publish as adjacent actions', async () => {
  const [html, editor, properties] = await Promise.all([
    read('screen-editor.html'),
    read('js/editor/editor.js'),
    read('js/editor/properties.js')
  ]);

  assert.doesNotMatch(html, />Доставка<\/summary>/);
  assert.doesNotMatch(html, /editor-source-file|editor-upload|JPEG вручную/);
  assert.match(html, /id="editor-save"[^>]*>Сохранить<\/button>\s*<button[^>]*id="editor-publish"[^>]*>Опубликовать<\/button>/);
  assert.match(html, /id="editor-sftp-path"/);
  assert.doesNotMatch(editor, /editor-source-file|editor-upload/);
  assert.doesNotMatch(properties, /editor-source-file|editor-upload/);
});
