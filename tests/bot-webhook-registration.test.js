import assert from 'node:assert/strict';
import test from 'node:test';
import { registerBotWebhooks } from '../src/bot/register-webhooks.js';

test('explicit webhook registration uses HTTPS, provider secrets and approved event types',async()=>{
  const seen=[];
  const config={
    telegramEnabled:true,telegramToken:'123456:abcdefghij123456789012345678901234',
    telegramWebhookSecret:'t'.repeat(64),
    maxEnabled:true,maxToken:'max-private-token',maxWebhookSecret:'m'.repeat(64)
  };
  const confirmed=await registerBotWebhooks(config,'bot.example.com',{fetchImpl:async(url,init)=>{
    seen.push({url,init});
    return {ok:true,status:200,async json(){return {ok:true,success:true};}};
  }});
  assert.deepEqual(confirmed,['telegram','max']);
  assert.equal(seen[0].url.endsWith('/setWebhook'),true);
  assert.deepEqual(JSON.parse(seen[0].init.body),{
    url:'https://bot.example.com/webhooks/telegram',
    secret_token:config.telegramWebhookSecret,allowed_updates:['message']
  });
  assert.deepEqual(JSON.parse(seen[1].init.body),{
    url:'https://bot.example.com/webhooks/max',
    update_types:['message_created','bot_started'],
    secret:config.maxWebhookSecret
  });
  assert.equal(seen[1].init.headers.Authorization,'max-private-token');
});

test('webhook registration fails closed without DNS domain and on API failure',async()=>{
  const config={
    telegramEnabled:true,telegramToken:'123456:abcdefghij123456789012345678901234',
    telegramWebhookSecret:'t'.repeat(64),maxEnabled:false
  };
  await assert.rejects(registerBotWebhooks(config,'http://bad/'),/Invalid bot domain/);
  await assert.rejects(registerBotWebhooks(config,'bot.example.com',{fetchImpl:async()=>({
    status:500,ok:false,async json(){return {ok:false};}
  })}),/webhook registration failed/);
});
