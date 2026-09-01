import { AppError, NotFoundError, ValidationError } from '../shared/errors.js';

const CODE_GROUPS = Object.freeze([
  { codes: [0], icon: '☀', label: 'Ясно' },
  { codes: [1, 2], icon: '🌤', label: 'Переменная облачность' },
  { codes: [3], icon: '☁', label: 'Облачно' },
  { codes: [45, 48], icon: '🌫', label: 'Туман' },
  { codes: [51, 53, 55, 56, 57], icon: '🌦', label: 'Морось' },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], icon: '🌧', label: 'Дождь' },
  { codes: [71, 73, 75, 77, 85, 86], icon: '🌨', label: 'Снег' },
  { codes: [95, 96, 99], icon: '⛈', label: 'Гроза' }
]);

const sharedServices = new WeakMap();

export function weatherLocation(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (text.length < 2 || text.length > 120) throw new ValidationError('Укажите город или населённый пункт длиной от 2 до 120 символов.');
  return text;
}

export function weatherCodeInfo(value) {
  const code = Number(value);
  const group = CODE_GROUPS.find((item) => item.codes.includes(code));
  return group ? { code, icon: group.icon, label: group.label } : { code: Number.isFinite(code) ? code : -1, icon: '•', label: 'Нет данных' };
}

function endpoint(value, name) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
    return url;
  } catch {
    throw new Error(`${name} должен быть корректным HTTP(S) URL.`);
  }
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response?.ok) throw new AppError(`Погодный провайдер ответил HTTP ${response?.status || 0}.`, { status: 502, code: 'weather_provider_error' });
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new AppError('Погодный провайдер не ответил вовремя.', { status: 504, code: 'weather_provider_timeout', cause: error });
    if (error instanceof AppError) throw error;
    throw new AppError('Погодный провайдер временно недоступен.', { status: 502, code: 'weather_provider_unavailable', cause: error });
  } finally {
    clearTimeout(timer);
  }
}

function roundTemperature(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function normaliseForecast(location, place, forecast, fetchedAt) {
  const currentCode = weatherCodeInfo(forecast?.current?.weather_code);
  const dates = Array.isArray(forecast?.daily?.time) ? forecast.daily.time : [];
  const dailyCodes = Array.isArray(forecast?.daily?.weather_code) ? forecast.daily.weather_code : [];
  const max = Array.isArray(forecast?.daily?.temperature_2m_max) ? forecast.daily.temperature_2m_max : [];
  const min = Array.isArray(forecast?.daily?.temperature_2m_min) ? forecast.daily.temperature_2m_min : [];
  const daily = dates.slice(0, 2).map((date, index) => {
    const code = weatherCodeInfo(dailyCodes[index]);
    return {
      date: String(date),
      temperature_max_c: roundTemperature(max[index]),
      temperature_min_c: roundTemperature(min[index]),
      weather_code: code.code,
      label: code.label,
      icon: code.icon
    };
  });
  return {
    requested_location: location,
    location: String(place?.name || location),
    region: String(place?.admin1 || ''),
    country: String(place?.country || ''),
    latitude: Number(place?.latitude),
    longitude: Number(place?.longitude),
    timezone: String(forecast?.timezone || place?.timezone || 'auto'),
    current: {
      temperature_c: roundTemperature(forecast?.current?.temperature_2m),
      weather_code: currentCode.code,
      label: currentCode.label,
      icon: currentCode.icon
    },
    daily,
    fetched_at: fetchedAt,
    stale: false
  };
}

function pruneCache(cache, maximum) {
  while (cache.size > maximum) cache.delete(cache.keys().next().value);
}

export function createWeatherService(config, options = {}) {
  const useShared = config && typeof config === 'object' && options.fetchImpl === undefined && options.now === undefined;
  if (useShared && sharedServices.has(config)) return sharedServices.get(config);

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => Date.now());
  if (typeof fetchImpl !== 'function') throw new TypeError('Weather service requires fetch.');
  const geocodingEndpoint = endpoint(config.weatherGeocodingUrl, 'WEATHER_GEOCODING_URL');
  const forecastEndpoint = endpoint(config.weatherForecastUrl, 'WEATHER_FORECAST_URL');
  const cacheMs = Number(config.weatherCacheSeconds) * 1000;
  const timeoutMs = Number(config.weatherRequestTimeoutMs);
  const maxEntries = Number(config.weatherCacheMaxEntries);
  if (!Number.isSafeInteger(cacheMs) || cacheMs < 1000) throw new Error('WEATHER_CACHE_SECONDS должен быть положительным целым числом.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100) throw new Error('WEATHER_REQUEST_TIMEOUT_MS должен быть положительным целым числом.');
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error('WEATHER_CACHE_MAX_ENTRIES должен быть положительным целым числом.');

  const cache = new Map();
  const inFlight = new Map();

  async function load(location) {
    const geocodeUrl = new URL(geocodingEndpoint);
    geocodeUrl.searchParams.set('name', location);
    geocodeUrl.searchParams.set('count', '1');
    geocodeUrl.searchParams.set('language', 'ru');
    geocodeUrl.searchParams.set('format', 'json');
    const geocode = await fetchJson(fetchImpl, geocodeUrl, timeoutMs);
    const place = Array.isArray(geocode?.results) ? geocode.results[0] : null;
    if (!place || !Number.isFinite(Number(place.latitude)) || !Number.isFinite(Number(place.longitude))) {
      throw new NotFoundError(`Место «${location}» не найдено.`, { code: 'weather_location_not_found' });
    }

    const forecastUrl = new URL(forecastEndpoint);
    forecastUrl.searchParams.set('latitude', String(place.latitude));
    forecastUrl.searchParams.set('longitude', String(place.longitude));
    forecastUrl.searchParams.set('current', 'temperature_2m,weather_code');
    forecastUrl.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    forecastUrl.searchParams.set('forecast_days', '2');
    forecastUrl.searchParams.set('timezone', 'auto');
    const forecast = await fetchJson(fetchImpl, forecastUrl, timeoutMs);
    return normaliseForecast(location, place, forecast, new Date(now()).toISOString());
  }

  async function get(value) {
    const location = weatherLocation(value);
    const key = location.toLocaleLowerCase('ru-RU');
    const timestamp = now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > timestamp) return cached.data;
    if (inFlight.has(key)) return inFlight.get(key);

    const operation = load(location)
      .then((data) => {
        cache.delete(key);
        cache.set(key, { data, expiresAt: now() + cacheMs });
        pruneCache(cache, maxEntries);
        return data;
      })
      .catch((error) => {
        if (cached?.data) return { ...cached.data, stale: true };
        throw error;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, operation);
    return operation;
  }

  const service = Object.freeze({ get, get cacheSize() { return cache.size; } });
  if (useShared) sharedServices.set(config, service);
  return service;
}
