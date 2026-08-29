import express from 'express';
import { ValidationError } from '../../shared/errors.js';

const SEVERITIES = new Set(['success', 'warning', 'error', 'info']);
const CATEGORY_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/;

function text(value, maximum) {
  return String(value ?? '').trim().slice(0, maximum);
}

function eventInput(body = {}) {
  const message = text(body.message, 2000);
  const severity = text(body.severity || 'info', 20).toLowerCase();
  const category = text(body.category || 'interface', 40).toLowerCase();
  if (!message) throw new ValidationError('Сообщение события не может быть пустым.');
  if (!SEVERITIES.has(severity)) throw new ValidationError('Неизвестный уровень события.');
  if (!CATEGORY_PATTERN.test(category)) throw new ValidationError('Некорректная категория события.');
  return {
    message,
    severity,
    category,
    details: text(body.details, 4000),
    page: text(body.page, 1000)
  };
}

async function prune(store, config) {
  return store.pruneEvents({
    retentionDays: config.eventJournalRetentionDays,
    maxEntries: config.eventJournalMaxEntries
  });
}

export function createNotificationsRouter({ store, config }) {
  const router = express.Router();

  router.get('/', async (request, response) => {
    await prune(store, config);
    response.json(await store.listNotifications(request.query.limit));
  });

  router.get('/events', async (request, response) => {
    await prune(store, config);
    const [items, stats] = await Promise.all([
      store.listEvents({
        limit: request.query.limit,
        severity: request.query.severity,
        category: request.query.category,
        query: request.query.q
      }),
      store.eventJournalStats()
    ]);
    response.json({
      items,
      stats,
      retention_days: config.eventJournalRetentionDays,
      max_entries: config.eventJournalMaxEntries
    });
  });

  router.post('/events', async (request, response) => {
    const input = eventInput(request.body);
    const event = await store.recordActivity({
      actor_username: request.session.sub,
      action: 'ui.message',
      entity_type: 'ui_event',
      entity_id: null,
      message: input.message,
      severity: input.severity,
      category: input.category,
      details: input.details,
      metadata: input.page ? { page: input.page } : {}
    });
    await prune(store, config);
    response.status(201).json(event);
  });

  router.delete('/events', async (request, response) => {
    const deletedCount = await store.clearEvents();
    const auditEvent = await store.recordActivity({
      actor_username: request.session.sub,
      action: 'events.cleared',
      entity_type: 'event_journal',
      entity_id: null,
      message: 'Журнал событий очищен',
      severity: 'info',
      category: 'system',
      metadata: { deleted_count: deletedCount }
    });
    response.json({ deleted_count: deletedCount, audit_event: auditEvent });
  });

  router.post('/read', async (_request, response) => response.json({ marked_read: await store.markNotificationsRead() }));

  return router;
}
