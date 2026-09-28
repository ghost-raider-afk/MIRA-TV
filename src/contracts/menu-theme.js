import { ValidationError } from '../shared/errors.js';
import { completeWeatherWidget } from './weather.js';
import {
  MENU_THEME_PRESET_IDS as REGISTRY_PRESET_IDS,
  MENU_THEME_PRESETS as REGISTRY_PRESETS,
  menuThemeCatalog
} from '../web/admin-ui/public/js/themes/menu-theme-registry.js';

export const MENU_THEME_SCHEMA_VERSION = 1;

const THEME_PRESETS = REGISTRY_PRESETS;
const PRESET_IDS = new Set(REGISTRY_PRESET_IDS);
const UTILITY_MODES = new Set(['none','weather','clock','text']);
const FONT_FAMILIES = new Set([
  'arial-narrow',
  'tahoma-bold',
  'arial',
  'dejavu-condensed',
  'liberation-narrow',
  'system-sans',
  'mira-condensed',
  'mira-mono',
  'mira-serif',
  'mira-serif-condensed',
  'montserrat',
  'roboto-condensed',
  'oswald',
  'russo-one',
  'neucha',
  'pt-sans-narrow',
  'yanone-kaffeesatz',
  'underdog'
]);
const OVERRIDE_KEYS = Object.freeze([
  'background_color',
  'background_image_url',
  'accent_color',
  'text_color',
  'font_scale_percent',
  'font_family',
  'price_font_size_pt',
  'promotion_badge_shape',
  'promotion_font_family',
  'promotion_font_size_percent',
  'promotion_font_weight',
  'promotion_font_height_percent',
  'promotion_letter_spacing_px',
  'table_x',
  'table_y',
  'table_width_px',
  'table_height_px'
]);
const OVERRIDE_KEY_SET = new Set(OVERRIDE_KEYS);

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function shortText(value, field, fallback = '', maximum = 160) {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  if (text.length > maximum) throw new ValidationError(`Поле «${field}» слишком длинное.`);
  return text;
}

function stableElementId(value, field) {
  return shortText(value, field, '', 120);
}

function boundedInteger(value, field, fallback, minimum, maximum) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new ValidationError(`Поле «${field}» должно быть от ${minimum} до ${maximum}.`);
  }
  return number;
}

function boundedNumber(value, field, fallback, minimum, maximum) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new ValidationError(`Поле «${field}» должно быть от ${minimum} до ${maximum}.`);
  }
  return number;
}

function nullableNumber(value, field, minimum, maximum) {
  if (value === undefined || value === null || value === '') return null;
  return boundedNumber(value, field, null, minimum, maximum);
}

function booleanValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function fontOverride(value, field) {
  const text = shortText(value, field, '', 64);
  if (!text) return '';
  if (!FONT_FAMILIES.has(text)) throw new ValidationError(`Поле «${field}» содержит неподдерживаемый шрифт.`);
  return text;
}

function presetId(value) {
  const requested = shortText(value, 'theme.preset_id', 'legacy', 64) || 'legacy';
  const id = requested === 'constructor' ? 'legacy' : requested;
  if (!PRESET_IDS.has(id)) throw new ValidationError('Выбрана неподдерживаемая тема меню.');
  return id;
}

function presetVersion(value, id) {
  const expected = THEME_PRESETS.find((preset) => preset.id === id)?.preset_version || 1;
  if (value === undefined || value === null || value === '') return expected;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number !== expected) {
    throw new ValidationError(`Версия темы «${id}» не поддерживается.`);
  }
  return number;
}

function utilityMode(value, fallback = 'none') {
  const mode = shortText(value, 'theme.utility_slot.mode', fallback, 24) || fallback;
  if (!UTILITY_MODES.has(mode)) throw new ValidationError('Режим информационного слота темы не поддерживается.');
  return mode;
}

function overrides(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError('theme.overrides должен быть списком.');
  const requested = new Set();
  for (const item of value) {
    const key = shortText(item, 'theme.overrides', '', 64);
    if (!OVERRIDE_KEY_SET.has(key)) throw new ValidationError(`Параметр темы «${key}» нельзя переопределять.`);
    requested.add(key);
  }
  return OVERRIDE_KEYS.filter((key) => requested.has(key));
}

