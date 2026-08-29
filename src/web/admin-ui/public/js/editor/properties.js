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

function fontScaleValue() {
  const number = element('editor-font-scale-number');
  const range = element('editor-font-scale');
  return number?.value || range?.value || '100';
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
    background_color: element('editor-background-color').value,
    accent_color: element('editor-accent-color').value,
    text_color: element('editor-text-color').value,
    font_scale_percent: fontScaleValue(),
    font_family: element('editor-font-family').value,
    table_x: element('editor-table-x').value,
    table_y: element('editor-table-y').value,
    table_width_px: element('editor-table-width').value,
    table_height_px: element('editor-table-height').value
  });
}

export function writeEditorSettings(settings) {
  const normalized = normaliseEditorSettings(settings);
  element('editor-background-color').value = normalized.background_color;
  element('editor-accent-color').value = normalized.accent_color;
  element('editor-text-color').value = normalized.text_color;
  element('editor-font-family').value = normalized.font_family;
  element('editor-table-x').value = String(normalized.table_x);
  element('editor-table-y').value = String(normalized.table_y);
  element('editor-table-width').value = String(normalized.table_width_px);
  element('editor-table-height').value = String(normalized.table_height_px);
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
  const path = element('editor-sftp-path');
  if (path) path.textContent = screen.sftp_path || 'SFTP не настроен';
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

export function syncDeliveryControls(screen, editorState) {
  const dirty = editorState?.dirty === true;
  const publish = element('editor-publish');
  if (publish instanceof HTMLButtonElement) {
    publish.disabled = dirty || !screen?.prepared_asset_key || !screen?.sftp_directory_name;
  }
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
