import { createEntityMedia, normaliseSceneEntity } from './entity-editor.js';

const SCENE_TYPES = Object.freeze(['promo', 'content', 'object-story']);
const SCENE_MODES = Object.freeze(['overlay', 'split', 'fullscreen']);

export const DEFAULT_SCENE_PLAYLIST = Object.freeze({ enabled: false, menu_duration_seconds: 40, scenes: Object.freeze([]) });

function sourceObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function ensurePlaylistFxHost(layer) {
  let host = layer.querySelector(':scope > [data-scene-playlist-fx-host]');
  if (!(host instanceof HTMLElement)) {
    host = document.createElement('div');
    host.className = 'scene-playlist-fx-host';
    host.dataset.scenePlaylistFxHost = '';
    layer.append(host);
  }
  return host;
}

function commonStage(menuLayer, contentLayer, fxLayer) {
  const stage = menuLayer?.parentElement;
  return stage instanceof HTMLElement && contentLayer?.parentElement === stage && fxLayer?.parentElement === stage ? stage : null;
}

export function normaliseScenePlaylist(value = {}) {
  const source = sourceObject(value);
  const scenes = Array.isArray(source.scenes) ? source.scenes.slice(0, 20) : [];
  return {
    enabled: source.enabled === true && scenes.length > 0,
    menu_duration_seconds: clamp(source.menu_duration_seconds, 40, 5, 300),
    scenes: scenes.map((item, index) => {
      const scene = sourceObject(item);
      return {
        id: /^[a-z0-9-]{1,64}$/.test(String(scene.id || '')) ? String(scene.id) : `scene-${index + 1}`,
        type: SCENE_TYPES.includes(scene.type) ? scene.type : 'promo',
        enabled: scene.enabled !== false,
        mode: SCENE_MODES.includes(scene.mode) ? scene.mode : 'overlay',
        duration_seconds: clamp(scene.duration_seconds, 8, 2, 120),
        title: String(scene.title || '').trim().slice(0, 100),
        body: String(scene.body || '').trim().slice(0, 500)
      };
    })
  };
}

function playbackSignature(playlist, entity) {
  return JSON.stringify({ playlist, entity: sourceObject(entity) });
}

function typeLabel(type) {
  if (type === 'promo') return 'PROMO SCENE';
  if (type === 'object-story') return 'OBJECT STORY';
  return 'CONTENT SCENE';
}

function entityMedia(entity) {
  const current = normaliseSceneEntity(entity);
  if (!current.asset_url) return null;
  const media = createEntityMedia(current);
  media.setAttribute('aria-hidden', 'true');
  if (media instanceof HTMLImageElement) media.alt = '';
  return media;
}

function buildSceneContent(scene, entity) {
  const root = document.createElement('div');
  root.className = `scene-playlist-content scene-type-${scene.type} scene-mode-${scene.mode}`;
  root.dataset.scenePlaylistId = scene.id;
  root.setAttribute('aria-label', scene.title || typeLabel(scene.type));

  const card = document.createElement('div');
  card.className = 'scene-playlist-card';
  const copy = document.createElement('div');
  copy.className = 'scene-playlist-copy';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'scene-playlist-eyebrow';
  eyebrow.textContent = typeLabel(scene.type);
  copy.append(eyebrow);

  if (scene.title) {
    const title = document.createElement('h1');
    title.className = 'scene-playlist-title';
    title.textContent = scene.title;
    copy.append(title);
  }
  if (scene.body) {
    const body = document.createElement('p');
    body.className = 'scene-playlist-body';
    body.textContent = scene.body;
    copy.append(body);
  }

  if (scene.type === 'object-story') {
    const media = entityMedia(entity);
    if (media) {
      const shell = document.createElement('div');
      shell.className = 'scene-playlist-object-media';
      shell.append(media);
      card.append(shell);
    }
  }
  card.append(copy);
  root.append(card);
  return root;
}

