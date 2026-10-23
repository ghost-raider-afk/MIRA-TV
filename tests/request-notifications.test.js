import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequestNotificationsRepository } from '../src/db/request-notifications.js';
import { migrateRequestNotifications } from '../src/db/migrations/request-notifications.js';
import { createRequestNotificationHub } from '../src/realtime/request-notifications.js';

test('request inbox SQL is per-user, bounded and cannot clear activity audit',async()=>{
  const statements=[];
  const db={query:async(sql,values=[])=>{
    statements.push({sql,values});
    if(sql.includes('COUNT(*)::int AS unread_count'))return {rows:[{unread_count:5}]};
    if(sql.includes('SELECT id,proposal_id'))return {rows:[{id:'17',proposal_id:'8',kind:'created'}]};
    if(sql.includes('WITH picked'))return {rows:[{id:'18',kind:'rework'}]};
    if(sql.includes('RETURNING request_sound_enabled'))return {rows:[{request_sound_enabled:true}]};
    return {rowCount:1,rows:[]};
  }};
  const store=createRequestNotificationsRepository(db);
  const result=await store.listRequestNotifications('manager-a',{cursor:40,limit:10000});
  assert.equal(result.unread_count,5);
  assert.equal(statements[0].values[0],'manager-a');
  assert.equal(statements[0].values[1],30);
  assert.equal(statements[0].values[2],40);
  assert.match(statements[0].sql,/username=\$1 AND archived_at IS NULL AND id<\$3/);
  await store.claimRequestNotifications('manager-a');
  await store.readRequestNotification('manager-a',17);
  await store.readAllRequestNotifications('manager-a');
  await store.clearRequestNotifications('manager-a');
  await store.setRequestSound('manager-a',true);
  for(const statement of statements)assert.doesNotMatch(statement.sql,/UPDATE activity_events|DELETE FROM activity_events/i);
  assert.match(statements.find(s=>s.sql.includes('FOR UPDATE SKIP LOCKED')).sql,/LIMIT 3/);
  assert.match(statements.find(s=>s.sql.includes('archived_at=NOW()')).sql,/username=\$1/);
  assert.ok(statements.every(s=>s.values[0]==='manager-a'));
});

test('migration routes creation to administrators and status updates only to the author',async()=>{
  const queries=[];
  await migrateRequestNotifications({query:async sql=>{queries.push(sql);}});
  assert.equal(queries.length,1);
  const sql=queries[0];
  assert.match(sql,/AFTER INSERT OR UPDATE OF status/);
  assert.match(sql,/role='administrator' AND active=TRUE/);
  assert.match(sql,/username=NEW.manager_username AND role='manager' AND active=TRUE/);
  assert.match(sql,/OLD.status='rework' AND NEW.status='pending'/);
  assert.match(sql,/pg_notify\('mira_request_notifications'/);
  assert.doesNotMatch(sql,/DELETE FROM activity_events|TRUNCATE/i);
});

test('live push sends only to the authenticated username',async()=>{
  const client=new EventEmitter();
  client.query=async()=>({rows:[]});
  client.release=()=>{};
  const hub=createRequestNotificationHub({connect:async()=>client});
  hub.start();
  await new Promise(resolve=>setImmediate(resolve));
  function subscribe(username) {
    const request=new EventEmitter();
    const output=[];
    const response={
      status(){return this;},set(){return this;},flushHeaders(){},
      write(value){output.push(value);},end(){}
    };
    hub.subscribe(username,request,response);
    return output;
  }
  const admin=subscribe('admin');
  const manager=subscribe('manager');
  client.emit('notification',{channel:'mira_request_notifications',payload:'manager'});
  assert.equal(admin.filter(s=>s.includes('event: changed')).length,0);
  assert.equal(manager.filter(s=>s.includes('event: changed')).length,1);
  hub.close();
});

test('approved sound is generated in browser from fixed note synthesis only',()=>{
  const src=readFileSync(new URL('../src/web/admin-ui/public/js/core/notifications.js',import.meta.url),'utf8');
  assert.match(src,/659\.255/);
  assert.match(src,/830\.609/);
  assert.match(src,/createBuffer\(1,samples,rate\)/);
  assert.doesNotMatch(src,/\.mp3|\.wav|audio-cdn|microsoft\.com/);
  assert.match(src,/items\.forEach\(requestToast\)/);
  assert.match(src,/\.slice\(0,3\)/);
});
