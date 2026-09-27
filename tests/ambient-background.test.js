import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('ambient background stays static and shared across admin surfaces', async () => {
  const [entry, ambient, shell, signin] = await Promise.all([
    read('css/index.css'), read('css/ambient.css'), read('css/shell.css'), read('css/auth/signin.css')
  ]);
  assert.match(entry, /@import url\('\.\/ambient\.css'\)/);
  assert.match(ambient, /\.app-content::before,body\.signin-page::before/);
  assert.match(ambient, /radial-gradient/);
  assert.doesNotMatch(ambient, /@keyframes|animation\s*:|transition\s*:|will-change\s*:/);
  assert.match(shell, /\.app-content\{[^}]*background:var\(--ui-bg\)/);
  assert.match(signin, /body\.signin-page\{[^}]*background:var\(--ui-bg\)/);
});

test('uploaded shell logo is never painted on top of the accent tile', async () => {
  const shell = await read('css/shell.css');
  assert.match(shell, /\.ui-rail-brand \.brand-mark:has\(img\)\{background:transparent;box-shadow:none\}/);
  assert.match(shell, /\.ui-rail-brand \.brand-mark img\{[^}]*padding:0[^}]*object-fit:contain/);
});
