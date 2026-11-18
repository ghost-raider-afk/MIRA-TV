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

test('CRM notifications enter the durable outbox in their own transaction without polling a cursor',async()=>{
  const statements=[];
  const { migrateBotDelivery } = await import('../src/db/migrations/bot-delivery.js');
  await migrateBotDelivery({ async query(sql) { statements.push(sql); return {rows:[]}; } });
  const ddl=statements.join('\n');
  assert.match(ddl,/CREATE OR REPLACE FUNCTION mira_bot_request_outbox_trigger/);
  assert.match(ddl,/AFTER INSERT ON request_notifications/);
  assert.match(ddl,/ON CONFLICT\(event_key,username,provider\) DO NOTHING/);
  assert.match(ddl,/FROM messenger_accounts a/);
  assert.match(ddl,/NEW.kind IN \('created','resubmitted'\)/);
  assert.doesNotMatch(ddl,/bot_notification_cursor/);
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
