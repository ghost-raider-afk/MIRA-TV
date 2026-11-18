import assert from 'node:assert/strict';
import test from 'node:test';
import { createMessengerLinksRepository } from '../src/db/messenger-links.js';
import { messengerIdentityId } from '../src/bot/account-linking.js';

test('administrator listing includes administrators and managers with string IDs', async () => {
  const seen=[];
  const store=createMessengerLinksRepository({
    async query(sql,args) {
      seen.push({sql,args});
      return {rows:[
        {username:'admin',role:'administrator',active:true,display_name:'Админ',
         telegram_id:'9223372036854775807',max_id:null},
        {username:'manager',role:'manager',active:false,display_name:'Менеджер',
         telegram_id:null,max_id:'123456789'}
      ]};
    }
  });
  const users=await store.listMessengerUsers();
  assert.deepEqual(users,[
    {username:'admin',role:'administrator',active:true,display_name:'Админ',
     telegram_id:'9223372036854775807',max_id:''},
    {username:'manager',role:'manager',active:false,display_name:'Менеджер',
     telegram_id:'',max_id:'123456789'}
  ]);
  assert.match(seen[0].sql,/FROM web_users u/);
  assert.match(seen[0].sql,/LEFT JOIN messenger_accounts/);
  assert.match(seen[0].sql,/administrator/);
});

test('administrator can atomically replace and revoke IDs without changing CRM roles',async()=>{
  const calls=[];
  const store=createMessengerLinksRepository({
    async query(sql,args) {
      calls.push({sql,args});
      return {rows:sql.startsWith('SELECT username') ? [{username:'manager'}] : []};
    }
  });
  const result=await store.setMessengerUserIds('manager',{
    telegram_id:'9223372036854775807',max_id:null
  });
  assert.deepEqual(result,{username:'manager',telegram_id:'9223372036854775807',max_id:null});
  assert.match(calls[0].sql,/FOR UPDATE/);
  assert.deepEqual(calls[1].args,['manager','telegram','9223372036854775807']);
  assert.match(calls[1].sql,/ON CONFLICT\(username,provider\) DO UPDATE/);
  assert.deepEqual(calls[2].args,['manager','max']);
  assert.match(calls[2].sql,/DELETE FROM messenger_accounts/);
  assert.match(calls[3].sql,/DELETE FROM messenger_link_codes/);
  assert.equal(calls.length,4);
  assert.ok(calls.every(x=>!x.sql.includes('UPDATE web_users SET role')));
});

test('user access resolves from current active CRM account only',async()=>{
  const statements=[];
  const store=createMessengerLinksRepository({
    async query(sql,args) {
      statements.push({sql,args});
      return {rows:[]};
    }
  });
  assert.equal(await store.resolveMessengerAccount('telegram','123'),null);
  assert.match(statements[0].sql,/JOIN web_users u ON u.username=a.username AND u.active=TRUE/);
  assert.match(statements[0].sql,/WHERE a.provider=\$1 AND a.provider_user_id=\$2/);
  assert.deepEqual(statements[0].args,['telegram','123']);
  assert.equal(messengerIdentityId('9223372036854775807'),'9223372036854775807');
});
