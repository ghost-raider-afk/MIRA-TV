const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function expectedOrigin(request) {
  const host = request.get('host');
  return host ? `${request.protocol}://${host}` : '';
}

export function protectStateChangingRequest(request, response, next) {
  if (SAFE_METHODS.has(request.method)) return next();

  const fetchSite = String(request.get('sec-fetch-site') || '').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return response.status(403).json({ error: 'Запрос с другого сайта отклонён.' });
  }

  const origin = request.get('origin');
  if (origin && origin !== expectedOrigin(request)) {
    return response.status(403).json({ error: 'Источник запроса не совпадает с адресом ТВ МЕНЮ.' });
  }
  return next();
}
