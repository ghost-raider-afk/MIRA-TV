import assert from 'node:assert/strict';
import test from 'node:test';
import { jsonRequest } from '../src/bot/http-client.js';

test('MAX API 200 with success:false cannot cause a false durable outbox acknowledgement',async()=>{
  await assert.rejects(jsonRequest('https://platform-api2.max.ru/messages',{
    body:{text:'test'},
    fetchImpl:async()=>({
      ok:true,status:200,headers:{get(){return '30';}},
      async json(){return {success:false,code:'invalid_recipient'};}
    })
  }),error=>error.status===200 && error.retryAfter===30);
});

test('Telegram Bot API logical failure also fails closed',async()=>{
  await assert.rejects(jsonRequest('https://api.telegram.org/botexample/sendWidget',{
    body:{chat_id:'123'},
    fetchImpl:async()=>({
      ok:true,status:200,headers:{get(){return null;}},
      async json(){return {ok:false,description:'failed'};}
    })
  }),/Remote request rejected/);
});
