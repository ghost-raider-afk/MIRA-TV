import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Player boot layer always covers cached scene content until bootstrap finishes', async () => {
  const css = await readFile(new URL('../src/web/admin-ui/public/css/player.css', import.meta.url), 'utf8');
  assert.match(css, /\.player-boot\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*z-index:\s*100;/s);
});

test('unsupported desktop Player does not render the Android-only label', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/js/player/player.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /MIRA-TV Player — только Android TV/);
  assert.match(source, /!playerInstallSupportedPlatform\(\).*setHidden\(installPlayerButton, true\)/);
});

test('Player shell advances so cached TVs receive the bugfix assets', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/player-sw.js', import.meta.url), 'utf8');
  assert.match(source, /RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v61'/);
  assert.match(source, /SHELL_CACHE = 'mira-tv-player-shell-v62'/);
});

test('table content editor opens only from the explicit inspector action', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/js/pages/scene.js', import.meta.url), 'utf8');
  assert.match(source, /openEditor\.textContent = 'Редактировать содержимое';\s*openEditor\.addEventListener\('click', openTableEditor\);/s);
  assert.match(source, /tableLayer\.addEventListener\('click', \(\) => selectOwner\('table'\)\);/);
  assert.doesNotMatch(source, /shouldOpenEditor/);
});
