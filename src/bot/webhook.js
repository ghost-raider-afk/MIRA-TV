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
