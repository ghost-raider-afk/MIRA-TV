import { ValidationError } from '../shared/errors.js';

export const WEATHER_PRESETS = Object.freeze([
  'glass', 'minimal', 'neon', 'aurora', 'chalk',
  'paper', 'midnight', 'sunrise', 'marine', 'mono'
]);

export const WEATHER_POSITIONS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

export const DEFAULT_WEATHER_WIDGET = Object.freeze({
  enabled: false,
  location_name: '',
  latitude: null,
  longitude: null,
  timezone: 'auto',
  preset: 'glass',
  position: 'top-right',
  refresh_minutes: 15,
  width_px: 420,
  opacity: 0.96,
  show_condition: true,
  show_feels_like: true,
  show_humidity: true,
  show_wind: true,
  show_forecast: true,
  forecast_items: 3
});

function booleanValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function numberValue(value, fallback, min, max) {
  const number = value === null || value === '' || value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function integerValue(value, fallback, min, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

function locationName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function timezone(value) {
  const text = typeof value === 'string' ? value.trim() : 'auto';
  if (text === 'auto') return text;
  return /^[A-Za-z0-9_+\-/]{1,64}$/.test(text) ? text : 'auto';
}

export function completeWeatherWidget(source = {}) {
  const value = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const preset = WEATHER_PRESETS.includes(value.preset) ? value.preset : DEFAULT_WEATHER_WIDGET.preset;
  const position = WEATHER_POSITIONS.includes(value.position) ? value.position : DEFAULT_WEATHER_WIDGET.position;
  return {
    enabled: booleanValue(value.enabled, DEFAULT_WEATHER_WIDGET.enabled),
    location_name: locationName(value.location_name),
    latitude: numberValue(value.latitude, null, -90, 90),
    longitude: numberValue(value.longitude, null, -180, 180),
    timezone: timezone(value.timezone),
    preset,
    position,
    refresh_minutes: integerValue(value.refresh_minutes, DEFAULT_WEATHER_WIDGET.refresh_minutes, 5, 120),
    width_px: integerValue(value.width_px, DEFAULT_WEATHER_WIDGET.width_px, 260, 760),
    opacity: numberValue(value.opacity, DEFAULT_WEATHER_WIDGET.opacity, 0.35, 1),
    show_condition: booleanValue(value.show_condition, DEFAULT_WEATHER_WIDGET.show_condition),
    show_feels_like: booleanValue(value.show_feels_like, DEFAULT_WEATHER_WIDGET.show_feels_like),
    show_humidity: booleanValue(value.show_humidity, DEFAULT_WEATHER_WIDGET.show_humidity),
    show_wind: booleanValue(value.show_wind, DEFAULT_WEATHER_WIDGET.show_wind),
    show_forecast: booleanValue(value.show_forecast, DEFAULT_WEATHER_WIDGET.show_forecast),
    forecast_items: integerValue(value.forecast_items, DEFAULT_WEATHER_WIDGET.forecast_items, 1, 6)
  };
}

export function weatherWidgetInput(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new ValidationError('Настройки виджета погоды должны быть объектом.');
  }
  const current = completeWeatherWidget(source);
  if (current.enabled && (!Number.isFinite(current.latitude) || !Number.isFinite(current.longitude))) {
    throw new ValidationError('Для включённого виджета погоды выберите населённый пункт.');
  }
  if (!WEATHER_PRESETS.includes(current.preset)) throw new ValidationError('Неизвестный пресет погоды.');
  if (!WEATHER_POSITIONS.includes(current.position)) throw new ValidationError('Неизвестное положение виджета погоды.');
  return current;
}

export function weatherTargetScreenIds(value) {
  if (!Array.isArray(value) || value.length < 1) throw new ValidationError('Выберите хотя бы один монитор.');
  const ids = [...new Set(value.map(Number))];
  if (ids.length > 200 || ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    throw new ValidationError('Список мониторов для погоды указан неверно.');
  }
  return ids;
}
