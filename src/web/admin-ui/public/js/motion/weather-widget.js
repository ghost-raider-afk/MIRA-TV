export const WEATHER_WIDGET_PRESETS = Object.freeze([
  Object.freeze({ id: 'glass', label: 'Стекло', motion: 'weather-float' }),
  Object.freeze({ id: 'minimal', label: 'Минимал', motion: 'weather-rise' }),
  Object.freeze({ id: 'neon', label: 'Неон', motion: 'weather-neon-pulse' }),
  Object.freeze({ id: 'aurora', label: 'Аврора', motion: 'weather-aurora-drift' }),
  Object.freeze({ id: 'chalk', label: 'Меловая', motion: 'weather-chalk-wobble' }),
  Object.freeze({ id: 'paper', label: 'Бумага', motion: 'weather-paper-breathe' }),
  Object.freeze({ id: 'midnight', label: 'Полночь', motion: 'weather-stars' }),
  Object.freeze({ id: 'sunrise', label: 'Рассвет', motion: 'weather-sunrise' }),
  Object.freeze({ id: 'marine', label: 'Море', motion: 'weather-wave' }),
  Object.freeze({ id: 'mono', label: 'Моно', motion: 'weather-scan' })
]);

const PRESET_IDS = new Set(WEATHER_WIDGET_PRESETS.map((item) => item.id));
const POSITIONS = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

export const WEATHER_SAMPLE = Object.freeze({
  location_name: 'Хельсинки',
  temperature: 18,
  apparent_temperature: 17,
  humidity: 64,
  wind_speed: 12,
  weather_code: 2,
  condition: 'Переменная облачность',
  icon: 'partly-cloudy',
  updated_at: new Date().toISOString(),
  forecast: Object.freeze([
    Object.freeze({ time: '2026-09-07T14:00', temperature: 19, icon: 'partly-cloudy', precipitation_probability: 10 }),
    Object.freeze({ time: '2026-09-07T16:00', temperature: 17, icon: 'cloud', precipitation_probability: 20 }),
    Object.freeze({ time: '2026-09-07T18:00', temperature: 15, icon: 'rain', precipitation_probability: 45 })
  ])
});

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function normaliseWeatherWidget(source = {}) {
  const value = source && typeof source === 'object' ? source : {};
  return {
    enabled: value.enabled === true,
    location_name: String(value.location_name || '').trim().slice(0, 120),
    latitude: Number.isFinite(Number(value.latitude)) ? Number(value.latitude) : null,
    longitude: Number.isFinite(Number(value.longitude)) ? Number(value.longitude) : null,
    timezone: String(value.timezone || 'auto'),
    preset: PRESET_IDS.has(value.preset) ? value.preset : 'glass',
    position: POSITIONS.has(value.position) ? value.position : 'top-right',
    refresh_minutes: Math.round(clamp(value.refresh_minutes, 5, 120, 15)),
    width_px: Math.round(clamp(value.width_px, 260, 760, 420)),
    opacity: clamp(value.opacity, .35, 1, .96),
    show_condition: value.show_condition !== false,
    show_feels_like: value.show_feels_like !== false,
    show_humidity: value.show_humidity !== false,
    show_wind: value.show_wind !== false,
    show_forecast: value.show_forecast !== false,
    forecast_items: Math.round(clamp(value.forecast_items, 1, 6, 3))
  };
}

