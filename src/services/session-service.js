import crypto from 'node:crypto';

export const SESSION_COOKIE = 'menu_tv_2_session';
const VALID_THEMES = new Set(['system', 'light', 'dark']);

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').flatMap((entry) => {
    const separator = entry.indexOf('=');
    return separator === -1 ? [] : [[entry.slice(0, separator).trim(), decodeURIComponent(entry.slice(separator + 1).trim())]];
  }));
}

export function issueSession(user, config) {
  const payload = Buffer.from(JSON.stringify({
    sub: user.username,
    version: user.session_version,
    exp: Math.floor(Date.now() / 1000) + config.sessionTtlHours * 3600
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySession(token, config) {
  if (typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  if (!constantTimeEqual(signature, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof session.sub === 'string' && Number.isInteger(session.version) && session.version > 0 && Number.isInteger(session.exp) && session.exp > Math.floor(Date.now() / 1000) ? session : null;
  } catch {
    return null;
  }
}

export function sessionCookie(token, config, maxAge = config.sessionTtlHours * 3600) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${config.secureCookies ? '; Secure' : ''}`;
}

export function themeCookie(theme, config, maxAge = config.sessionTtlHours * 3600) {
  const value = VALID_THEMES.has(theme) ? theme : 'system';
  return `menu_tv_theme=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Strict${config.secureCookies ? '; Secure' : ''}`;
}

export function createSessionResolver(store, config) {
  return async function resolveSession(request) {
    const session = verifySession(parseCookies(request)[SESSION_COOKIE], config);
    if (!session) return null;
    const user = await store.getActiveUser(session.sub);
    if (!user || user.session_version !== session.version) return null;
    return { ...session, user };
  };
}
