import { buildDomMotionScene } from '../motion/dom-scene-adapter.js';
import { WaapiMotionDriver } from '../motion/drivers/waapi-driver.js';
import { compileEntityBehaviorProgram } from '../motion/entity-behavior.js';
import { SceneRuntime } from '../motion/scene-runtime.js';

const stage = document.querySelector('[data-player-stage]');
const playerHost = stage?.closest?.('[data-tv-player]');
let runtime = null;
let target = null;
let media = null;
let fullscreenSuppressed = stage?.dataset?.scenePlaylistFullscreen === 'true';
let playerActive = playerHost instanceof HTMLElement && !playerHost.classList.contains('is-hidden');

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function pageVisible() {
  return document.visibilityState !== 'hidden';
}

function publishStageState() {
  if (!(stage instanceof HTMLElement)) return;
  stage.dataset.playerActive = playerActive ? 'true' : 'false';
  stage.dataset.playerPageVisible = pageVisible() ? 'true' : 'false';
}

function motionShouldPlay() {
  return playerActive && !fullscreenSuppressed && pageVisible() && !reducedMotion();
}

function mediaShouldPlay() {
  return playerActive && !fullscreenSuppressed && pageVisible();
}

function syncPlayback() {
  publishStageState();
  if (runtime) {
    if (motionShouldPlay()) runtime.play();
    else runtime.pause();
  }
  if (media instanceof HTMLVideoElement) {
    if (mediaShouldPlay()) void media.play().catch(() => undefined);
    else media.pause();
  }
}

function destroyRuntime() {
  runtime?.destroy();
  runtime = null;
  target = null;
  if (media instanceof HTMLVideoElement) media.pause();
  media = null;
}

function baseEntityLayer() {
  if (!(stage instanceof Element)) return null;
  const layer = stage.querySelector('[data-motion-entity-layer]');
  return layer instanceof HTMLElement ? layer : null;
}

function bindEntityRuntime() {
  const layer = baseEntityLayer();
  const nextTarget = layer?.querySelector('[data-entity-motion="beer-glass"]');
  const nextMedia = layer?.querySelector('.animation-scene-entity-media');

  if (!(nextTarget instanceof Element)) {
    destroyRuntime();
    publishStageState();
    return;
  }

  if (nextTarget === target && runtime) {
    media = nextMedia instanceof HTMLVideoElement ? nextMedia : null;
    syncPlayback();
    return;
  }

  destroyRuntime();
  const scene = buildDomMotionScene(layer);
  runtime = new SceneRuntime({
    root: layer,
    driver: new WaapiMotionDriver(),
    compilers: [compileEntityBehaviorProgram]
  });
  runtime.load({ scene, context: { entity: { visible: true, id: 'beer-glass' } } });
  target = nextTarget;
  media = nextMedia instanceof HTMLVideoElement ? nextMedia : null;
  syncPlayback();
}

function onEntityRendered() {
  bindEntityRuntime();
}

function onPlaylistMode(event) {
  fullscreenSuppressed = event.detail?.fullscreen === true;
  syncPlayback();
}

function onPlayerActivity(event) {
  playerActive = event.detail?.active === true;
  syncPlayback();
}

function onVisibilityChange() {
  syncPlayback();
}

function destroy() {
  if (!(stage instanceof Element)) return destroyRuntime();
  stage.removeEventListener('mira:entity-rendered', onEntityRendered);
  stage.removeEventListener('mira:scene-playlist-mode', onPlaylistMode);
  stage.removeEventListener('mira:player-active', onPlayerActivity);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  destroyRuntime();
}

if (stage instanceof Element) {
  stage.addEventListener('mira:entity-rendered', onEntityRendered);
  stage.addEventListener('mira:scene-playlist-mode', onPlaylistMode);
  stage.addEventListener('mira:player-active', onPlayerActivity);
  document.addEventListener('visibilitychange', onVisibilityChange);
  publishStageState();
  bindEntityRuntime();
}

window.addEventListener('pagehide', destroy, { once: true });
