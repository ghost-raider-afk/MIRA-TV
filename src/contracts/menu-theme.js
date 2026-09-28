import { ValidationError } from '../shared/errors.js';
import { MENU_THEME_PRESET_IDS as REGISTRY_PRESET_IDS, MENU_THEME_PRESETS as REGISTRY_PRESETS, menuThemeCatalog } from '../web/admin-ui/public/js/themes/menu-theme-registry.js';

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
  'mira-serif-condensed'
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
  const text = shortText(value, field, '', 120);
  if (!text) return '';
  return text;
}

function boundedInteger(value, field, fallback, minimum, maximum) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new ValidationError(`Поле «${field}» должно быть от ${minimum} до ${maximum}.`);
  }
  return number;
}

function fontOverride(value, field) {
  const text = shortText(value, field, '', 64);
  if (!text) return '';
  if (!FONT_FAMILIES.has(text)) throw new ValidationError(`Поле «${field}» содержит неподдерживаемый шрифт.`);
  return text;
}

function presetId(value) {
  const id = shortText(value, 'theme.preset_id', 'legacy', 64) || 'legacy';
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

function utilityMode(value) {
  const mode = shortText(value, 'theme.utility_slot.mode', 'none', 24) || 'none';
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

export function menuThemeInput(value) {
  const source = record(value);
  const id = presetId(source.preset_id);
  const brand = record(source.brand);
  const utility = record(source.utility_slot);
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
      name_font_family:fontOverride(brand.name_font_family, 'theme.brand.name_font_family') || String(visual.brandNameFontFamily || ''),
      name_font_size_px:boundedInteger(brand.name_font_size_px, 'theme.brand.name_font_size_px', Number(visual.brandNameFontSizePx) || 64, 24, 128),
      name_font_weight:boundedInteger(brand.name_font_weight, 'theme.brand.name_font_weight', Number(visual.brandNameFontWeight) || 900, 300, 900),
      caption_font_family:fontOverride(brand.caption_font_family, 'theme.brand.caption_font_family') || String(visual.brandCaptionFontFamily || ''),
      caption_font_size_px:boundedInteger(brand.caption_font_size_px, 'theme.brand.caption_font_size_px', Number(visual.brandCaptionFontSizePx) || 20, 10, 64),
      caption_font_weight:boundedInteger(brand.caption_font_weight, 'theme.brand.caption_font_weight', Number(visual.brandCaptionFontWeight) || 700, 300, 900)
    }),
    utility_slot:Object.freeze({
      mode:utilityMode(utility.mode),
      text:shortText(utility.text, 'theme.utility_slot.text', '', 240),
      weather_element_id:stableElementId(utility.weather_element_id, 'theme.utility_slot.weather_element_id'),
      font_family:fontOverride(utility.font_family, 'theme.utility_slot.font_family') || String(visual.utilityFontFamily || ''),
      font_size_px:boundedInteger(utility.font_size_px, 'theme.utility_slot.font_size_px', Number(visual.utilityFontSizePx) || 28, 12, 72),
      font_weight:boundedInteger(utility.font_weight, 'theme.utility_slot.font_weight', Number(visual.utilityFontWeight) || 800, 300, 900),
      temperature_font_family:fontOverride(utility.temperature_font_family, 'theme.utility_slot.temperature_font_family') || String(weatherPreset.temperature_font_family || ''),
      temperature_font_size_pt:boundedInteger(utility.temperature_font_size_pt, 'theme.utility_slot.temperature_font_size_pt', Number(weatherPreset.temperature_font_size_pt) || 48, 24, 96),
      location_font_size_pt:boundedInteger(utility.location_font_size_pt, 'theme.utility_slot.location_font_size_pt', Number(weatherPreset.location_font_size_pt) || 14, 8, 32),
      icon_scale_percent:boundedInteger(utility.icon_scale_percent, 'theme.utility_slot.icon_scale_percent', Number(weatherPreset.icon_scale_percent) || 100, 80, 200)
    }),
    overrides:Object.freeze(overrides(source.overrides))
  });
}

export function validateMenuThemeBindings(theme, scene) {
  const current = menuThemeInput(theme);
  const elements = Array.isArray(scene?.elements) ? scene.elements : [];
  const byId = new Map(elements.map((element) => [String(element?.id || ''), element]));

  if (current.brand.logo_element_id) {
    const logo = byId.get(current.brand.logo_element_id);
    if (!logo || logo.type !== 'logo') {
      throw new ValidationError('Логотип темы должен ссылаться на существующий элемент сцены типа «Логотип».');
    }
  }

  if (current.utility_slot.weather_element_id) {
    const weather = byId.get(current.utility_slot.weather_element_id);
    if (!weather || weather.type !== 'weather') {
      throw new ValidationError('Погодный слот темы должен ссылаться на существующий элемент сцены типа «Погода».');
    }
  }
  if (current.utility_slot.mode === 'weather' && !current.utility_slot.weather_element_id) {
    throw new ValidationError('Для режима «Погода» выберите погодный элемент сцены.');
  }
  return current;
}

export { menuThemeCatalog };
export const MENU_THEME_PRESETS = THEME_PRESETS;
export const MENU_THEME_PRESET_IDS = Object.freeze([...PRESET_IDS]);
export const MENU_THEME_UTILITY_MODES = Object.freeze([...UTILITY_MODES]);
export const MENU_THEME_OVERRIDE_KEYS = OVERRIDE_KEYS;
