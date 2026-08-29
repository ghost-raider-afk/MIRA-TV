import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const htmlPages = ['index.html','locations.html','screens.html','screen-editor.html','catalog.html','settings.html','sftp-settings.html','playlist.html','events.html','profile.html','signin.html'];

test('all current pages use the single final CSS entrypoint', async () => {
  for (const page of htmlPages) {
    const html = await read(page);
    assert.match(html, /href="\/css\/index\.css"/, page);
    assert.doesNotMatch(html, /href="\/style\.css"|ui-v319/, page);
  }
});

test('templates frontend is physically absent', async () => {
  for (const path of ['templates.html','js/pages/templates.js','js/editor/templates.js','css/pages/templates.css']) {
    await assert.rejects(access(new URL(path, root)), undefined, path);
  }
  const [application, navigation, config, entry] = await Promise.all([
    read('js/application.js'), read('js/core/navigation.js'), read('js/core/config.js'), read('css/index.css')
  ]);
  for (const source of [application, navigation, config, entry]) assert.doesNotMatch(source, /templates\.html|api\/templates|pages\/templates|templates\.css/);
});

test('CSS architecture is compact and has one permanent entrypoint', async () => {
  const [entry, tokens] = await Promise.all([read('css/index.css'), read('css/tokens.css')]);
  for (const required of ['./tokens.css','./base.css','./shell.css','./components.css','./forms.css','./tables.css','./pages/playlist.css','./pages/events.css','./connect-tv.css','./editor/editor.css','./auth/signin.css']) {
    assert.ok(entry.includes(required), required);
  }
  assert.doesNotMatch(entry, /tv1|templates\.css|error-log\.css/i);
  assert.match(tokens, /--brand-accent:#f4c915/i);
  assert.match(tokens, /--ui-rail-width:64px/);
  assert.match(tokens, /--ui-context-width:250px/);
  assert.match(tokens, /--ui-control-height:32px/);
  assert.match(tokens, /--ui-chrome-surface:/);
  assert.match(tokens, /--ui-accent-on-chrome:/);
});

test('shell remains modular and event journal exists only as its own route', async () => {
  const [shell, navigation, settings, bell] = await Promise.all([
    read('js/components/shell.js'), read('js/core/navigation.js'), read('settings.html'), read('js/components/notifications.js')
  ]);
  assert.match(shell, /createSidebar/);
  assert.match(shell, /createContextPanel/);
  assert.match(shell, /createHeader/);
  assert.doesNotMatch(shell, /legacy|\.sidebar|\.topbar/i);
  assert.match(navigation, /catalog:\s*Object\.freeze\(\[\['Продукция', '\/catalog'\]\]\)/);
  assert.match(navigation, /playlist:\s*Object\.freeze\(\[\['Плейлист', '\/playlist'\]\]\)/);
  assert.match(navigation, /\['Журнал событий', '\/events'\]/);
  assert.match(navigation, /source\.endsWith\('\.html'\)/);
  assert.match(navigation, /source === '\/animation\.html' \|\| source === '\/animation'/);
  assert.doesNotMatch(navigation, /path:\s*'\/playlist\.html'/);
  assert.doesNotMatch(settings, /Журнал событий|href="\/events(?:\.html)?"|event-journal-link-title/);
  assert.match(bell, /href="\/events"/);
  assert.match(bell, /Открыть журнал событий/);
});

test('global messages use one top toast and one persisted event source', async () => {
  const [dom, toasts, notifications, events] = await Promise.all([
    read('js/core/dom.js'), read('js/core/toasts.js'), read('js/core/notifications.js'), read('js/pages/events.js')
  ]);
  assert.match(dom, /import \{ showToast \} from '\.\/toasts\.js'/);
  assert.match(dom, /showToast\(message/);
  assert.match(dom, /target\.className = 'form-message is-hidden'/);
  assert.match(toasts, /TOAST_LIFETIME_MS = 5000/);
  assert.match(toasts, /\/api\/notifications\/events/);
  assert.match(toasts, /mouseenter/);
  assert.match(toasts, /focusin/);
  assert.match(toasts, /menu-tv:event-recorded/);
  assert.match(notifications, /menu-tv:event-recorded/);
  assert.match(events, /API\.notifications\}\/events/);
});

test('authenticated page bootstrap uses one context API request', async () => {
  const [session, config] = await Promise.all([read('js/core/session.js'), read('js/core/config.js')]);
  assert.match(config, /sessionContext:\s*'\/api\/session\/context'/);
  assert.match(session, /api\.get\(API\.sessionContext\)/);
  assert.equal((session.match(/api\.get\(/g) || []).length, 1);
  assert.doesNotMatch(session, /API\.userSettings|API\.siteSettings|Promise\.all/);
});

test('authenticated navigation uses one persistent client-side shell and extensionless canonical URLs', async () => {
  const [application, router, shell, sidebar, context, header, screens, navigation] = await Promise.all([
    read('js/application.js'), read('js/core/router.js'), read('js/components/shell.js'), read('js/components/sidebar.js'),
    read('js/components/context-panel.js'), read('js/components/header.js'), read('js/pages/screens.js'), read('js/core/navigation.js')
  ]);
  assert.match(application, /createAppRouter/);
  assert.match(application, /case 'events'/);
  assert.match(application, /case 'playlist'/);
  assert.match(application, /pages\/playlist\.js/);
  assert.match(application, /router\.start\(\)/);
  assert.doesNotMatch(application, /pages\/animation\.js|case 'error-log'|pages\/error-log/);
  assert.match(router, /history\.pushState/);
  assert.match(router, /addEventListener\('popstate'/);
  assert.match(router, /main\.innerHTML = view\.mainHtml/);
  assert.match(router, /PREFETCH_ROUTE_PATHS/);
  assert.match(router, /canLeaveCurrentPage/);
  assert.match(router, /canonicalRoutePath/);
  assert.match(router, /declaredPage/);
  assert.match(router, /mira:route-dispose/);
  assert.match(navigation, /ROUTE_DEFINITIONS/);
  assert.match(navigation, /path:\s*'\/playlist',\s*page:\s*'playlist'/);
  assert.match(navigation, /PREFETCH_ROUTE_PATHS/);
  assert.match(shell, /refreshShellRoute/);
  assert.match(sidebar, /refreshSidebarActive/);
  assert.match(context, /refreshContextPanel/);
  assert.match(header, /refreshHeaderRoute/);
  assert.match(header, /document\.title = `\$\{appName\(\)\} — \$\{title\}`/);
  assert.match(screens, /await navigate\(`\/screen-editor\?id=\$\{screen\.id\}`\)/);
  assert.doesNotMatch(screens, /screen-editor\.html/);
  assert.doesNotMatch(screens, /window\.location\.assign/);
});

test('monitor editor owns one compact command bar, in-flow settings and one modular canonical renderer', async () => {
  const [rows, preview, finalImage, facade, model, svg, editorCss, editorHtml, editorJs, tablesCss] = await Promise.all([
    read('js/editor/rows.js'), read('js/editor/preview.js'), read('js/editor/final-image.js'), read('js/editor/renderer.js'),
    read('js/editor/renderer-model.js'), read('js/editor/renderer-svg.js'), read('css/editor/editor.css'), read('screen-editor.html'),
    read('js/editor/editor.js'), read('css/tables.css')
  ]);
  assert.match(rows, /editor-menu-editor-table/);
  assert.match(rows, /<th>Данные из базы<\/th>/);
  assert.match(rows, /<th>1 л<\/th>/);
  assert.match(rows, /<th>1,5 л<\/th>/);
  assert.match(preview, /buildTableSvg/);
  assert.match(finalImage, /buildTableSvg/);
  assert.match(facade, /renderer-model\.js/);
  assert.match(facade, /renderer-svg\.js/);
  assert.match(model, /formatProductMetadata/);
  assert.match(model, /formatStrength\(product\?\.strength/);
  assert.match(model, /tableX: 56/);
  assert.match(model, /tableWidth: 1374/);
  assert.match(model, /tableHeight: 925/);
  assert.match(model, /tableFrame\(model\)/);
  assert.match(model, /table_width_px/);
  assert.match(model, /table_height_px/);
  assert.match(svg, /export function buildTableSvg/);
  assert.match(svg, /viewBox="0 0 \$\{model\.viewport\.width\} \$\{model\.viewport\.height\}"/);
  assert.doesNotMatch(svg, /verticalSeparatorsMarkup/);
  assert.match(editorCss, /\.editor-commandbar\{position:sticky/);
  assert.match(editorCss, /\.editor-workarea\{display:grid/);
  assert.match(editorCss, /\.editor-settings-panel\{position:sticky/);
  assert.match(editorCss, /\.editor-settings-section>summary/);
  assert.match(editorCss, /:focus-visible/);
  assert.match(editorCss, /@media\(pointer:coarse\)/);
  assert.match(editorCss, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(editorCss, /\.editor-tool-popover|\.tv-board-table/);
  assert.match(editorHtml, /class="editor-commandbar"/);
  assert.match(editorHtml, /class="settings-card editor-settings-panel"/);
  assert.match(editorHtml, /<details class="editor-settings-section editor-tool-menu"/);
  assert.match(editorHtml, /id="editor-sftp-path"/);
  assert.doesNotMatch(editorHtml, /editor-tool-popover|editor-commandbar-menus/);
  assert.doesNotMatch(editorHtml, />Доставка<\/summary>|editor-source-file|editor-upload|JPEG вручную/);
  assert.match(editorHtml, /id="editor-save"[^>]*>Сохранить<\/button>\s*<button[^>]*id="editor-publish"[^>]*>Опубликовать<\/button>/);
  assert.match(editorJs, /canLeave\(\)/);
  assert.match(editorJs, /dispose\(\)/);
  assert.match(editorJs, /removeEventListener\('beforeunload'/);
  assert.doesNotMatch(editorJs, /editor-source-file|editor-upload/);
  const commandbar = editorHtml.match(/<section class="editor-commandbar"[\s\S]*?<\/section>/)?.[0] || '';
  const menuCard = editorHtml.match(/<section class="settings-card editor-menu-card"[\s\S]*?<\/section>/)?.[0] || '';
  assert.doesNotMatch(commandbar, /editor-add-section|editor-add-item|editor-add-packaging/);
  for (const id of ['editor-add-section','editor-add-item','editor-add-packaging']) assert.match(menuCard, new RegExp(`id="${id}"`));
  for (const id of ['editor-table-x','editor-table-y','editor-table-width','editor-table-height','editor-background-file','editor-font-family','editor-font-scale']) {
    assert.match(editorHtml, new RegExp(`id="${id}"`));
  }
  assert.match(editorHtml, />Tahoma Bold<\/option>/);
  assert.doesNotMatch(editorHtml, /editor-template|Использовать шаблон|ШАБЛОН/);
  assert.doesNotMatch(editorJs, /20 МБ/);
  assert.doesNotMatch(tablesCss, /menu-preview|editor-menu-table/);
});

test('catalog page delegates CSV import and decodes Excel encodings before preview', async () => {
  const [catalog, importer, decoder] = await Promise.all([read('js/pages/catalog.js'), read('js/catalog/import-preview.js'), read('js/catalog/csv-decoder.js')]);
  assert.match(catalog, /initialiseProductImport/);
  assert.doesNotMatch(catalog, /function importRowMarkup|function scheduleImportValidation/);
  assert.match(importer, /function importRowMarkup/);
  assert.match(importer, /Цена 1,5 л, расчётная/);
  assert.match(importer, /decodeCsvFile\(file\)/);
  assert.doesNotMatch(importer, /file\.text\(\)/);
  assert.match(decoder, /windows-1251/);
  assert.match(decoder, /utf-16le/);
  assert.match(decoder, /utf-16be/);
  assert.match(decoder, /fatal:\s*true/);
});

test('login uses the TV Menu 1 composition and seven logo sizes without a wrong first frame', async () => {
  const [signinCss, signinHtml, signinJs, settingsHtml, presentation] = await Promise.all([
    read('css/auth/signin.css'), read('signin.html'), read('js/pages/signin.js'), read('settings.html'), read('js/core/presentation.js')
  ]);
  assert.match(signinCss, /\.signin-brand \.brand-mark\{[^}]*width:72px[^}]*height:72px/);
  for (let level = 2; level <= 7; level += 1) assert.match(signinCss, new RegExp(`data-signin-logo-size="${level}"`));
  assert.match(signinCss, /data-signin-logo-size="7"[^}]*width:170px[^}]*height:170px/);
  assert.match(signinCss, /data-signin-presentation="pending"[^}]*\.signin-brand\{visibility:hidden/);
  assert.doesNotMatch(signinCss, /transition:\s*(?:width|height)|transition-property:[^}]*\b(?:width|height)\b/);
  assert.match(signinHtml, /data-signin-presentation="pending"/);
  assert.doesNotMatch(signinHtml, /ПАНЕЛЬ УПРАВЛЕНИЯ|Введите данные администратора\./);
  assert.match(signinHtml, /placeholder="Логин"/);
  assert.match(signinHtml, /placeholder="Пароль"/);
  assert.match(signinHtml, /Забыли логин или пароль/);
  assert.match(signinJs, /signinPresentation = 'ready'/);
  assert.match(settingsHtml, /id="site-signin-logo-size"/);
  for (let level = 1; level <= 7; level += 1) assert.match(settingsHtml, new RegExp(`value="${level}"`));
  assert.match(presentation, /dataset\.signinLogoSize/);
});

test('legacy frontend files and duplicate diagnostic journals are physically absent', async () => {
  for (const path of ['style.css','css/tv1.css','css/tv1/tokens.css','css/tv1/base.css','css/tv1/shell.css','css/tv1/pages.css','css/tv1/editor.css','css/tv1/auth.css','js/components/chrome.js','error-log.html','js/pages/error-log.js','css/pages/error-log.css','animation.html','js/pages/animation.js']) {
    await assert.rejects(access(new URL(path, root)), undefined, path);
  }
});
