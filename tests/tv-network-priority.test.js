import assert from 'node:assert/strict';
import test from 'node:test';
import {
  locationOperationalPriority,
  sortLocationsByOperationalPriority
} from '../src/web/admin-ui/public/js/pages/tv-network-priority.js';

const locations = [
  { id:1, name:'Без ТВ' },
  { id:2, name:'Рабочая' },
  { id:3, name:'Потеря связи' },
  { id:4, name:'Подключена впервые' }
];
const screens = [
  { id:11, location_id:1 },
  { id:21, location_id:2 },
  { id:22, location_id:2 },
  { id:31, location_id:3 },
  { id:41, location_id:4 }
];

test('TV network ranks lost connections before healthy and unconnected locations', () => {
  const bindings = [
    { screen_id:21, online:true, realtime_last_seen_at:'2026-10-16T01:00:00Z' },
    { screen_id:31, online:false, session_last_seen_at:'2026-10-16T00:30:00Z' },
    { screen_id:41, online:false, session_last_seen_at:null, device_last_seen_at:null }
  ];

  assert.equal(locationOperationalPriority(3, screens, bindings), 0);
  assert.equal(locationOperationalPriority(2, screens, bindings), 1);
  assert.equal(locationOperationalPriority(4, screens, bindings), 2);
  assert.equal(locationOperationalPriority(1, screens, bindings), 3);
  assert.deepEqual(
    sortLocationsByOperationalPriority(locations, screens, bindings).map((location) => location.id),
    [3, 2, 4, 1]
  );
});

test('partially connected location stays in the connected section', () => {
  const bindings = [{ screen_id:21, online:true, realtime_last_seen_at:'2026-10-16T01:00:00Z' }];
  assert.equal(locationOperationalPriority(2, screens, bindings), 1);
});

test('any previously seen offline TV raises the whole location to problem priority', () => {
  const bindings = [
    { screen_id:21, online:true, realtime_last_seen_at:'2026-10-16T01:00:00Z' },
    { screen_id:22, online:false, device_last_seen_at:'2026-10-15T23:00:00Z' }
  ];
  assert.equal(locationOperationalPriority(2, screens, bindings), 0);
});
