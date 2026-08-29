import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('event journal clear action uses the single activity_events source and leaves one audit event', async () => {
  const [html, page, routes, repository] = await Promise.all([
    read('src/web/admin-ui/public/events.html'),
    read('src/web/admin-ui/public/js/pages/events.js'),
    read('src/api/notifications/routes.js'),
    read('src/db/notifications.js')
  ]);

  assert.match(html, /id="event-clear"[^>]*>Очистить журнал<\/button>/);
  assert.match(page, /confirm\('Очистить весь журнал событий\? Это действие нельзя отменить\.'/);
  assert.match(page, /api\.delete\(`\$\{API\.notifications\}\/events`\)/);
  assert.match(page, /persist:\s*false/);
  assert.match(routes, /router\.delete\('\/events'/);
  assert.match(routes, /const deletedCount = await store\.clearEvents\(\)/);
  assert.match(routes, /action:\s*'events\.cleared'/);
  assert.match(routes, /message:\s*'Журнал событий очищен'/);
  assert.match(routes, /metadata:\s*\{ deleted_count: deletedCount \}/);
  assert.match(repository, /async clearEvents\(\)/);
  assert.match(repository, /DELETE FROM activity_events/);
});
