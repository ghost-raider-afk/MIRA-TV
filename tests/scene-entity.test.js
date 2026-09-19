import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DEFAULT_SCENE_ENTITY,
  ENTITY_SCENE_HEIGHT,
  ENTITY_SCENE_WIDTH,
  SCENE_ENTITY_VERSION,
  sceneEntityInput
} from '../src/contracts/scene-entity.js';

const root = new URL('../src/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('scene entity v2 keeps canonical FullHD coordinates and image compatibility', () => {
  assert.equal(SCENE_ENTITY_VERSION, 2);
  assert.equal(ENTITY_SCENE_WIDTH, 1920);
  assert.equal(ENTITY_SCENE_HEIGHT, 1080);
  const entity = sceneEntityInput({
    ...DEFAULT_SCENE_ENTITY,
    asset_url: '/site-assets/entities/entity-123e4567-e89b-42d3-a456-426614174000.webp',
    media_type: 'image/webp',
    width: 560,
    height: 980,
    visible: true,
    transform: { x: 1500, y: 330, width: 320, scale: 1.1, rotation: -3, depth: 12, opacity: 0.92 }
  });
  assert.equal(entity.id, 'beer-glass');
  assert.equal(entity.asset_type, 'image');
  assert.equal(entity.media_type, 'image/webp');
  assert.equal(entity.width, 560);
  assert.equal(entity.height, 980);
  assert.equal(entity.asset_width, 560);
  assert.equal(entity.asset_height, 980);
  assert.equal(entity.visible, true);
  assert.deepEqual(entity.transform, { x: 1500, y: 330, width: 320, scale: 1.1, rotation: -3, depth: 12, opacity: 0.92 });
});

test('scene entity v2 accepts MP4/WebM playback metadata and rejects media mismatches', () => {
  const video = sceneEntityInput({
    id: 'beer-glass', name: 'Видео бокала',
    asset_url: '/site-assets/entities/entity-123e4567-e89b-42d3-a456-426614174000.mp4',
    asset_type: 'video', media_type: 'video/mp4', width: 720, height: 1280, has_alpha: false,
    loop: true, muted: true, playsinline: true, playback_rate: 0.85, visible: true
  });
  assert.equal(video.asset_type, 'video');
  assert.equal(video.media_type, 'video/mp4');
  assert.equal(video.playback_rate, 0.85);
  assert.equal(video.loop, true);
  assert.equal(video.muted, true);
  assert.equal(video.playsinline, true);
  assert.throws(() => sceneEntityInput({ asset_url: video.asset_url, asset_type: 'image', media_type: 'image/png' }), /не соответствует/);
  assert.throws(() => sceneEntityInput({ asset_url: video.asset_url, asset_type: 'video', media_type: 'video/webm' }), /расширению/);
});

test('scene entity rejects foreign assets and invalid transforms', () => {
  assert.throws(() => sceneEntityInput({ asset_url: 'https://example.com/beer.png' }), /недопустимый адрес/);
  assert.throws(() => sceneEntityInput({ transform: { width: 0 } }), /Ширина/);
  assert.throws(() => sceneEntityInput({ transform: { opacity: 2 } }), /Opacity/);
});

test('Video Entity processing uses ffprobe and never a per-frame chroma key', async () => {
  const service = await read('services/entity-assets-service.js');
  assert.match(service, /execFileAsync\('ffprobe'/);
  assert.match(service, /pix_fmt/);
  assert.match(service, /videoHasAlpha/);
  assert.match(service, /format_name/);
  assert.match(service, /videoContainerMatches/);
  assert.match(service, /video\/mp4/);
  assert.match(service, /video\/webm/);
  assert.doesNotMatch(service, /chroma|canvas|getImageData|green.?screen/i);
});

test('generic scene media upload streams to disk with an independent env limit', async () => {
  const [service, routes, config] = await Promise.all([
    read('services/scene-assets-service.js'), read('api/screens/routes.js'), read('config/index.js')
  ]);
  assert.match(service, /createSceneAssetStream/);
  assert.match(service, /for await \(const part of stream\)/);
  assert.match(service, /config\.sceneAssetMaxBytes/);
  assert.match(service, /PayloadTooLargeError/);
  assert.match(routes, /stream:\s*request/);
  assert.match(routes, /contentLength:\s*request\.get\('content-length'\)/);
  assert.match(routes, /\/screens\/:id\/scene-asset/);
  assert.match(config, /SCENE_ASSET_MAX_BYTES/);
  assert.doesNotMatch(service, /entityAssetMaxBytes|screenBackgroundMaxBytes/);
});

test('generic scene media editor replaces the old Entity UI owner', async () => {
  const [html, elements, service, contract] = await Promise.all([
    read('web/admin-ui/public/screen-editor.html'),
    read('web/admin-ui/public/js/editor/elements.js'),
    read('services/scene-assets-service.js'),
    read('contracts/scene.js')
  ]);
  assert.match(html, /id="editor-add-element"/);
  for (const label of ['Картинка','Видео','Логотип']) assert.ok(elements.includes(label));
  assert.match(elements, /video\/mp4,video\/webm/);
  assert.match(elements, /image\/png,image\/jpeg,image\/webp/);
  assert.match(elements, /playback_rate/);
  assert.match(service, /createSceneAssetStream/);
  assert.match(service, /SCENE_DIR = 'scene'/);
  assert.match(contract, /ELEMENT_TYPES = new Set\(\['text', 'weather', 'image', 'video', 'logo'\]\)/);
  assert.doesNotMatch(elements, /animation-entity-/);
});

test('TV player receives, renders and caches generic scene video without JavaScript byte-range copies', async () => {
  const [routes, playerContextService, player, sceneRenderer, elementRenderer, sync, serviceWorker] = await Promise.all([
    read('api/device/public-routes.js'), read('services/player-context-service.js'), read('web/admin-ui/public/js/player/player.js'),
    read('web/admin-ui/public/js/player/player-scene-renderer.js'), read('web/admin-ui/public/js/player/scene-element-renderer.js'),
    read('web/admin-ui/public/js/player/player-state-sync.js'), read('web/admin-ui/public/player-sw.js')
  ]);
  assert.match(routes, /buildPlayerState\(store, session, config, \{ renderRevision: currentRevision \}\)/);
  assert.match(routes, /known\.hashes\.runtime === runtimeHash/);
  assert.match(playerContextService, /scene:\s*draft\.scene/);
  assert.doesNotMatch(playerContextService, /entity:\s*animationSettings/);
  assert.match(player, /new PlayerSceneRenderer\(playerStage\)/);
  assert.match(sceneRenderer, /this\.sceneElementRenderer\.render\(context\.scene\)/);
  assert.match(elementRenderer, /document\.createElement\('video'\)/);
  assert.match(elementRenderer, /video\.playsInline/);
  assert.match(elementRenderer, /playbackRate/);
  assert.match(sync, /element\?\.media\?\.source_url/);
  assert.doesNotMatch(sync, /context\?\.entity/);
  assert.match(sync, /mira:player-active-assets/);
  assert.match(serviceWorker, /async function ensureActiveAssets/);
  assert.match(serviceWorker, /async function syncActiveAssets/);
  assert.match(serviceWorker, /if \(!complete\) return/);
  assert.match(serviceWorker, /async function videoRequest/);
  assert.match(serviceWorker, /const cached = await cache\.match\(fullRequest\);[\s\S]*?return cached;/);
  assert.match(serviceWorker, /request\.headers\.has\('range'\)/);
  assert.doesNotMatch(serviceWorker, /cachedVideoRange|arrayBuffer\s*\(|Content-Range|status:\s*206/);
});
