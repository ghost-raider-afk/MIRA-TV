import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('settings navigation exposes one unified event journal', async () => {
  const [navigation, application, page, bell] = await Promise.all([
    read('src/web/admin-ui/public/js/core/navigation.js'),
    read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/events.html'),
    read('src/web/admin-ui/public/js/components/notifications.js')
  ]);
  assert.match(navigation, /\['Журнал событий', '\/events'\]/);
  assert.match(navigation, /page: 'events'/);
  assert.doesNotMatch(navigation, /Журнал ошибок|error-log\.html|Журнал действий/);
  assert.match(application, /case 'events'/);
  assert.match(application, /pages\/events\.js/);
  assert.doesNotMatch(application, /case 'error-log'|pages\/error-log/);
  assert.match(page, /data-page="events"/);
  assert.match(page, />Журнал событий<\/h1>/);
  assert.match(bell, /href="\/events"/);
  await assert.rejects(access(new URL('../src/web/admin-ui/public/error-log.html', import.meta.url)));
});

test('frontend diagnostics feed the same activity event journal without request bodies', async () => {
  const [collector, api, routes, notifications] = await Promise.all([
    read('src/web/admin-ui/public/js/core/diagnostics.js'),
    read('src/web/admin-ui/public/js/core/api.js'),
    read('src/api/diagnostics/routes.js'),
    read('src/db/notifications.js')
  ]);
  assert.match(collector, /addEventListener\('error'/);
  assert.match(collector, /addEventListener\('unhandledrejection'/);
  assert.match(api, /type: 'api-network'/);
  assert.match(api, /response\.status >= 500/);
  assert.match(routes, /frontend-errors/);
  assert.match(routes, /recordActivity/);
  assert.match(routes, /severity:\s*'error'/);
  assert.match(routes, /category:\s*'interface'/);
  assert.match(notifications, /activity_events/);
  assert.doesNotMatch(routes, /cookie|request\.body\.(?:body|payload|password)/i);
});

test('event journal migration preserves legacy frontend errors and uses env-only retention', async () => {
  const [db, migration, config, env] = await Promise.all([
    read('src/db/index.js'),
    read('src/db/migrations/event-journal.js'),
    read('src/config/index.js'),
    read('.env.example')
  ]);
  assert.match(db, /008-event-journal/);
  assert.match(migration, /FROM frontend_error_events/);
  assert.match(migration, /JSON\.stringify/);
  assert.match(migration, /DROP TABLE IF EXISTS frontend_error_events/);
  assert.match(config, /EVENT_JOURNAL_RETENTION_DAYS/);
  assert.match(config, /EVENT_JOURNAL_MAX_ENTRIES/);
  assert.doesNotMatch(config, /FRONTEND_ERROR_RETENTION_DAYS|FRONTEND_ERROR_MAX_ENTRIES/);
  assert.match(env, /^EVENT_JOURNAL_RETENTION_DAYS=30$/m);
  assert.match(env, /^EVENT_JOURNAL_MAX_ENTRIES=5000$/m);
  assert.doesNotMatch(env, /^FRONTEND_ERROR_/m);
});
