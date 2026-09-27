import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  issueRenderUploadToken,
  verifyRenderUploadToken
} from '../src/services/render-agent-package-service.js';
import {
  bakedSceneComponent,
  bakedSceneRuntimeToken
} from '../src/services/baked-scene-service.js';
import { windowsBootstrapCommand } from '../src/services/render-agent-installer-service.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Render Agent upload token is bound to screen, render revision and input hash', () => {
  const config = { sessionSecret: 'render-agent-test-secret-0123456789' };
  const renderPackage = {
    screen: { id: 17 },
    render_revision: 44,
    input_hash: 'a'.repeat(64)
  };
  const token = issueRenderUploadToken(renderPackage, config, 900);
  const decoded = verifyRenderUploadToken(token, config);
  assert.equal(decoded.screen_id, 17);
  assert.equal(decoded.render_revision, 44);
  assert.equal(decoded.input_hash, 'a'.repeat(64));
  assert.equal(verifyRenderUploadToken(token + 'x', config), null);
  assert.equal(verifyRenderUploadToken(token, { sessionSecret:'different-secret-0123456789' }), null);
});

test('Player keeps the last published baked video active while a newer draft is edited', () => {
  const record = {
    source_render_revision: 12,
    input_hash: 'b'.repeat(64),
    active_url: '/site-assets/content/asset-' + 'c'.repeat(64) + '.mp4',
    active_hash: 'c'.repeat(64),
    width: 1920,
    height: 1080,
    fps: 25,
    duration_ms: 12000
  };
  const active = bakedSceneComponent(record, 12);
  assert.equal(active.status, 'ready');
  assert.equal(active.enabled, true);
  assert.equal(active.live_layers[0], 'weather');
  assert.match(bakedSceneRuntimeToken(record, 12), /^ready:/);

  const stale = bakedSceneComponent(record, 13);
  assert.equal(stale.status, 'ready');
  assert.equal(stale.enabled, true);
  assert.equal(stale.stale, true);
  assert.match(bakedSceneRuntimeToken(record, 13), /^ready:/);
});

test('Render Agent architecture never adds server-side Chromium or scene encoding', async () => {
  const [server, packageService, uploadRoutes, dockerfile, docs, agent, surface, editor, sceneHtml] = await Promise.all([
    read('src/server.js'),
    read('src/services/render-agent-package-service.js'),
    read('src/api/render-agent/public-routes.js'),
    read('Dockerfile'),
    read('docs/RENDER-AGENT.md'),
    read('tools/render-agent/agent.js'),
    read('src/web/admin-ui/public/js/render-agent/render-surface.js'),
    read('src/web/admin-ui/public/js/pages/scene.js'),
    read('src/web/admin-ui/public/scene.html')
  ]);

  assert.match(packageService, /withoutWeather/);
  assert.match(packageService, /live_overlays/);
  assert.match(packageService, /codec:\s*'h264'/);
  assert.match(uploadRoutes, /verifyRenderUploadToken/);
  assert.match(uploadRoutes, /buildRenderAgentPackage/);
  assert.match(uploadRoutes, /createSceneAssetStream/);
  assert.match(uploadRoutes, /currentPackage\.input_hash !== token\.input_hash/);
  assert.match(server, /createRenderAgentPublicRouter/);
  assert.doesNotMatch(server, /chromium|ffmpeg.*spawn|sceneVideoRenderService/i);
  assert.doesNotMatch(dockerfile, /chromium/i);
  assert.match(docs, /VPS не запускает Chromium и FFmpeg/);
  assert.match(agent, /127\.0\.0\.1/);
  assert.match(agent, /Page\.captureScreenshot/);
  assert.match(agent, /libx264/);
  assert.match(agent, /renderQueue = renderQueue/);
  assert.match(surface, /new PlayerSceneRenderer/);
  assert.match(surface, /sceneMotionRuntime\.seek/);
  assert.match(editor, /LOCAL_RENDER_AGENT = 'http:\/\/127\.0\.0\.1:41417'/);
  assert.match(editor, /render-package\/reuse/);
  assert.match(sceneHtml, /id="scene-editor-publish"/);
});

test('baked scene persistence keeps ACTIVE and PREVIOUS server references', async () => {
  const [migration, repository, assets] = await Promise.all([
    read('src/db/migrations/baked-scenes.js'),
    read('src/db/baked-scenes.js'),
    read('src/services/content-addressed-assets.js')
  ]);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS screen_baked_scenes/);
  assert.match(migration, /previous_url TEXT NOT NULL DEFAULT ''/);
  assert.match(repository, /activateBakedScene/);
  assert.match(repository, /screen_baked_scenes\.active_url/);
  assert.match(repository, /previous_hash/);
  assert.match(assets, /isBakedSceneAssetReferenced/);
  assert.match(assets, /listBakedSceneAssetReferences/);
});


test('Render Agent browser installer is per-user, self-contained and preserves the single Agent source', async () => {
  const [routes, installer, dockerfile, scene, sceneHtml, sceneCss] = await Promise.all([
    read('src/api/render-agent/public-routes.js'),
    read('tools/render-agent/install-windows.ps1'),
    read('Dockerfile'),
    read('src/web/admin-ui/public/js/pages/scene.js'),
    read('src/web/admin-ui/public/scene.html'),
    read('src/web/admin-ui/public/css/pages/scene-editor.css')
  ]);

  const bootstrap = windowsBootstrapCommand('https://mira.example');
  assert.match(bootstrap, /MIRA-Render-Agent-Setup/);
  assert.match(bootstrap, /https:\/\/mira\.example\/api\/render-agent\/installer\/windows\.ps1/);
  assert.match(routes, /router\.get\('\/installer\/windows'/);
  assert.match(routes, /router\.get\('\/installer\/windows\.ps1'/);
  assert.match(routes, /router\.get\('\/agent\.js'/);
  assert.match(dockerfile, /COPY tools\/render-agent \.\/tools\/render-agent/);
  assert.match(installer, /LOCALAPPDATA.*MIRA-TV\\RenderAgent/);
  assert.match(installer, /latest-v24\.x/);
  assert.match(installer, /SHASUMS256\.txt/);
  assert.match(installer, /ffmpeg-release-essentials\.zip/);
  assert.match(installer, /\.sha256/);
  assert.match(installer, /ws@8\.21\.3/);
  assert.match(installer, /CurrentVersion\\Run/);
  assert.match(installer, /127\.0\.0\.1:41417\/health/);
  assert.doesNotMatch(installer, /-Verb\s+RunAs/i);
  assert.match(sceneHtml, /id="scene-editor-agent-install"/);
  assert.match(sceneHtml, /Установить Render Agent/);
  assert.match(scene, /watchAgentInstallation/);
  assert.match(scene, /refreshLocalAgentState/);
  assert.match(sceneCss, /scene-editor-agent-setup/);
});
