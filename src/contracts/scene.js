import { ValidationError } from '../shared/errors.js';
import { requireText } from './input.js';

const ELEMENT_TYPES = new Set(['text', 'table', 'image', 'logo', 'video', 'weather', 'clock', 'shape']);
const MEDIA_ELEMENT_TYPES = new Set(['image', 'logo', 'video']);
const TRANSITIONS = new Set(['none', 'fade', 'slide', 'zoom', 'wipe', 'crossfade']);
const ENTRANCE = new Set(['none', 'fade', 'slide-up', 'scale']);
const LOOP = new Set(['none', 'pulse', 'float']);
const EXIT = new Set(['none', 'fade', 'scale']);
const BACKGROUND_TYPES = new Set(['color', 'image', 'video']);
const TABLE_PRESETS = new Set(['clean', 'glass', 'solid', 'minimal']);
const TABLE_DENSITIES = new Set(['compact', 'comfortable', 'spacious']);
const TABLE_HEADER_STYLES = new Set(['subtle', 'accent', 'solid']);
const TABLE_PRICE_STYLES = new Set(['accent', 'bold', 'plain']);
const FONT_WEIGHTS = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900]);
const TEXT_ALIGNS = new Set(['left', 'center', 'right']);
const VERTICAL_ALIGNS = new Set(['top', 'center', 'bottom']);
const MEDIA_FITS = new Set(['cover', 'contain', 'fill']);
const MEDIA_POSITIONS = new Set(['center', 'top', 'bottom', 'left', 'right']);
const MAX_SLIDES = 50;
const MAX_ELEMENTS_PER_SLIDE = 200;
const DISPLAY_WIDTH = 1920;
const DISPLAY_HEIGHT = 1080;
const MAX_DISPLAYS = 6;

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`Поле «${field}» должно быть объектом.`);
  return value;
}

function integer(value, field, min, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new ValidationError(`Поле «${field}» должно быть целым числом от ${min} до ${max}.`);
  return number;
}

function numeric(value, field, min, max) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new ValidationError(`Поле «${field}» должно быть числом от ${min} до ${max}.`);
  return result;
}

function bool(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function optionalString(value, field, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > max) throw new ValidationError(`Поле «${field}» должно содержать не более ${max} символов.`);
  return value;
}

function enumValue(value, field, allowed, fallback) {
  const result = value ?? fallback;
  if (!allowed.has(result)) throw new ValidationError(`Поле «${field}» содержит неподдерживаемое значение.`);
  return result;
}

function numericEnumValue(value, field, allowed, fallback) {
  const result = Number(value ?? fallback);
  if (!allowed.has(result)) throw new ValidationError(`Поле «${field}» содержит неподдерживаемое значение.`);
  return result;
}

function hexColor(value, field, fallback) {
  const result = optionalString(value ?? fallback, field, 16) || fallback;
  if (!/^#[0-9a-f]{6}$/i.test(result)) throw new ValidationError(`Поле «${field}» должно содержать цвет в формате #RRGGBB.`);
  return result.toLowerCase();
}

function stableId(value, field) {
  const id = requireText(value, field, { max: 120 });
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) throw new ValidationError(`Поле «${field}» содержит недопустимый идентификатор.`);
  return id;
}

function optionalMediaAssetId(value, field) {
  if (value === undefined || value === null || value === '') return '';
  const id = stableId(value, field);
  if (!/^media-[0-9a-f-]{36}$/i.test(id)) throw new ValidationError(`Поле «${field}» содержит некорректный идентификатор медиафайла.`);
  return id;
}

function tableConfig(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const volumes = Array.isArray(source.volumes_l) ? source.volumes_l : [0.5, 1, 1.5];
  if (volumes.length < 1 || volumes.length > 8) throw new ValidationError('Таблица должна содержать от 1 до 8 ценовых объёмов.');
  const normalizedVolumes = [...new Set(volumes.map((item, index) => numeric(item, `table.volumes_l[${index}]`, 0.01, 100)))].sort((a, b) => a - b);
  const appearance = source.appearance && typeof source.appearance === 'object' && !Array.isArray(source.appearance) ? source.appearance : {};
  return {
    active_only: source.active_only !== false,
    row_limit: integer(source.row_limit ?? 12, 'table.row_limit', 1, 50),
    volumes_l: normalizedVolumes,
    show_producer: bool(source.show_producer),
    show_strength: source.show_strength !== false,
    show_color: bool(source.show_color),
    show_filtration: bool(source.show_filtration),
    appearance: {
      preset: enumValue(appearance.preset, 'table.appearance.preset', TABLE_PRESETS, 'clean'),
      density: enumValue(appearance.density, 'table.appearance.density', TABLE_DENSITIES, 'comfortable'),
      header_style: enumValue(appearance.header_style, 'table.appearance.header_style', TABLE_HEADER_STYLES, 'subtle'),
      price_style: enumValue(appearance.price_style, 'table.appearance.price_style', TABLE_PRICE_STYLES, 'accent'),
      accent_color: hexColor(appearance.accent_color, 'table.appearance.accent_color', '#f4c915'),
      show_title: appearance.show_title !== false,
      row_dividers: appearance.row_dividers !== false,
      zebra: bool(appearance.zebra)
    }
  };
}

