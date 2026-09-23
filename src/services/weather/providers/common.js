function finite(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function weatherCoordinates(settings) {
  const latitude = finite(settings?.latitude, -90, 90);
  const longitude = finite(settings?.longitude, -180, 180);
  if (latitude === null || longitude === null) throw new Error('Weather coordinates are not configured.');
  return { latitude, longitude };
}

export function cityTimezone(value, fallback = 'UTC') {
  const timezone = String(value || 'auto').trim() || 'auto';
  if (timezone === 'auto') return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return timezone;
  } catch {
    throw new Error('Weather timezone is invalid.');
  }
}

export function weatherSourceKey(settings) {
  const { latitude, longitude } = weatherCoordinates(settings);
  const timezone = cityTimezone(settings?.timezone);
  return `${latitude.toFixed(4)}:${longitude.toFixed(4)}:${timezone}`;
}

export async function fetchJson(url, { timeoutMs, headers = {} }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept:'application/json', ...headers }
    });
    if (!response.ok) {
      const error = new Error(`Weather provider HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function cityLocalTime(value, timezone) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export function wmoCondition(code) {
  const value = Number(code);
  if (value === 0) return 'Ясно';
  if ([1,2].includes(value)) return 'Переменная облачность';
  if (value === 3) return 'Облачно';
  if ([45,48].includes(value)) return 'Туман';
  if ([51,53,55,56,57].includes(value)) return 'Морось';
  if ([61,63,65,66,67,80,81,82].includes(value)) return 'Дождь';
  if ([71,73,75,77,85,86].includes(value)) return 'Снег';
  if ([95,96,99].includes(value)) return 'Гроза';
  return 'Погода';
}

export function wmoIcon(code, isDay = true) {
  const value = Number(code);
  if (value === 0) return isDay ? 'sun' : 'moon';
  if ([1,2].includes(value)) return isDay ? 'partly-cloudy' : 'cloudy-night';
  if (value === 3) return 'cloud';
  if ([45,48].includes(value)) return 'fog';
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(value)) return 'rain';
  if ([71,73,75,77,85,86].includes(value)) return 'snow';
  if ([95,96,99].includes(value)) return 'storm';
  return 'cloud';
}

export function normalisedSnapshot(settings, fields) {
  const { latitude, longitude } = weatherCoordinates(settings);
  const timezone = cityTimezone(settings?.timezone, fields.timezone || 'UTC');
  return Object.freeze({
    location_name: String(settings?.location_name || '').trim(),
    latitude,
    longitude,
    timezone,
    updated_at: fields.updated_at || new Date().toISOString(),
    temperature: Number(fields.temperature),
    apparent_temperature: Number(fields.apparent_temperature ?? fields.temperature),
    humidity: Number(fields.humidity || 0),
    wind_speed: Number(fields.wind_speed || 0),
    weather_code: Number(fields.weather_code || 0),
    is_day: fields.is_day !== false,
    condition: fields.condition || wmoCondition(fields.weather_code),
    icon: fields.icon || wmoIcon(fields.weather_code, fields.is_day !== false),
    forecast: Array.isArray(fields.forecast) ? fields.forecast.slice(0, 6) : []
  });
}
