const cache = new Map();

function finite(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function hasWeatherCoordinates(settings) {
  return finite(settings?.latitude, -90, 90) !== null
    && finite(settings?.longitude, -180, 180) !== null;
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

function cityTimezone(value) {
  const timezone = String(value || 'auto').trim() || 'auto';
  if (timezone === 'auto') return timezone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return timezone;
  } catch {
    throw new Error('Weather timezone is invalid.');
  }
}

function wallClockMs(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(value || ''));
  if (!match) return Number.NaN;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0)
  );
}

function forecastItems(hourly, count, currentTime) {
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const temperatures = Array.isArray(hourly?.temperature_2m) ? hourly.temperature_2m : [];
  const codes = Array.isArray(hourly?.weather_code) ? hourly.weather_code : [];
  const probabilities = Array.isArray(hourly?.precipitation_probability) ? hourly.precipitation_probability : [];
  const currentWallClock = wallClockMs(currentTime);
  const threshold = Number.isFinite(currentWallClock) ? currentWallClock + 45 * 60 * 1000 : Number.NEGATIVE_INFINITY;
  const result = [];
  for (let index = 0; index < times.length && result.length < count; index += 1) {
    const timestamp = wallClockMs(times[index]);
    if (!Number.isFinite(timestamp) || timestamp < threshold) continue;
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
  const timezone = cityTimezone(settings?.timezone);
  const key = cacheKey(latitude, longitude, timezone);
  const cached = cache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) {
    const locationName = String(settings?.location_name || '').trim();
    if (cached.value.location_name === locationName) return cached.value;
    return Object.freeze({ ...cached.value, location_name: locationName });
  }

  const url = new URL('/v1/forecast', config.weatherProviderBaseUrl);
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('timezone', timezone || 'auto');
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day');
  url.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set('wind_speed_unit', 'kmh');
  let body;
  try {
    body = await fetchJson(url, config);
  } catch (error) {
    if (!force && cached?.value) {
      const locationName = String(settings?.location_name || '').trim();
      return cached.value.location_name === locationName
        ? cached.value
        : Object.freeze({ ...cached.value, location_name: locationName });
    }
    throw error;
  }
  const current = body?.current || {};
  const isDay = Number(current.is_day) !== 0;
  const value = Object.freeze({
    location_name: String(settings?.location_name || '').trim(),
    latitude,
    longitude,
    timezone: timezone === 'auto' ? cityTimezone(body?.timezone || 'UTC') : timezone,
    updated_at: current.time || new Date().toISOString(),
    temperature: Number(current.temperature_2m),
    apparent_temperature: Number(current.apparent_temperature),
    humidity: Number(current.relative_humidity_2m),
    wind_speed: Number(current.wind_speed_10m),
    weather_code: Number(current.weather_code),
    is_day: isDay,
    condition: condition(current.weather_code),
    icon: icon(current.weather_code, isDay),
    forecast: forecastItems(body?.hourly, 6, current.time)
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
