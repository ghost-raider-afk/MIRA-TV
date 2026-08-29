import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('mobile UI is one canonical shell layer rather than page-by-page patches', async () => {
  const [index, mobile, shell, sidebar, header] = await Promise.all([
    read('css/index.css'),
    read('css/mobile.css'),
    read('js/components/shell.js'),
    read('js/components/sidebar.js'),
    read('js/components/header.js')
  ]);

  assert.match(index, /@import url\('\.\/mobile\.css'\);\s*$/);
  assert.match(mobile, /@media\(max-width:960px\)/);
  assert.match(mobile, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(mobile, /bottom:calc\(76px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(mobile, /font-size:16px/);
  assert.match(mobile, /min-height:44px/);
  assert.match(mobile, /body\.ui-context-open\{overflow:hidden/);
  assert.match(mobile, /editor-menu-table-scroll/);
  assert.match(mobile, /catalog-import-table-wrap/);
  assert.match(mobile, /connect-tv-card\.is-disabled\{display:none\}/);

  assert.match(sidebar, /MOBILE_OVERVIEW_ROUTE/);
  assert.match(sidebar, /ui-mobile-primary/);
  assert.match(header, /data-mobile-context-trigger/);
  assert.match(shell, /ui-context-backdrop/);
  assert.match(shell, /PHONE_BREAKPOINT = 960/);
  assert.match(shell, /document\.body\.classList\.toggle\('ui-context-open'/);
  assert.doesNotMatch(shell, /uiSection === 'monitors'/);
});
