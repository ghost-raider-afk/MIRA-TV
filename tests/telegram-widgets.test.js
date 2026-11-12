import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import test from 'node:test';
import { STATUS_WIDGET_HTML, buildTelegramNotice, sendTelegramNotice } from '../src/bot/telegram-widgets.js';

test('Telegram widget is self-contained and respects Bot API 10.4 size limits', () => {
  assert.ok(Buffer.byteLength(STATUS_WIDGET_HTML) <= 32768);
  assert.ok(deflateSync(STATUS_WIDGET_HTML, { level:9 }).length <= 4096);
  assert.match(STATUS_WIDGET_HTML, /TelegramWidget/);
  assert.match(STATUS_WIDGET_HTML, /chatDataChanged/);
  assert.doesNotMatch(STATUS_WIDGET_HTML, /<script[^>]+src|<link[^>]+href/i);
  assert.doesNotMatch(STATUS_WIDGET_HTML, /fetch\(|XMLHttpRequest|WebSocket\(/);
});

test('Telegram status cards have updateable state and no injected HTML', () => {
  const suspicious = '</script><img src=x onerror=alert(1)>';
  const result = buildTelegramNotice({
    kind:'tv_offline', location:suspicious, subject:'ТВ 2', time:'12.11.2026 10:00'
  });
  assert.equal(result.html.includes(suspicious), false);
  assert.equal(JSON.parse(result.chat_data).location, suspicious);
  assert.equal(result.allow_queries, false);
  assert.equal(result.protect_content, true);
  assert.equal(result.width, 340);
  assert.ok(Buffer.byteLength(result.chat_data) <= 1024);
  assert.throws(() => buildTelegramNotice({ kind:'arbitrary' }), TypeError);
  assert.throws(() => buildTelegramNotice({ kind:'tv_offline', location:'Я'.repeat(2000) }), RangeError);
});

test('Telegram sends a widget to a private chat and plain fallback elsewhere', async () => {
  const calls = [];
  const api = async (method, data) => { calls.push({method,data}); return { ok:true }; };
  const opts = {
    chatId:'123456789', chatType:'private', miniAppUrl:'https://menu.example.test/messenger',
    notice:{kind:'tv_restored',location:'Центральная',subject:'ТВ 1'}
  };
  await sendTelegramNotice(api, opts);
  assert.equal(calls[0].method, 'sendWidget');
  assert.equal(calls[0].data.reply_markup.inline_keyboard[0][0].web_app.url, opts.miniAppUrl);
  await sendTelegramNotice(api, {...opts,chatId:'-100123', chatType:'supergroup'});
  assert.equal(calls[1].method, 'sendMessage');
  assert.equal(calls[1].data.reply_markup.inline_keyboard[0][0].url, opts.miniAppUrl);
  await sendTelegramNotice(api, {...opts,useWidgets:false});
  assert.equal(calls[2].method, 'sendMessage');
});

test('Only known widget-unavailable errors trigger fallback; delivery errors propagate', async () => {
  const calls = [];
  const api = async method => {
    calls.push(method);
    if (method === 'sendWidget') throw { error_code:400, description:'Widget is not supported in this chat' };
    return { ok:true };
  };
  await sendTelegramNotice(api,{ chatId:'123', notice:{kind:'request_new'} });
  assert.deepEqual(calls,['sendWidget','sendMessage']);
  await assert.rejects(
    sendTelegramNotice(async()=>{throw {error_code:429,description:'Too Many Requests'};},
      { chatId:'123', notice:{kind:'tv_offline'} })
  );
  await assert.rejects(
    sendTelegramNotice(async()=>({}),{
      chatId:'123', miniAppUrl:'http://insecure.example', notice:{kind:'tv_offline'}
    }),
    TypeError
  );
});
