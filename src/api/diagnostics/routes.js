import express from 'express';
import { ValidationError } from '../../shared/errors.js';

const ERROR_TYPES = new Set(['error', 'unhandledrejection', 'api-network', 'api-response', 'application']);

function text(value, maximum) {
  return String(value ?? '').trim().slice(0, maximum);
}

function optionalInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function frontendErrorInput(body = {}) {
  const errorType = text(body.error_type, 40);
  const message = text(body.message, 2000);
  if (!ERROR_TYPES.has(errorType)) throw new ValidationError('Неизвестный тип ошибки интерфейса.');
  if (!message) throw new ValidationError('Сообщение ошибки интерфейса не может быть пустым.');
  return {
    error_type: errorType,
    message,
    stack: text(body.stack, 12000),
    page: text(body.page, 1000),
    source: text(body.source, 1000),
    line_number: optionalInteger(body.line_number),
    column_number: optionalInteger(body.column_number)
  };
}

export function createDiagnosticsRouter({ store, config }) {
  const router = express.Router();

  router.get('/frontend-errors', async (request, response) => {
    const items = await store.listEvents({
      limit: request.query.limit,
      severity: 'error',
      category: 'interface',
      query: request.query.q
    });
    response.json({
      items,
      retention_days: config.eventJournalRetentionDays,
      max_entries: config.eventJournalMaxEntries
    });
  });

  router.post('/frontend-errors', async (request, response) => {
    const input = frontendErrorInput(request.body);
    await store.recordActivity({
      actor_username: request.session.sub,
      action: `frontend.${input.error_type}`,
      entity_type: 'frontend_error',
      entity_id: null,
      message: input.message,
      severity: 'error',
      category: 'interface',
      details: input.stack,
      metadata: {
        page: input.page,
        source: input.source,
        line_number: input.line_number,
        column_number: input.column_number,
        user_agent: text(request.get('user-agent'), 1000)
      }
    });
    await store.pruneEvents({
      retentionDays: config.eventJournalRetentionDays,
      maxEntries: config.eventJournalMaxEntries
    });
    response.status(204).end();
  });

  return router;
}
