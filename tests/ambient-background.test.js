import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('premium ambient background is a shared lightweight CSS layer', async () => {
  const [entry, ambient, shell, signin] = await Promise.all([
    read('css/index.css'),
    read('css/ambient.css'),
    read('css/shell.css'),
    read('css/auth/signin.css')
  ]);

  assert.match(entry, /@import url\('\.\/ambient\.css'\)/);
  assert.ok(entry.indexOf('./ambient.css') > entry.indexOf('./base.css'));
  assert.ok(entry.indexOf('./ambient.css') < entry.indexOf('./shell.css'));
  assert.match(ambient, /@keyframes uiAmbientDrift/);
  assert.match(ambient, /animation:uiAmbientDrift 32s ease-in-out infinite alternate/);
  assert.match(ambient, /\.app-content::before,body\.signin-page::before/);
  assert.match(ambient, /will-change:transform,opacity/);
  assert.match(ambient, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(ambient, /animation:none/);
  assert.match(shell, /\.app-content\{[^}]*background:var\(--ui-bg\)/);
  assert.match(signin, /body\.signin-page\{[^}]*background:var\(--ui-bg\)/);
});

test('uploaded shell logo is never painted on top of the accent tile', async () => {
  const shell = await read('css/shell.css');
  assert.match(shell, /\.ui-rail-brand \.brand-mark:has\(img\)\{background:transparent;box-shadow:none\}/);
  assert.match(shell, /\.ui-rail-brand \.brand-mark img\{[^}]*padding:0[^}]*object-fit:contain/);
});
