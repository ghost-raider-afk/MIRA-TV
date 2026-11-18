import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createBotServer, botRuntimeConfig } from '../src/bot/runtime.js';
import { extractBotCommand, webhookAllowed, preserveMaxUserIds } from '../src/bot/webhook.js';
import { createBotInternalRouter } from '../src/bot/internal-api.js';
import { createServer } from 'node:http';
import express from 'express';

const INTERNAL = 'a'.repeat(64);
const config = botRuntimeConfig({
  BOT_INTERNAL_API_TOKEN:INTERNAL,
  TELEGRAM_BOT_ENABLED:'true',
  TELEGRAM_BOT_TOKEN:'123456:abcdefghijklmnopqrstuvwxyzABCDEFGHI',
  TELEGRAM_WEBHOOK_SECRET:'t'.repeat(64),
  MAX_BOT_ENABLED:'true',
  MAX_BOT_TOKEN:'test-max-token',
  MAX_WEBHOOK_SECRET:'m'.repeat(64)
});

async function withServer(server, run) {
  server.listen(0, '127.0.0.1');
  await once(server,'listening');
  try { return await run('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('bot webhooks reject invalid secrets, ignore groups, and resolve valid users via internal API',async()=>{
  const delivered=[];const resolved=[];
  const transport={
    async internalCommand(command){resolved.push(command);return {text:'Добро пожаловать'};},
    async telegramSend(id,text){delivered.push(['telegram',id,text]);},
    async maxSend(id,text){delivered.push(['max',id,text]);}
  };
  await withServer(createBotServer(config,transport),async base=>{
    const payload={message:{from:{id:123},chat:{type:'private',id:123},text:'/status'}};
    const bad=await fetch(base+'/webhooks/telegram',{method:'POST',headers:{'x-telegram-bot-api-secret-token':'bad'},body:JSON.stringify(payload)});
    assert.equal(bad.status,403);
    const group=await fetch(base+'/webhooks/telegram',{method:'POST',headers:{'x-telegram-bot-api-secret-token':config.telegramWebhookSecret},body:JSON.stringify({...payload,message:{...payload.message,chat:{type:'group',id:222}}})});
    assert.equal(group.status,200);
    const good=await fetch(base+'/webhooks/telegram',{method:'POST',headers:{'x-telegram-bot-api-secret-token':config.telegramWebhookSecret},body:JSON.stringify(payload)});
    assert.equal(good.status,200);
    const max=await fetch(base+'/webhooks/max',{method:'POST',headers:{'x-max-bot-api-secret':config.maxWebhookSecret},body:JSON.stringify({update_type:'message_created',message:{sender:{user_id:987},recipient:{chat_type:'dialog'},body:{text:'/requests'}}})});
    assert.equal(max.status,200);
    assert.deepEqual(resolved,[{provider:'telegram',provider_user_id:'123',command:'status'},{provider:'max',provider_user_id:'987',command:'requests'}]);
    assert.deepEqual(delivered,[['telegram','123','Добро пожаловать'],['max','987','Добро пожаловать']]);
  });
});

test('MAX and Telegram IDs remain strings, invalid identities fail closed',()=>{
  assert.equal(extractBotCommand('max',{update_type:'bot_started',user:{user_id:'9223372036854775807'}}).provider_user_id,'9223372036854775807');
  assert.equal(extractBotCommand('max',{update_type:'message_created',message:{recipient:{chat_type:'chat'},sender:{user_id:55},body:{text:'/start'}}}),null);
  assert.equal(extractBotCommand('telegram',{message:{from:{id:3},chat:{type:'private',id:4},text:'/start'}}),null);
  assert.equal(webhookAllowed('telegram',{'x-telegram-bot-api-secret-token':config.telegramWebhookSecret},config),true);
  assert.equal(webhookAllowed('max',{'x-max-bot-api-secret':config.telegramWebhookSecret},config),false);
});

test('internal bot command authorizes against live CRM roles and manager location grants',async()=>{
  const store={
    async resolveMessengerAccount(provider,id){return provider==='telegram' && id==='123' ? {username:'manager',role:'manager'} : null;},
    async listDeviceBindings(){return [
      {screen_id:1,location_id:1,location_name:'Первая',location_number:1},
      {screen_id:2,location_id:2,location_name:'Секретная',location_number:2}
    ];},
    async getManagerAccess(){return {all_locations:false,location_ids:[1]};},
    async listRequestNotifications(){return {items:[{proposal_id:55,title:'Новая заявка',location_name:'Первая'}],unread_count:1};}
  };
  const realtime={presenceForScreen(id){return {online:id===2}}};
  const app=express();app.use(express.json());app.use('/internal/bot',createBotInternalRouter({store,realtime,token:INTERNAL}));
  await withServer(createServer(app),async base=>{
    const call=(key,command,id='123')=>fetch(base+'/internal/bot/command',{method:'POST',headers:{'content-type':'application/json','authorization':key},body:JSON.stringify({provider:'telegram',provider_user_id:id,command})});
    assert.equal((await call('Bearer wrong','status')).status,404);
    assert.equal((await call('Bearer '+INTERNAL,'start','999')).status,403);
    const status=await (await call('Bearer '+INTERNAL,'status')).json();
    assert.match(status.text,/0 онлайн \/ 1 офлайн/);
    assert.match(status.text,/Первая/);
    assert.equal(status.text.includes('Секретная'),false);
    const requests=await (await call('Bearer '+INTERNAL,'requests')).json();
    assert.match(requests.text,/№55/);
    assert.equal(requests.text.includes('Секретная'),false);
  });
});

test('MAX int64 sender identifiers are preserved losslessly before JSON decoding',()=>{
  const raw='{"update_type":"bot_started","user":{"user_id":9223372036854775807}}';
  const parsed=JSON.parse(preserveMaxUserIds(raw));
  assert.equal(extractBotCommand('max',parsed).provider_user_id,'9223372036854775807');
  const surrounded='{"body":{"text":"user_id: 123 text"},"user":{"user_id":9223372036854775807}}';
  assert.equal(JSON.parse(preserveMaxUserIds(surrounded)).body.text,'user_id: 123 text');
  const formatted='{"user": { "user_id" : 9223372036854775807 }}';
  assert.equal(JSON.parse(preserveMaxUserIds(formatted)).user.user_id,'9223372036854775807');
});
