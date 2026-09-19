import { ValidationError } from '../shared/errors.js';

const SCENE_VERSION = 1;
const MAX_ELEMENTS = 64;
const MAX_RUNS = 128;
const MAX_TEXT_LENGTH = 12000;
const MAX_GRADIENT_STOPS = 8;
const HEX = /^#[0-9a-f]{6}$/i;
const ELEMENT_TYPES = new Set(['text', 'weather', 'image', 'video', 'logo']);
const FONT_FAMILIES = new Set([
  'arial-narrow',
  'tahoma-bold',
  'arial',
  'dejavu-condensed',
  'liberation-narrow',
  'system-sans'
]);
const TEXT_TRANSFORMS = new Set(['none', 'uppercase', 'lowercase']);
const HORIZONTAL_ALIGNMENTS = new Set(['left', 'center', 'right']);
const VERTICAL_ALIGNMENTS = new Set(['top', 'center', 'bottom']);
const MEDIA_FITS = new Set(['contain', 'cover', 'fill']);
const WEATHER_MODES = new Set(['current', 'current-and-forecast']);

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requiredId(value, index) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 120) {
    throw new ValidationError(`Элемент сцены №${index + 1} должен иметь стабильный id длиной до 120 символов.`);
  }
  return value;
}

function integer(value, field, fallback, minimum, maximum) {
  if (value === undefined || value === null || value === '') return fallback;
  const source = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^-?\d+$/.test(source)) throw new ValidationError(`Поле «${field}» должно быть целым числом.`);
  const number = Number(source);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new ValidationError(`Поле «${field}» должно быть от ${minimum} до ${maximum}.`);
  }
  return number;
}

function number(value, field, fallback, minimum, maximum) {
  if (value === undefined || value === null || value === '') return fallback;
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum) {
    throw new ValidationError(`Поле «${field}» должно быть от ${minimum} до ${maximum}.`);
  }
  return result;
}

function color(value, field, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !HEX.test(value)) throw new ValidationError(`Поле «${field}» должно быть цветом #RRGGBB.`);
  return value.toUpperCase();
}

function enumValue(value, field, allowed, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !allowed.has(value)) throw new ValidationError(`Поле «${field}» содержит неподдерживаемое значение.`);
  return value;
}

function assetUrl(value, field) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/site-assets/') || value.includes('..')) {
    throw new ValidationError(`Поле «${field}» должно ссылаться на внутренний ресурс /site-assets/.`);
  }
  return value;
}

function gradientStops(value) {
  const source = Array.isArray(value) && value.length > 0
    ? value
    : [{ offset_percent: 0, color: '#FFFFFF', opacity: 1 }, { offset_percent: 100, color: '#FFFFFF', opacity: 1 }];
  if (source.length > MAX_GRADIENT_STOPS) throw new ValidationError(`Градиент может содержать не более ${MAX_GRADIENT_STOPS} точек.`);
  return source.map((stop, index) => {
    const current = record(stop);
    return {
      offset_percent: number(current.offset_percent, `gradient.stops[${index}].offset_percent`, index === 0 ? 0 : 100, 0, 100),
      color: color(current.color, `gradient.stops[${index}].color`, '#FFFFFF'),
      opacity: number(current.opacity, `gradient.stops[${index}].opacity`, 1, 0, 1)
    };
  });
}

function effectsInput(value) {
  const source = record(value);
  const fill = record(source.fill);
  const stroke = record(source.stroke);
  const shadow = record(source.shadow);
  const glow = record(source.glow);
  const mode = enumValue(fill.mode, 'effects.fill.mode', new Set(['solid', 'linear-gradient']), 'solid');
  return {
    fill: {
      enabled: fill.enabled !== false,
      mode,
      color: color(fill.color, 'effects.fill.color', '#FFFFFF'),
      opacity: number(fill.opacity, 'effects.fill.opacity', 1, 0, 1),
      ...(mode === 'linear-gradient' ? {
        gradient: {
          angle_deg: number(record(fill.gradient).angle_deg, 'effects.fill.gradient.angle_deg', 0, -360, 360),
          stops: gradientStops(record(fill.gradient).stops)
        }
      } : {})
    },
    stroke: {
      enabled: stroke.enabled === true,
      width_px: number(stroke.width_px, 'effects.stroke.width_px', 1, 0, 64),
      color: color(stroke.color, 'effects.stroke.color', '#000000'),
      opacity: number(stroke.opacity, 'effects.stroke.opacity', 1, 0, 1)
    },
    shadow: {
      enabled: shadow.enabled === true,
      offset_x_px: number(shadow.offset_x_px, 'effects.shadow.offset_x_px', 0, -500, 500),
      offset_y_px: number(shadow.offset_y_px, 'effects.shadow.offset_y_px', 0, -500, 500),
      blur_px: number(shadow.blur_px, 'effects.shadow.blur_px', 0, 0, 256),
      color: color(shadow.color, 'effects.shadow.color', '#000000'),
      opacity: number(shadow.opacity, 'effects.shadow.opacity', 0.5, 0, 1)
    },
    glow: {
      enabled: glow.enabled === true,
      blur_px: number(glow.blur_px, 'effects.glow.blur_px', 0, 0, 256),
      spread_px: number(glow.spread_px, 'effects.glow.spread_px', 0, 0, 128),
      color: color(glow.color, 'effects.glow.color', '#FFFFFF'),
      opacity: number(glow.opacity, 'effects.glow.opacity', 0.5, 0, 1)
    }
  };
}

