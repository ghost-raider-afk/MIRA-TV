import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, publicRoot), 'utf8');

test('application shell uses one primary sidebar without a secondary context submenu', async () => {
  const [shell, sidebar, navigation] = await Promise.all([
    read('js/components/shell.js'),
    read('js/components/sidebar.js'),
    read('js/core/navigation.js')
  ]);
  assert.match(shell, /createSidebar/);
  assert.match(shell, /createHeader/);
  assert.doesNotMatch(shell, /context-panel|createContextPanel|setCollapsed|responsiveCollapsed|savedCollapsedState/);
  assert.doesNotMatch(navigation, /CONTEXT_LINKS/);
  assert.match(navigation, /group: 'content'/);
  assert.match(navigation, /group: 'show'/);
  assert.match(navigation, /group: 'system'/);
  assert.match(sidebar, /ui-rail-section-label/);
  assert.match(sidebar, /GROUP_LABELS/);
  assert.match(sidebar, /Контент/);
  assert.match(sidebar, /Показ/);
  assert.match(sidebar, /Система/);
});
