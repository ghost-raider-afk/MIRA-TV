import { ValidationError } from '../shared/errors.js';

export const BRAND_FONTS = Object.freeze(['inter', 'arial', 'montserrat', 'oswald', 'georgia']);
export const BRAND_ENTRANCE_EFFECTS = Object.freeze(['none', 'pop-up', 'blur-reveal', 'zoom-in', 'tracking-expand', 'neon-reveal']);
export const BRAND_LOOP_EFFECTS = Object.freeze(['none', 'wave', 'neon-pulse', 'float', 'breathe', 'stretch']);
export const BRAND_EXIT_EFFECTS = Object.freeze(['none', 'fade-out', 'blur-out', 'zoom-out']);
// Legacy name kept for stored v1.8.0/v1.8.1 payloads.
export const BRAND_EFFECTS = BRAND_LOOP_EFFECTS;

export const DEFAULT_BRAND_TITLE = Object.freeze({
  enabled: false,
  text: '',
  x: 960,
  y: 96,
  font_family: 'inter',
  font_size: 72,
  vertical_scale: 1,
  letter_spacing: 2,
  line_spacing: 6,
  text_color: '#FFFFFF',
  glow_color: '#35D9FF',
  glow_strength: 18,
  entrance_effect: 'blur-reveal',
  loop_effect: 'neon-pulse',
  exit_effect: 'fade-out',
  entrance_duration_ms: 900,
  exit_duration_ms: 550,
  letter_stagger_ms: 55,
  amplitude_px: 12,
  overshoot: 0.12,
  cycle_seconds: 5.5,
  effect: 'neon-pulse'
});

function sourceObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function color(value, fallback) {
  const text = String(value || '').toUpperCase();
  return /^#[0-9A-F]{6}$/.test(text) ? text : fallback;
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function completeBrandTitle(value = {}) {
  const source = sourceObject(value);
  const legacyLoop = enumValue(source.effect, BRAND_LOOP_EFFECTS, DEFAULT_BRAND_TITLE.loop_effect);
  const loopEffect = enumValue(source.loop_effect, BRAND_LOOP_EFFECTS, legacyLoop);
  return {
    enabled: source.enabled === true,
    text: String(source.text ?? DEFAULT_BRAND_TITLE.text).replace(/\r\n?/g, '\n').trim().slice(0, 80),
    x: clamp(source.x, DEFAULT_BRAND_TITLE.x, 0, 1920),
    y: clamp(source.y, DEFAULT_BRAND_TITLE.y, 0, 1080),
    font_family: enumValue(source.font_family, BRAND_FONTS, DEFAULT_BRAND_TITLE.font_family),
    font_size: clamp(source.font_size, DEFAULT_BRAND_TITLE.font_size, 18, 180),
    vertical_scale: clamp(source.vertical_scale, DEFAULT_BRAND_TITLE.vertical_scale, 0.5, 2.2),
    letter_spacing: clamp(source.letter_spacing, DEFAULT_BRAND_TITLE.letter_spacing, -2, 20),
    line_spacing: clamp(source.line_spacing, DEFAULT_BRAND_TITLE.line_spacing, -60, 80),
    text_color: color(source.text_color, DEFAULT_BRAND_TITLE.text_color),
    glow_color: color(source.glow_color, DEFAULT_BRAND_TITLE.glow_color),
    glow_strength: clamp(source.glow_strength, DEFAULT_BRAND_TITLE.glow_strength, 0, 48),
    entrance_effect: enumValue(source.entrance_effect, BRAND_ENTRANCE_EFFECTS, DEFAULT_BRAND_TITLE.entrance_effect),
    loop_effect: loopEffect,
    exit_effect: enumValue(source.exit_effect, BRAND_EXIT_EFFECTS, DEFAULT_BRAND_TITLE.exit_effect),
    entrance_duration_ms: clamp(source.entrance_duration_ms, DEFAULT_BRAND_TITLE.entrance_duration_ms, 200, 5000),
    exit_duration_ms: clamp(source.exit_duration_ms, DEFAULT_BRAND_TITLE.exit_duration_ms, 150, 3000),
    letter_stagger_ms: clamp(source.letter_stagger_ms, DEFAULT_BRAND_TITLE.letter_stagger_ms, 0, 250),
    amplitude_px: clamp(source.amplitude_px, DEFAULT_BRAND_TITLE.amplitude_px, 0, 80),
    overshoot: clamp(source.overshoot, DEFAULT_BRAND_TITLE.overshoot, 0, 0.45),
    cycle_seconds: clamp(source.cycle_seconds, DEFAULT_BRAND_TITLE.cycle_seconds, 2, 30),
    effect: loopEffect
  };
}

export function brandTitleInput(value) {
  if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value))) {
    throw new ValidationError('Настройки названия бренда должны быть объектом.');
  }
  const result = completeBrandTitle(value);
  if (result.enabled && !result.text) throw new ValidationError('Введите название бренда или выключите его отображение.');
  return result;
}
