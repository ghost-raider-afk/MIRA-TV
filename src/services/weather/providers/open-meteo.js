import { cityTimezone, fetchJson, normalisedSnapshot, weatherCoordinates, wmoCondition, wmoIcon } from './common.js';

function wallClockMs(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(value || ''));
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2])-1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0));
}

function forecastItems(hourly, currentTime) {
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const temperatures = Array.isArray(hourly?.temperature_2m) ? hourly.temperature_2m : [];
  const codes = Array.isArray(hourly?.weather_code) ? hourly.weather_code : [];
  const probabilities = Array.isArray(hourly?.precipitation_probability) ? hourly.precipitation_probability : [];
  const current = wallClockMs(currentTime);
  const threshold = Number.isFinite(current) ? current + 45 * 60 * 1000 : Number.NEGATIVE_INFINITY;
  const result = [];
  for (let index=0; index<times.length && result.length<6; index+=1) {
    const timestamp = wallClockMs(times[index]);
    if (!Number.isFinite(timestamp) || timestamp < threshold) continue;
    const code = Number(codes[index]);
    result.push({
      time:times[index],
      temperature:Number(temperatures[index]),
      weather_code:code,
      icon:wmoIcon(code, true),
      precipitation_probability:Number(probabilities[index] || 0)
    });
  }
  return result;
}

export async function fetchOpenMeteo(settings, config) {
  const { latitude, longitude } = weatherCoordinates(settings);
  const timezone = cityTimezone(settings?.timezone);
  const url = new URL('/v1/forecast', config.weatherProviderBaseUrl);
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('timezone', timezone);
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day');
  url.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set('wind_speed_unit', 'kmh');
  const body = await fetchJson(url, { timeoutMs:config.weatherFetchTimeoutMs });
  const current = body?.current || {};
  const isDay = Number(current.is_day) !== 0;
  const code = Number(current.weather_code);
  return normalisedSnapshot(settings, {
    timezone:body?.timezone || timezone,
    updated_at:current.time,
    temperature:current.temperature_2m,
    apparent_temperature:current.apparent_temperature,
    humidity:current.relative_humidity_2m,
    wind_speed:current.wind_speed_10m,
    weather_code:code,
    is_day:isDay,
    condition:wmoCondition(code),
    icon:wmoIcon(code, isDay),
    forecast:forecastItems(body?.hourly, current.time)
  });
}
