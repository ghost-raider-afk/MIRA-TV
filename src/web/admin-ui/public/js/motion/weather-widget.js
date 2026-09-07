const POSITIONS = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

export const WEATHER_SAMPLE = Object.freeze({
  location_name: 'Хельсинки',
  temperature: 18,
  apparent_temperature: 17,
  humidity: 64,
  wind_speed: 12,
  weather_code: 61,
  is_day: true,
  condition: 'Дождь',
  icon: 'rain',
  updated_at: new Date().toISOString(),
  forecast: Object.freeze([
    Object.freeze({ time: '2026-09-07T14:00', temperature: 19, icon: 'rain', precipitation_probability: 70 }),
    Object.freeze({ time: '2026-09-07T16:00', temperature: 17, icon: 'cloud', precipitation_probability: 35 }),
    Object.freeze({ time: '2026-09-07T18:00', temperature: 15, icon: 'partly-cloudy', precipitation_probability: 20 })
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
    preset: 'adaptive',
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

export function weatherVisualState(snapshot = WEATHER_SAMPLE) {
  const code = Number(snapshot?.weather_code);
  const isDay = snapshot?.is_day !== false;
  if ([95, 96, 99].includes(code)) return 'storm';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([45, 48].includes(code)) return 'fog';
  if (code === 3) return 'cloudy';
  if ([1, 2].includes(code)) return isDay ? 'partly-cloudy-day' : 'partly-cloudy-night';
  if (code === 0) return isDay ? 'clear-day' : 'clear-night';
  return isDay ? 'cloudy' : 'partly-cloudy-night';
}

function effectNode(className, count = 1) {
  const container = document.createElement('div');
  container.className = className;
  container.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < count; index += 1) {
    const item = document.createElement('i');
    item.style.setProperty('--i', String(index));
    container.append(item);
  }
  return container;
}

function createAtmosphere(state) {
  const atmosphere = document.createElement('div');
  atmosphere.className = `weather-atmosphere weather-atmosphere-${state}`;
  atmosphere.setAttribute('aria-hidden', 'true');

  if (state === 'rain' || state === 'drizzle' || state === 'storm') {
    atmosphere.append(effectNode('weather-rain', state === 'drizzle' ? 14 : 24));
    atmosphere.append(effectNode('weather-clouds', 3));
    if (state === 'storm') atmosphere.append(effectNode('weather-lightning', 2));
  } else if (state === 'snow') {
    atmosphere.append(effectNode('weather-snow', 28), effectNode('weather-clouds', 3));
  } else if (state === 'fog') {
    atmosphere.append(effectNode('weather-fog', 4));
  } else if (state === 'cloudy' || state.startsWith('partly-cloudy')) {
    atmosphere.append(effectNode('weather-clouds', state === 'cloudy' ? 4 : 3));
    if (state.endsWith('night')) atmosphere.append(effectNode('weather-stars', 14));
    else atmosphere.append(effectNode('weather-sun-rays', 8));
  } else if (state === 'clear-night') {
    atmosphere.append(effectNode('weather-stars', 20), effectNode('weather-moon-glow', 1));
  } else {
    atmosphere.append(effectNode('weather-sun-rays', 12), effectNode('weather-sun-glow', 1));
  }
  return atmosphere;
}

export function renderWeatherWidget(layer, settings, snapshot = WEATHER_SAMPLE) {
  if (!(layer instanceof HTMLElement)) return;
  const config = normaliseWeatherWidget(settings);
  layer.replaceChildren();
  layer.className = 'weather-widget-layer';
  layer.dataset.weatherEnabled = config.enabled ? 'true' : 'false';
  if (!config.enabled) return;

  const data = snapshot && typeof snapshot === 'object' ? snapshot : WEATHER_SAMPLE;
  const state = weatherVisualState(data);
  const card = document.createElement('section');
  card.className = 'weather-widget weather-widget-adaptive';
  card.dataset.weatherState = state;
  card.dataset.position = config.position;
  card.style.setProperty('--weather-width', `${config.width_px}px`);
  card.style.setProperty('--weather-opacity', String(config.opacity));
  card.append(createAtmosphere(state));

  const content = document.createElement('div');
  content.className = 'weather-widget-content';
  const top = document.createElement('div');
  top.className = 'weather-widget-main';
  const icon = document.createElement('div');
  icon.className = 'weather-widget-icon';
  icon.innerHTML = svgIcon(data.icon || 'cloud');
  const primary = document.createElement('div');
  primary.className = 'weather-widget-primary';
  primary.append(text('strong', 'weather-widget-location', data.location_name || config.location_name || 'Погода'));
  primary.append(text('span', 'weather-widget-temperature', `${Math.round(number(data.temperature))}°`));
  if (config.show_condition) primary.append(text('span', 'weather-widget-condition', data.condition || 'Погода'));
  top.append(icon, primary);
  content.append(top);

  const facts = document.createElement('div');
  facts.className = 'weather-widget-facts';
  if (config.show_feels_like) facts.append(text('span', '', `Ощущается ${Math.round(number(data.apparent_temperature, data.temperature))}°`));
  if (config.show_humidity) facts.append(text('span', '', `Влажность ${Math.round(number(data.humidity))}%`));
  if (config.show_wind) facts.append(text('span', '', `Ветер ${Math.round(number(data.wind_speed))} км/ч`));
  if (facts.childElementCount) content.append(facts);

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
    if (forecast.childElementCount) content.append(forecast);
  }

  card.append(content);
  layer.append(card);
}
