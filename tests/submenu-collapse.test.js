import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, publicRoot), 'utf8');

test('context navigation is integrated into the desktop header and inaccessible while the mobile sheet is closed', async () => {
  const [shell, navigation, contextPanel, header] = await Promise.all([
    read('js/components/shell.js'),
    read('js/core/navigation.js'),
    read('js/components/context-panel.js'),
    read('js/components/header.js')
  ]);

  assert.match(navigation, /overview:\s*Object\.freeze\(\[\]\)/);
  assert.match(navigation, /scene:\s*Object\.freeze\(\[\]\)/);
  assert.match(navigation, /hasContext:\s*contextLinks\.length > 0/);
  assert.doesNotMatch(navigation, /\['Сцена', '\/scene'\]/);
  assert.match(contextPanel, /data\.contextAvailable|dataset\.contextAvailable/);
  assert.match(contextPanel, /id = 'app-context-panel'/);

  assert.match(shell, /const PHONE_BREAKPOINT = 960/);
  assert.match(shell, /contextAvailable\(context\)/);
  assert.match(shell, /const open = available && mobile && !collapsed/);
  assert.match(shell, /context\.hidden = !available \|\| !mobile/);
  assert.match(shell, /toggleAttribute\('inert', !open\)/);
  assert.match(shell, /trigger\.hidden = !available \|\| !mobile/);
  assert.match(shell, /event\.key !== 'Escape'/);
  assert.match(shell, /reconcileContextRoute/);
  assert.match(shell, /setCollapsed\(shell, context, true\);/);
  assert.doesNotMatch(shell, /pointerenter/);
  assert.doesNotMatch(shell, /\.app-content'\)\?\.addEventListener\('click'/);
  assert.doesNotMatch(shell, /localStorage|CONTEXT_COLLAPSED_KEY|savedCollapsedState/);

  assert.match(header, /aria-controls="app-context-panel"/);
  assert.match(header, /DESKTOP_PRIMARY_ROUTES/);
  assert.match(header, /contextLinksForSection/);
  assert.match(header, /app-header-dropdown/);
  assert.match(header, /className = 'app-header-home'/);
});
