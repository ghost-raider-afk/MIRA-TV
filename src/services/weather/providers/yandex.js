import { cityLocalTime, cityTimezone, fetchJson, normalisedSnapshot, weatherCoordinates } from './common.js';

const CONDITIONS = Object.freeze({
  clear:['Ясно',0,'sun'], 'partly-cloudy':['Малооблачно',2,'partly-cloudy'],
  cloudy:['Облачно с прояснениями',2,'partly-cloudy'], overcast:['Пасмурно',3,'cloud'],
  drizzle:['Морось',51,'rain'], 'light-rain':['Небольшой дождь',61,'rain'],
  rain:['Дождь',63,'rain'], 'moderate-rain':['Умеренный дождь',63,'rain'],
  'heavy-rain':['Сильный дождь',65,'rain'], 'continuous-heavy-rain':['Сильный дождь',65,'rain'],
  showers:['Ливень',80,'rain'], 'wet-snow':['Мокрый снег',71,'snow'],
  'light-snow':['Небольшой снег',71,'snow'], snow:['Снег',73,'snow'],
  'snow-showers':['Снегопад',75,'snow'], hail:['Град',96,'storm'],
  thunderstorm:['Гроза',95,'storm'], 'thunderstorm-with-rain':['Гроза с дождём',95,'storm'],
  'thunderstorm-with-hail':['Гроза с градом',96,'storm']
});

function state(condition, daytime = 'd') {
  const [label, weatherCode, baseIcon] = CONDITIONS[String(condition || '').toLowerCase()] || ['Погода',3,'cloud'];
  const isDay = daytime !== 'n';
  const icon = weatherCode === 0 ? (isDay?'sun':'moon')
    : baseIcon === 'partly-cloudy' && !isDay ? 'cloudy-night' : baseIcon;
  return { condition:label, weather_code:weatherCode, icon, is_day:isDay };
}

export function yandexConfigured(config) {
  return Boolean(String(config.yandexWeatherApiKey || '').trim());
}

export async function fetchYandex(settings, config) {
  if (!yandexConfigured(config)) {
    const error = new Error('Yandex Weather API key is not configured.');
    error.code = 'WEATHER_PROVIDER_NOT_CONFIGURED';
    throw error;
  }
  const { latitude, longitude } = weatherCoordinates(settings);
  const timezone = cityTimezone(settings?.timezone);
  const url = new URL('/v2/forecast', config.yandexWeatherBaseUrl);
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('lang', 'ru_RU');
  url.searchParams.set('limit', '2');
  url.searchParams.set('hours', 'true');
  url.searchParams.set('extra', 'false');
  const body = await fetchJson(url, {
    timeoutMs:config.weatherFetchTimeoutMs,
    headers:{ 'X-Yandex-Weather-Key':config.yandexWeatherApiKey }
  });
  const fact = body?.fact || {};
  const currentState = state(fact.condition, fact.daytime);
  const currentEpoch = Number(fact.obs_time || body?.now || Math.floor(Date.now()/1000));
  const forecast = [];
  const hours = (Array.isArray(body?.forecasts) ? body.forecasts : []).flatMap((day) => Array.isArray(day?.hours) ? day.hours : []);
  for (const hour of hours) {
    if (forecast.length >= 6) break;
    const epoch = Number(hour?.hour_ts);
    if (!Number.isFinite(epoch) || epoch*1000 < currentEpoch*1000 + 45*60*1000) continue;
    const itemState = state(hour.condition, 'd');
    forecast.push({
      time:cityLocalTime(epoch*1000, timezone),
      temperature:Number(hour.temp),
      weather_code:itemState.weather_code,
      icon:itemState.icon,
      precipitation_probability:0
    });
  }
  return normalisedSnapshot(settings, {
    timezone,
    updated_at:cityLocalTime(currentEpoch*1000, timezone),
    temperature:fact.temp,
    apparent_temperature:fact.feels_like,
    humidity:fact.humidity,
    wind_speed:Number(fact.wind_speed || 0) * 3.6,
    ...currentState,
    forecast
  });
}
