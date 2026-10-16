import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Player boot layer always covers cached scene content until bootstrap finishes', async () => {
  const css = await readFile(new URL('../src/web/admin-ui/public/css/player.css', import.meta.url), 'utf8');
  assert.match(css, /\.player-root\s*\{[^}]*position:\s*fixed;[^}]*width:\s*var\(--mira-player-viewport-width,[^}]*height:\s*var\(--mira-player-viewport-height,/s);
  assert.match(css, /\.player-boot\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*z-index:\s*100;/s);
});

test('unsupported desktop Player does not render the Android-only label', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/js/player/player.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /MIRA-TV Player — только Android TV/);
  assert.match(source, /!playerInstallSupportedPlatform\(\).*setHidden\(installPlayerButton, true\)/);
});

test('Player shell advances so cached TVs receive the bugfix assets', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/player-sw.js', import.meta.url), 'utf8');
  const retiredVersion = Number(source.match(/^const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v(\d+)';$/m)?.[1]);
  const activeVersion = Number(source.match(/^const SHELL_CACHE = 'mira-tv-player-shell-v(\d+)';$/m)?.[1]);
  assert.ok(Number.isSafeInteger(retiredVersion), 'retired Player shell cache must be versioned');
  assert.ok(Number.isSafeInteger(activeVersion), 'active Player shell cache must be versioned');
  assert.equal(activeVersion, retiredVersion + 1);
});

test('release version stays aligned across app, Player, environment and installer', async () => {
  const [pkg, player, env, installer] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../src/web/admin-ui/public/js/player/player.js', import.meta.url), 'utf8'),
    readFile(new URL('../.env.example', import.meta.url), 'utf8'),
    readFile(new URL('../mira-tv.sh', import.meta.url), 'utf8')
  ]);
  const playerVersion = player.match(/const PLAYER_BUILD_VERSION = '([^']+)'/)?.[1];
  const envVersion = env.match(/^MIRA_TV_VERSION=(.+)$/m)?.[1];
  const installerVersion = installer.match(/^SCRIPT_VERSION="([^"]+)"$/m)?.[1];
  assert.equal(pkg.version, pkg.miraVersion);
  assert.equal(playerVersion, pkg.version);
  assert.equal(envVersion, pkg.version);
  assert.equal(installerVersion, pkg.version);
});

test('failed Player shell activation is retried with bounded backoff only while versions differ', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/js/player/player.js', import.meta.url), 'utf8');
  assert.match(source, /const PLAYER_BUILD_RETRY_MIN_MS = 15_000;/);
  assert.match(source, /const PLAYER_BUILD_RETRY_MAX_MS = 300_000;/);
  assert.match(source, /if \(!updated\) schedulePlayerBuildRetry\(serverVersion\);/);
  assert.match(source, /serverVersion === PLAYER_BUILD_VERSION[\s\S]*clearPlayerBuildRetry\(\);/);
});

test('Player reconciles its build after Last Known Good restore without immediate duplicate update', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/js/player/player.js', import.meta.url), 'utf8');
  const reconcile = source.match(/function reconcilePlayerBuild\([\s\S]*?\n}\n\nasync function bootstrapPlayer/)?.[0] || '';
  assert.match(reconcile, /if \(!changedNames\?\.includes\('runtime'\)\) return;/);
  assert.doesNotMatch(reconcile, /source === 'last-known-good'/);
  assert.match(reconcile, /if \(storedReloadVersion\(\) === serverVersion\) \{\s*schedulePlayerBuildRetry\(serverVersion\);\s*return;\s*\}/s);
  assert.doesNotMatch(reconcile, /storedReloadVersion\(\) === serverVersion[\s\S]{0,120}clearReloadVersion\(\)/);
});

test('table content editor opens only from the explicit inspector action', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/js/pages/scene.js', import.meta.url), 'utf8');
  assert.match(source, /openEditor\.textContent = 'Редактировать содержимое';\s*openEditor\.addEventListener\('click', openTableEditor\);/s);
  assert.match(source, /tableLayer\.addEventListener\('click', \(\) => selectOwner\('table'\)\);/);
  assert.doesNotMatch(source, /shouldOpenEditor/);
});
