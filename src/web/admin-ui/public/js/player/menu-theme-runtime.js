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

function normalizedTheme(settings) {
  const source = themeRecord(settings);
  const preset = menuThemePreset(source.preset_id);
  const visual = preset.visual || {};
  const weatherPreset = preset.weather || {};
  const brand = source.brand && typeof source.brand === 'object' ? source.brand : {};
  const utility = source.utility_slot && typeof source.utility_slot === 'object' ? source.utility_slot : {};
  return Object.freeze({
    schema_version:Number(source.schema_version) || 1,
    preset_id:preset.id,
    preset_version:Number(source.preset_version) || preset.preset_version || 1,
    brand:Object.freeze({
      name:String(brand.name || visual.brandText || '').trim(),
      caption:String(brand.caption || visual.brandCaption || '').trim(),
      logo_element_id:String(brand.logo_element_id || ''),
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
      icon_scale_percent:boundedNumber(utility.icon_scale_percent, Number(weatherPreset.icon_scale_percent) || 100, 80, 200)
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

function applySlot(element, rect, zIndex) {
  if (!element || !rect) return element;
  return {
    ...element,
    x:rect.x,
    y:rect.y,
    width:rect.width,
    height:rect.height,
    rotation_deg:0,
    z_index:zIndex,
    opacity:1,
    enabled:true,
    content_auto_scale:true,
    content_scale_percent:100
  };
}

function applyThemeWeather(element, theme, preset) {
  const weatherPreset = preset.weather || {};
  const utility = theme.utility_slot;
  return {
    ...element,
    weather:{
      ...(element.weather || {}),
      temperature_font_family:utility.temperature_font_family || weatherPreset.temperature_font_family || element.weather?.temperature_font_family,
      temperature_font_size_pt:utility.temperature_font_size_pt,
      location_font_size_pt:utility.location_font_size_pt,
      icon_scale_percent:utility.icon_scale_percent,
      show_condition:weatherPreset.show_condition !== false,
      show_forecast:weatherPreset.show_forecast !== false,
      forecast_items:Number(weatherPreset.forecast_items) || element.weather?.forecast_items || 3
    }
  };
}

export function resolveMenuThemeRuntime(settings = {}, scene = { version:1,elements:[] }, viewport = { width:1920,height:1080 }) {
  const theme = normalizedTheme(settings);
  const preset = menuThemePreset(theme.preset_id);
  const resolvedSettings = resolveMenuThemeSettings({ ...settings, theme });
  const source = scene && typeof scene === 'object' ? scene : { version:1,elements:[] };
  const elements = clone(Array.isArray(source.elements) ? source.elements : []);
  const layout = preset.layout ? Object.fromEntries(
    Object.entries(preset.layout).map(([key,value]) => [key,scaleGeometry(value,viewport)])
  ) : null;

  for (let index=0; index<elements.length; index+=1) {
    const element = elements[index];
    if (!element?.id) continue;
    if (theme.brand.logo_element_id && element.id === theme.brand.logo_element_id && layout?.logo) {
      elements[index] = applySlot(element, layout.logo, 40);
      continue;
    }
    if (theme.utility_slot.weather_element_id && element.id === theme.utility_slot.weather_element_id) {
      elements[index] = theme.utility_slot.mode === 'weather' && layout?.weather
        ? applyThemeWeather(applySlot(element, layout.weather, 35), theme, preset)
        : { ...element, enabled:false };
    }
  }

  return Object.freeze({
    theme,
    preset,
    settings:resolvedSettings,
    scene:Object.freeze({ ...source, elements:Object.freeze(elements) }),
    layout
  });
}
