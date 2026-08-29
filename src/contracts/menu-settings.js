import { ValidationError } from '../shared/errors.js';

const HEX = /^#[0-9a-f]{6}$/i;
const BACKGROUND_URL = /^\/site-assets\/screens\/background-[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;
const MIN_FONT_SCALE = 55;
const MAX_FONT_SCALE = 130;
const DEFAULT_FONT_FAMILY = 'arial-narrow';
const FONT_FAMILIES = new Set([
  'arial-narrow',
  'tahoma-bold',
  'arial',
  'dejavu-condensed',
  'liberation-narrow',
  'system-sans'
]);
const DEFAULT_GEOMETRY = Object.freeze({ x: 56, y: 15, width: 1374, height: 925 });

function color(value, field, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !HEX.test(value)) throw new ValidationError(`Поле «${field}» должно быть цветом #RRGGBB.`);
  return value.toUpperCase();
}

function fontScale(value) {
  if (value === undefined || value === null || value === '') return 100;
  const source = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{2,3}$/.test(source)) throw new ValidationError('Масштаб шрифта должен быть целым числом от 55 до 130 процентов.');
  const number = Number(source);
  if (!Number.isSafeInteger(number) || number < MIN_FONT_SCALE || number > MAX_FONT_SCALE) {
    throw new ValidationError('Масштаб шрифта должен быть целым числом от 55 до 130 процентов.');
  }
  return number;
}

function fontFamily(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_FONT_FAMILY;
  if (typeof value !== 'string' || !FONT_FAMILIES.has(value)) throw new ValidationError('Шрифт таблицы выбран неверно.');
  return value;
}

function backgroundUrl(value, { allowBackgroundImage }) {
  if (!allowBackgroundImage || value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !BACKGROUND_URL.test(value)) throw new ValidationError('Фоновое изображение монитора имеет недопустимый адрес.');
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

export function menuSettingsInput(value, { allowBackgroundImage = true, maxWidth = 1920, maxHeight = 1080 } = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const table_x = integer(source.table_x, 'table_x', DEFAULT_GEOMETRY.x, 0, Math.max(0, maxWidth - 1));
  const table_y = integer(source.table_y, 'table_y', DEFAULT_GEOMETRY.y, 0, Math.max(0, maxHeight - 1));
  const table_width_px = integer(source.table_width_px, 'table_width_px', DEFAULT_GEOMETRY.width, 1, maxWidth);
  const table_height_px = integer(source.table_height_px, 'table_height_px', DEFAULT_GEOMETRY.height, 1, maxHeight);
  if (table_x + table_width_px > maxWidth) throw new ValidationError('Таблица выходит за правую границу экрана.');
  if (table_y + table_height_px > maxHeight) throw new ValidationError('Таблица выходит за нижнюю границу экрана.');
  return Object.freeze({
    background_color: color(source.background_color, 'background_color', '#101828'),
    background_image_url: backgroundUrl(source.background_image_url, { allowBackgroundImage }),
    accent_color: color(source.accent_color, 'accent_color', '#F4C915'),
    text_color: color(source.text_color, 'text_color', '#F8FAFC'),
    font_scale_percent: fontScale(source.font_scale_percent),
    font_family: fontFamily(source.font_family),
    table_x,
    table_y,
    table_width_px,
    table_height_px
  });
}

export const MENU_FONT_SCALE_RANGE = Object.freeze({ minimum: MIN_FONT_SCALE, maximum: MAX_FONT_SCALE });
export const MENU_FONT_FAMILIES = Object.freeze([...FONT_FAMILIES]);
export const MENU_DEFAULT_GEOMETRY = DEFAULT_GEOMETRY;
