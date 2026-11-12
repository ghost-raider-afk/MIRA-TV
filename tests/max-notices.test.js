import assert from 'node:assert/strict';
import test from 'node:test';
import { sendMaxNotice } from '../src/bot/max-notices.js';
import { noticeContent } from '../src/bot/notice-content.js';
import { buildTelegramNotice } from '../src/bot/telegram-widgets.js';

test('Telegram and MAX use the same sanitized localized notification content', () => {
  const input = {kind:'tv_offline',location:'А'.repeat(140),subject:'ТВ 1',detail:'Б'.repeat(210)};
  const common = noticeContent(input);
  const telegram = buildTelegramNotice(input);
  assert.equal(telegram.caption, common.caption);
  assert.deepEqual(JSON.parse(telegram.chat_data), common.payload);
  assert.equal(common.payload.location.length, 100);
  assert.equal(common.payload.detail.length, 180);
  assert.match(common.plainText, /Нет связи с телевизором/);
});

test('MAX uses POST messages with registered bot open_app keyboard and safe plain text', async () => {
  const calls = [];
  const expected = {message:{mid:'test-message'}};
  const result = await sendMaxNotice(async (req)=>{calls.push(req);return expected;},{
    recipient:'6789012345', miniAppBot:'mira_tv_bot',
    notice:{kind:'tv_restored',location:'Центральная',subject:'ТВ 2',detail:'Связь восстановлена'}
  });
  assert.equal(result,expected);
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,'POST');
  assert.equal(calls[0].path,'/messages');
  assert.deepEqual(calls[0].query,{user_id:'6789012345'});
  assert.equal(calls[0].body.disable_link_preview,true);
  assert.match(calls[0].body.text,/Связь восстановлена/);
  assert.deepEqual(calls[0].body.attachments,[{
    type:'inline_keyboard',payload:{buttons:[[
      {type:'open_app',text:'Открыть MIRA-TV',web_app:'mira_tv_bot'}
    ]]}
  }]);
});

test('unregistered MAX Mini App uses a safe link rather than invalid open_app button', async () => {
  let req;
  await sendMaxNotice(async p => { req=p;return {ok:true}; },{
    recipient:'123',miniAppUrl:'https://app.example.test/messenger',
    notice:{kind:'tv_offline'}
  });
  assert.deepEqual(req.body.attachments,[{
    type:'inline_keyboard',payload:{buttons:[[
      {type:'link',text:'Открыть MIRA-TV',url:'https://app.example.test/messenger'}
    ]]}
  }]);
});

test('MAX supports chat destinations and text-only fallback when Mini App is not configured', async () => {
  let req;
  await sendMaxNotice(async (r)=>{req=r;return {ok:true}},{
    recipientType:'chat',recipient:'-10012345678',
    notice:{kind:'request_new',location:'Северная точка',subject:'Заявка 3'}
  });
  assert.deepEqual(req.query,{chat_id:'-10012345678'});
  assert.equal(req.body.attachments,undefined);
  assert.match(req.body.text,/Новая заявка/);
});

test('MAX forbids forged recipients and insecure app addresses before invoking transport', async () => {
  let sends=0;
  const api=async()=>{sends+=1};
  for(const destination of ['0','-1','1e3','9223372036854775808','abc']) {
    await assert.rejects(sendMaxNotice(api,{recipient:destination,notice:{kind:'tv_offline'}}),TypeError);
  }
  await assert.rejects(sendMaxNotice(api,{
    recipient:'123',miniAppUrl:'http://invalid.test',notice:{kind:'tv_offline'}
  }),TypeError);
  await assert.rejects(sendMaxNotice(api,{
    recipient:'123',miniAppUrl:'https://user:password@example.test',notice:{kind:'tv_offline'}
  }),TypeError);
  await assert.rejects(sendMaxNotice(api,{recipient:'123',miniAppBot:'bad/bot',notice:{kind:'tv_offline'}}),TypeError);
  await assert.rejects(sendMaxNotice(api,{recipient:'123',notice:{kind:'invalid'}}),TypeError);
  assert.equal(sends,0);
});

test('transport failures propagate for persistent retries', async () => {
  await assert.rejects(sendMaxNotice(async()=>{
    throw Object.assign(new Error('MAX flood wait'),{status:429});
  },{recipient:'123',notice:{kind:'request_new'}}),/flood wait/);
});
