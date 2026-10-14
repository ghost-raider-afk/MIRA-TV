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