function weatherConfig(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    location: optionalString(source.location, 'weather.location', 120).trim().replace(/\s+/g, ' ')
  };
}

function mediaConfig(value, type) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    fit: enumValue(source.fit, 'element.media.fit', MEDIA_FITS, type === 'logo' ? 'contain' : 'cover'),
    position: enumValue(source.position, 'element.media.position', MEDIA_POSITIONS, 'center')
  };
}

function elementInput(source, scene, slideIndex, elementIndex, usedIds) {
  const value = object(source, `slides[${slideIndex}].elements[${elementIndex}]`);
  const id = stableId(value.id, 'element.id');
  if (usedIds.has(id)) throw new ValidationError('Идентификаторы элементов внутри сцены должны быть уникальными.');
  usedIds.add(id);
  const type = enumValue(value.type, 'element.type', ELEMENT_TYPES);
  const width = numeric(value.width, 'element.width', 20, scene.canvas_width);
  const height = numeric(value.height, 'element.height', 20, scene.canvas_height);
  const x = numeric(value.x, 'element.x', 0, scene.canvas_width - width);
  const y = numeric(value.y, 'element.y', 0, scene.canvas_height - height);
  const style = value.style && typeof value.style === 'object' && !Array.isArray(value.style) ? value.style : {};
  const effects = value.effects && typeof value.effects === 'object' && !Array.isArray(value.effects) ? value.effects : {};
  const animation = value.animation && typeof value.animation === 'object' && !Array.isArray(value.animation) ? value.animation : {};
  const result = {
    id,
    type,
    x,
    y,
    width,
    height,
    z_index: integer(value.z_index ?? 1, 'element.z_index', 0, 10000),
    opacity: numeric(value.opacity ?? 1, 'element.opacity', 0, 1),
    content: optionalString(value.content, 'element.content', 1000),
    variant: optionalString(value.variant || 'default', 'element.variant', 64) || 'default',
    style: {
      color: optionalString(style.color || '#ffffff', 'element.style.color', 64) || '#ffffff',
      font_size: numeric(style.font_size ?? 40, 'element.style.font_size', 8, 400),
      font_weight: numericEnumValue(style.font_weight, 'element.style.font_weight', FONT_WEIGHTS, 400),
      text_align: enumValue(style.text_align, 'element.style.text_align', TEXT_ALIGNS, 'center'),
      vertical_align: enumValue(style.vertical_align, 'element.style.vertical_align', VERTICAL_ALIGNS, 'center'),
      line_height: numeric(style.line_height ?? 1.06, 'element.style.line_height', 0.5, 3),
      letter_spacing: numeric(style.letter_spacing ?? 0, 'element.style.letter_spacing', -50, 100),
      background: optionalString(style.background || 'transparent', 'element.style.background', 160) || 'transparent',
      radius: numeric(style.radius ?? 0, 'element.style.radius', 0, 500),
      border_width: numeric(style.border_width ?? 0, 'element.style.border_width', 0, 40),
      border_color: optionalString(style.border_color || '#ffffff', 'element.style.border_color', 64) || '#ffffff'
    },
    effects: {
      shadow: bool(effects.shadow),
      glow: bool(effects.glow),
      blur: numeric(effects.blur ?? 0, 'element.effects.blur', 0, 100)
    },
    animation: {
      entrance: enumValue(animation.entrance, 'element.animation.entrance', ENTRANCE, 'none'),
      loop: enumValue(animation.loop, 'element.animation.loop', LOOP, 'none'),
      exit: enumValue(animation.exit, 'element.animation.exit', EXIT, 'none'),
      duration_ms: integer(animation.duration_ms ?? 600, 'element.animation.duration_ms', 0, 60000)
    }
  };
  if (MEDIA_ELEMENT_TYPES.has(type)) {
    result.asset_id = optionalMediaAssetId(value.asset_id, 'element.asset_id');
    result.media = mediaConfig(value.media, type);
  }
  if (type === 'table') {
    const binding = value.data_binding && typeof value.data_binding === 'object' && !Array.isArray(value.data_binding) ? value.data_binding : {};
    if ((binding.source ?? 'catalog_products') !== 'catalog_products') throw new ValidationError('Текущий прототип поддерживает только источник таблицы catalog_products.');
    result.data_binding = { source: 'catalog_products' };
    result.table = tableConfig(value.table);
  }
  if (type === 'weather') result.weather = weatherConfig(value.weather);
  return result;
}