function svgIcon(name) {
  const common = 'viewBox="0 0 64 64" aria-hidden="true" focusable="false"';
  if (name === 'sun') return `<svg ${common}><circle cx="32" cy="32" r="12"/><path d="M32 5v10M32 49v10M5 32h10M49 32h10M13 13l7 7M44 44l7 7M51 13l-7 7M20 44l-7 7"/></svg>`;
  if (name === 'moon') return `<svg ${common}><path d="M44 43A22 22 0 1 1 28 9a18 18 0 0 0 16 34Z"/></svg>`;
  if (name === 'rain') return `<svg ${common}><path d="M18 41h30a11 11 0 0 0-2-22 16 16 0 0 0-29 6A8 8 0 0 0 18 41Z"/><path d="m22 48-3 7M34 48l-3 7M46 48l-3 7"/></svg>`;
  if (name === 'snow') return `<svg ${common}><path d="M18 39h30a11 11 0 0 0-2-22 16 16 0 0 0-29 6A8 8 0 0 0 18 39Z"/><path d="M20 50h8M24 46v8M36 50h8M40 46v8"/></svg>`;
  if (name === 'storm') return `<svg ${common}><path d="M17 39h31a11 11 0 0 0-2-22 16 16 0 0 0-29 6A8 8 0 0 0 17 39Z"/><path d="m34 42-8 11h8l-4 7 13-14h-8l4-4Z"/></svg>`;
  if (name === 'fog') return `<svg ${common}><path d="M17 34h31a10 10 0 0 0-2-20 15 15 0 0 0-28 6A8 8 0 0 0 17 34Z"/><path d="M13 43h38M18 51h30"/></svg>`;
  if (name === 'cloud') return `<svg ${common}><path d="M16 43h33a12 12 0 0 0-3-23 17 17 0 0 0-31 7A9 9 0 0 0 16 43Z"/></svg>`;
  if (name === 'cloudy-night') return `<svg ${common}><path d="M43 23A15 15 0 0 1 31 6a17 17 0 0 0 18 24"/><path d="M14 48h34a10 10 0 0 0-2-19 15 15 0 0 0-28 6A8 8 0 0 0 14 48Z"/></svg>`;
  return `<svg ${common}><circle cx="23" cy="21" r="10"/><path d="M16 47h34a11 11 0 0 0-3-21 16 16 0 0 0-29 7A8 8 0 0 0 16 47Z"/></svg>`;
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function timeLabel(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function text(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

export function renderWeatherWidget(layer, settings, snapshot = WEATHER_SAMPLE) {
  if (!(layer instanceof HTMLElement)) return;
  const config = normaliseWeatherWidget(settings);
  layer.replaceChildren();
  layer.className = 'weather-widget-layer';
  layer.dataset.weatherEnabled = config.enabled ? 'true' : 'false';
  if (!config.enabled) return;

  const data = snapshot && typeof snapshot === 'object' ? snapshot : WEATHER_SAMPLE;
  const preset = WEATHER_WIDGET_PRESETS.find((item) => item.id === config.preset) || WEATHER_WIDGET_PRESETS[0];
  const card = document.createElement('section');
  card.className = `weather-widget weather-preset-${preset.id} ${preset.motion}`;
  card.dataset.position = config.position;
  card.style.setProperty('--weather-width', `${config.width_px}px`);
  card.style.setProperty('--weather-opacity', String(config.opacity));

  const top = document.createElement('div');
  top.className = 'weather-widget-main';
  const icon = document.createElement('div');
  icon.className = 'weather-widget-icon';
  icon.innerHTML = svgIcon(data.icon || 'cloud');
  const primary = document.createElement('div');
  primary.className = 'weather-widget-primary';
  primary.append(text('strong', 'weather-widget-location', data.location_name || config.location_name || 'Погода'));
  const temp = text('span', 'weather-widget-temperature', `${Math.round(number(data.temperature))}°`);
  primary.append(temp);
  if (config.show_condition) primary.append(text('span', 'weather-widget-condition', data.condition || 'Погода'));
  top.append(icon, primary);
  card.append(top);

  const facts = document.createElement('div');
  facts.className = 'weather-widget-facts';
  if (config.show_feels_like) facts.append(text('span', '', `Ощущается ${Math.round(number(data.apparent_temperature, data.temperature))}°`));
  if (config.show_humidity) facts.append(text('span', '', `Влажность ${Math.round(number(data.humidity))}%`));
  if (config.show_wind) facts.append(text('span', '', `Ветер ${Math.round(number(data.wind_speed))} км/ч`));
  if (facts.childElementCount) card.append(facts);

  if (config.show_forecast) {
    const forecast = document.createElement('div');
    forecast.className = 'weather-widget-forecast';
    for (const item of (Array.isArray(data.forecast) ? data.forecast : []).slice(0, config.forecast_items)) {
      const entry = document.createElement('div');
      entry.className = 'weather-widget-forecast-item';
      entry.append(text('span', '', timeLabel(item.time)));
      const mini = document.createElement('i');
      mini.innerHTML = svgIcon(item.icon || 'cloud');
      entry.append(mini, text('strong', '', `${Math.round(number(item.temperature))}°`));
      forecast.append(entry);
    }
    if (forecast.childElementCount) card.append(forecast);
  }

  layer.append(card);
}
