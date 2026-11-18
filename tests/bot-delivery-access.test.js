import assert from 'node:assert/strict';
import test from 'node:test';
import { createBotDeliveryRepository } from '../src/db/bot-delivery.js';

test('pending TV deliveries recheck the manager location grant and active messenger identity',async()=>{
  const queries=[];
  const repository=createBotDeliveryRepository({
    async query(sql,args) {
      queries.push({sql,args});
      return {rows:[{
        id:123,provider:'telegram',kind:'tv_offline',username:'manager',
        location_name:'Точка',subject:'ТВ 1',detail:'120 секунд',
        recipient:'9223372036854775807',attempts:1
      }]};
    }
  });
  const lease='f2b96621-65a2-4bb4-9b17-f31d761c6924';
  const jobs=await repository.claimBotJobs(lease);
  assert.equal(jobs.length,1);
  assert.equal(jobs[0].recipient,'9223372036854775807');
  const sql=queries[0].sql;
  assert.match(sql,/u.active=TRUE/);
  assert.match(sql,/JOIN messenger_accounts a/);
  assert.match(sql,/LEFT JOIN manager_access ma/);
  assert.match(sql,/manager_location_access ml/);
  assert.match(sql,/ml.location_id=o.location_id/);
  assert.match(sql,/o.kind IN \('request_new','request_updated'\)/);
  assert.match(sql,/SKIP LOCKED/);
  assert.match(sql,/lease_expires_at/);
});

test('CRM cursor never rounds PostgreSQL bigint notification IDs or changes existing inbox delivery state',async()=>{
  const farId='9223372036854775807';
  const queries=[];
  const repository=createBotDeliveryRepository({
    async query(sql,args) {
      queries.push({sql,args});
      if (sql.includes('SELECT last_notification_id')) return {rows:[{last_notification_id:'9223372036854775700'}]};
      if (sql.includes('SELECT id FROM request_notifications')) return {rows:[{id:farId}]};
      return {rows:[],rowCount:1};
    }
  });
  assert.equal(await repository.stageRequestNotifications(),1);
  assert.deepEqual(queries[1].args,['9223372036854775700',200]);
  assert.deepEqual(queries[2].args,['9223372036854775700',farId]);
  assert.deepEqual(queries[3].args,[farId]);
  assert.match(queries[2].sql,/JOIN messenger_accounts/);
  assert.match(queries[2].sql,/CASE WHEN n.kind IN \('created','resubmitted'\)/);
  assert.doesNotMatch(queries.map(x=>x.sql).join('\n'),/UPDATE request_notifications/);
});

test('TV outage generates outbox row only after grace with SQL scoped to location ACL',async()=>{
  const observed=[];
  const repo=createBotDeliveryRepository({
    async query(sql,args) {
      observed.push({sql,args});
      if (sql.includes('SELECT last_state,offline_since,notified')) {
        return {rows:[{last_state:'offline',offline_since:'2026-11-18T10:00:00.000Z',notified:false}]};
      }
      return {rows:[],rowCount:1};
    }
  });
  const point={
    screen_id:7,location_id:9,location_name:'Торговая точка',
    location_number:1,screen_name:'Зал'
  };
  const result=await repo.stageTvIncident(point,false,Date.parse('2026-11-18T10:02:01.000Z'));
  assert.equal(result,'tv_offline');
  const inserted=observed.find(x=>x.sql.includes('INSERT INTO bot_outbox'));
  assert.ok(inserted);
  assert.match(inserted.sql,/JOIN messenger_accounts/);
  assert.match(inserted.sql,/manager_location_access/);
  assert.match(inserted.sql,/location_id\)/);
  assert.equal(inserted.args[5],9);
  assert.match(inserted.args[0],/^tv:7:.*:tv_offline$/);
  assert.match(inserted.args[4],/120 секунд/);
});
