import { ValidationError } from '../shared/errors.js';
import { MENU_THEME_PRESET_IDS, MENU_THEME_PRESETS, menuThemeCatalog } from '../web/admin-ui/public/js/themes/menu-theme-registry.js';

export const MENU_THEME_SCHEMA_VERSION = 1;

const THEME_PRESETS = MENU_THEME_PRESETS;
const PRESET_IDS = new Set(MENU_THEME_PRESET_IDS);
const UTILITY_MODES = new Set(['none','weather','clock','text']);
const FONT_FAMILIES = new Set([
  'arial-narrow',
  'tahoma-bold',
  'arial',
  'dejavu-condensed',
  'liberation-narrow',
  'system-sans'
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
  return Object.freeze({
    schema_version:MENU_THEME_SCHEMA_VERSION,
    preset_id:id,
    preset_version:presetVersion(source.preset_version, id),
    brand:Object.freeze({
      name:shortText(brand.name, 'theme.brand.name', '', 120),
      caption:shortText(brand.caption, 'theme.brand.caption', '', 160),
      logo_element_id:stableElementId(brand.logo_element_id, 'theme.brand.logo_element_id'),
      name_font_family:fontOverride(brand.name_font_family, 'theme.brand.name_font_family'),
      caption_font_family:fontOverride(brand.caption_font_family, 'theme.brand.caption_font_family')
    }),
    utility_slot:Object.freeze({
      mode:utilityMode(utility.mode),
      text:shortText(utility.text, 'theme.utility_slot.text', '', 240),
      weather_element_id:stableElementId(utility.weather_element_id, 'theme.utility_slot.weather_element_id'),
      font_family:fontOverride(utility.font_family, 'theme.utility_slot.font_family')
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
