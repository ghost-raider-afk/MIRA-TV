import assert from 'node:assert/strict';
import test from 'node:test';
import { WeatherService } from '../src/services/weather-service.js';

const SETTINGS = Object.freeze({
  enabled:true,
  location_name:'Комсомольск-на-Амуре',
  latitude:50.55034,
  longitude:137.00995,
  timezone:'Asia/Vladivostok',
  refresh_minutes:15
});

const CONFIG = Object.freeze({
  appVersion:'1.14.0',
  domain:'mira-tv.test',
  metNoWeatherBaseUrl:'https://met.test',
  weatherProviderBaseUrl:'https://open.test',
  weatherGeocodingBaseUrl:'https://geo.test',
  weatherProviderOrder:Object.freeze(['met-no','open-meteo']),
  weatherFetchTimeoutMs:1000,
  weatherProviderCooldownSeconds:300,
  weatherCacheSeconds:600,
  weatherCollectorIntervalSeconds:60
});

function metResponse() {
  return {
    properties:{
      timeseries:[
        { time:'2026-09-23T06:00:00Z', data:{
          instant:{details:{air_temperature:14.5,relative_humidity:24.7,wind_speed:3.1}},
          next_1_hours:{summary:{symbol_code:'clearsky_day'},details:{precipitation_amount:0}}
        }},
        { time:'2026-09-23T07:00:00Z', data:{
          instant:{details:{air_temperature:14,relative_humidity:32.4,wind_speed:2.4}},
          next_1_hours:{summary:{symbol_code:'clearsky_day'},details:{precipitation_amount:0}}
        }},
        { time:'2026-09-23T08:00:00Z', data:{
          instant:{details:{air_temperature:12.2,relative_humidity:40,wind_speed:2}},
          next_1_hours:{summary:{symbol_code:'partlycloudy_day'},details:{precipitation_amount:0}}
        }}
      ]
    }
  };
}

function openMeteoResponse() {
  return {
    timezone:'UTC',
    current:{
      time:'2026-09-23T16:10',
      temperature_2m:11,
      apparent_temperature:9,
      relative_humidity_2m:55,
      weather_code:3,
      wind_speed_10m:12,
      is_day:1
    },
    hourly:{
      time:['2026-09-23T16:00','2026-09-23T17:00','2026-09-23T18:00','2026-09-23T19:00'],
      temperature_2m:[11,10,9,8],
      weather_code:[3,3,2,2],
      precipitation_probability:[5,10,10,5]
    }
  };
}

function storeFixture() {
  const snapshots = new Map();
  const statuses = new Map();
  const events = [];
  let documents = [];
  return {
    snapshots, statuses, events,
    set documents(value) { documents = value; },
    async getWeatherSnapshotRecord(key) { return snapshots.get(key) || null; },
    async upsertWeatherSnapshotRecord(record) {
      const saved = { ...record, updated_at:new Date().toISOString() };
      snapshots.set(record.source_key, saved);
      return saved;
    },
    async listWeatherSceneDocuments() { return documents; },
    async getWeatherProviderStatus(provider) { return statuses.get(provider) || null; },
    async setWeatherProviderStatus({ provider, status, error = '', cooldownUntil = null }) {
      const previous = statuses.get(provider) || null;
      const now = new Date().toISOString();
      const current = {
        provider, status,
        failure_count:status === 'failed' ? Number(previous?.failure_count || 0) + 1 : 0,
        last_error:error,
        last_checked_at:now,
        last_success_at:status === 'healthy' ? now : previous?.last_success_at || null,
        cooldown_until:cooldownUntil,
        changed_at:previous?.status === status ? previous.changed_at : now
      };
      statuses.set(provider, current);
      return { previous, current };
    },
    async recordActivity(event) {
      events.push(event);
      return event;
    }
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers:{ 'content-type':'application/json' }
  });
}

