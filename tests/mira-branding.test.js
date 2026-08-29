import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('MIRA-TV is the canonical public brand without renaming legacy internals', async () => {
  const [env, header, signin, dashboard, player, settingsRepo, pkg] = await Promise.all([
    read('.env.example'),
    read('src/web/admin-ui/public/js/components/header.js'),
    read('src/web/admin-ui/public/signin.html'),
    read('src/web/admin-ui/public/index.html'),
    read('src/web/admin-ui/public/player.html'),
    read('src/db/settings.js'),
    read('package.json')
  ]);

  assert.match(env, /^APP_NAME=MIRA-TV$/m);
  assert.match(header, /\|\| 'MIRA-TV'/);
  for (const source of [signin, dashboard, player]) assert.match(source, /MIRA-TV/);
  assert.match(settingsRepo, /application_name IN \('ТВ МЕНЮ', 'ТВ МЕНЮ 2'\)/);

  const metadata = JSON.parse(pkg);
  assert.equal(metadata.name, 'menu-tv-2');
  assert.match(metadata.description, /MIRA-TV/);
  assert.match(env, /^MENU_TV_2_DOMAIN=/m);
  assert.match(env, /^POSTGRES_DB=menu_tv_2$/m);
  assert.match(env, /^POSTGRES_USER=menu_tv_2$/m);
});
