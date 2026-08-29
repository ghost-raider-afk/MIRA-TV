import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('server is a thin application assembly layer without templates runtime', async () => {
  const server = await read('server.js');
  assert.ok(server.length < 12000, `server.js too large: ${server.length}`);
  for (const router of ['createAuthRouter','createSessionRouter','createOverviewRouter','createSettingsRouter','createCatalogRouter','createLocationsRouter','createScreensRouter','createSftpRouter']) {
    assert.match(server, new RegExp(router));
  }
  assert.doesNotMatch(server, /createTemplatesRouter|\/api\/templates|\/templates\.html/);
  assert.match(server, /logger\.info/);
  assert.doesNotMatch(server, /INSERT INTO|UPDATE\s+(?:screens|locations)|DELETE FROM|CREATE TABLE/i);
  assert.doesNotMatch(server, /function\s+(?:productInput|screenInput|menuDraftInput|verifyPassword|issueSession)\b/);
});

test('normal page loads never purge the browser cache', async () => {
  const server = await read('server.js');
  assert.doesNotMatch(server, /Clear-Site-Data/i);
  assert.match(server, /extension === '\.html'[\s\S]*Cache-Control', 'no-store'/);
  assert.match(server, /extension === '\.js' \|\| extension === '\.css'[\s\S]*no-cache, must-revalidate/);
});

test('session router exposes one bootstrap context with user and site data', async () => {
  const routes = await read('api/session/routes.js');
  assert.match(routes, /router\.get\('\/session\/context'/);
  assert.match(routes, /user:\s*preferences/);
  assert.match(routes, /site:\s*siteSettingsResponse\(settings, config\)/);
  assert.match(routes, /Promise\.all/);
});

test('database facade exposes only current domain repositories', async () => {
  const facade = await read('db/index.js');
  assert.ok(facade.length < 6000, `db/index.js too large: ${facade.length}`);
  assert.doesNotMatch(facade, /SELECT\s|INSERT\s+INTO|UPDATE\s|DELETE\s+FROM|CREATE\s+TABLE/i);
  for (const repository of ['users.js','settings.js','notifications.js','overview.js','locations.js','screens.js','catalog.js','sftp.js']) {
    await access(new URL(`db/${repository}`, root));
  }
  await assert.rejects(access(new URL('db/templates.js', root)));
  await access(new URL('db/migrations/schema.js', root));
  await access(new URL('db/migrations/template-retirement.js', root));
  await assert.rejects(access(new URL('db.js', root)));
});

test('canonical schema contains no templates table or template_id', async () => {
  const schema = await read('db/migrations/schema.js');
  assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS templates|template_id/);
  assert.match(schema, /signin_logo_size SMALLINT NOT NULL DEFAULT 1/);
  assert.match(schema, /CHECK\(signin_logo_size BETWEEN 1 AND 7\)/);
});

test('legacy template terminology is isolated to one retirement migration only', async () => {
  const retirement = await read('db/migrations/template-retirement.js');
  assert.match(retirement, /DROP TABLE IF EXISTS templates/);
  assert.match(retirement, /DROP COLUMN IF EXISTS template_id/);
  for (const path of ['server.js','db/index.js','db/screens.js','contracts/input.js','api/screens/routes.js']) {
    assert.doesNotMatch(await read(path), /template_id|createTemplatesRouter|listTemplates|getTemplate|createTemplate/);
  }
});

test('SFTP facade lives only in sftp index and is composed from client storage and publisher', async () => {
  const service = await read('sftp/index.js');
  assert.match(service, /SftpGoClient/);
  assert.match(service, /SftpStorage/);
  assert.match(service, /SftpPublisher/);
  assert.doesNotMatch(service, /from 'node:fs\/promises'/);
  await access(new URL('sftp/client.js', root));
  await access(new URL('sftp/storage.js', root));
  await access(new URL('sftp/publisher.js', root));
  await assert.rejects(access(new URL('sftp.js', root)));
});

test('configuration has one modular entrypoint and no legacy config file', async () => {
  await access(new URL('config/index.js', root));
  await access(new URL('config/env.js', root));
  await assert.rejects(access(new URL('config.js', root)));
});

test('fresh PostgreSQL schema keeps TV Menu 1 accent without overwriting a changed accent', async () => {
  const schema = await read('db/migrations/schema.js');
  assert.match(schema, /DEFAULT '#F4C915'/);
  assert.match(schema, /accent_color = '#2563EB'.*updated_by/s);
});
