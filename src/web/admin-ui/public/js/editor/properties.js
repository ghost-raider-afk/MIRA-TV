import { element } from '../core/dom.js';
import { updateScreen, updateSettings } from './commands.js';
import { normaliseEditorSettings } from './settings.js';

const SETTINGS_INPUTS = Object.freeze([
  'editor-background-color',
  'editor-accent-color',
  'editor-text-color',
  'editor-font-family',
  'editor-table-x',
  'editor-table-y',
  'editor-table-width',
  'editor-table-height'
]);

const SCREEN_INPUTS = Object.freeze([
  'editor-name',
  'editor-resolution',
  'editor-status',
  'editor-active'
]);

function fontScaleValue(fallback = 100) {
  const number = element('editor-font-scale-number');
  const range = element('editor-font-scale');
  return number?.value || range?.value || String(fallback ?? 100);
}

function syncFontScaleInputs(value) {
  const normalized = normaliseEditorSettings({ font_scale_percent: value }).font_scale_percent;
  const number = element('editor-font-scale-number');
  const range = element('editor-font-scale');
  if (number instanceof HTMLInputElement) number.value = String(normalized);
  if (range instanceof HTMLInputElement) range.value = String(normalized);
  return normalized;
}

export function readEditorSettings(baseSettings = {}) {
  return normaliseEditorSettings({
    ...baseSettings,
    background_color: element('editor-background-color')?.value ?? baseSettings.background_color,
    accent_color: element('editor-accent-color')?.value ?? baseSettings.accent_color,
    text_color: element('editor-text-color')?.value ?? baseSettings.text_color,
    font_scale_percent: fontScaleValue(baseSettings.font_scale_percent),
    font_family: element('editor-font-family')?.value ?? baseSettings.font_family,
    table_x: element('editor-table-x')?.value ?? baseSettings.table_x,
    table_y: element('editor-table-y')?.value ?? baseSettings.table_y,
    table_width_px: element('editor-table-width')?.value ?? baseSettings.table_width_px,
    table_height_px: element('editor-table-height')?.value ?? baseSettings.table_height_px
  });
}

export function writeEditorSettings(settings) {
  const normalized = normaliseEditorSettings(settings);
  const backgroundColor = element('editor-background-color');
  const accentColor = element('editor-accent-color');
  const textColor = element('editor-text-color');
  if (backgroundColor) backgroundColor.value = normalized.background_color;
  if (accentColor) accentColor.value = normalized.accent_color;
  if (textColor) textColor.value = normalized.text_color;
  const fontFamily = element('editor-font-family');
  const tableX = element('editor-table-x');
  const tableY = element('editor-table-y');
  const tableWidth = element('editor-table-width');
  const tableHeight = element('editor-table-height');
  if (fontFamily) fontFamily.value = normalized.font_family;
  if (tableX) tableX.value = String(normalized.table_x);
  if (tableY) tableY.value = String(normalized.table_y);
  if (tableWidth) tableWidth.value = String(normalized.table_width_px);
  if (tableHeight) tableHeight.value = String(normalized.table_height_px);
  syncFontScaleInputs(normalized.font_scale_percent);
  const backgroundState = element('editor-background-state');
  if (backgroundState) backgroundState.textContent = normalized.background_image_url ? 'Фон загружен' : 'Без изображения';
  return normalized;
}

export function writeScreenProperties(screen) {
  element('editor-location').value = screen.location_name || '';
  element('editor-name').value = screen.name || '';
  element('editor-resolution').value = screen.resolution || '';
  element('editor-status').value = screen.status === 'published' ? 'ready' : screen.status;
  element('editor-active').checked = screen.active !== false;
  const identity = element('editor-toolbar-title');
  if (identity) identity.textContent = `${screen.location_name || 'Точка'} · ${screen.name || 'Монитор'}`;
}

export function readScreenProperties(screen) {
  return {
    location_id: screen.location_id,
    name: element('editor-name').value,
    resolution: element('editor-resolution').value,
    status: element('editor-status').value,
    active: element('editor-active').checked
  };
}


export function bindSettingsProperties(editorState, onChange) {
  const apply = () => {
    updateSettings(editorState, readEditorSettings(editorState.settings));
    onChange?.();
  };
  SETTINGS_INPUTS.forEach((id) => {
    const target = element(id);
    const eventName = target instanceof HTMLSelectElement ? 'change' : 'input';
    target?.addEventListener(eventName, apply);
  });

  const range = element('editor-font-scale');
  const number = element('editor-font-scale-number');
  range?.addEventListener('input', () => {
    syncFontScaleInputs(range.value);
    apply();
  });
  number?.addEventListener('input', () => {
    syncFontScaleInputs(number.value);
    apply();
  });
}

export function bindScreenProperties(editorState, onChange) {
  SCREEN_INPUTS.forEach((id) => {
    const target = element(id);
    const eventName = target instanceof HTMLSelectElement || target?.type === 'checkbox' ? 'change' : 'input';
    target?.addEventListener(eventName, () => {
      updateScreen(editorState, readScreenProperties(editorState.screen || {}));
      onChange?.();
    });
  });
}
