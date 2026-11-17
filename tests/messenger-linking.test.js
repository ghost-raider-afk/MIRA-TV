import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createMessengerLinksRepository } from '../src/db/messenger-links.js';
import { migrateMessengerLinks } from '../src/db/migrations/messenger-links.js';
import {
  createMessengerLinkCode, LINK_CODE_TTL_MS,
  messengerLinkCodeHash, messengerIdentityId
} from '../src/bot/account-linking.js';

test('one-time code uses 128-bit randomness and only SHA-256 is persisted',()=>{
  const a=createMessengerLinkCode(),b=createMessengerLinkCode();
  assert.match(a,/^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(a,b);
  assert.equal(LINK_CODE_TTL_MS,300000);
  assert.equal(messengerLinkCodeHash(a),createHash('sha256').update(a).digest('hex'));
  assert.throws(()=>messengerLinkCodeHash('123456'),/Некорректный код/);
  assert.equal(messengerIdentityId('9223372036854775807'),'9223372036854775807');
  assert.throws(()=>messengerIdentityId('9223372036854775808'),/Некорректный идентификатор/);
});

test('schema enforces referential ownership and unique IDs across users',async()=>{
  const statements=[];
  await migrateMessengerLinks({query:async sql=>statements.push(sql)});
  assert.equal(statements.length,1);
  const sql=statements[0];
  assert.match(sql,/REFERENCES web_users\(username\) ON DELETE CASCADE/);
  assert.match(sql,/PRIMARY KEY\(username,provider\)/);
  assert.match(sql,/UNIQUE\(provider,provider_user_id\)/);
  assert.match(sql,/code_hash CHAR\(64\) NOT NULL UNIQUE/);
  assert.doesNotMatch(sql,/bot_token|password_hash|raw_code/i);
});

test('issued codes are scoped to an active user and generation is rate limited in SQL',async()=>{
  const calls=[];
  const store=createMessengerLinksRepository({
    query:async(sql,args)=>{calls.push({sql,args});return {rows:[{expires_at:'2026-11-12T22:00:00Z'}]};}
  });
  const hash=messengerLinkCodeHash(createMessengerLinkCode());
  assert.ok(await store.issueMessengerLinkCode('manager-one','max',hash,'2026-11-12T22:00:00Z'));
  assert.deepEqual(calls[0].args,['manager-one','max',hash,'2026-11-12T22:00:00Z']);
  assert.match(calls[0].sql,/u\.username=\$1 AND u\.active=TRUE/);
  assert.match(calls[0].sql,/current\.created_at <= NOW\(\) - INTERVAL '30 seconds'/);
  assert.match(calls[0].sql,/ON CONFLICT\(username,provider\) DO UPDATE/);
});

test('atomic redemption requires unexpired unused token and an active user',async()=>{
  const calls=[];
  const store=createMessengerLinksRepository({
    query:async(sql,args)=>{calls.push({sql,args});return {rows:[{username:'manager-one'}]};}
  });
  const hash=messengerLinkCodeHash(createMessengerLinkCode());
  const linked=await store.redeemMessengerLinkCode('telegram',hash,'9001234567890');
  assert.equal(linked.username,'manager-one');
  assert.deepEqual(calls[0].args,['telegram',hash,'9001234567890']);
  assert.match(calls[0].sql,/WITH consumed AS \(/);
  assert.match(calls[0].sql,/consumed_at IS NULL AND c\.expires_at > NOW\(\)/);
  assert.match(calls[0].sql,/u\.active=TRUE/);
  assert.match(calls[0].sql,/ON CONFLICT\(username,provider\) DO UPDATE/);
});

test('roles remain live and revocation also cancels outstanding pairing codes',async()=>{
  const calls=[];
  const store=createMessengerLinksRepository({
    query:async(sql,args)=>{calls.push({sql,args});return {rows:[{username:'manager-one',role:'manager'}]};}
  });
  assert.equal((await store.resolveMessengerAccount('max','123456789')).role,'manager');
  assert.match(calls[0].sql,/JOIN web_users u ON u\.username=a\.username AND u\.active=TRUE/);
  assert.match(calls[0].sql,/u\.role/);
  assert.deepEqual(calls[0].args,['max','123456789']);
  await store.revokeMessengerAccount('manager-one','telegram');
  assert.deepEqual(calls[1].args,['manager-one','telegram']);
  assert.match(calls[1].sql,/DELETE FROM messenger_link_codes/);
  assert.match(calls[1].sql,/DELETE FROM messenger_accounts/);
});
