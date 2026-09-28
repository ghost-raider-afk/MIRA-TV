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

function normalizedTheme(settings) {
  const source = themeRecord(settings);
  const preset = menuThemePreset(source.preset_id);
  const brand = source.brand && typeof source.brand === 'object' ? source.brand : {};
  const utility = source.utility_slot && typeof source.utility_slot === 'object' ? source.utility_slot : {};
  return Object.freeze({
    schema_version:Number(source.schema_version) || 1,
    preset_id:preset.id,
    preset_version:Number(source.preset_version) || preset.preset_version || 1,
    brand:Object.freeze({
      name:String(brand.name || preset.visual?.brandText || '').trim(),
      caption:String(brand.caption || preset.visual?.brandCaption || '').trim(),
      logo_element_id:String(brand.logo_element_id || ''),
      name_font_family:String(brand.name_font_family || ''),
      caption_font_family:String(brand.caption_font_family || '')
    }),
    utility_slot:Object.freeze({
      mode:String(utility.mode || preset.default_utility_mode || 'none'),
      text:String(utility.text || '').trim(),
      weather_element_id:String(utility.weather_element_id || ''),
      font_family:String(utility.font_family || '')
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
        ? applySlot(element, layout.weather, 35)
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