function weatherSettingsInput(value, presetWeather = {}) {
  const source = record(value);
  return Object.freeze({
    location_name:shortText(source.location_name, 'theme.utility_slot.weather.location_name', '', 120),
    latitude:nullableNumber(source.latitude, 'theme.utility_slot.weather.latitude', -90, 90),
    longitude:nullableNumber(source.longitude, 'theme.utility_slot.weather.longitude', -180, 180),
    timezone:shortText(source.timezone, 'theme.utility_slot.weather.timezone', 'auto', 64) || 'auto',
    refresh_minutes:boundedInteger(source.refresh_minutes, 'theme.utility_slot.weather.refresh_minutes', 15, 5, 120),
    show_condition:booleanValue(source.show_condition, presetWeather.show_condition !== false),
    show_forecast:booleanValue(source.show_forecast, presetWeather.show_forecast !== false),
    forecast_items:boundedInteger(
      source.forecast_items,
      'theme.utility_slot.weather.forecast_items',
      Number(presetWeather.forecast_items) || 3,
      1,
      6
    )
  });
}

export function menuThemeInput(value) {
  const source = record(value);
  const id = presetId(source.preset_id);
  const brand = record(source.brand);
  const utility = record(source.utility_slot);
  const decor = record(source.decor);
  const legal = record(source.legal);
  const preset = THEME_PRESETS.find((item) => item.id === id) || THEME_PRESETS[0];
  const visual = preset?.visual || {};
  const weatherPreset = preset?.weather || {};

  return Object.freeze({
    schema_version:MENU_THEME_SCHEMA_VERSION,
    preset_id:id,
    preset_version:presetVersion(source.preset_version, id),
    brand:Object.freeze({
      name:shortText(brand.name, 'theme.brand.name', '', 120),
      caption:shortText(brand.caption, 'theme.brand.caption', '', 160),
      logo_element_id:stableElementId(brand.logo_element_id, 'theme.brand.logo_element_id'),
      logo_url:shortText(brand.logo_url, 'theme.brand.logo_url', '', 500),
      name_font_family:fontOverride(brand.name_font_family, 'theme.brand.name_font_family') || String(visual.brandNameFontFamily || ''),
      name_font_size_px:boundedInteger(brand.name_font_size_px, 'theme.brand.name_font_size_px', Number(visual.brandNameFontSizePx) || 64, 24, 128),
      name_font_weight:boundedInteger(brand.name_font_weight, 'theme.brand.name_font_weight', Number(visual.brandNameFontWeight) || 900, 300, 900),
      caption_font_family:fontOverride(brand.caption_font_family, 'theme.brand.caption_font_family') || String(visual.brandCaptionFontFamily || ''),
      caption_font_size_px:boundedInteger(brand.caption_font_size_px, 'theme.brand.caption_font_size_px', Number(visual.brandCaptionFontSizePx) || 20, 10, 64),
      caption_font_weight:boundedInteger(brand.caption_font_weight, 'theme.brand.caption_font_weight', Number(visual.brandCaptionFontWeight) || 700, 300, 900)
    }),
    utility_slot:Object.freeze({
      mode:utilityMode(utility.mode, preset.default_utility_mode || 'none'),
      text:shortText(utility.text, 'theme.utility_slot.text', '', 240),
      weather_element_id:stableElementId(utility.weather_element_id, 'theme.utility_slot.weather_element_id'),
      font_family:fontOverride(utility.font_family, 'theme.utility_slot.font_family') || String(visual.utilityFontFamily || ''),
      font_size_px:boundedInteger(utility.font_size_px, 'theme.utility_slot.font_size_px', Number(visual.utilityFontSizePx) || 28, 12, 72),
      font_weight:boundedInteger(utility.font_weight, 'theme.utility_slot.font_weight', Number(visual.utilityFontWeight) || 800, 300, 900),
      temperature_font_family:fontOverride(utility.temperature_font_family, 'theme.utility_slot.temperature_font_family') || String(weatherPreset.temperature_font_family || ''),
      temperature_font_size_pt:boundedInteger(utility.temperature_font_size_pt, 'theme.utility_slot.temperature_font_size_pt', Number(weatherPreset.temperature_font_size_pt) || 48, 24, 96),
      location_font_size_pt:boundedInteger(utility.location_font_size_pt, 'theme.utility_slot.location_font_size_pt', Number(weatherPreset.location_font_size_pt) || 14, 8, 32),
      icon_scale_percent:boundedInteger(utility.icon_scale_percent, 'theme.utility_slot.icon_scale_percent', Number(weatherPreset.icon_scale_percent) || 100, 80, 200),
      weather:weatherSettingsInput(utility.weather, weatherPreset)
    }),
    decor:Object.freeze({
      source_url:shortText(decor.source_url, 'theme.decor.source_url', '', 500)
    }),
    legal:Object.freeze({
      text:shortText(legal.text, 'theme.legal.text', String(visual.footerText || ''), 220),
      age_text:shortText(legal.age_text, 'theme.legal.age_text', String(visual.ageText || '18+'), 12),
      font_family:fontOverride(legal.font_family, 'theme.legal.font_family') || String(visual.legalFontFamily || 'mira-condensed'),
      font_size_px:boundedInteger(legal.font_size_px, 'theme.legal.font_size_px', Number(visual.legalFontSizePx) || 30, 16, 52),
      font_weight:boundedInteger(legal.font_weight, 'theme.legal.font_weight', Number(visual.legalFontWeight) || 600, 300, 900),
      letter_spacing_px:boundedInteger(legal.letter_spacing_px, 'theme.legal.letter_spacing_px', Number(visual.legalLetterSpacingPx) || 0, 0, 14)
    }),
    overrides:Object.freeze(overrides(source.overrides))
  });
}

