import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('player is public while TV connection page remains admin protected', async () => {
  const [server, frontendRoutes, playerHtml, connectHtml] = await Promise.all([
    read('src/server.js'), read('src/web/admin-ui/routes.js'), read('src/web/admin-ui/public/player.html'), read('src/web/admin-ui/public/connect-tv.html')
  ]);
  const protectedPages = frontendRoutes.match(/export const AUTHENTICATED_PAGES = Object\.freeze\(\[[\s\S]*?\]\);/)?.[0] || '';
  assert.match(protectedPages, /path:\s*'\/connect-tv'/);
  assert.match(protectedPages, /path:\s*'\/playlist'/);
  assert.doesNotMatch(protectedPages, /path:\s*'\/player'/);
  assert.match(server, /app\.get\('\/player'/);
  assert.match(server, /app\.use\('\/api\/device', createDevicePublicRouter/);
  assert.match(server, /app\.use\('\/api\/device-admin', createDeviceAdminRouter/);
  assert.match(playerHtml, /data-activation-view/);
  assert.match(playerHtml, /data-tv-player/);
  assert.match(connectHtml, /Сканировать QR-код/);
});

test('real TV player uses one generic scene owner and one offline-first state owner', async () => {
  const [worker, player, sceneRenderer, sync, store, realtimeClient, sceneMotionRuntime, layerComposer, publicRoutes, playerContextService, flatRenderer, weatherRuntime] = await Promise.all([
    read('src/web/admin-ui/public/player-sw.js'),
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/player/player-scene-renderer.js'),
    read('src/web/admin-ui/public/js/player/player-state-sync.js'),
    read('src/web/admin-ui/public/js/player/player-store.js'),
    read('src/web/admin-ui/public/js/player/player-realtime-client.js'),
    read('src/web/admin-ui/public/js/motion/scene-motion-runtime.js'),
    read('src/web/admin-ui/public/js/player/scene-layer-composer.js'),
    read('src/api/device/public-routes.js'),
    read('src/services/player-context-service.js'),
    read('src/web/admin-ui/public/js/player/flat-menu-renderer.js'),
    read('src/web/admin-ui/public/js/player/weather-bootstrap.js')
  ]);

  assert.match(worker, /const SHELL_CACHE = 'mira-tv-player-shell-v32'/);
  assert.match(player, /createPlayerStateSync/);
  assert.match(player, /restoreLastKnownGood\(\)/);
  assert.match(player, /syncNow\('boot'\)/);
  assert.match(store, /const DB_NAME = 'mira-tv-player'/);
  assert.match(store, /const LAST_KNOWN_GOOD_KEY = 'last-known-good'/);
  assert.match(sync, /fetch\('\/api\/device\/player-delta'/);
  assert.match(sync, /'screen', 'menu', 'scene', 'animation', 'scene_playlist', 'runtime'/);
  assert.match(sync, /function enabledSceneMedia\(context\)[\s\S]*?element\?\.enabled !== false[\s\S]*?\['image', 'logo', 'video'\]\.includes/);
  assert.match(sync, /enabledSceneMedia\(context\)\.map\(\(element\) => element\.media\.source_url\)/);
  assert.doesNotMatch(sync, /context\?\.entity|context\?\.brand|context\?\.announcement|context\?\.environment/);
  assert.match(realtimeClient, /new WebSocket\(/);

  assert.match(player, /new PlayerSceneRenderer\(playerStage\)/);
  assert.match(sceneRenderer, /new SceneMotionRuntime\(stage, \{ activityControlled: true \}\)/);
  assert.match(sceneRenderer, /new PlayerWeatherRuntime\(stage/);
  assert.match(sceneRenderer, /new PlayerSceneLayerComposer\(stage\)/);
  assert.match(sceneRenderer, /new SceneElementRenderer\(this\.sceneLayers\.ensure\('scene'/);
  assert.match(sceneRenderer, /this\.sceneElementRenderer\.render\(context\.scene\)/);
  assert.match(sceneRenderer, /this\.weatherRuntime\.setLayer\(weatherElement \? this\.sceneElementRenderer\.contentFor/);
  assert.doesNotMatch(sceneRenderer, /renderEnvironmentLayer|renderSceneEntity|renderBrandTitleLayer|renderAnnouncementLayer|context\.entity|context\.brand|context\.announcement|context\.environment/);

  assert.match(sceneMotionRuntime, /buildDomMotionScene/);
  assert.match(sceneMotionRuntime, /WasmMotionDriver/);
  assert.match(sceneMotionRuntime, /this\.compilers = compilers \|\| DEFAULT_SCENE_COMPILERS/);
  assert.doesNotMatch(sceneMotionRuntime, /compileEntityBehaviorProgram|entityMedia|data-motion-entity-layer/);

  for (const layer of ['menu','fx','content','scene']) assert.match(layerComposer, new RegExp("id: '"+layer+"'"));
  for (const legacy of ['environment','entity','weather','brand','announcement','aquarium']) assert.doesNotMatch(layerComposer, new RegExp("id: '"+legacy+"'"));

  assert.match(publicRoutes, /playerRuntimeHash\(config, currentRevision\)/);
  assert.match(publicRoutes, /router\.post\('\/player-delta'/);
  assert.match(publicRoutes, /router\.get\('\/weather'/);
  assert.match(playerContextService, /PLAYER_STATE_SCHEMA_VERSION = 4/);
  assert.match(playerContextService, /scene:\s*draft\.scene \|\| \{ version: 1, elements: \[\] \}/);
  assert.doesNotMatch(playerContextService, /environment:|entity:|brand:|announcement:|weather:/);
  assert.match(flatRenderer, /layer\.innerHTML = svg/);
  assert.match(weatherRuntime, /export class PlayerWeatherRuntime/);
});
test('shared Player Scene Renderer rerenders only canonical dirty components', async () => {
  const [player, renderer] = await Promise.all([
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/player/player-scene-renderer.js')
  ]);
  assert.match(player, /playerSceneRenderer\.render\(context, changedNames\)/);
  assert.match(renderer, /async render\(context, changedNames = ALL_PLAYER_COMPONENTS\)/);
  assert.match(renderer, /const menuDirty = dirty\.has\('menu'\) \|\| dirty\.has\('screen'\)/);
  assert.match(renderer, /if \(menuDirty\) \{[\s\S]*?this\.flatMenuRenderer\.render/);
  assert.match(renderer, /if \(dirty\.has\('scene'\)\) \{\s*this\.sceneElementRenderer\.render\(context\.scene\)/);
  assert.doesNotMatch(renderer, /dirty\.has\('entity'\)|dirty\.has\('brand'\)|dirty\.has\('announcement'\)|dirty\.has\('environment'\)/);
  assert.doesNotMatch(player, /setInterval\([^)]*refresh|schedulePlayerRefresh|refreshPlayer\(/);
});
test('Player Context has no specialized Entity field', async () => {
  const source = await read('src/services/player-context-service.js');
  assert.match(source, /scene:\s*draft\.scene/);
  assert.doesNotMatch(source, /entity:\s*animationSettings|scene-entity|entity_json/);
});
test('offline player caches generic scene media without JavaScript Range copies', async () => {
  const [worker, sync] = await Promise.all([read('src/web/admin-ui/public/player-sw.js'), read('src/web/admin-ui/public/js/player/player-state-sync.js')]);
  assert.match(sync, /activeAssetManifest/);
  assert.match(sync, /function enabledSceneMedia\(context\)[\s\S]*?element\?\.enabled !== false[\s\S]*?\['image', 'logo', 'video'\]\.includes/);
  assert.match(sync, /enabledSceneMedia\(context\)\.map\(\(element\) => element\.media\.source_url\)/);
  assert.doesNotMatch(sync, /context\?\.entity/);
  assert.match(sync, /mira:player-active-assets/);
  assert.match(sync, /requireAsset\(url, \{ video: element\.type === 'video' \}\)/);
  assert.match(sync, /Range: 'bytes=0-65535'/);
  assert.match(worker, /async function ensureActiveAssets/);
  assert.match(worker, /for \(const href of active\)/);
  assert.match(worker, /fetch\(request, \{ cache: 'force-cache' \}\)/);
  assert.match(worker, /async function syncActiveAssets/);
  assert.match(worker, /if \(!complete\) return/);
  assert.match(worker, /async function cachedAsset/);
  assert.match(worker, /async function videoRequest/);
  assert.match(worker, /const fullRequest = new Request\(request\.url/);
  assert.match(worker, /if \(!request\.headers\.has\('range'\)\) return cached \|\| cachedAsset\(request\)/);
  assert.match(worker, /const ranged = await networkWithTimeout\(request, 8000\)/);
  assert.match(worker, /return cached \|\| Response\.error\(\)/);
  assert.doesNotMatch(worker, /cachedVideoRange|arrayBuffer\s*\(|Content-Range|Partial Content/);
  assert.match(worker, /mp4\|webm/);
});

test('TV network status comes from real Player presence, on-demand ping and in-memory preview', async () => {
  const [realtime, publicRoutes, adminRoutes, player, capture, screens] = await Promise.all([
    read('src/realtime/player-realtime.js'),
    read('src/api/device/public-routes.js'),
    read('src/api/device/admin-routes.js'),
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/player/player-preview-capture.js'),
    read('src/web/admin-ui/public/js/pages/screens.js')
  ]);
  assert.match(realtime, /const screenPreviews = new Map\(\)/);
  assert.match(realtime, /async function pingScreen/);
  assert.match(realtime, /socket\.ping\(payload\)/);
  assert.match(realtime, /function updateScreenPreview/);
  assert.doesNotMatch(realtime, /writeFile|createWriteStream/);
  assert.match(publicRoutes, /router\.post\('\/preview'/);
  assert.match(adminRoutes, /measure_ping/);
  assert.match(adminRoutes, /remote_address/);
  assert.match(adminRoutes, /preview_available/);
  assert.match(player, /publishPlayerPreview/);
  assert.match(capture, /fetch\('\/api\/device\/preview'/);
  assert.match(capture, /blobAsDataUrl\(new Blob\(\[svg\]/);
  assert.doesNotMatch(capture, /URL\.createObjectURL\(new Blob\(\[svg\]/);
  assert.match(screens, /IP-адрес/);
  assert.match(screens, /Последняя связь/);
  assert.match(screens, /Ping/);
  assert.match(screens, /\?measure_ping=1/);
});

test('TV cards keep offline state static and Player preview quality stays bounded', async () => {
  const [css, capture, playerContext] = await Promise.all([
    read('src/web/admin-ui/public/css/pages/screens.css'),
    read('src/web/admin-ui/public/js/player/player-preview-capture.js'),
    read('src/services/player-context-service.js')
  ]);
  assert.match(css, /\.screen-tv-noise\{/);
  assert.doesNotMatch(css, /tv-static|screen-tv-noise[^}]*animation:/);
  assert.match(capture, /const OUTPUT_WIDTH = 720/);
  assert.match(capture, /const OUTPUT_QUALITY = 0\.76/);
  assert.match(capture, /const PREVIEW_ATTEMPTS/);
  assert.match(capture, /frame\.size <= byteLimit/);
  assert.match(playerContext, /preview_max_bytes:\s*config\.tvPreviewMaxBytes/);
});

test('TV identity is persistent and monitor binding is a first-class one-to-one relation', async () => {
  const [migration, repository, routes, player] = await Promise.all([
    read('src/db/migrations/device-bindings.js'), read('src/db/devices.js'), read('src/api/device/public-routes.js'), read('src/web/admin-ui/public/js/player/player.js')
  ]);
  assert.match(migration, /device_key TEXT/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS tv_device_bindings/);
  assert.match(migration, /tv_device_bindings_active_device_unique/);
  assert.match(migration, /tv_device_bindings_active_screen_unique/);
  assert.match(migration, /UPDATE tv_devices SET screen_id = NULL/);
  assert.match(repository, /async function bindDevice/);
  assert.match(repository, /JOIN tv_device_bindings b ON b\.device_id = d\.id AND b\.active = TRUE/);
  assert.match(repository, /UPDATE tv_device_sessions SET revoked_at/);
  assert.match(routes, /deviceKey: persistentDeviceKey\(activation\.device_key\)/);
  assert.match(routes, /tx\.bindDevice/);
  assert.match(player, /DEVICE_KEY_STORAGE_KEY/);
  assert.match(player, /device_key: currentDeviceKey\(\) \|\| undefined/);
  assert.match(player, /rememberDeviceKey/);
});

test('admin connection flow is mobile-first and diagnoses iOS camera/decoder failures', async () => {
  const [navigation, application, page, html, css] = await Promise.all([
    read('src/web/admin-ui/public/js/core/navigation.js'), read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/js/pages/connect-tv.js'), read('src/web/admin-ui/public/connect-tv.html'), read('src/web/admin-ui/public/css/connect-tv.css')
  ]);
  assert.match(navigation, /\['Подключить ТВ', '\/connect-tv'\]/);
  assert.match(application, /case 'connect-tv'/);
  assert.match(page, /selectedLocationId/);
  assert.match(page, /selectedScreenId/);
  assert.match(page, /API\.deviceAuthorize/);
  assert.match(page, /BarcodeDetector/);
  assert.match(page, /window\.jsQR/);
  assert.match(page, /const JS_QR_SRC = '\/vendor\/jsQR\.js'/);
  assert.match(page, /ensureJsQr/);
  assert.match(page, /document\.head\.append\(script\)/);
  assert.match(page, /function bindDom\(\)/);
  assert.match(page, /function releaseDom\(\)/);
  assert.doesNotMatch(page, /const scanButton = document\.querySelector/);
  assert.doesNotMatch(html, /\/vendor\/jsQR\.js/);
  assert.match(page, /window\.isSecureContext/);
  assert.match(page, /facingMode:\s*\{ ideal: 'environment' \}/);
  assert.match(page, /video\.videoWidth/);
  assert.match(page, /requestAnimationFrame/);
  assert.match(page, /NotAllowedError/);
  assert.match(html, /data-scanner role="dialog" aria-modal="true"/);
  assert.match(css, /\.connect-tv-scanner\{[\s\S]*position:fixed;[\s\S]*inset:0/);
});

test('TV activation lifetime is env-driven, defaults to two minutes and rotates automatically', async () => {
  const [env, player, publicRoutes] = await Promise.all([read('.env.example'), read('src/web/admin-ui/public/js/player/player.js'), read('src/api/device/public-routes.js')]);
  assert.match(env, /^DEVICE_ACTIVATION_TTL_MINUTES=2$/m);
  assert.match(publicRoutes, /config\.deviceActivationTtlMinutes \* 60_000/);
  assert.match(publicRoutes, /expires_at: expiresAt/);
  assert.match(player, /Date\.parse\(record\.expires_at\) - Date\.now\(\)/);
  assert.match(player, /createActivation\(\{ automatic: true \}\)/);
  assert.doesNotMatch(player, /120_000|120000/);
});

test('runtime TV device settings are declared in env example', async () => {
  const env = await read('.env.example');
  for (const key of [
    'DEVICE_ACTIVATION_TTL_MINUTES','DEVICE_ACTIVATION_POLL_SECONDS','DEVICE_ACTIVATION_MAX_ATTEMPTS',
    'DEVICE_ACTIVATION_WINDOW_MINUTES','DEVICE_ACTIVATION_LIMITER_MAX_ENTRIES','DEVICE_ACTIVATION_CLEANUP_MINUTES',
    'DEVICE_ACTIVATION_RETENTION_HOURS','DEVICE_SESSION_TTL_DAYS','DEVICE_HEARTBEAT_WRITE_SECONDS',
    'PLAYER_FALLBACK_POLL_SECONDS','PLAYER_LOG_BATCH_SIZE','PLAYER_LOG_LOCAL_MAX_ENTRIES','PLAYER_LOG_LOCAL_MAX_BYTES',
    'PLAYER_METRICS_INTERVAL_SECONDS','PLAYER_METRICS_RETENTION_DAYS','TV_PREVIEW_CAPTURE_SECONDS','TV_PREVIEW_MAX_BYTES'
  ]) assert.match(env, new RegExp(`^${key}=`, 'm'), key);
});
