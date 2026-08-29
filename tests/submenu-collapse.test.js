import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, publicRoot), 'utf8');

test('context submenu uses one section-independent collapse policy', async () => {
  const [shell, navigation] = await Promise.all([read('js/components/shell.js'), read('js/core/navigation.js')]);
  assert.match(navigation, /catalog:\s*Object\.freeze\(\[\['Продукция', '\/catalog'\]\]\)/);
  assert.doesNotMatch(navigation, /\['Тара',|#packaging-list|#products-list/);
  assert.match(shell, /context\.addEventListener\('click'/);
  assert.match(shell, /context\.addEventListener\('pointerleave'/);
  assert.doesNotMatch(shell, /uiSection === 'monitors'/);
  assert.match(shell, /setCollapsed\(shell, context, true\);/);
  assert.match(shell, /persist = false/);
  assert.match(shell, /responsiveCollapsed\(\) \? true : savedCollapsedState\(\)/);
});
