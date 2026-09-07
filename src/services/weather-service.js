const cache = new Map();

function finite(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function controller(timeoutMs) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  return { signal: abort.signal, done: () => clearTimeout(timer) };
}

async function fetchJson(url, config) {
  const request = controller(config.weatherFetchTimeoutMs);
  try {
    const response = await fetch(url, { signal: request.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Weather provider HTTP ${response.status}`);
    return await response.json();
  } finally {
    request.done();
  }
}

function condition(code) {
  const value = Number(code);
  if (value === 0) return 'Ясно';
  if ([1, 2].includes(value)) return 'Переменная облачность';
  if (value === 3) return 'Облачно';
  if ([45, 48].includes(value)) return 'Туман';
  if ([51, 53, 55, 56, 57].includes(value)) return 'Морось';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return 'Дождь';
  if ([71, 73, 75, 77, 85, 86].includes(value)) return 'Снег';
  if ([95, 96, 99].includes(value)) return 'Гроза';
  return 'Погода';
}

function icon(code, isDay = true) {
  const value = Number(code);
  if (value === 0) return isDay ? 'sun' : 'moon';
  if ([1, 2].includes(value)) return isDay ? 'partly-cloudy' : 'cloudy-night';
  if (value === 3) return 'cloud';
  if ([45, 48].includes(value)) return 'fog';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(value)) return 'snow';
  if ([95, 96, 99].includes(value)) return 'storm';
  return 'cloud';
}

function cacheKey(latitude, longitude, timezone) {
  return `${latitude.toFixed(3)}:${longitude.toFixed(3)}:${timezone || 'auto'}`;
}

function forecastItems(hourly, count) {
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const temperatures = Array.isArray(hourly?.temperature_2m) ? hourly.temperature_2m : [];
  const codes = Array.isArray(hourly?.weather_code) ? hourly.weather_code : [];
  const probabilities = Array.isArray(hourly?.precipitation_probability) ? hourly.precipitation_probability : [];
  const now = Date.now();
  const result = [];
  for (let index = 0; index < times.length && result.length < count; index += 1) {
    const timestamp = Date.parse(times[index]);
    if (!Number.isFinite(timestamp) || timestamp < now + 45 * 60 * 1000) continue;
    result.push({
      time: times[index],
      temperature: Number(temperatures[index]),
      weather_code: Number(codes[index]),
      icon: icon(codes[index], true),
      precipitation_probability: Number(probabilities[index] || 0)
    });
  }
  return result;
}

export async function searchWeatherLocations(query, config) {
  const name = String(query || '').trim();
  if (name.length < 2 || name.length > 120) return [];
  const url = new URL('/v1/search', config.weatherGeocodingBaseUrl);
  url.searchParams.set('name', name);
  url.searchParams.set('count', '8');
  url.searchParams.set('language', 'ru');
  url.searchParams.set('format', 'json');
  const body = await fetchJson(url, config);
  return (Array.isArray(body?.results) ? body.results : []).map((item) => ({
    name: item.name || '',
    admin1: item.admin1 || '',
    country: item.country || '',
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    timezone: item.timezone || 'auto'
  })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
}

export async function getWeatherSnapshot(settings, config, { force = false } = {}) {
  const latitude = finite(settings?.latitude, -90, 90);
  const longitude = finite(settings?.longitude, -180, 180);
  if (latitude === null || longitude === null) throw new Error('Weather coordinates are not configured.');
  const timezone = String(settings?.timezone || 'auto');
  const key = cacheKey(latitude, longitude, timezone);
  const cached = cache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

  const url = new URL('/v1/forecast', config.weatherProviderBaseUrl);
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('timezone', timezone || 'auto');
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day');
  url.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set('wind_speed_unit', 'kmh');
  const body = await fetchJson(url, config);
  const current = body?.current || {};
  const isDay = Number(current.is_day) !== 0;
  const value = Object.freeze({
    location_name: String(settings?.location_name || '').trim(),
    latitude,
    longitude,
    timezone: body?.timezone || timezone,
    updated_at: current.time || new Date().toISOString(),
    temperature: Number(current.temperature_2m),
    apparent_temperature: Number(current.apparent_temperature),
    humidity: Number(current.relative_humidity_2m),
    wind_speed: Number(current.wind_speed_10m),
    weather_code: Number(current.weather_code),
    is_day: isDay,
    condition: condition(current.weather_code),
    icon: icon(current.weather_code, isDay),
    forecast: forecastItems(body?.hourly, 6)
  });
  cache.set(key, { expiresAt: Date.now() + config.weatherCacheSeconds * 1000, value });
  if (cache.size > 256) {
    for (const [candidate, record] of cache) {
      if (record.expiresAt <= Date.now()) cache.delete(candidate);
      if (cache.size <= 192) break;
    }
  }
  return value;
}
