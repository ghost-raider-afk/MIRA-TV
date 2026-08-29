function requestIp(request) {
  return request.ip || request.socket?.remoteAddress || 'unknown';
}

export function createIpRateLimiter({ maxAttempts, windowMinutes, maxEntries, message }) {
  const entries = new Map();
  const windowMs = windowMinutes * 60 * 1000;

  function prune(now) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  }

  return function ipRateLimiter(request, response, next) {
    const now = Date.now();
    prune(now);
    const key = requestIp(request);
    const current = entries.get(key);
    const entry = current && current.expiresAt > now
      ? { attempts: current.attempts + 1, expiresAt: current.expiresAt }
      : { attempts: 1, expiresAt: now + windowMs };
    entries.set(key, entry);
    prune(now);

    if (entry.attempts > maxAttempts) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.expiresAt - now) / 1000))));
      return response.status(429).json({ error: message || 'Слишком много запросов. Повторите позже.' });
    }
    return next();
  };
}
