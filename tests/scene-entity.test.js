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
    id: 'beer-glass',
    name: 'Видео бокала',
    asset_url: '/site-assets/entities/entity-123e4567-e89b-42d3-a456-426614174000.mp4',
    asset_type: 'video',
    media_type: 'video/mp4',
    width: 720,
    height: 1280,
    has_alpha: false,
    loop: true,
    muted: true,
    playsinline: true,
    playback_rate: 0.85,
    visible: true
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

test('Entity media upload streams to disk and has an independent env-controlled size limit', async () => {
  const [service, routes, config] = await Promise.all([
    read('services/entity-assets-service.js'),
    read('api/settings/routes.js'),
    read('config/index.js')
  ]);
  assert.match(service, /replaceEntityAssetStream/);
  assert.match(service, /for await \(const part of stream\)/);
  assert.match(service, /config\.entityAssetMaxBytes/);
  assert.match(service, /PayloadTooLargeError/);
  assert.match(routes, /stream:\s*request/);
  assert.match(routes, /contentLength:\s*request\.get\('content-length'\)/);
  assert.doesNotMatch(routes, /entity-asset',\s*express\.raw/);
  assert.match(config, /ENTITY_ASSET_MAX_BYTES/);
  assert.doesNotMatch(service, /screenBackgroundMaxBytes/);
});

test('Entity Editor renders image or video on a layer independent from menu and background', async () => {
  const [html, page, preview, editor, animationContract, db, migration] = await Promise.all([
    read('web/admin-ui/public/playlist.html'), read('web/admin-ui/public/js/pages/playlist.js'),
    read('web/admin-ui/public/js/motion/screen-preview.js'), read('web/admin-ui/public/js/motion/entity-editor.js'),
    read('contracts/animation.js'), read('db/settings.js'), read('db/migrations/scene-entity.js')
  ]);

  for (const id of ['animation-entity-file','animation-entity-upload','animation-entity-name','animation-entity-visible','animation-entity-x','animation-entity-y','animation-entity-width','animation-entity-loop','animation-entity-muted','animation-entity-playback-rate']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /accept="image\/png,image\/webp,video\/mp4,video\/webm"/);
  assert.match(preview, /data-motion-entity-layer/);
  assert.match(editor, /document\.createElement\('video'\)/);
  assert.match(editor, /video\.playsInline/);
  assert.match(editor, /video\.playbackRate/);
  assert.match(editor, /document\.createElement\('img'\)/);
  assert.match(page, /entity:\s*currentEntity/);
  assert.match(animationContract, /entity:\s*sceneEntityInput\(body\.entity\)/);
  assert.match(db, /entity_json/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS entity_json/);
  assert.doesNotMatch(animationContract, /profile:\s*\{[^}]*entity/s);
});

test('TV player receives, renders and caches Video Entity with offline Range support', async () => {
  const [routes, player, playerCss, serviceWorker] = await Promise.all([
    read('api/device/public-routes.js'), read('web/admin-ui/public/js/player/player.js'),
    read('web/admin-ui/public/css/player.css'), read('web/admin-ui/public/player-sw.js')
  ]);
  assert.match(routes, /store\.getScreenAnimationSettings\(session\.screen_id\)/);
  assert.match(routes, /entity:\s*animationSettings\?\.entity/);
  assert.match(player, /renderSceneEntity\(playerStage, context\.entity, \{ editable: false \}\)/);
  assert.match(player, /context\?\.entity\?\.asset_url/);
  assert.match(playerCss, /\.tv-player-entity-layer/);
  assert.match(serviceWorker, /\/js\/motion\/entity-editor\.js/);
  assert.match(serviceWorker, /cachedVideoRange/);
  assert.match(serviceWorker, /status:\s*206/);
  assert.match(serviceWorker, /Content-Range/);
});
