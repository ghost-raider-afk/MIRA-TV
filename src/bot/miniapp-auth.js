import { createHmac, timingSafeEqual } from 'node:crypto';

// Telegram WebApp.initData and MAX WebApp.initData use the same signing
// construction, but MUST be checked against the token of their own bot.
export function verifyMiniAppInitData(provider, initData, botToken, {
  nowMs = Date.now(),
  maxAgeSeconds = 600
} = {}) {
  if (!['telegram', 'max'].includes(provider) ||
      typeof initData !== 'string' || !initData || Buffer.byteLength(initData) > 8192 ||
      typeof botToken !== 'string' || !botToken) return null;

  const params = new URLSearchParams(initData);
  const seen = new Set();
  for (const [key] of params) {
    if (seen.has(key) || !/^[a-z_]+$/.test(key)) return null;
    seen.add(key);
  }
  if (!seen.has('hash') || !seen.has('auth_date') || !seen.has('user')) return null;
  const given = params.get('hash');
  if (!/^[a-f0-9]{64}$/i.test(given || '')) return null;

  const checkString = [...params]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => key + '=' + value)
    .join('\n');
  const key = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', key).update(checkString).digest();
  if (!timingSafeEqual(Buffer.from(given, 'hex'), expected)) return null;

  const dateText = params.get('auth_date');
  if (!/^\d{9,11}$/.test(dateText || '')) return null;
  const authSeconds = Number(dateText);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(authSeconds) ||
      authSeconds > nowSeconds + 60 ||
      nowSeconds - authSeconds > maxAgeSeconds) return null;

  let user;
  try { user = JSON.parse(params.get('user')); }
  catch { return null; }
  if (!user || typeof user !== 'object' ||
      !Number.isSafeInteger(user.id) || user.id <= 0) return null;

  // Authentication is NOT authorization: a separate DB binding resolves
  // the MIRA-TV account, its current role and allowed locations.
  return {
    provider,
    providerUserId:String(user.id),
    firstName:typeof user.first_name === 'string' ? user.first_name.slice(0, 120) : '',
    authenticatedAt:new Date(authSeconds * 1000).toISOString()
  };
}
