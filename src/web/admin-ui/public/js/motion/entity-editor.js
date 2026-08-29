export const ENTITY_SCENE = Object.freeze({ width: 1920, height: 1080 });

const DEFAULT_ENTITY = Object.freeze({
  version: 2, id: 'beer-glass', name: 'Бокал пива', asset_url: '', asset_type: 'image', media_type: 'image/png',
  width: 0, height: 0, asset_width: 0, asset_height: 0, has_alpha: false,
  loop: true, muted: true, playsinline: true, playback_rate: 1, poster_url: '', visible: false,
  transform: Object.freeze({ x: 1580, y: 420, width: 280, scale: 1, rotation: 0, depth: 10, opacity: 1 })
});

function finite(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function inferredAssetType(value) { return value?.asset_type === 'video' || /\.(?:mp4|webm)(?:$|\?)/i.test(value?.asset_url || '') ? 'video' : 'image'; }

export function normaliseSceneEntity(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  const transform = value.transform || {};
  const assetType = inferredAssetType(value);
  const width = Math.max(0, Math.round(finite(value.width ?? value.asset_width, 0)));
  const height = Math.max(0, Math.round(finite(value.height ?? value.asset_height, 0)));
  return {
    version: 2,
    id: typeof value.id === 'string' && value.id ? value.id : DEFAULT_ENTITY.id,
    name: typeof value.name === 'string' && value.name ? value.name : DEFAULT_ENTITY.name,
    asset_url: typeof value.asset_url === 'string' ? value.asset_url : '',
    asset_type: assetType,
    media_type: typeof value.media_type === 'string' ? value.media_type : (assetType === 'video' ? 'video/mp4' : 'image/png'),
    width, height, asset_width: width, asset_height: height,
    has_alpha: value.has_alpha === true,
    loop: value.loop !== false,
    muted: value.muted !== false,
    playsinline: value.playsinline !== false,
    playback_rate: Math.min(4, Math.max(0.25, finite(value.playback_rate, 1))),
    poster_url: typeof value.poster_url === 'string' ? value.poster_url : '',
    visible: value.visible === true,
    transform: {
      x: finite(transform.x, DEFAULT_ENTITY.transform.x), y: finite(transform.y, DEFAULT_ENTITY.transform.y),
      width: Math.max(24, finite(transform.width, DEFAULT_ENTITY.transform.width)),
      scale: Math.min(4, Math.max(0.1, finite(transform.scale, DEFAULT_ENTITY.transform.scale))),
      rotation: Math.min(180, Math.max(-180, finite(transform.rotation, DEFAULT_ENTITY.transform.rotation))),
      depth: Math.round(Math.min(100, Math.max(-100, finite(transform.depth, DEFAULT_ENTITY.transform.depth)))),
      opacity: Math.min(1, Math.max(0, finite(transform.opacity, DEFAULT_ENTITY.transform.opacity)))
    }
  };
}

function entityHeight(entity) {
  if (!entity.width || !entity.height) return entity.transform.width;
  return entity.transform.width * (entity.height / entity.width);
}

export function createEntityMedia(entity, { thumbnail = false } = {}) {
  const current = normaliseSceneEntity(entity);
  if (current.asset_type === 'video') {
    const video = document.createElement('video');
    video.src = current.asset_url;
    video.autoplay = !thumbnail;
    video.loop = current.loop;
    video.muted = current.muted;
    video.defaultMuted = current.muted;
    video.playsInline = current.playsinline;
    if (current.playsinline) video.setAttribute('playsinline', '');
    video.preload = thumbnail ? 'metadata' : 'auto';
    if (current.poster_url) video.poster = current.poster_url;
    video.addEventListener('loadedmetadata', () => { video.playbackRate = current.playback_rate; }, { once: true });
    if (!thumbnail) video.play().catch(() => undefined);
    return video;
  }
  const image = document.createElement('img');
  image.src = current.asset_url;
  image.alt = current.name;
  image.draggable = false;
  return image;
}

export function renderSceneEntity(stage, source, { editable = true } = {}) {
  if (!stage) return;
  const layer = stage.querySelector('[data-motion-entity-layer]');
  if (!(layer instanceof HTMLElement)) return;
  const entity = normaliseSceneEntity(source);
  layer.replaceChildren();
  layer.dataset.entitySceneWidth = String(ENTITY_SCENE.width);
  layer.dataset.entitySceneHeight = String(ENTITY_SCENE.height);
  if (!entity.asset_url || !entity.visible) return;

  const object = document.createElement('div');
  object.className = 'animation-scene-entity';
  object.dataset.entityId = entity.id;
  object.dataset.entityDrag = editable ? 'true' : 'false';
  object.style.left = `${(entity.transform.x / ENTITY_SCENE.width) * 100}%`;
  object.style.top = `${(entity.transform.y / ENTITY_SCENE.height) * 100}%`;
  object.style.width = `${(entity.transform.width / ENTITY_SCENE.width) * 100}%`;
  object.style.opacity = String(entity.transform.opacity);
  object.style.zIndex = String(entity.transform.depth + 100);
  object.style.transform = `scale(${entity.transform.scale}) rotate(${entity.transform.rotation}deg)`;

  const motion = document.createElement('div');
  motion.className = 'animation-scene-entity-motion';
  motion.dataset.entityMotion = entity.id;
  const media = createEntityMedia(entity);
  media.classList.add('animation-scene-entity-media');
  motion.append(media);
  object.append(motion);

  if (editable) {
    object.classList.add('is-editable');
    const handle = document.createElement('button');
    handle.type = 'button'; handle.className = 'animation-entity-resize-handle'; handle.dataset.entityResize = 'true';
    handle.setAttribute('aria-label', 'Изменить размер объекта'); object.append(handle);
  }
  object.style.setProperty('--entity-height-ratio', String(entityHeight(entity) / entity.transform.width));
  layer.append(object);
}

export class SceneEntityEditor {
  constructor({ stage, onChange, onCommit }) {
    this.stage = stage;
    this.onChange = onChange;
    this.onCommit = onCommit;
    this.entity = normaliseSceneEntity();
    this.pointer = null;
    this.disposed = false;
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleRouteDispose = () => this.destroy();
    stage?.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('mira:route-dispose', this.handleRouteDispose);
  }
  setEntity(value) { if (this.disposed) return; this.entity = normaliseSceneEntity(value); this.render(); }
  getEntity() { return normaliseSceneEntity(this.entity); }
  update(patch) { if (this.disposed) return; this.entity = normaliseSceneEntity({ ...this.entity, ...patch, transform: { ...this.entity.transform, ...(patch.transform || {}) } }); this.render(); this.onChange?.(this.getEntity()); }
  render() { if (!this.disposed) renderSceneEntity(this.stage, this.entity, { editable: true }); }
  handlePointerDown(event) {
    if (this.disposed) return;
    const resize = event.target.closest?.('[data-entity-resize="true"]'); const drag = event.target.closest?.('[data-entity-drag="true"]');
    if (!resize && !drag) return; const rect = this.stage.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    event.preventDefault(); const target = resize || drag; target.setPointerCapture?.(event.pointerId);
    this.pointer = { pointerId: event.pointerId, mode: resize ? 'resize' : 'drag', startX: event.clientX, startY: event.clientY, scenePerPixelX: ENTITY_SCENE.width / rect.width, scenePerPixelY: ENTITY_SCENE.height / rect.height, entity: this.getEntity() };
    window.addEventListener('pointermove', this.handlePointerMove); window.addEventListener('pointerup', this.handlePointerUp, { once: true }); window.addEventListener('pointercancel', this.handlePointerUp, { once: true });
  }
  handlePointerMove(event) {
    if (!this.pointer || event.pointerId !== this.pointer.pointerId) return;
    const dx = (event.clientX - this.pointer.startX) * this.pointer.scenePerPixelX; const dy = (event.clientY - this.pointer.startY) * this.pointer.scenePerPixelY;
    if (this.pointer.mode === 'resize') { this.update({ transform: { width: Math.max(24, this.pointer.entity.transform.width + dx) } }); return; }
    const height = entityHeight(this.pointer.entity) * this.pointer.entity.transform.scale; const width = this.pointer.entity.transform.width * this.pointer.entity.transform.scale;
    this.update({ transform: { x: Math.min(ENTITY_SCENE.width - Math.min(width, ENTITY_SCENE.width), Math.max(0, this.pointer.entity.transform.x + dx)), y: Math.min(ENTITY_SCENE.height - Math.min(height, ENTITY_SCENE.height), Math.max(0, this.pointer.entity.transform.y + dy)) } });
  }
  handlePointerUp(event) {
    if (!this.pointer || event.pointerId !== this.pointer.pointerId) return; this.pointer = null;
    window.removeEventListener('pointermove', this.handlePointerMove); window.removeEventListener('pointerup', this.handlePointerUp); window.removeEventListener('pointercancel', this.handlePointerUp); this.onCommit?.(this.getEntity());
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('mira:route-dispose', this.handleRouteDispose);
    this.stage?.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    this.pointer = null;
    this.stage = null;
    this.onChange = null;
    this.onCommit = null;
  }
}
