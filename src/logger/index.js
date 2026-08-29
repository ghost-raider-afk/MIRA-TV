function errorPayload(error) {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
  };
}

function write(level, message, fields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields
  };
  if (entry.error) entry.error = errorPayload(entry.error);
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = Object.freeze({
  info(message, fields) { write('info', message, fields); },
  warn(message, fields) { write('warn', message, fields); },
  error(message, fields) { write('error', message, fields); }
});

export function childLogger(baseFields = {}) {
  return Object.freeze({
    info(message, fields = {}) { logger.info(message, { ...baseFields, ...fields }); },
    warn(message, fields = {}) { logger.warn(message, { ...baseFields, ...fields }); },
    error(message, fields = {}) { logger.error(message, { ...baseFields, ...fields }); }
  });
}
