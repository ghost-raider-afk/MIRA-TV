function normalizeUsername(request) {
  return typeof request.body?.username === 'string' ? request.body.username.trim().toLowerCase() : '';
}

function requestIp(request) {
  return request.ip || request.socket?.remoteAddress || 'unknown';
}

export function createLoginLimiter({ maxAttempts, ipMaxAttempts, windowMinutes, maxEntries }) {
  const identityEntries = new Map();
  const ipEntries = new Map();
  const windowMs = windowMinutes * 60 * 1000;

  function identityKeyFor(request) {
    return `${requestIp(request)}|${normalizeUsername(request)}`;
  }

  function ipKeyFor(request) {
    return requestIp(request);
  }

  function pruneMap(entries, now) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  }

  function prune(now) {
    pruneMap(identityEntries, now);
    pruneMap(ipEntries, now);
  }

  function retryAfter(entry, now) {
    return Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
  }

  function increment(entries, key, now) {
    const current = entries.get(key);
    entries.set(key, current && current.expiresAt > now
      ? { attempts: current.attempts + 1, expiresAt: current.expiresAt }
      : { attempts: 1, expiresAt: now + windowMs });
  }

  function middleware(request, response, next) {
    const now = Date.now();
    prune(now);
    const identityKey = identityKeyFor(request);
    const ipKey = ipKeyFor(request);
    const identityEntry = identityEntries.get(identityKey);
    const ipEntry = ipEntries.get(ipKey);
    request.loginLimiterIdentityKey = identityKey;
    request.loginLimiterIpKey = ipKey;

    const blockedIdentity = identityEntry && identityEntry.attempts >= maxAttempts && identityEntry.expiresAt > now;
    const blockedIp = ipEntry && ipEntry.attempts >= ipMaxAttempts && ipEntry.expiresAt > now;
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

  function recordFailure(request) {
    const now = Date.now();
    prune(now);
    increment(identityEntries, request.loginLimiterIdentityKey || identityKeyFor(request), now);
    increment(ipEntries, request.loginLimiterIpKey || ipKeyFor(request), now);
    prune(now);
  }

  function recordSuccess(request) {
    identityEntries.delete(request.loginLimiterIdentityKey || identityKeyFor(request));
    ipEntries.delete(request.loginLimiterIpKey || ipKeyFor(request));
  }

  return Object.freeze({ middleware, recordFailure, recordSuccess });
}