function textRunInput(value, index) {
  const source = record(value);
  const text = source.value === undefined || source.value === null ? '' : String(source.value);
  if (text.length > MAX_TEXT_LENGTH) throw new ValidationError(`Фрагмент текста №${index + 1} слишком длинный.`);
  return {
    value: text,
    font_family: enumValue(source.font_family, `text.runs[${index}].font_family`, FONT_FAMILIES, 'system-sans'),
    font_size_px: number(source.font_size_px, `text.runs[${index}].font_size_px`, 64, 6, 512),
    font_weight: integer(source.font_weight, `text.runs[${index}].font_weight`, 400, 100, 900),
    italic: source.italic === true,
    color: color(source.color, `text.runs[${index}].color`, '#FFFFFF'),
    opacity: number(source.opacity, `text.runs[${index}].opacity`, 1, 0, 1),
    tracking_px: number(source.tracking_px, `text.runs[${index}].tracking_px`, 0, -20, 100),
    leading_percent: number(source.leading_percent, `text.runs[${index}].leading_percent`, 120, 50, 400),
    horizontal_scale_percent: number(source.horizontal_scale_percent, `text.runs[${index}].horizontal_scale_percent`, 100, 10, 400),
    vertical_scale_percent: number(source.vertical_scale_percent, `text.runs[${index}].vertical_scale_percent`, 100, 10, 400),
    baseline_shift_px: number(source.baseline_shift_px, `text.runs[${index}].baseline_shift_px`, 0, -500, 500),
    text_transform: enumValue(source.text_transform, `text.runs[${index}].text_transform`, TEXT_TRANSFORMS, 'none')
  };
}

function textInput(value) {
  const source = record(value);
  const runsSource = Array.isArray(source.runs) && source.runs.length > 0 ? source.runs : [{ value: '' }];
  if (runsSource.length > MAX_RUNS) throw new ValidationError(`Текстовое поле может содержать не более ${MAX_RUNS} форматированных фрагментов.`);
  const runs = runsSource.map(textRunInput);
  const totalLength = runs.reduce((sum, run) => sum + run.value.length, 0);
  if (totalLength > MAX_TEXT_LENGTH) throw new ValidationError(`Текстовое поле может содержать не более ${MAX_TEXT_LENGTH} символов.`);
  const paragraph = record(source.paragraph);
  return {
    runs,
    paragraph: {
      align: enumValue(paragraph.align, 'text.paragraph.align', HORIZONTAL_ALIGNMENTS, 'left'),
      vertical_align: enumValue(paragraph.vertical_align, 'text.paragraph.vertical_align', VERTICAL_ALIGNMENTS, 'top'),
      wrap: paragraph.wrap !== false
    },
    effects: effectsInput(source.effects)
  };
}

function mediaInput(value, { video = false } = {}) {
  const source = record(value);
  const base = {
    source_url: assetUrl(source.source_url, 'media.source_url'),
    fit: enumValue(source.fit, 'media.fit', MEDIA_FITS, 'contain'),
    position_x_percent: number(source.position_x_percent, 'media.position_x_percent', 50, 0, 100),
    position_y_percent: number(source.position_y_percent, 'media.position_y_percent', 50, 0, 100)
  };
  if (!video) return base;
  return {
    ...base,
    loop: source.loop !== false,
    muted: source.muted !== false,
    playback_rate: number(source.playback_rate, 'media.playback_rate', 1, 0.25, 4)
  };
}

function shortText(value, field, fallback = '', maximum = 120) {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  if (text.length > maximum) throw new ValidationError(`Поле «${field}» слишком длинное.`);
  return text;
}

