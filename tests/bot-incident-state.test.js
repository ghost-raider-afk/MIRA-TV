import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceTvIncident, TV_OFFLINE_GRACE_MS } from '../src/bot/incident-state.js';

const NOW=Date.parse('2026-11-18T09:00:00.000Z');
test('TV offline 120s confirmation, deduplication and recovery across polling/reboots',()=>{
  const initial=advanceTvIncident(null,false,NOW);
  assert.equal(initial.kind,null);
  assert.equal(initial.next.last_state,'offline');
  const short=advanceTvIncident(initial.next,false,NOW+TV_OFFLINE_GRACE_MS-1);
  assert.equal(short.changed,false);
  const expired=advanceTvIncident(initial.next,false,NOW+TV_OFFLINE_GRACE_MS);
  assert.equal(expired.kind,'tv_offline');
  assert.equal(expired.next.notified,true);
  assert.equal(advanceTvIncident(expired.next,false,NOW+3600000).kind,null);
  const recovered=advanceTvIncident(expired.next,true,NOW+3600000);
  assert.equal(recovered.kind,'tv_restored');
  assert.equal(recovered.next.last_state,'online');
  assert.equal(advanceTvIncident(recovered.next,true,NOW+7200000).kind,null);
  const nextOutage=advanceTvIncident(recovered.next,false,NOW+7200000);
  assert.equal(nextOutage.kind,null);
  assert.notEqual(nextOutage.next.offline_since,initial.next.offline_since);
  assert.equal(advanceTvIncident(nextOutage.next,false,NOW+7200000+120000).kind,'tv_offline');
});

test('brief outages do not notify, freshly starting server respects grace',()=>{
  const first=advanceTvIncident(null,true,NOW);
  const offline=advanceTvIncident(first.next,false,NOW+1000);
  const recovered=advanceTvIncident(offline.next,true,NOW+31000);
  assert.equal(recovered.kind,null);
  assert.equal(recovered.next.last_state,'online');
  assert.equal(advanceTvIncident(null,false,NOW+31000).kind,null);
});
