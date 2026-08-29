import { logger } from '../logger/index.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';

export function notFound(message) {
  return new NotFoundError(message);
}

export function conflict(message, details) {
  return new ConflictError(message, details === undefined ? {} : { details });
}

export async function activity(store, request, entry) {
  try {
    await store.recordActivity({ actor_username: request.session.sub, ...entry });
    return true;
  } catch (error) {
    logger.warn('Activity event could not be recorded', {
      actor: request.session?.sub,
      action: entry?.action,
      entity_type: entry?.entity_type,
      entity_id: entry?.entity_id,
      error
    });
    return false;
  }
}