test('MET Norway is the primary free provider and snapshot survives service restart', async () => {
  const originalFetch = globalThis.fetch;
  const store = storeFixture();
  let requests = 0;
  globalThis.fetch = async (input) => {
    requests += 1;
    assert.equal(new URL(String(input)).origin, 'https://met.test');
    return json(metResponse());
  };
  try {
    const first = new WeatherService({ store, config:CONFIG });
    const snapshot = await first.getSnapshot(SETTINGS);
    assert.equal(snapshot.provider, 'met-no');
    assert.equal(snapshot.timezone, 'Asia/Vladivostok');
    assert.equal(snapshot.temperature, 14.5);
    assert.equal(snapshot.forecast[0].time, '2026-09-23T17:00');
    assert.equal(snapshot.stale, false);
    assert.equal(requests, 1);

    globalThis.fetch = async () => {
      throw new Error('provider must not be called for a fresh persistent snapshot');
    };
    const restarted = new WeatherService({ store, config:CONFIG });
    const afterRestart = await restarted.getSnapshot(SETTINGS);
    assert.equal(afterRestart.provider, 'met-no');
    assert.equal(afterRestart.temperature, 14.5);
    assert.equal(afterRestart.stale, false);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Open-Meteo is used automatically when MET Norway is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const store = storeFixture();
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.origin);
    if (url.origin === 'https://met.test') return json({ error:'down' }, 503);
    if (url.origin === 'https://open.test') return json(openMeteoResponse());
    throw new Error(`Unexpected provider ${url.origin}`);
  };
  try {
    const service = new WeatherService({ store, config:CONFIG });
    const snapshot = await service.getSnapshot(SETTINGS);
    assert.deepEqual(calls, ['https://met.test','https://open.test']);
    assert.equal(snapshot.provider, 'open-meteo');
    assert.equal(snapshot.timezone, 'Asia/Vladivostok');
    assert.deepEqual(snapshot.forecast.slice(0, 3).map((item) => item.time), [
      '2026-09-23T17:00',
      '2026-09-23T18:00',
      '2026-09-23T19:00'
    ]);
    assert.equal(store.events.filter((event) => event.action === 'weather.provider.failed').length, 1);
    assert.equal(store.events[0].category, 'weather');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('persistent last-known-good snapshot is returned when all providers fail without notification spam', async () => {
  const originalFetch = globalThis.fetch;
  const store = storeFixture();
  store.snapshots.set('50.5503:137.0100:Asia/Vladivostok', {
    source_key:'50.5503:137.0100:Asia/Vladivostok',
    location_name:'Комсомольск-на-Амуре',
    latitude:50.55034,
    longitude:137.00995,
    timezone:'Asia/Vladivostok',
    provider:'met-no',
    snapshot:{
      location_name:'Комсомольск-на-Амуре',
      latitude:50.55034,
      longitude:137.00995,
      timezone:'Asia/Vladivostok',
      updated_at:'2026-09-23T15:00',
      temperature:13,
      apparent_temperature:13,
      humidity:35,
      wind_speed:8,
      weather_code:2,
      is_day:true,
      condition:'Переменная облачность',
      icon:'partly-cloudy',
      forecast:[]
    },
    fetched_at:'2026-09-23T05:00:00.000Z',
    fresh_until:'2026-09-23T05:10:00.000Z',
    updated_at:'2026-09-23T05:00:00.000Z'
  });
  globalThis.fetch = async () => json({ error:'down' }, 503);
  try {
    const service = new WeatherService({ store, config:CONFIG });
    const first = await service.getSnapshot(SETTINGS, { force:true });
    assert.equal(first.temperature, 13);
    assert.equal(first.stale, true);
    assert.equal(store.events.filter((event) => event.action === 'weather.provider.failed').length, 2);
    assert.equal(store.events.filter((event) => event.action === 'weather.system.failed').length, 1);

    const second = await service.getSnapshot(SETTINGS, { force:true });
    assert.equal(second.temperature, 13);
    assert.equal(second.stale, true);
    assert.equal(store.events.filter((event) => event.action === 'weather.system.failed').length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('collector de-duplicates the same city used by multiple TV scenes', async () => {
  const originalFetch = globalThis.fetch;
  const store = storeFixture();
  const weatherElement = {
    id:'weather',
    type:'weather',
    enabled:true,
    width:520,
    weather:{
      location_name:SETTINGS.location_name,
      latitude:SETTINGS.latitude,
      longitude:SETTINGS.longitude,
      timezone:SETTINGS.timezone
    }
  };
  store.documents = [
    { screen_id:1, scene:{ version:1, elements:[weatherElement] } },
    { screen_id:2, scene:{ version:1, elements:[{ ...weatherElement, id:'weather-2' }] } }
  ];
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return json(metResponse());
  };
  try {
    const service = new WeatherService({ store, config:CONFIG });
    await service.refreshConfiguredSources();
    assert.equal(requests, 1);
    assert.equal(store.snapshots.size, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('collector uses the shortest refresh interval for a city shared by multiple screens', async () => {
  const originalFetch = globalThis.fetch;
  const store = storeFixture();
  const sourceKey = '50.5503:137.0100:Asia/Vladivostok';
  const now = Date.now();
  store.snapshots.set(sourceKey, {
    source_key:sourceKey,
    location_name:SETTINGS.location_name,
    latitude:SETTINGS.latitude,
    longitude:SETTINGS.longitude,
    timezone:SETTINGS.timezone,
    provider:'met-no',
    snapshot:{
      location_name:SETTINGS.location_name,
      latitude:SETTINGS.latitude,
      longitude:SETTINGS.longitude,
      timezone:SETTINGS.timezone,
      updated_at:'2026-09-23T15:00',
      temperature:13,
      apparent_temperature:13,
      humidity:35,
      wind_speed:8,
      weather_code:2,
      is_day:true,
      condition:'Переменная облачность',
      icon:'partly-cloudy',
      forecast:[]
    },
    fetched_at:new Date(now - 6 * 60 * 1000).toISOString(),
    fresh_until:new Date(now + 9 * 60 * 1000).toISOString(),
    updated_at:new Date(now - 6 * 60 * 1000).toISOString()
  });
  const element = (id, refreshMinutes) => ({
    id,
    type:'weather',
    enabled:true,
    width:520,
    weather:{
      location_name:SETTINGS.location_name,
      latitude:SETTINGS.latitude,
      longitude:SETTINGS.longitude,
      timezone:SETTINGS.timezone,
      refresh_minutes:refreshMinutes
    }
  });
  store.documents = [
    { screen_id:1, scene:{ version:1, elements:[element('weather-a', 15)] } },
    { screen_id:2, scene:{ version:1, elements:[element('weather-b', 5)] } }
  ];
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return json(metResponse());
  };
  try {
    const service = new WeatherService({ store, config:CONFIG });
    await service.refreshConfiguredSources();
    assert.equal(requests, 1);
    const saved = store.snapshots.get(sourceKey);
    const lifetimeMs = Date.parse(saved.fresh_until) - Date.parse(saved.fetched_at);
    assert.equal(lifetimeMs, 5 * 60 * 1000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
