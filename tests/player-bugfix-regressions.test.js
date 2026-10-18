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

test('Player registers the Offline shell during startup before LKG restore', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/js/player/player.js', import.meta.url), 'utf8');
  const initialise = source.match(/async function initialisePlayer\(\)[\s\S]*?\n}\n\nvoid initialisePlayer/)?.[0] || '';
  assert.match(source, /navigator\.serviceWorker\.register\('\/player-sw\.js', \{ scope: '\/player' \}\)/);
  assert.doesNotMatch(source, /player-sw\.js\?v=|updateViaCache/);
  assert.match(initialise, /void registerOfflinePlayer\(\);\s*const restored = await playerStateSync\.restoreLastKnownGood\(\);/s);
  assert.match(initialise, /playerStateSync\.note\('player\.boot', \{ restored, build:PLAYER_BUILD_VERSION \}\);/);
});

test('Player shell activation is not blocked by optional theme or font assets', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/player-sw.js', import.meta.url), 'utf8');
  assert.match(source, /const CORE_SHELL_ASSETS = \[/);
  assert.match(source, /const OPTIONAL_SHELL_ASSETS = \[/);
  assert.match(source, /CORE_SHELL_ASSETS\.map\(\(path\) => cacheShellAsset\(cache, path, true\)\)/);
  assert.match(source, /OPTIONAL_SHELL_ASSETS\.map\(\(path\) => cacheShellAsset\(cache, path, false\)\)/);
  assert.match(source, /if \(required\) throw error;/);
  assert.doesNotMatch(source, /cache\.addAll\(SHELL_ASSETS\)/);
});

test('TV snapshot remains fresh when one visual asset cannot be inlined', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/js/player/player-preview-capture.js', import.meta.url), 'utf8');
  assert.match(source, /await inlineStaticAssets\(stage, clone\);/);
  assert.doesNotMatch(source, /if \(!await inlineStaticAssets\(stage, clone\)\) return null;/);
});

test('TV snapshot waits for the rendered frame and coalesces rapid requests', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/js/player/player-background-services.js', import.meta.url), 'utf8');
  assert.match(source, /const PREVIEW_SETTLE_MS = 1500;/);
  assert.match(source, /function schedulePreview\(\)[\s\S]*clearPreviewTimer\(\);[\s\S]*setTimeout\([\s\S]*PREVIEW_SETTLE_MS\);/);
  assert.match(source, /function requestPreview\(\) \{\s*previewQueued = true;\s*schedulePreview\(\);\s*\}/s);
  assert.doesNotMatch(source, /function requestPreview\(\) \{[\s\S]{0,120}publishPreview\(\)/);
  assert.match(source, /finally \{\s*previewInFlight = false;\s*if \(previewQueued\) schedulePreview\(\);\s*\}/s);
});

test('TV Player makes one compatible fullscreen attempt when the rendered Player becomes active', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/js/player/player-fullscreen.js', import.meta.url), 'utf8');
  assert.match(source, /let automaticAttempted = false;/);
  assert.match(source, /function requestFullscreenCompat\(\)[\s\S]*request\.call\(root\)/s);
  assert.doesNotMatch(source, /request\.call\(root,\s*\{\s*navigationUI:/);
  assert.match(source, /function tryAutomaticFullscreen\(\)[\s\S]*automaticAttempted = true;[\s\S]*requestFullscreenCompat\(\)/s);
  assert.match(source, /mira:player-active[\s\S]*tryAutomaticFullscreen\(\);[\s\S]*reportRuntimeState\(\);/s);
  assert.match(source, /else \{\s*armGesture\(\);\s*showFullscreenHint\(\);\s*\}/s);
});

test('offline boot never deletes the last working shell after an interrupted startup', async () => {
  const [boot, shell, sync] = await Promise.all([
    readFile(new URL('../src/web/admin-ui/public/js/player/player-boot.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/web/admin-ui/public/player-sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/web/admin-ui/public/js/player/player-state-sync.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(boot, /caches\.delete|registration\.unregister/);
  assert.doesNotMatch(shell, /client\.navigate\(/);
  assert.match(shell, /older\[0\]/);
  assert.match(sync, /function scheduleSyncRetry\(\)/);
  assert.match(sync, /if \(result\.revoked\)/);
  assert.doesNotMatch(sync, /await clearLastKnownGood\(\)\.catch\(\(\) => undefined\);\s*await clearAssetManifests/);
});

test('confirmed administrative unbind clears the Player but generic 401 retains LKG', async () => {
  const [player, sync, routes, realtime] = await Promise.all([
    readFile(new URL('../src/web/admin-ui/public/js/player/player.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/web/admin-ui/public/js/player/player-state-sync.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/api/device/public-routes.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/realtime/player-realtime.js', import.meta.url), 'utf8')
  ]);
  assert.match(player, /async function playerRevoked\(\)/);
  assert.match(player, /await purgePlayerStore\(\)/);
  assert.match(player, /caches\.delete\(name\)/);
  assert.match(sync, /revoked: response\.headers\.get\('x-mira-device-revoked'\) === '1'/);
  assert.match(routes, /X-MIRA-Device-Revoked/);
  assert.match(realtime, /type:'device\.revoked'/);
});
