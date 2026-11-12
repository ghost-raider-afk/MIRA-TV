import { noticeContent, secureMiniAppUrl } from './notice-content.js';

const INT64_MAX = 9223372036854775807n;

function destinationId(value, type) {
  const text = String(value ?? '');
  if (!/^-?[1-9]\d{0,18}$/.test(text) || (type === 'user' && text.startsWith('-'))) {
    throw new TypeError('Invalid MAX destination.');
  }
  const id = BigInt(text);
  if (id > INT64_MAX || id < -INT64_MAX) throw new TypeError('Invalid MAX destination.');
  return text;
}

// Transport is injected by the separate bot container. It must use
// Authorization: <bot-token> against platform-api2.max.ru, with durable retry
// and per-dialog throttling (MAX: at most two sends per second).
export async function sendMaxNotice(apiCall, {
  recipient, recipientType = 'user', miniAppUrl = '', notice
} = {}) {
  if (typeof apiCall !== 'function' || !['user','chat'].includes(recipientType)) {
    throw new TypeError('Invalid MAX transport or recipient type.');
  }
  const id = destinationId(recipient, recipientType);
  const content = noticeContent(notice);
  const app = miniAppUrl ? secureMiniAppUrl(miniAppUrl) : '';
  const attachments = app ? [{
    type:'inline_keyboard',
    payload:{ buttons:[[{ type:'open_app', text:'Открыть MIRA-TV', web_app:app }]] }
  }] : null;

  return apiCall({
    method:'POST',
    path:'/messages',
    query:recipientType === 'user' ? {user_id:id} : {chat_id:id},
    body:{
      text:content.plainText,
      disable_link_preview:true,
      ...(attachments ? { attachments } : {})
    }
  });
}
