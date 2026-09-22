import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, publicRoot), 'utf8');

test('context drawer is route-aware, deterministic and inaccessible while closed', async () => {
  const [shell, navigation, contextPanel, header] = await Promise.all([
    read('js/components/shell.js'),
    read('js/core/navigation.js'),
    read('js/components/context-panel.js'),
    read('js/components/header.js')
  ]);

  assert.match(navigation, /overview:\s*Object\.freeze\(\[\]\)/);
  assert.match(navigation, /hasContext:\s*contextLinks\.length > 0/);
  assert.match(contextPanel, /data\.contextAvailable|dataset\.contextAvailable/);
  assert.match(contextPanel, /id = 'app-context-panel'/);

  assert.match(shell, /contextAvailable\(context\)/);
  assert.match(shell, /context\.hidden = !available/);
  assert.match(shell, /toggleAttribute\('inert', !open\)/);
  assert.match(shell, /event\.key !== 'Escape'/);
  assert.match(shell, /\.app-content'\)\?\.addEventListener\('pointerdown'/);
  assert.match(shell, /reconcileContextRoute/);
  assert.match(shell, /setCollapsed\(shell, context, true\);/);
  assert.doesNotMatch(shell, /localStorage|CONTEXT_COLLAPSED_KEY|savedCollapsedState/);

  assert.match(header, /aria-controls="app-context-panel"/);
  assert.match(header, /className = 'app-header-home'/);
});
