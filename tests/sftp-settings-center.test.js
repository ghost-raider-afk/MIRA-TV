import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SftpStorage } from '../src/sftp/storage.js';

const webRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const sourceRoot = new URL('../src/', import.meta.url);
const readWeb = (relative) => readFile(new URL(relative, webRoot), 'utf8');
const readSource = (relative) => readFile(new URL(relative, sourceRoot), 'utf8');

test('published SFTP storage can enumerate, checksum and read safe files only', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'menu-tv-sftp-'));
  try {
    const storage = new SftpStorage(root);
    await mkdir(path.join(root, 'point-one'));
    await writeFile(path.join(root, 'point-one', 'monitor-1.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0xff, 0xd9]));
    await writeFile(path.join(root, 'point-one', '.secret'), 'hidden');

    const summary = await storage.directorySummary('point-one');
    assert.equal(summary.file_count, 1);
    assert.equal(summary.total_bytes, 6);
    assert.ok(summary.last_modified_at);

    const files = await storage.listPublishedFiles('point-one');
    assert.equal(files.length, 1);
    assert.equal(files[0].name, 'monitor-1.jpg');
    assert.equal(files[0].size, 6);
    assert.match(files[0].sha256, /^[0-9a-f]{64}$/);

    const file = await storage.readPublishedFile('point-one', 'monitor-1.jpg');
    assert.equal(file.size, 6);
    assert.deepEqual([...file.bytes], [0xff, 0xd8, 0xff, 0xdb, 0xff, 0xd9]);
    await assert.rejects(() => storage.readPublishedFile('point-one', '../secret'), /Недопустимое имя/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('SFTP administration is a dedicated settings page and not mixed into locations', async () => {
  const [html, locationsHtml, page, navigation, application, config, css, routes] = await Promise.all([
    readWeb('sftp-settings.html'),
    readWeb('locations.html'),
    readWeb('js/pages/sftp-settings.js'),
    readWeb('js/core/navigation.js'),
    readWeb('js/application.js'),
    readWeb('js/core/config.js'),
    readWeb('css/pages/sftp-settings.css'),
    readSource('api/sftp/routes.js')
  ]);

  assert.match(html, /data-page="sftp-settings"/);
  for (const id of ['sftp-host','sftp-port','sftp-directory-form','sftp-binding-form','sftp-browser-directory','sftp-file-list']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(locationsHtml, /id="sftp-directory-form"|id="sftp-binding-form"/);
  assert.match(locationsHtml, /Настройки → SFTP/);
  assert.match(navigation, /path:\s*'\/sftp-settings'/);
  assert.match(navigation, /\['SFTP', '\/sftp-settings'\]/);
  assert.doesNotMatch(navigation, /path:\s*'\/sftp-settings\.html'/);
  assert.match(application, /initialiseSftpSettings/);
  assert.match(config, /sftpOverview:\s*'\/api\/sftp\/overview'/);
  assert.match(page, /\/files\/\$\{encodeURIComponent\(file\.name\)\}\/download/);
  assert.match(page, /file\.sha256/);
  assert.match(css, /\.sftp-file-table/);
  assert.match(routes, /\/sftp\/overview/);
  assert.match(routes, /\/sftp\/directories\/:id\/files/);
  assert.match(routes, /\/files\/:filename\/download/);
  assert.match(routes, /X-Content-SHA256/);
});
