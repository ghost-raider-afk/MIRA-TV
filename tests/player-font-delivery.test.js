import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const dockerfile = await readFile(new URL('Dockerfile', root), 'utf8');
const fontsCss = await readFile(new URL('css/fonts.css', publicRoot), 'utf8');
const playerSw = await readFile(new URL('player-sw.js', publicRoot), 'utf8');

test('production image bundles all DejaVu faces required by the shared Preview/TV CSS', () => {
  assert.match(dockerfile, /apt-get install[^\n]*\bfonts-dejavu-core\b/);
  assert.match(dockerfile, /apt-get install[^\n]*\bfonts-dejavu-extra\b/);
  const cssFiles = [...new Set([...fontsCss.matchAll(/\/fonts\/(DejaVu[\w-]+\.ttf)/g)]
    .map((match) => match[1]))].sort();
  assert.equal(cssFiles.length, 10, 'expected all base font faces to be declared in CSS');
  const start = dockerfile.indexOf('for font in');
  const end = dockerfile.indexOf('; do', start);
  assert.ok(start >= 0 && end > start, 'Dockerfile must validate required font files');
  const loop = dockerfile.slice(start, end);
  const bundledFiles = [...new Set(loop[1].match(/DejaVu[\w-]+\.ttf/g) || [])].sort();
  assert.deepEqual(bundledFiles, cssFiles, 'Docker image validation must cover every referenced DejaVu face');
  assert.match(dockerfile, /test -s "\/usr\/share\/fonts\/truetype\/dejavu\/\$font"/);
});

test('bundled preset fonts are present, offline-cached and attributed', async () => {
  const themeFiles = [...new Set([...fontsCss.matchAll(/\/fonts\/theme\/([\w-]+\.woff2)/g)]
    .map((match) => match[1]))];
  assert.equal(themeFiles.length, 12);
  for (const file of themeFiles) {
    assert.ok((await stat(new URL('fonts/theme/' + file, publicRoot))).size > 0, file);
    assert.ok(playerSw.includes("'/fonts/theme/" + file + "'"), file + ' must be in offline shell');
  }
  const notices = await readFile(new URL('fonts/theme/NOTICES.txt', publicRoot), 'utf8');
  const license = await readFile(new URL('fonts/theme/OFL-1.1.txt', publicRoot), 'utf8');
  for (const name of ['Montserrat', 'Roboto Condensed', 'Oswald', 'Russo One', 'Neucha', 'PT Sans Narrow', 'Yanone Kaffeesatz', 'Underdog']) {
    assert.ok(notices.includes('Font family: ' + name), name + ' is missing a copyright notice');
  }
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
});
