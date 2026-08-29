import { ValidationError } from '../shared/errors.js';

export const SCENE_TYPES = Object.freeze(['promo', 'content', 'object-story']);
export const SCENE_MODES = Object.freeze(['overlay', 'split', 'fullscreen']);
export const MAX_PLAYLIST_SCENES = 20;

export const DEFAULT_SCENE_PLAYLIST = Object.freeze({
  enabled: false,
  menu_duration_seconds: 40,
  scenes: Object.freeze([])
});

function sourceObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function sceneId(value, index) {
  const text = String(value || '').trim().toLowerCase();
  if (/^[a-z0-9-]{1,64}$/.test(text)) return text;
  return `scene-${index + 1}`;
}

function sceneText(value, max) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function completeScenePlaylist(value = {}) {
  const source = sourceObject(value);
  const scenes = Array.isArray(source.scenes) ? source.scenes.slice(0, MAX_PLAYLIST_SCENES) : [];
  return {
    enabled: source.enabled === true && scenes.length > 0,
    menu_duration_seconds: clamp(source.menu_duration_seconds, DEFAULT_SCENE_PLAYLIST.menu_duration_seconds, 5, 300),
    scenes: scenes.map((item, index) => {
      const scene = sourceObject(item);
      return {
        id: sceneId(scene.id, index),
        type: SCENE_TYPES.includes(scene.type) ? scene.type : 'promo',
        enabled: scene.enabled !== false,
        mode: SCENE_MODES.includes(scene.mode) ? scene.mode : 'overlay',
        duration_seconds: clamp(scene.duration_seconds, 8, 2, 120),
        title: sceneText(scene.title, 100),
        body: sceneText(scene.body, 500)
      };
    })
  };
}

export function scenePlaylistInput(value) {
  if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value))) {
    throw new ValidationError('Scene Playlist должен быть объектом.');
  }

  const source = sourceObject(value);
  if (source.scenes !== undefined && !Array.isArray(source.scenes)) {
    throw new ValidationError('Список сцен Scene Playlist должен быть массивом.');
  }
  if (Array.isArray(source.scenes) && source.scenes.length > MAX_PLAYLIST_SCENES) {
    throw new ValidationError(`Scene Playlist может содержать не более ${MAX_PLAYLIST_SCENES} временных сцен.`);
  }

  for (const [index, item] of (source.scenes || []).entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ValidationError(`Сцена ${index + 1} должна быть объектом.`);
    }
    if (item.type !== undefined && !SCENE_TYPES.includes(item.type)) {
      throw new ValidationError('Scene Playlist содержит неподдерживаемый тип сцены.');
    }
    if (item.mode !== undefined && !SCENE_MODES.includes(item.mode)) {
      throw new ValidationError('Scene Playlist содержит неподдерживаемый режим сцены.');
    }
  }

  const playlist = completeScenePlaylist(source);
  const ids = playlist.scenes.map((scene) => scene.id);
  if (new Set(ids).size !== ids.length) throw new ValidationError('Scene Playlist содержит повторяющиеся идентификаторы сцен.');
  for (const scene of playlist.scenes) {
    if (scene.enabled && !scene.title && !scene.body && scene.type !== 'object-story') {
      throw new ValidationError('У включённой PromoScene/ContentScene должен быть заголовок или текст.');
    }
  }
  return playlist;
}
