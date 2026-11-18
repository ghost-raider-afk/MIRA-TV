import { timingSafeEqual } from 'node:crypto';

function secretEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function numericId(value) {
  const id = String(value ?? '');
  if (!/^[1-9][0-9]{0,18}$/.test(id)) return '';
  try { return BigInt(id) <= 9223372036854775807n ? id : ''; }
  catch { return ''; }
}

// MAX IDs use int64. JSON.parse would round numeric user_id values above
// Number.MAX_SAFE_INTEGER, potentially mapping a message to the wrong account.
// Quote numeric user_id tokens *outside* JSON strings before decoding; keep
// the full payload format unchanged for the platform's remaining fields.
export function preserveMaxUserIds(source) {
  let result='', index=0;
  while (index<source.length) {
    if (source[index]!=='"') { result+=source[index++]; continue; }
    const begin=index++;
    let escaped=false;
    while (index<source.length) {
      const ch=source[index++];
      if (escaped) { escaped=false;continue; }
      if (ch==='\\') { escaped=true;continue; }
      if (ch==='"') break;
    }
    const token=source.slice(begin,index);
    result+=token;
    if (token!=='"user_id"') continue;
    let colon=index;
    while (/\s/.test(source[colon]||'')) colon++;
    if (source[colon]!==':') continue;
    result+=source.slice(index,colon+1);
    index=colon+1;
    let value=index;
    while (/\s/.test(source[value]||'')) value++;
    const digits=/^([1-9][0-9]{0,18})(?=[,}\]\s]|$)/.exec(source.slice(value))?.[1];
    if (!digits) continue;
    result+=source.slice(index,value)+'"'+digits+'"';
    index=value+digits.length;
  }
  return result;
}

export function commandFromText(value) {
  const text = String(value || '').trim();
  if (/^\/start(?:\s|$)/i.test(text)) return 'start';
  if (/^\/help(?:\s|$)/i.test(text)) return 'help';
  if (/^\/status(?:\s|$)/i.test(text)) return 'status';
  if (/^\/requests(?:\s|$)/i.test(text)) return 'requests';
  return 'help';
}

export function extractBotCommand(provider, update) {
  if (provider === 'telegram') {
    const message = update?.message;
    if (!message || message.chat?.type !== 'private' || message.from?.is_bot === true) return null;
    const sender = numericId(message.from?.id);
    if (!sender || numericId(message.chat?.id) !== sender) return null;
    return { provider, provider_user_id:sender, command:commandFromText(message.text) };
  }
  if (provider === 'max') {
    if (update?.update_type === 'bot_started') {
      const user = numericId(update?.user?.user_id);
      return user ? { provider, provider_user_id:user, command:'start' } : null;
    }
    if (update?.update_type !== 'message_created') return null;
    const message = update.message;
    if (!message || message.recipient?.chat_type !== 'dialog' || message.sender?.is_bot === true) return null;
    const sender = numericId(message.sender?.user_id);
    return sender ? { provider, provider_user_id:sender, command:commandFromText(message.body?.text) } : null;
  }
  return null;
}

export function webhookAllowed(provider, headers, config) {
  if (provider === 'telegram' && config.telegramEnabled) {
    return secretEquals(headers['x-telegram-bot-api-secret-token'], config.telegramWebhookSecret);
  }
  if (provider === 'max' && config.maxEnabled) {
    return secretEquals(headers['x-max-bot-api-secret'], config.maxWebhookSecret);
  }
  return false;
}
