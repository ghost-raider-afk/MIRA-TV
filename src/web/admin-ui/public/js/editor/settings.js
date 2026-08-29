import { MENU_FONT_OPTIONS, MENU_REFERENCE } from './renderer.js';

const SCREEN_BACKGROUND_URL = /^\/site-assets\/screens\/background-[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_FONT_FAMILY = 'arial-narrow';
const FONT_KEYS = new Set(MENU_FONT_OPTIONS.map((font) => font.key));

function fontScalePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.max(MENU_REFERENCE.fontScaleMinPercent, Math.min(MENU_REFERENCE.fontScaleMaxPercent, Math.round(number)));
}

function fontFamily(value) {
  return FONT_KEYS.has(value) ? value : DEFAULT_FONT_FAMILY;
}

function integer(value, fallback, minimum = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum ? number : fallback;
}

export function normaliseEditorSettings(settings = {}) {
  return {
    background_color: HEX.test(settings.background_color || '') ? String(settings.background_color).toUpperCase() : '#101828',
    background_image_url: SCREEN_BACKGROUND_URL.test(settings.background_image_url || '') ? settings.background_image_url : '',
    accent_color: HEX.test(settings.accent_color || '') ? String(settings.accent_color).toUpperCase() : '#F4C915',
    text_color: HEX.test(settings.text_color || '') ? String(settings.text_color).toUpperCase() : '#F8FAFC',
    font_scale_percent: fontScalePercent(settings.font_scale_percent),
    font_family: fontFamily(settings.font_family),
    table_x: integer(settings.table_x, MENU_REFERENCE.tableX),
    table_y: integer(settings.table_y, MENU_REFERENCE.tableTop),
    table_width_px: integer(settings.table_width_px, MENU_REFERENCE.tableWidth, 1),
    table_height_px: integer(settings.table_height_px, MENU_REFERENCE.tableHeight, 1)
  };
}

export function parseResolution(value) {
  const match = String(value || '').match(/^(\d{3,5})[×x](\d{3,5})$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return null;
  return { width, height };
}
