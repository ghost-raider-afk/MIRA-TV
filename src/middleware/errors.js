import { logger } from '../logger/index.js';
import { httpStatusOf } from '../shared/errors.js';

export function errorHandler(error, request, response, _next) {
  if (error.code === '23505') return response.status(409).json({ error: 'Запись с таким названием уже существует.' });
  if (error.code === '23503') return response.status(409).json({ error: 'Связанная запись не найдена.' });

  const status = httpStatusOf(error);
  if (status >= 500) {
    logger.error('HTTP request failed', {
      method: request.method,
      path: request.originalUrl,
      actor: request.session?.sub,
      error
    });
  }
  return response.status(status).json({
    error: status >= 500 ? 'Внутренняя ошибка сервера.' : error.message,
    ...(status < 500 && error.details !== undefined ? { details: error.details } : {})
  });
}
