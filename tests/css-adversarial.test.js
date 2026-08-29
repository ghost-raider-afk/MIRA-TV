import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('shell uses dynamic viewport height and explicit layer and chrome tokens', async () => {
  const [tokens, shell] = await Promise.all([
    source('src/web/admin-ui/public/css/tokens.css'),
    source('src/web/admin-ui/public/css/shell.css')
  ]);
  assert.match(tokens, /--ui-z-context:/);
  assert.match(tokens, /--ui-accent-text:/);
  assert.match(tokens, /--ui-accent-on-chrome:/);
  assert.match(tokens, /--ui-chrome-surface:/);
  assert.match(tokens, /--ui-chrome-text:/);
  assert.match(shell, /100dvh/);
  assert.match(shell, /var\(--ui-z-context\)/);
  assert.match(shell, /var\(--ui-accent-on-chrome\)/);
  assert.match(shell, /var\(--ui-chrome-surface\)/);
  assert.match(shell, /var\(--ui-chrome-text\)/);
});

test('hidden switches expose a keyboard focus indicator', async () => {
  const forms = await source('src/web/admin-ui/public/css/forms.css');
  assert.match(forms, /\.toggle-row input:focus-visible\+i/);
  assert.match(forms, /outline-offset/);
});

test('preview aspect ratio is driven by monitor resolution and table has one canonical SVG owner', async () => {
  const [preview, editorCss, settings] = await Promise.all([
    source('src/web/admin-ui/public/js/editor/preview.js'),
    source('src/web/admin-ui/public/css/editor/editor.css'),
    source('src/web/admin-ui/public/js/editor/settings.js')
  ]);
  assert.match(preview, /target\.style\.aspectRatio = `\$\{model\.viewport\.width\} \/ \$\{model\.viewport\.height\}`/);
  assert.match(preview, /buildTableSvg/);
  assert.match(editorCss, /container-type\s*:\s*inline-size/);
  assert.match(editorCss, /\.menu-table-svg/);
  assert.doesNotMatch(editorCss, /\.tv-board-table/);
  assert.doesNotMatch(settings, /Math\.min\(1920/);
  assert.doesNotMatch(settings, /Math\.min\(1080/);
});

test('preview and final image share the exact modular canonical SVG and fit logic', async () => {
  const [facade, model, svg, preview, finalImage, editor] = await Promise.all([
    source('src/web/admin-ui/public/js/editor/renderer.js'),
    source('src/web/admin-ui/public/js/editor/renderer-model.js'),
    source('src/web/admin-ui/public/js/editor/renderer-svg.js'),
    source('src/web/admin-ui/public/js/editor/preview.js'),
    source('src/web/admin-ui/public/js/editor/final-image.js'),
    source('src/web/admin-ui/public/js/editor/editor.js')
  ]);
  assert.match(facade, /from '\.\/renderer-model\.js'/);
  assert.match(facade, /buildTableSvg.*from '\.\/renderer-svg\.js'/s);
  assert.match(model, /export function buildRenderLayout/);
  assert.match(model, /autoReduced/);
  assert.match(model, /table_width_px/);
  assert.match(svg, /export function buildTableSvg/);
  assert.equal((svg.match(/export function buildTableSvg/g) || []).length, 1);
  assert.match(preview, /buildTableSvg\(model, lines, layout\)/);
  assert.match(finalImage, /buildTableSvg\(model, lines, layout\)/);
  assert.match(finalImage, /if \(!layout\.vertical\.fits\)/);
  assert.match(editor, /if \(!preview\?\.layout\?\.vertical\?\.fits\)/);
});

test('site accent derives contrast colors instead of reusing arbitrary accent as text', async () => {
  const presentation = await source('src/web/admin-ui/public/js/core/presentation.js');
  assert.match(presentation, /function contrast/);
  assert.match(presentation, />= 4\.5/);
  assert.match(presentation, /--ui-accent-contrast/);
  assert.match(presentation, /--ui-accent-text/);
  assert.match(presentation, /--ui-accent-on-dark/);
  assert.match(presentation, /--ui-accent-on-chrome/);
});
