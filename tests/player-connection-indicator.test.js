import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('TV connection warning is a non-blocking top-right icon, not a text banner', async () => {
  const [html, css, player] = await Promise.all([
    read('player.html'), read('css/player.css'), read('js/player/player.js')
  ]);
  const element = html.match(/<div class="player-connection-message[^"]*"[^>]*>[\s\S]*?<\/div>/)?.[0] || '';
  const style = css.match(/\.player-connection-message\s*\{[^}]*\}/)?.[0] || '';

  assert.match(element, /data-player-message role="status" aria-live="polite"/);
  assert.match(element, /<svg[^>]+aria-hidden="true"/);
  assert.match(element, /data-player-message-label/);
  assert.doesNotMatch(element, /Нет связи|Связь с сервером/);
  assert.match(style, /top:\s*8px;/);
  assert.match(style, /right:\s*10px;/);
  assert.match(style, /width:\s*24px;/);
  assert.match(style, /height:\s*24px;/);
  assert.match(style, /pointer-events:\s*none;/);
  assert.doesNotMatch(style, /bottom:|padding:|background:|animation:/);
  assert.match(css, /\.player-connection-message svg\s*\{[^}]*width:\s*20px;[^}]*height:\s*20px;/);
  assert.match(css, /\.player-connection-message-label\s*\{[^}]*clip-path:\s*inset\(50%\)/);
  assert.match(player, /playerMessageLabel\.textContent = message \|\| '';/);
  assert.match(player, /setHidden\(playerMessage, !message\);/);
  assert.doesNotMatch(player, /playerMessage\.textContent\s*=/);
});

test('connection state preserves local-first display and clears the icon on recovery', async () => {
  const player = await read('js/player/player.js');
  assert.match(player, /if \(source === 'last-known-good'\)\s*\{\s*showConnectionMessage\(/);
  assert.match(player, /if \(state === 'online'\)\s*\{[\s\S]*?showConnectionMessage\(''\);/);
  assert.match(player, /if \(state === 'offline'\)\s*\{\s*showConnectionMessage\('Нет связи/);
  assert.match(player, /else if \(state === 'degraded'\)\s*\{\s*showConnectionMessage\('Связь с сервером нестабильна/);
});