export function themeWeatherSettings(themeValue, scene = { version:1,elements:[] }) {
  const theme = menuThemeInput(themeValue);
  if (theme.preset_id === 'legacy' || theme.utility_slot.mode !== 'weather') return null;

  let source = theme.utility_slot.weather;
  const hasCoordinates = source.latitude !== null
    && source.latitude !== ''
    && source.longitude !== null
    && source.longitude !== ''
    && Number.isFinite(Number(source.latitude))
    && Number.isFinite(Number(source.longitude));
  if (!hasCoordinates && theme.utility_slot.weather_element_id) {
    const elements = Array.isArray(scene?.elements) ? scene.elements : [];
    const legacy = elements.find((element) =>
      element?.id === theme.utility_slot.weather_element_id && element?.type === 'weather'
    );
    if (legacy?.weather) source = { ...source, ...legacy.weather };
  }

  return completeWeatherWidget({
    enabled:true,
    embedded:true,
    ...source,
    temperature_font_family:theme.utility_slot.temperature_font_family,
    temperature_font_size_pt:theme.utility_slot.temperature_font_size_pt,
    location_font_size_pt:theme.utility_slot.location_font_size_pt,
    icon_scale_percent:theme.utility_slot.icon_scale_percent,
    show_condition:source.show_condition !== false,
    show_feels_like:false,
    show_humidity:false,
    show_wind:false,
    show_forecast:source.show_forecast !== false,
    forecast_items:source.forecast_items
  });
}

export function validateMenuThemeBindings(theme, scene) {
  const current = menuThemeInput(theme);
  const elements = Array.isArray(scene?.elements) ? scene.elements : [];
  const byId = new Map(elements.map((element) => [String(element?.id || ''), element]));

  if (current.brand.logo_element_id) {
    const logo = byId.get(current.brand.logo_element_id);
    if (logo && logo.type !== 'logo') {
      throw new ValidationError('Логотип темы должен ссылаться на элемент типа «Логотип».');
    }
  }

  if (current.utility_slot.weather_element_id) {
    const weather = byId.get(current.utility_slot.weather_element_id);
    if (weather && weather.type !== 'weather') {
      throw new ValidationError('Миграционная ссылка погоды темы должна указывать на элемент типа «Погода».');
    }
  }
  return current;
}

export { menuThemeCatalog };
export const MENU_THEME_PRESETS = THEME_PRESETS;
export const MENU_THEME_PRESET_IDS = Object.freeze([...PRESET_IDS]);
export const MENU_THEME_UTILITY_MODES = Object.freeze([...UTILITY_MODES]);
export const MENU_THEME_OVERRIDE_KEYS = OVERRIDE_KEYS;
