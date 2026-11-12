import { deflateSync } from 'node:zlib';

// Fixed code; TV/CRM data goes only through Telegram's chat_data.
// The Telegram sandbox disallows network access and form text input.
export const STATUS_WIDGET_HTML = String.raw`<!doctype html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;padding:12px;font:14px/1.4 system-ui,sans-serif;color:var(--tg-theme-text-color)}
h3{font-size:17px;line-height:1.25;margin:6px 0;font-weight:750}
p{margin:6px 0;overflow-wrap:anywhere}
.row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.tag{border-radius:8px;padding:3px 8px;background:var(--tg-theme-secondary-bg-color);font-weight:700}
.tag.offline{color:var(--tg-theme-destructive-text-color)}
.tag.online{color:var(--tg-theme-link-color)}
.muted{color:var(--tg-theme-hint-color)}
.rule{border-top:1px solid var(--tg-theme-section-separator-color);margin:10px 0 8px}
button{width:100%;min-height:34px;margin-top:6px}
#detail{display:none}
#detail.expanded{display:block}
</style></head><body>
<div class="row"><b>MIRA-TV</b><span class="tag" id="tag">Событие</span></div>
<h3 id="title">Уведомление</h3>
<p id="location"></p><p class="muted" id="screen"></p>
<div class="rule"></div>
<p class="muted" id="time"></p>
<button id="toggle" type="button">Подробнее</button>
<p class="muted" id="detail"></p>
<script>
(function(){
  var W=window.TelegramWidget;
  var labels={tv_offline:['Нет связи с телевизором','offline'],tv_restored:['Связь восстановлена','online'],request_new:['Новая заявка','online']};
  function show(){
    var s={};
    try{s=JSON.parse(W.chatData||'{}')}catch(e){}
    var match=labels[s.kind]||['Событие MIRA-TV',''];
    document.getElementById('tag').textContent=s.kind==='tv_offline'?'Офлайн':s.kind==='tv_restored'?'Онлайн':'CRM';
    document.getElementById('tag').className='tag '+match[1];
    document.getElementById('title').textContent=match[0];
    document.getElementById('location').textContent=s.location||'Торговая точка';
    document.getElementById('screen').textContent=s.subject||'';
    document.getElementById('time').textContent=s.time||'';
    document.getElementById('detail').textContent=s.detail||'Подробности доступны в приложении MIRA-TV.';
  }
  document.getElementById('toggle').addEventListener('click',function(){
    var node=document.getElementById('detail');
    var visible=node.className==='expanded';
    node.className=visible?'':'expanded';
    document.getElementById('toggle').textContent=visible?'Подробнее':'Скрыть';
  });
  W.onEvent('chatDataChanged',show);
  show();
  W.ready();
})();
</script></body></html>`;

const KINDS = Object.freeze({
  tv_offline:{ title:'Нет связи с телевизором', tag:'🔴' },
  tv_restored:{ title:'Связь с телевизором восстановлена', tag:'🟢' },
  request_new:{ title:'Новая заявка', tag:'🔔' }
});

function text(value, limit = 100) {
  return [...String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()].slice(0, limit).join('');
}

function checkWidgetSize(html) {
  if (Buffer.byteLength(html, 'utf8') > 32768 ||
      deflateSync(html, { level:9 }).byteLength > 4096) {
    throw new RangeError('Telegram Widget exceeds Bot API 10.4 size limits.');
  }
}

checkWidgetSize(STATUS_WIDGET_HTML);

export function buildTelegramNotice({
  kind, location = '', subject = '', time = '', detail = ''
}) {
  if (!Object.hasOwn(KINDS, kind)) throw new TypeError('Unknown MIRA-TV notice kind.');
  const notice = KINDS[kind];
  const payload = {
    kind,
    location:text(location),
    subject:text(subject),
    time:text(time, 64),
    detail:text(detail, 180)
  };
  const chatData = JSON.stringify(payload);
  if (Buffer.byteLength(chatData, 'utf8') > 1024) {
    throw new RangeError('Telegram Widget chat state exceeds 1024 bytes.');
  }
  return {
    html:STATUS_WIDGET_HTML,
    chat_data:chatData,
    width:340,
    height:218,
    allow_queries:false,
    protect_content:true,
    caption:notice.tag + ' ' + notice.title + (payload.location ? '\n' + payload.location : '') +
      (payload.subject ? ' · ' + payload.subject : '')
  };
}

function miniAppKeyboard(url, privateChat) {
  if (!url) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new TypeError('Mini App URL must use public HTTPS.');
  }
  return {
    inline_keyboard:[[
      privateChat
        ? { text:'Открыть MIRA-TV', web_app:{ url:parsed.href } }
        : { text:'Открыть MIRA-TV', url:parsed.href }
    ]]
  };
}

function widgetUnavailable(error) {
  const code = Number(error?.status || error?.error_code);
  const message = String(error?.description || error?.message || '');
  return code === 400 && /widget|method (not found|not available)|not supported/i.test(message);
}

// apiCall(method, payload) is injected by the separate bot transport.
// Unsupported clients/chats can use plain messages; other API failures
// MUST propagate to the persistent delivery queue for retry.
export async function sendTelegramNotice(apiCall, {
  chatId, chatType = 'private', miniAppUrl = '', notice, useWidgets = true
}) {
  if (typeof apiCall !== 'function' || !/^-?[1-9]\d{0,19}$/.test(String(chatId))) {
    throw new TypeError('Telegram destination or API transport is invalid.');
  }
  const privateChat = chatType === 'private';
  const content = buildTelegramNotice(notice);
  const replyMarkup = miniAppKeyboard(miniAppUrl, privateChat);
  if (useWidgets && privateChat) {
    try {
      return await apiCall('sendWidget', {
        chat_id:chatId, ...content,
        ...(replyMarkup ? { reply_markup:replyMarkup } : {})
      });
    } catch (error) {
      if (!widgetUnavailable(error)) throw error;
    }
  }
  return apiCall('sendMessage', {
    chat_id:chatId,
    text:content.caption + (notice.detail ? '\n' + text(notice.detail, 180) : ''),
    ...(replyMarkup ? { reply_markup:replyMarkup } : {})
  });
}
