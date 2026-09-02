import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('mobile UI is one canonical shell layer rather than a second navigation model', async () => {
  const [index, mobile, shell, sidebar, navigation] = await Promise.all([
    read('css/index.css'),
    read('css/mobile.css'),
    read('js/components/shell.js'),
    read('js/components/sidebar.js'),
    read('js/core/navigation.js')
  ]);

  assert.match(index, /@import url\('\.\/mobile\.css'\);\s*$/);
  assert.match(mobile, /@media\(max-width:980px\)/);
  assert.match(mobile, /bottom:0/);
  assert.match(mobile, /env\(safe-area-inset-bottom\)/);
  assert.match(mobile, /font-size:16px/);
  assert.match(mobile, /min-height:44px/);
  assert.match(mobile, /editor-menu-table-scroll/);
  assert.match(mobile, /catalog-import-table-wrap/);
  assert.match(mobile, /connect-tv-card\.is-disabled\{display:none\}/);
  assert.match(mobile, /\.mobile-context-trigger,.ui-context-backdrop,.ui-context\{display:none!important\}/);

  assert.match(sidebar, /PRIMARY_ROUTES/);
  assert.match(sidebar, /ui-rail-nav/);
  assert.doesNotMatch(sidebar, /MOBILE_OVERVIEW_ROUTE|ui-mobile-primary/);
  assert.doesNotMatch(shell, /ui-context-backdrop|PHONE_BREAKPOINT|ui-context-open|createContextPanel/);
  assert.doesNotMatch(navigation, /CONTEXT_LINKS/);
});
