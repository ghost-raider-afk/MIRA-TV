import crypto from 'node:crypto';

function normalizeUsername(request) {
  return typeof request.body?.username === 'string' ? request.body.username.trim().toLowerCase() : '';
}

function requestIp(request) {
  return request.ip || request.socket?.remoteAddress || 'unknown';
}

function keyHash(secret, scope, value) {
  return crypto.createHmac('sha256', secret).update(`${scope}:${value}`).digest('hex');
}

function retryAfter(entry, now) {
  const expiresAt = Date.parse(entry?.expires_at || '');
  return Number.isFinite(expiresAt) ? Math.max(1, Math.ceil((expiresAt - now) / 1000)) : 1;
}

export function createLoginLimiter({ store, keySecret, maxAttempts, ipMaxAttempts, windowMinutes }) {
  const windowMs = windowMinutes * 60 * 1000;

  function keysFor(request) {
    const ip = requestIp(request);
    return {
      identityKeyHash: keyHash(keySecret, 'identity', `${ip}|${normalizeUsername(request)}`),
      ipKeyHash: keyHash(keySecret, 'ip', ip)
    };
  }

  async function middleware(request, response, next) {
    const now = Date.now();
    const keys = keysFor(request);
    request.loginLimiterKeys = keys;
    const entries = await store.getActiveLoginRateLimits(keys.identityKeyHash, keys.ipKeyHash);
    const identityEntry = entries.find((entry) => entry.scope === 'identity');
    const ipEntry = entries.find((entry) => entry.scope === 'ip');
    const blockedIdentity = identityEntry && identityEntry.attempts >= maxAttempts;
    const blockedIp = ipEntry && ipEntry.attempts >= ipMaxAttempts;
    if (blockedIdentity || blockedIp) {
      const retry = Math.max(
        blockedIdentity ? retryAfter(identityEntry, now) : 0,
        blockedIp ? retryAfter(ipEntry, now) : 0
      );
      response.setHeader('Retry-After', String(retry));
      return response.status(429).json({ error: 'Слишком много неудачных попыток входа. Повторите позже.' });
    }
    return next();
  }

  async function recordFailure(request) {
    const now = new Date();
    const keys = request.loginLimiterKeys || keysFor(request);
    return store.recordLoginFailure({
      ...keys,
      now: now.toISOString(),
      expiresAt: new Date(now.getTime() + windowMs).toISOString()
    });
  }

  async function recordSuccess(request) {
    const keys = request.loginLimiterKeys || keysFor(request);
    return store.clearLoginRateLimits(keys.identityKeyHash, keys.ipKeyHash);
  }

  return Object.freeze({ middleware, recordFailure, recordSuccess });
}