function weatherTimezone(value) {
  const text = shortText(value, 'weather.timezone', 'auto', 64) || 'auto';
  if (text === 'auto' || /^[A-Za-z0-9_+\\-/]{1,64}$/.test(text)) return text;
  throw new ValidationError('Поле «weather.timezone» содержит недопустимый часовой пояс.');
}

function weatherInput(value) {
  const source = record(value);
  return {
    mode: enumValue(source.mode, 'weather.mode', WEATHER_MODES, 'current-and-forecast'),
    location_name: shortText(source.location_name, 'weather.location_name', '', 120),
    latitude: number(source.latitude, 'weather.latitude', null, -90, 90),
    longitude: number(source.longitude, 'weather.longitude', null, -180, 180),
    timezone: weatherTimezone(source.timezone),
    refresh_minutes: integer(source.refresh_minutes, 'weather.refresh_minutes', 15, 5, 120),
    show_location: source.show_location !== false,
    show_condition: source.show_condition !== false,
    show_feels_like: source.show_feels_like !== false,
    show_humidity: source.show_humidity !== false,
    show_wind: source.show_wind !== false,
    show_forecast: source.show_forecast !== false,
    forecast_items: integer(source.forecast_items, 'weather.forecast_items', 3, 1, 6),
    animation_enabled: source.animation_enabled !== false,
    animation_speed: number(source.animation_speed, 'weather.animation_speed', 1, 0.25, 2),
    animation_intensity: number(source.animation_intensity, 'weather.animation_intensity', 1, 0.25, 2),
    widget_motion_enabled: source.widget_motion_enabled !== false
  };
}

function elementInput(value, index, options) {
  const source = record(value);
  const type = enumValue(source.type, `elements[${index}].type`, ELEMENT_TYPES, null);
  if (!type) throw new ValidationError(`Элемент сцены №${index + 1} должен иметь поддерживаемый type.`);
  const x = integer(source.x, `elements[${index}].x`, 0, 0, Math.max(0, options.maxWidth - 1));
  const y = integer(source.y, `elements[${index}].y`, 0, 0, Math.max(0, options.maxHeight - 1));
  const width = integer(source.width, `elements[${index}].width`, Math.min(640, options.maxWidth), 1, options.maxWidth);
  const height = integer(source.height, `elements[${index}].height`, Math.min(360, options.maxHeight), 1, options.maxHeight);
  if (x + width > options.maxWidth) throw new ValidationError(`Элемент сцены №${index + 1} выходит за правую границу ${options.maxWidth}px.`);
  if (y + height > options.maxHeight) throw new ValidationError(`Элемент сцены №${index + 1} выходит за нижнюю границу ${options.maxHeight}px.`);

  const common = {
    id: requiredId(source.id, index),
    enabled: source.enabled !== false,
    type,
    x,
    y,
    width,
    height,
    z_index: integer(source.z_index, `elements[${index}].z_index`, index, -1000, 1000),
    opacity: number(source.opacity, `elements[${index}].opacity`, 1, 0, 1),
    rotation_deg: number(source.rotation_deg, `elements[${index}].rotation_deg`, 0, -360, 360)
  };

  if (type === 'text') return { ...common, text: textInput(source.text) };
  if (type === 'weather') return { ...common, weather: weatherInput(source.weather) };
  if (type === 'video') return { ...common, media: mediaInput(source.media, { video: true }) };
  return { ...common, media: mediaInput(source.media) };
}

export function sceneInput(value, { maxWidth = 1920, maxHeight = 1080 } = {}) {
  const source = record(value);
  if (source.version !== undefined && Number(source.version) !== SCENE_VERSION) {
    throw new ValidationError(`Версия сцены не поддерживается. Ожидается version=${SCENE_VERSION}.`);
  }
  const elementsSource = source.elements === undefined ? [] : source.elements;
  if (!Array.isArray(elementsSource)) throw new ValidationError('scene.elements должен быть списком.');
  if (elementsSource.length > MAX_ELEMENTS) throw new ValidationError(`Сцена может содержать не более ${MAX_ELEMENTS} элементов.`);

  const elements = elementsSource.map((element, index) => elementInput(element, index, { maxWidth, maxHeight }));
  const ids = new Set();
  for (const element of elements) {
    if (ids.has(element.id)) throw new ValidationError('Идентификаторы элементов сцены должны быть уникальными.');
    ids.add(element.id);
  }
  return Object.freeze({ version: SCENE_VERSION, elements });
}

export const SCENE_ELEMENT_TYPES = Object.freeze([...ELEMENT_TYPES]);
export const SCENE_CANONICAL_SIZE = Object.freeze({ width: 1920, height: 1080 });