function buildSceneFx(scene) {
  const fx = document.createElement('div');
  fx.className = `scene-playlist-fx scene-type-${scene.type} scene-mode-${scene.mode}`;
  fx.setAttribute('aria-hidden', 'true');
  return fx;
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function animateEntrance(node, mode) {
  if (!(node instanceof Element) || reducedMotion()) return;
  const x = mode === 'split' ? '3.5%' : '0';
  node.animate(
    [{ opacity: 0, transform: `translate3d(${x},2.5%,0) scale(.985)` }, { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }],
    { duration: 520, easing: 'cubic-bezier(.2,.72,.22,1)', fill: 'both' }
  );
}

function animateExit(node, mode) {
  if (!(node instanceof Element) || reducedMotion()) return Promise.resolve();
  const x = mode === 'split' ? '2.5%' : '0';
  const animation = node.animate(
    [{ opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }, { opacity: 0, transform: `translate3d(${x},-1.5%,0) scale(.99)` }],
    { duration: 260, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' }
  );
  return animation.finished.catch(() => undefined);
}

export class ScenePlaylistRuntime {
  constructor() {
    this.timer = null;
    this.generation = 0;
    this.playlist = DEFAULT_SCENE_PLAYLIST;
    this.layers = null;
    this.stage = null;
    this.entity = null;
    this.sceneIndex = 0;
    this.signature = null;
    this.playbackActive = false;
  }

  setFullscreen(fullscreen) {
    if (!(this.stage instanceof HTMLElement)) return;
    if (fullscreen) this.stage.dataset.scenePlaylistFullscreen = 'true';
    else delete this.stage.dataset.scenePlaylistFullscreen;
    this.stage.dispatchEvent(new CustomEvent('mira:scene-playlist-mode', { detail: { fullscreen } }));
  }

  destroy() {
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.playbackActive = false;
    this.showMenu();
    this.layers = null;
    this.stage = null;
    this.entity = null;
    this.signature = null;
  }

  render(value, { menuLayer, contentLayer, fxLayer, entity = null, autoplay = true } = {}) {
    const nextPlaylist = normaliseScenePlaylist(value);
    const nextLayers = { menuLayer, contentLayer, fxLayer };
    const nextSignature = playbackSignature(nextPlaylist, entity);
    const sameLayers = this.layers?.menuLayer === menuLayer
      && this.layers?.contentLayer === contentLayer
      && this.layers?.fxLayer === fxLayer;

    if (autoplay && this.playbackActive && sameLayers && this.signature === nextSignature) {
      this.playlist = nextPlaylist;
      this.entity = entity;
      return this.playlist;
    }

    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.playlist = nextPlaylist;
    this.layers = nextLayers;
    this.stage = commonStage(menuLayer, contentLayer, fxLayer);
    this.entity = entity;
    this.sceneIndex = 0;
    this.signature = nextSignature;
    this.showMenu();
    this.playbackActive = autoplay && this.playlist.enabled && this.activeScenes().length > 0;
    if (!this.playbackActive) return this.playlist;
    this.scheduleMenu(this.playlist.menu_duration_seconds * 1000);
    return this.playlist;
  }

  activeScenes() {
    return this.playlist.scenes.filter((scene) => scene.enabled);
  }

  preview(scene) {
    const value = sourceObject(scene);
    const normalised = normaliseScenePlaylist({ enabled: true, scenes: [value] }).scenes[0];
    if (!normalised || !this.layers) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.playbackActive = false;
    this.showScene(normalised, false);
  }

  resume() {
    if (!this.layers) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.generation += 1;
    this.sceneIndex = 0;
    this.showMenu();
    this.playbackActive = this.playlist.enabled && this.activeScenes().length > 0;
    if (this.playbackActive) this.scheduleMenu(this.playlist.menu_duration_seconds * 1000);
  }

  scheduleMenu(delay) {
    const generation = this.generation;
    this.timer = setTimeout(() => {
      if (generation !== this.generation) return;
      const scenes = this.activeScenes();
      if (!scenes.length) {
        this.playbackActive = false;
        return this.showMenu();
      }
      const scene = scenes[this.sceneIndex % scenes.length];
      this.showScene(scene, true);
    }, Math.max(0, delay));
  }

  async returnToMenu(scene, generation) {
    const { contentLayer, fxLayer } = this.layers || {};
    const fxHost = fxLayer instanceof Element ? fxLayer.querySelector(':scope > [data-scene-playlist-fx-host]') : null;
    await Promise.all([
      animateExit(contentLayer?.firstElementChild, scene.mode),
      animateExit(fxHost?.firstElementChild, scene.mode)
    ]);
    if (generation !== this.generation) return;
    this.sceneIndex += 1;
    this.showMenu();
    this.scheduleMenu(this.playlist.menu_duration_seconds * 1000);
  }

  showScene(scene, scheduleReturn) {
    try {
      const { menuLayer, contentLayer, fxLayer } = this.layers || {};
      if (!(contentLayer instanceof Element) || !(fxLayer instanceof Element)) throw new Error('Scene Playlist layers are unavailable.');
      const fxHost = ensurePlaylistFxHost(fxLayer);
      contentLayer.replaceChildren(buildSceneContent(scene, this.entity));
      fxHost.replaceChildren(buildSceneFx(scene));
      contentLayer.dataset.scenePlaylistMode = scene.mode;
      fxHost.dataset.scenePlaylistMode = scene.mode;
      if (menuLayer instanceof HTMLElement) menuLayer.classList.toggle('scene-menu-suppressed', scene.mode === 'fullscreen');
      this.setFullscreen(scene.mode === 'fullscreen');
      animateEntrance(contentLayer.firstElementChild, scene.mode);
      animateEntrance(fxHost.firstElementChild, scene.mode);
      if (!scheduleReturn) return;
      const generation = this.generation;
      this.timer = setTimeout(() => void this.returnToMenu(scene, generation), scene.duration_seconds * 1000);
    } catch (error) {
      console.error('Scene Playlist could not render scene', error);
      this.sceneIndex += 1;
      this.showMenu();
      if (scheduleReturn) this.scheduleMenu(this.playlist.menu_duration_seconds * 1000);
    }
  }

  showMenu() {
    const { menuLayer, contentLayer, fxLayer } = this.layers || {};
    this.setFullscreen(false);
    if (menuLayer instanceof HTMLElement) menuLayer.classList.remove('scene-menu-suppressed');
    if (contentLayer instanceof Element) {
      contentLayer.replaceChildren();
      delete contentLayer.dataset.scenePlaylistMode;
    }
    if (fxLayer instanceof Element) {
      const fxHost = fxLayer.querySelector(':scope > [data-scene-playlist-fx-host]');
      fxHost?.replaceChildren();
      if (fxHost instanceof HTMLElement) delete fxHost.dataset.scenePlaylistMode;
    }
  }
}