function slideInput(source, scene, index, usedSlideIds, usedElementIds) {
  const value = object(source, `slides[${index}]`);
  const id = stableId(value.id, 'slide.id');
  if (usedSlideIds.has(id)) throw new ValidationError('Идентификаторы слайдов должны быть уникальными.');
  usedSlideIds.add(id);
  const elements = Array.isArray(value.elements) ? value.elements : [];
  if (elements.length > MAX_ELEMENTS_PER_SLIDE) throw new ValidationError(`Один слайд может содержать не более ${MAX_ELEMENTS_PER_SLIDE} элементов.`);
  const background = value.background && typeof value.background === 'object' && !Array.isArray(value.background) ? value.background : {};
  const backgroundType = enumValue(background.type, 'slide.background.type', BACKGROUND_TYPES, 'color');
  return {
    id,
    name: requireText(value.name || `Слайд ${index + 1}`, 'slide.name', { max: 120 }),
    duration_ms: integer(value.duration_ms ?? 10000, 'slide.duration_ms', 1000, 3600000),
    transition: enumValue(value.transition, 'slide.transition', TRANSITIONS, 'fade'),
    background: {
      type: backgroundType,
      color: optionalString(background.color || '#10141c', 'slide.background.color', 64) || '#10141c',
      asset_id: backgroundType === 'color' ? '' : optionalMediaAssetId(background.asset_id, 'slide.background.asset_id')
    },
    elements: elements.map((element, elementIndex) => elementInput(element, scene, index, elementIndex, usedElementIds))
  };
}

export function scenePayloadInput(body) {
  const value = object(body, 'scene');
  const displayCount = integer(value.display_count ?? 1, 'display_count', 1, MAX_DISPLAYS);
  const scene = {
    schema_version: integer(value.schema_version ?? 1, 'schema_version', 1, 1),
    name: requireText(value.name, 'name', { max: 120 }),
    display_count: displayCount,
    display_width: DISPLAY_WIDTH,
    display_height: DISPLAY_HEIGHT,
    canvas_width: displayCount * DISPLAY_WIDTH,
    canvas_height: DISPLAY_HEIGHT,
    slides: [],
    active_slide_id: ''
  };
  if (!Array.isArray(value.slides) || value.slides.length < 1 || value.slides.length > MAX_SLIDES) {
    throw new ValidationError(`Сцена должна содержать от 1 до ${MAX_SLIDES} слайдов.`);
  }
  const usedSlideIds = new Set();
  const usedElementIds = new Set();
  scene.slides = value.slides.map((slide, index) => slideInput(slide, scene, index, usedSlideIds, usedElementIds));
  scene.active_slide_id = stableId(value.active_slide_id || scene.slides[0].id, 'active_slide_id');
  if (!usedSlideIds.has(scene.active_slide_id)) throw new ValidationError('Активный слайд должен существовать внутри сцены.');
  return scene;
}

export function sceneMediaAssetIds(scene) {
  const ids = new Set();
  for (const slide of Array.isArray(scene?.slides) ? scene.slides : []) {
    if (typeof slide?.background?.asset_id === 'string' && slide.background.asset_id) ids.add(slide.background.asset_id);
    for (const element of Array.isArray(slide?.elements) ? slide.elements : []) {
      if (typeof element?.asset_id === 'string' && element.asset_id) ids.add(element.asset_id);
    }
  }
  return [...ids];
}

export function sceneRevision(value) {
  return integer(value, 'server_revision', 1, Number.MAX_SAFE_INTEGER);
}

export function sceneIdParam(value) {
  const id = stableId(value, 'id');
  if (!/^scene-[A-Za-z0-9-]+$/.test(id)) throw new ValidationError('Некорректный идентификатор сцены.');
  return id;
}
