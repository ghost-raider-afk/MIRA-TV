import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeatherService, weatherCodeInfo, weatherLocation } from '../src/services/weather-service.js';

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

function config(overrides = {}) {
  return {
    weatherGeocodingUrl: 'https://weather.example/geocode',
    weatherForecastUrl: 'https://weather.example/forecast',
    weatherCacheSeconds: 900,
    weatherRequestTimeoutMs: 5000,
    weatherCacheMaxEntries: 32,
    ...overrides
  };
}

test('weather location input is compact and rejects empty values', () => {
  assert.equal(weatherLocation('  Berlin   Mitte '), 'Berlin Mitte');
  assert.throws(() => weatherLocation(' '), /Укажите город/);
  assert.throws(() => weatherLocation('x'.repeat(121)), /120/);
});

test('WMO weather codes are normalized into stable UI metadata', () => {
  assert.deepEqual(weatherCodeInfo(0), { code: 0, icon: '☀', label: 'Ясно' });
  assert.equal(weatherCodeInfo(63).label, 'Дождь');
  assert.equal(weatherCodeInfo(95).icon, '⛈');
  assert.equal(weatherCodeInfo(999).label, 'Нет данных');
});

test('weather service geocodes once, fetches forecast and reuses fresh cache', async () => {
  const calls = [];
  let timestamp = Date.parse('2026-08-30T08:00:00Z');
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    if (parsed.pathname === '/geocode') {
      return response({ results: [{ name: 'Берлин', country: 'Германия', admin1: 'Берлин', latitude: 52.52, longitude: 13.41, timezone: 'Europe/Berlin' }] });
    }
    return response({
      timezone: 'Europe/Berlin',
      current: { temperature_2m: 18.4, weather_code: 2 },
      daily: {
        time: ['2026-08-30', '2026-08-31'],
        weather_code: [2, 61],
        temperature_2m_max: [21.2, 19.1],
        temperature_2m_min: [12.6, 11.2]
      }
    });
  };
  const service = createWeatherService(config(), { fetchImpl, now: () => timestamp });
  const first = await service.get('Berlin');
  const second = await service.get('Berlin');

  assert.equal(calls.length, 2);
  assert.equal(first.location, 'Берлин');
  assert.equal(first.current.temperature_c, 18);
  assert.equal(first.current.label, 'Переменная облачность');
  assert.equal(first.daily[1].label, 'Дождь');
  assert.deepEqual(second, first);
  assert.equal(service.cacheSize, 1);

  timestamp += 901_000;
  await service.get('Berlin');
  assert.equal(calls.length, 4);
});

test('concurrent weather requests are coalesced and stale cache survives provider outage', async () => {
  let calls = 0;
  let timestamp = 1_000_000;
  let fail = false;
  const fetchImpl = async (url) => {
    calls += 1;
    if (fail) throw new Error('offline');
    const parsed = new URL(url);
    if (parsed.pathname === '/geocode') {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return response({ results: [{ name: 'Berlin', latitude: 52.52, longitude: 13.41 }] });
    }
    return response({ current: { temperature_2m: 10, weather_code: 0 }, daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] } });
  };
  const service = createWeatherService(config({ weatherCacheSeconds: 1 }), { fetchImpl, now: () => timestamp });
  const [a, b] = await Promise.all([service.get('Berlin'), service.get('Berlin')]);
  assert.equal(calls, 2);
  assert.deepEqual(a, b);

  timestamp += 2_000;
  fail = true;
  const stale = await service.get('Berlin');
  assert.equal(stale.stale, true);
  assert.equal(stale.current.temperature_c, 10);
});

test('weather service reports unknown locations without requesting forecast', async () => {
  let calls = 0;
  const service = createWeatherService(config(), {
    fetchImpl: async () => {
      calls += 1;
      return response({ results: [] });
    }
  });
  await assert.rejects(() => service.get('Unknown place'), /не найдено/);
  assert.equal(calls, 1);
});
