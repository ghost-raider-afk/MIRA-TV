import { ValidationError } from '../shared/errors.js';

export const ANNOUNCEMENT_FONTS = Object.freeze(['inter', 'arial', 'montserrat', 'oswald', 'georgia']);

export const DEFAULT_ANNOUNCEMENT = Object.freeze({
  enabled: false,
  text: '',
  position: 'bottom',
  speed_px_per_second: 90,
  font_size: 34,
  font_family: 'inter',
  vertical_scale: 1,
  text_color: '#FFFFFF',
  background_color: '#101317',
  background_opacity: 0.82,
  glow_enabled: false,
  glow_color: '#35D9FF',
  glow_strength: 12
});

function sourceObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function numberValue(value, fallback, minimum, maximum, field) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new ValidationError(`Поле «${field}» должно быть числом от ${minimum} до ${maximum}.`);
  }
  return parsed;
}

function colorValue(value, fallback, field) {
  const text = String(value ?? fallback).trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(text)) throw new ValidationError(`Поле «${field}» должно содержать цвет в формате #RRGGBB.`);
  return text;
}

export function completeAnnouncement(value = {}) {
  const source = sourceObject(value);
  const position = source.position === 'top' ? 'top' : 'bottom';
  return {
    enabled: source.enabled === true,
    text: String(source.text ?? '').trim().slice(0, 500),
    position,
    speed_px_per_second: Math.max(30, Math.min(240, Number(source.speed_px_per_second) || DEFAULT_ANNOUNCEMENT.speed_px_per_second)),
    font_size: Math.max(18, Math.min(72, Number(source.font_size) || DEFAULT_ANNOUNCEMENT.font_size)),
    font_family: ANNOUNCEMENT_FONTS.includes(source.font_family) ? source.font_family : DEFAULT_ANNOUNCEMENT.font_family,
    vertical_scale: Math.max(0.5, Math.min(2.2, Number(source.vertical_scale) || DEFAULT_ANNOUNCEMENT.vertical_scale)),
    text_color: /^#[0-9A-Fa-f]{6}$/.test(String(source.text_color || '')) ? String(source.text_color).toUpperCase() : DEFAULT_ANNOUNCEMENT.text_color,
    background_color: /^#[0-9A-Fa-f]{6}$/.test(String(source.background_color || '')) ? String(source.background_color).toUpperCase() : DEFAULT_ANNOUNCEMENT.background_color,
    background_opacity: Math.max(0, Math.min(1, Number.isFinite(Number(source.background_opacity)) ? Number(source.background_opacity) : DEFAULT_ANNOUNCEMENT.background_opacity)),
    glow_enabled: source.glow_enabled === true,
    glow_color: /^#[0-9A-Fa-f]{6}$/.test(String(source.glow_color || '')) ? String(source.glow_color).toUpperCase() : DEFAULT_ANNOUNCEMENT.glow_color,
    glow_strength: Math.max(0, Math.min(48, Number.isFinite(Number(source.glow_strength)) ? Number(source.glow_strength) : DEFAULT_ANNOUNCEMENT.glow_strength))
  };
}

export function announcementInput(value) {
  const source = sourceObject(value);
  if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value))) {
    throw new ValidationError('Настройки бегущей строки должны быть объектом.');
  }
  const enabled = source.enabled ?? false;
  if (typeof enabled !== 'boolean') throw new ValidationError('Поле «Показывать объявление» должно быть логическим значением.');
  const text = String(source.text ?? '').trim();
  if (text.length > 500) throw new ValidationError('Текст объявления не должен превышать 500 символов.');
  if (enabled && !text) throw new ValidationError('Введите текст объявления или выключите бегущую строку.');
  const position = source.position ?? DEFAULT_ANNOUNCEMENT.position;
  if (!['top', 'bottom'].includes(position)) throw new ValidationError('Положение бегущей строки указано неверно.');
  const fontFamily = source.font_family ?? DEFAULT_ANNOUNCEMENT.font_family;
  if (!ANNOUNCEMENT_FONTS.includes(fontFamily)) throw new ValidationError('Шрифт бегущей строки указан неверно.');
  const glowEnabled = source.glow_enabled ?? false;
  if (typeof glowEnabled !== 'boolean') throw new ValidationError('Поле «Подсветка строки» должно быть логическим значением.');
  return {
    enabled,
    text,
    position,
    speed_px_per_second: numberValue(source.speed_px_per_second, DEFAULT_ANNOUNCEMENT.speed_px_per_second, 30, 240, 'Скорость бегущей строки'),
    font_size: numberValue(source.font_size, DEFAULT_ANNOUNCEMENT.font_size, 18, 72, 'Размер текста объявления'),
    font_family: fontFamily,
    vertical_scale: numberValue(source.vertical_scale, DEFAULT_ANNOUNCEMENT.vertical_scale, 0.5, 2.2, 'Вертикальное растяжение текста'),
    text_color: colorValue(source.text_color, DEFAULT_ANNOUNCEMENT.text_color, 'Цвет текста объявления'),
    background_color: colorValue(source.background_color, DEFAULT_ANNOUNCEMENT.background_color, 'Цвет фона объявления'),
    background_opacity: numberValue(source.background_opacity, DEFAULT_ANNOUNCEMENT.background_opacity, 0, 1, 'Прозрачность фона объявления'),
    glow_enabled: glowEnabled,
    glow_color: colorValue(source.glow_color, DEFAULT_ANNOUNCEMENT.glow_color, 'Цвет подсветки строки'),
    glow_strength: numberValue(source.glow_strength, DEFAULT_ANNOUNCEMENT.glow_strength, 0, 48, 'Сила подсветки строки')
  };
}
