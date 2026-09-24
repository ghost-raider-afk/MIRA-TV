import { Pool } from 'pg';
import { logger } from '../logger/index.js';

export function attachDatabasePoolErrorHandler(pool, log = logger) {
  if (!pool || typeof pool.on !== 'function') throw new TypeError('PostgreSQL pool must support error events.');
  pool.on('error', (error) => {
    log.warn('PostgreSQL idle connection lost; pool will reconnect on demand', { error });
  });
  return pool;
}

export function createDatabasePool(dbConfig) {
  const pool = new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    max: dbConfig.poolMax,
    idleTimeoutMillis: dbConfig.idleTimeoutMs,
    connectionTimeoutMillis: dbConfig.connectionTimeoutMs
  });
  return attachDatabasePoolErrorHandler(pool);
}
