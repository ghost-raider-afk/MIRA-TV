import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const docsRoot = new URL('../docs/', import.meta.url);

const PUBLIC_DOCS = [
  'README.md',
  'INSTALLATION.md',
  'CONFIGURATION.md',
  'USAGE.md',
  'ARCHITECTURE.md',
  'SCENES.md',
  'SPEC-KIT.md',
  'CATALOG.md',
  'DISPLAY-MANAGEMENT.md',
  'DATA-MODEL.md',
  'UX-PRINCIPLES.md',
  'SCENE-PROTOTYPE.md',
  'PLAYER.md',
  'ANIMATION.md',
  'PERFORMANCE.md',
  'TROUBLESHOOTING.md',
  'DEPLOYMENT-CHECKLIST.md',
  'BRANDING.md',
  'ROADMAP.md'
];

const USER_FACING_DOCS = [
  'README.md',
  'INSTALLATION.md',
  'CONFIGURATION.md',
  'USAGE.md',
  'PLAYER.md',
  'ANIMATION.md',
  'PERFORMANCE.md',
  'TROUBLESHOOTING.md',
  'DEPLOYMENT-CHECKLIST.md',
  'BRANDING.md',
  'ROADMAP.md'
];

const RETIRED_INTERNAL_DOCS = [
  'ADR-001-MOTION-ENGINE-V3.md',
  'MOTION-ENGINE-V3.md',
  'REALTIME-SYNC.md',
  'RESOURCE-BUDGET.md',
  'TV-PLAYER-OFFLINE-FIRST.md',
  'VPS-ACCEPTANCE.md'
];

const INTERNAL_TERMS = [
  /authoritative state/i,
  /renderer-agnostic/i,
  /scene\s*graph/i,
  /sceneprogram/i,
  /scene\s*composer/i,
  /channel ownership/i,
  /dirty layers?/i,
  /bounded journal/i,
  /resource[- ]budget/i,
  /offline-first/i,
  /invalidation\/control/i,
  /runtime boundary/i,
  /\bO\(N\)\b/
];

async function exists(url) {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

test('public documentation has one explicit approved structure', async () => {
  for (const file of PUBLIC_DOCS) {
    assert.equal(await exists(new URL(file, docsRoot)), true, `missing public documentation page: docs/${file}`);
  }
  for (const file of RETIRED_INTERNAL_DOCS) {
    assert.equal(await exists(new URL(file, docsRoot)), false, `retired internal document returned: docs/${file}`);
  }
});

test('user-facing documentation avoids internal development jargon', async () => {
  const files = [
    new URL('README.md', root),
    new URL('CHANGELOG.md', root),
    ...USER_FACING_DOCS.map((file) => new URL(file, docsRoot))
  ];

  for (const url of files) {
    const source = await readFile(url, 'utf8');
    for (const pattern of INTERNAL_TERMS) {
      assert.doesNotMatch(source, pattern, `${url.pathname} contains internal terminology: ${pattern}`);
    }
  }
});

test('README local documentation links point to existing files', async () => {
  const source = await readFile(new URL('README.md', root), 'utf8');
  const links = [...source.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)].map((match) => match[1]);
  assert.ok(links.length >= 10, 'README should expose the public documentation set');

  for (const relative of links) {
    assert.equal(await exists(new URL(relative, root)), true, `README contains broken documentation link: ${relative}`);
  }
});

test('docs directory contains only approved markdown files', async () => {
  const files = (await readdir(docsRoot)).filter((name) => name.endsWith('.md'));
  assert.deepEqual(files.sort(), PUBLIC_DOCS.slice().sort());
});
