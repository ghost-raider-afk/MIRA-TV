import { cityLocalTime, cityTimezone, fetchJson, normalisedSnapshot, weatherCoordinates } from './common.js';

function metState(symbolCode = '') {
  const code = String(symbolCode || '').toLowerCase();
  const isDay = !code.includes('_night');
  if (code.includes('thunder')) return { weather_code:95, condition:'Гроза', icon:'storm', is_day:isDay };
  if (code.includes('snow') || code.includes('sleet')) return { weather_code:71, condition:'Снег', icon:'snow', is_day:isDay };
  if (code.includes('rain') || code.includes('drizzle')) return { weather_code:61, condition:'Дождь', icon:'rain', is_day:isDay };
  if (code.includes('fog')) return { weather_code:45, condition:'Туман', icon:'fog', is_day:isDay };
  if (code.includes('partlycloudy') || code.includes('fair')) return { weather_code:2, condition:'Переменная облачность', icon:isDay?'partly-cloudy':'cloudy-night', is_day:isDay };
  if (code.includes('cloudy')) return { weather_code:3, condition:'Облачно', icon:'cloud', is_day:isDay };
  return { weather_code:0, condition:'Ясно', icon:isDay?'sun':'moon', is_day:isDay };
}

function symbol(item) {
  return item?.data?.next_1_hours?.summary?.symbol_code
    || item?.data?.next_6_hours?.summary?.symbol_code
    || item?.data?.next_12_hours?.summary?.symbol_code
    || 'cloudy';
}

export async function fetchMetNo(settings, config) {
  const { latitude, longitude } = weatherCoordinates(settings);
  const timezone = cityTimezone(settings?.timezone);
  const url = new URL('/weatherapi/locationforecast/2.0/compact', config.metNoWeatherBaseUrl);
  url.searchParams.set('lat', latitude.toFixed(4));
  url.searchParams.set('lon', longitude.toFixed(4));
  const userAgent = `MIRA-TV/${config.appVersion} (${config.domain})`;
  const body = await fetchJson(url, {
    timeoutMs:config.weatherFetchTimeoutMs,
    headers:{ 'user-agent':userAgent }
  });
  const series = Array.isArray(body?.properties?.timeseries) ? body.properties.timeseries : [];
  if (!series.length) throw new Error('MET Norway returned no forecast data.');
  const current = series[0];
  const currentDetails = current?.data?.instant?.details || {};
  const currentState = metState(symbol(current));
  const currentMs = Date.parse(current.time);
  const forecast = [];
  for (const item of series) {
    if (forecast.length >= 6) break;
    const timestamp = Date.parse(item?.time);
    if (!Number.isFinite(timestamp) || (Number.isFinite(currentMs) && timestamp < currentMs + 45*60*1000)) continue;
    const details = item?.data?.instant?.details || {};
    const state = metState(symbol(item));
    forecast.push({
      time:cityLocalTime(timestamp, timezone),
      temperature:Number(details.air_temperature),
      weather_code:state.weather_code,
      icon:state.icon,
      precipitation_probability:0
    });
  }
  return normalisedSnapshot(settings, {
    timezone,
    updated_at:cityLocalTime(current.time, timezone),
    temperature:currentDetails.air_temperature,
    apparent_temperature:currentDetails.air_temperature,
    humidity:currentDetails.relative_humidity,
    wind_speed:Number(currentDetails.wind_speed || 0) * 3.6,
    ...currentState,
    forecast
  });
}
