import { menuThemePreset, resolveMenuThemeSettings } from '../themes/menu-theme-registry.js';

const SCENE_WIDTH = 1920;
const SCENE_HEIGHT = 1080;

function clone(value) {
  if (Array.isArray(value)) return value.map((item) => clone(item));
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const key of Object.keys(value)) next[key] = clone(value[key]);
  return next;
}

function themeRecord(settings) {
  const value = settings?.theme;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedTheme(settings) {
  const source = themeRecord(settings);
  const preset = menuThemePreset(source.preset_id);
  const visual = preset.visual || {};
  const weatherPreset = preset.weather || {};
  const brand = source.brand && typeof source.brand === 'object' ? source.brand : {};
  const utility = source.utility_slot && typeof source.utility_slot === 'object' ? source.utility_slot : {};
  const weather = utility.weather && typeof utility.weather === 'object' ? utility.weather : {};
  const decor = source.decor && typeof source.decor === 'object' ? source.decor : {};
  const legal = source.legal && typeof source.legal === 'object' ? source.legal : {};

  return Object.freeze({
    schema_version:Number(source.schema_version) || 1,
    preset_id:preset.id,
    preset_version:Number(source.preset_version) || preset.preset_version || 1,
    brand:Object.freeze({
      name:String(brand.name || visual.brandText || '').trim(),
      caption:String(brand.caption || visual.brandCaption || '').trim(),
      logo_element_id:String(brand.logo_element_id || ''),
      logo_url:String(brand.logo_url || '').trim(),
      name_font_family:String(brand.name_font_family || visual.brandNameFontFamily || ''),
      name_font_size_px:boundedNumber(brand.name_font_size_px, Number(visual.brandNameFontSizePx) || 64, 24, 128),
      name_font_weight:boundedNumber(brand.name_font_weight, Number(visual.brandNameFontWeight) || 900, 300, 900),
      caption_font_family:String(brand.caption_font_family || visual.brandCaptionFontFamily || ''),
      caption_font_size_px:boundedNumber(brand.caption_font_size_px, Number(visual.brandCaptionFontSizePx) || 20, 10, 64),
      caption_font_weight:boundedNumber(brand.caption_font_weight, Number(visual.brandCaptionFontWeight) || 700, 300, 900)
    }),
    utility_slot:Object.freeze({
      mode:String(utility.mode || preset.default_utility_mode || 'none'),
      text:String(utility.text || '').trim(),
      weather_element_id:String(utility.weather_element_id || ''),
      font_family:String(utility.font_family || visual.utilityFontFamily || ''),
      font_size_px:boundedNumber(utility.font_size_px, Number(visual.utilityFontSizePx) || 28, 12, 72),
      font_weight:boundedNumber(utility.font_weight, Number(visual.utilityFontWeight) || 800, 300, 900),
      temperature_font_family:String(utility.temperature_font_family || weatherPreset.temperature_font_family || ''),
      temperature_font_size_pt:boundedNumber(utility.temperature_font_size_pt, Number(weatherPreset.temperature_font_size_pt) || 48, 24, 96),
      location_font_size_pt:boundedNumber(utility.location_font_size_pt, Number(weatherPreset.location_font_size_pt) || 14, 8, 32),
      icon_scale_percent:boundedNumber(utility.icon_scale_percent, Number(weatherPreset.icon_scale_percent) || 100, 80, 200),
      weather:Object.freeze({
        location_name:String(weather.location_name || '').trim(),
        latitude:nullableNumber(weather.latitude),
        longitude:nullableNumber(weather.longitude),
        timezone:String(weather.timezone || 'auto'),
        refresh_minutes:boundedNumber(weather.refresh_minutes, 15, 5, 120),
        show_condition:weather.show_condition !== false,
        show_forecast:weather.show_forecast !== false,
        forecast_items:boundedNumber(weather.forecast_items, Number(weatherPreset.forecast_items) || 3, 1, 6)
      })
    }),
    decor:Object.freeze({
      source_url:String(decor.source_url || '').trim()
    }),
    legal:Object.freeze({
      text:String(legal.text || visual.footerText || '').trim(),
      age_text:String(legal.age_text || visual.ageText || '18+').trim(),
      font_family:String(legal.font_family || visual.legalFontFamily || 'mira-condensed'),
      font_size_px:boundedNumber(legal.font_size_px, Number(visual.legalFontSizePx) || 30, 16, 52),
      font_weight:boundedNumber(legal.font_weight, Number(visual.legalFontWeight) || 600, 300, 900),
      letter_spacing_px:boundedNumber(legal.letter_spacing_px, Number(visual.legalLetterSpacingPx) || 0, 0, 14)
    }),
    overrides:Object.freeze(Array.isArray(source.overrides) ? [...source.overrides] : [])
  });
}

function scaleGeometry(rect, viewport) {
  if (!rect) return null;
  const sx = Math.max(1,Number(viewport?.width) || SCENE_WIDTH) / SCENE_WIDTH;
  const sy = Math.max(1,Number(viewport?.height) || SCENE_HEIGHT) / SCENE_HEIGHT;
  return Object.freeze({
    x:Math.round(rect.x * sx),
    y:Math.round(rect.y * sy),
    width:Math.max(1,Math.round(rect.width * sx)),
    height:Math.max(1,Math.round(rect.height * sy))
  });
}

function logoSource(element) {
  if (!element || element.type !== 'logo') return '';
  return String(element.media?.source_url || '').trim();
}

export function resolveMenuThemeRuntime(settings = {}, scene = { version:1,elements:[] }, viewport = { width:1920,height:1080 }) {
  const baseTheme = normalizedTheme(settings);
  const preset = menuThemePreset(baseTheme.preset_id);
  const source = scene && typeof scene === 'object' ? scene : { version:1,elements:[] };
  const elements = clone(Array.isArray(source.elements) ? source.elements : []);

  let legacyLogoUrl = '';
  if (preset.id !== 'legacy' && baseTheme.brand.logo_element_id) {
    const boundLogo = elements.find((element) => element?.id === baseTheme.brand.logo_element_id);
    legacyLogoUrl = logoSource(boundLogo);
    if (boundLogo) boundLogo.enabled = false;
  }

  const theme = Object.freeze({
    ...baseTheme,
    brand:Object.freeze({
      ...baseTheme.brand,
      logo_url:baseTheme.brand.logo_url || legacyLogoUrl
    })
  });
  const resolvedSettings = resolveMenuThemeSettings({ ...settings, theme });
  const layout = preset.layout ? Object.fromEntries(
    Object.entries(preset.layout).map(([key,value]) => [key,scaleGeometry(value,viewport)])
  ) : null;

  return Object.freeze({
    theme,
    preset,
    settings:resolvedSettings,
    scene:Object.freeze({ ...source, elements:Object.freeze(elements) }),
    layout
  });
}
