const LAYERS = Object.freeze([
  Object.freeze({ id: 'environment', className: 'tv-player-environment-layer', attribute: 'data-player-environment-layer' }),
  Object.freeze({ id: 'menu', className: 'tv-player-menu-layer', attribute: 'data-player-menu-layer' }),
  Object.freeze({ id: 'fx', className: 'tv-player-fx-layer', attribute: 'data-player-fx-layer' }),
  Object.freeze({ id: 'content', className: 'tv-player-content-layer', attribute: 'data-player-content-layer' }),
  Object.freeze({ id: 'entity', className: 'tv-player-entity-layer', attribute: 'data-motion-entity-layer' }),
  Object.freeze({ id: 'brand', className: 'tv-player-brand-layer', attribute: 'data-brand-layer' }),
  Object.freeze({ id: 'announcement', className: 'tv-player-announcement-layer', attribute: 'data-announcement-layer' })
]);

const LAYER_BY_ID = new Map(LAYERS.map((layer, index) => [layer.id, Object.freeze({ ...layer, index })]));

function descriptor(id) {
  const value = LAYER_BY_ID.get(id);
  if (!value) throw new TypeError(`Unknown Player scene layer: ${id}`);
  return value;
}

function positionLayer(stage, layer, index) {
  const children = [...stage.children];
  const currentPosition = children.indexOf(layer);
  if (currentPosition >= 0) {
    const outOfOrder = children.some((candidate, candidatePosition) => {
      if (!(candidate instanceof HTMLElement) || candidate === layer) return false;
      const id = candidate.dataset.sceneLayer;
      const entry = id ? LAYER_BY_ID.get(id) : null;
      if (!entry) return false;
      if (entry.index < index) return candidatePosition > currentPosition;
      if (entry.index > index) return candidatePosition < currentPosition;
      return false;
    });
    if (!outOfOrder) return;
  }

  const next = children.find((candidate) => {
    if (!(candidate instanceof HTMLElement) || candidate === layer) return false;
    const id = candidate.dataset.sceneLayer;
    const entry = id ? LAYER_BY_ID.get(id) : null;
    return entry && entry.index > index;
  });
  if (next) stage.insertBefore(layer, next);
  else stage.append(layer);
}

export function ensurePlayerSceneLayer(stage, id, { ariaLabel = '', ariaHidden = false } = {}) {
  if (!(stage instanceof HTMLElement)) throw new TypeError('Player scene layer composer requires an HTMLElement stage.');
  const entry = descriptor(id);
  let layer = stage.querySelector(`[${entry.attribute}]`);
  if (!(layer instanceof HTMLElement)) {
    layer = document.createElement('div');
    layer.setAttribute(entry.attribute, '');
  }
  layer.classList.add(entry.className);
  layer.dataset.sceneLayer = id;
  if (ariaLabel) layer.setAttribute('aria-label', ariaLabel);
  if (ariaHidden) layer.setAttribute('aria-hidden', 'true');
  else if (!ariaLabel) layer.removeAttribute('aria-hidden');
  positionLayer(stage, layer, entry.index);
  return layer;
}

export class PlayerSceneLayerComposer {
  constructor(stage) {
    if (!(stage instanceof HTMLElement)) throw new TypeError('Player scene layer composer requires an HTMLElement stage.');
    this.stage = stage;
  }

  ensure(id, options) {
    return ensurePlayerSceneLayer(this.stage, id, options);
  }

  get(id) {
    const entry = descriptor(id);
    const layer = this.stage.querySelector(`[${entry.attribute}]`);
    return layer instanceof HTMLElement ? layer : null;
  }

  ensureCore() {
    return Object.freeze({
      environment: this.ensure('environment', { ariaLabel: 'Фоновая сцена' }),
      menu: this.ensure('menu', { ariaHidden: true }),
      fx: this.ensure('fx', { ariaHidden: true }),
      content: this.ensure('content', { ariaHidden: true }),
      entity: this.ensure('entity', { ariaHidden: true }),
      brand: this.ensure('brand', { ariaLabel: 'Название бренда' }),
      announcement: this.ensure('announcement', { ariaLabel: 'Объявление' })
    });
  }
}

export const PLAYER_SCENE_LAYER_IDS = Object.freeze(LAYERS.map((layer) => layer.id));
