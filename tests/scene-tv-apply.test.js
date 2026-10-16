import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Scene Editor exposes an explicit apply action without a parallel renderer', async () => {
  const [application, module] = await Promise.all([
    readFile(new URL('../src/web/admin-ui/public/js/application.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/web/admin-ui/public/js/pages/scene-tv-apply.js', import.meta.url), 'utf8')
  ]);
  assert.match(application, /import\('\.\/pages\/scene-tv-apply\.js'\)/);
  assert.match(module, /button\.textContent = 'Применить на ТВ';/);
  assert.match(module, /dirtyState\.classList\.contains\('is-dirty'\)/);
  assert.match(module, /api\.post\(`\$\{API\.deviceBindings\}\/\$\{screenId\}\/apply`, \{\}\)/);
  assert.match(module, /waitForTvApply\(screenId, result\.command_id\)/);
  assert.match(module, /status\?\.status === 'completed'/);
  assert.doesNotMatch(module, /PlayerSceneRenderer|FlatMenuRenderer|SceneElementRenderer/);
});

test('Apply on TV bumps render revision and requests soft reprovision instead of a blind reload', async () => {
  const source = await readFile(new URL('../src/api/device/admin-routes.js', import.meta.url), 'utf8');
  assert.match(source, /router\.post\('\/bindings\/:screenId\/apply'/);
  assert.match(source, /markScreenRenderChanged\([\s\S]*\['screen', 'menu', 'scene', 'runtime'\][\s\S]*'screen\.force_applied'/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /realtime\?\.requestReprovision\?\.\(screenId, revision\.revision, commandId\)/);
  assert.match(source, /router\.get\('\/bindings\/:screenId\/apply\/:commandId'/);
  assert.doesNotMatch(source, /notifyScreen\(screenId, revision\.revision, \{ forceRender:true \}\)/);
});

test('soft reprovision preserves binding while clearing only Player shell state', async () => {
  const [client, recovery, server] = await Promise.all([
    readFile(new URL('../src/web/admin-ui/public/js/player/player-realtime-client.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/web/admin-ui/public/js/player/player-recovery.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/realtime/player-realtime.js', import.meta.url), 'utf8')
  ]);
  assert.match(server, /force_reprovision:state\.commandId/);
  assert.match(server, /message\?\.type === 'reprovision\.ack'/);
  assert.match(client, /location\.replace\(recoveryUrl\(reprovision\)\)/);
  assert.match(client, /type:'reprovision\.ack'/);
  assert.match(recovery, /registration\.unregister\(\)/);
  assert.match(recovery, /name\.startsWith\('mira-tv-player-shell-'\)/);
  assert.doesNotMatch(recovery, /localStorage\.clear|indexedDB\.deleteDatabase|mira-tv\.device-key/);
});
