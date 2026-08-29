import { ValidationError } from '../shared/errors.js';

export const ENTITY_SCENE_WIDTH = 1920;
export const ENTITY_SCENE_HEIGHT = 1080;
export const SCENE_ENTITY_VERSION = 2;

const ENTITY_ASSET_URL = /^\/site-assets\/entities\/entity-[0-9a-f-]{36}\.(?:png|webp|mp4|webm)$/i;
const ENTITY_POSTER_URL = /^\/site-assets\/entities\/entity-[0-9a-f-]{36}\.(?:png|webp)$/i;
const ENTITY_ID = /^[a-z0-9-]{1,64}$/;
const MEDIA_TYPES = Object.freeze(['image/png', 'image/webp', 'video/mp4', 'video/webm']);
const ASSET_TYPES = Object.freeze(['image', 'video']);

export const DEFAULT_SCENE_ENTITY = Object.freeze({
  version: SCENE_ENTITY_VERSION,
  id: 'beer-glass',
  name: 'Бокал пива',
  asset_url: '',
  asset_type: 'image',
  media_type: 'image/png',
  width: 0,
  height: 0,
  asset_width: 0,
  asset_height: 0,
  has_alpha: false,
  loop: true,
  muted: true,
  playsinline: true,
  playback_rate: 1,
  poster_url: '',
  visible: false,
  transform: Object.freeze({ x: 1580, y: 420, width: 280, scale: 1, rotation: 0, depth: 10, opacity: 1 })
});

function finiteNumber(value, field, { min, max, fallback }) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new ValidationError(`Поле «${field}» должно быть числом от ${min} до ${max}.`);
  return number;
}

function integer(value, field, options) {
  const number = finiteNumber(value, field, options);
  if (!Number.isInteger(number)) throw new ValidationError(`Поле «${field}» должно быть целым числом.`);
  return number;
}

function bool(value, field, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new ValidationError(`Поле «${field}» должно быть логическим значением.`);
  return value;
}

function oneOf(value, field, allowed, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !allowed.includes(value)) throw new ValidationError(`Поле «${field}» содержит неподдерживаемое значение.`);
  return value;
}

function entityName(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_SCENE_ENTITY.name;
  if (typeof value !== 'string') throw new ValidationError('Название объекта указано неверно.');
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) throw new ValidationError('Название объекта должно содержать от 1 до 80 символов.');
  return trimmed;
}

function safeUrl(value, regex, message) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !regex.test(value)) throw new ValidationError(message);
  return value;
}

function mediaFromUrl(assetUrl) {
  if (!assetUrl) return null;
  if (/\.webm$/i.test(assetUrl)) return { assetType: 'video', mediaType: 'video/webm' };
  if (/\.mp4$/i.test(assetUrl)) return { assetType: 'video', mediaType: 'video/mp4' };
  if (/\.webp$/i.test(assetUrl)) return { assetType: 'image', mediaType: 'image/webp' };
  return { assetType: 'image', mediaType: 'image/png' };
}

function inferredMedia(source, assetUrl) {
  const inferred = mediaFromUrl(assetUrl);
  const assetType = oneOf(source.asset_type, 'asset_type', ASSET_TYPES, inferred?.assetType || DEFAULT_SCENE_ENTITY.asset_type);
  const mediaType = oneOf(source.media_type, 'media_type', MEDIA_TYPES, inferred?.mediaType || DEFAULT_SCENE_ENTITY.media_type);
  if ((assetType === 'video') !== mediaType.startsWith('video/')) throw new ValidationError('Тип Entity не соответствует MIME-типу файла.');
  if (inferred && (assetType !== inferred.assetType || mediaType !== inferred.mediaType)) throw new ValidationError('Тип Entity не соответствует расширению медиафайла.');
  return { assetType, mediaType };
}

export function sceneEntityInput(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const transform = source.transform && typeof source.transform === 'object' && !Array.isArray(source.transform) ? source.transform : {};
  const id = typeof source.id === 'string' ? source.id.trim() : DEFAULT_SCENE_ENTITY.id;
  if (!ENTITY_ID.test(id)) throw new ValidationError('Идентификатор объекта указан неверно.');
  const assetUrl = safeUrl(source.asset_url, ENTITY_ASSET_URL, 'Медиафайл объекта имеет недопустимый адрес.');
  const { assetType, mediaType } = inferredMedia(source, assetUrl);
  const width = integer(source.width ?? source.asset_width, 'width', { min: 0, max: 7680, fallback: 0 });
  const height = integer(source.height ?? source.asset_height, 'height', { min: 0, max: 4320, fallback: 0 });

  return Object.freeze({
    version: SCENE_ENTITY_VERSION,
    id,
    name: entityName(source.name),
    asset_url: assetUrl,
    asset_type: assetType,
    media_type: mediaType,
    width,
    height,
    asset_width: width,
    asset_height: height,
    has_alpha: bool(source.has_alpha, 'has_alpha', false),
    loop: bool(source.loop, 'loop', true),
    muted: bool(source.muted, 'muted', true),
    playsinline: bool(source.playsinline, 'playsinline', true),
    playback_rate: finiteNumber(source.playback_rate, 'playback_rate', { min: 0.25, max: 4, fallback: 1 }),
    poster_url: safeUrl(source.poster_url, ENTITY_POSTER_URL, 'Poster объекта имеет недопустимый адрес.'),
    visible: bool(source.visible, 'visible', DEFAULT_SCENE_ENTITY.visible),
    transform: Object.freeze({
      x: finiteNumber(transform.x, 'X', { min: -ENTITY_SCENE_WIDTH, max: ENTITY_SCENE_WIDTH * 2, fallback: DEFAULT_SCENE_ENTITY.transform.x }),
      y: finiteNumber(transform.y, 'Y', { min: -ENTITY_SCENE_HEIGHT, max: ENTITY_SCENE_HEIGHT * 2, fallback: DEFAULT_SCENE_ENTITY.transform.y }),
      width: finiteNumber(transform.width, 'Ширина', { min: 24, max: ENTITY_SCENE_WIDTH * 2, fallback: DEFAULT_SCENE_ENTITY.transform.width }),
      scale: finiteNumber(transform.scale, 'Масштаб', { min: 0.1, max: 4, fallback: DEFAULT_SCENE_ENTITY.transform.scale }),
      rotation: finiteNumber(transform.rotation, 'Поворот', { min: -180, max: 180, fallback: DEFAULT_SCENE_ENTITY.transform.rotation }),
      depth: integer(transform.depth, 'Глубина Z', { min: -100, max: 100, fallback: DEFAULT_SCENE_ENTITY.transform.depth }),
      opacity: finiteNumber(transform.opacity, 'Opacity', { min: 0, max: 1, fallback: DEFAULT_SCENE_ENTITY.transform.opacity })
    })
  });
}

export function completeSceneEntity(value) {
  try { return sceneEntityInput(value); }
  catch { return sceneEntityInput(DEFAULT_SCENE_ENTITY); }
}
