import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const exists = async (path) => access(path).then(() => true, () => false);

test('MIRA-TV owns the repository, runtime and installer namespace', async () => {
  const [pkg, env, compose, installer] = await Promise.all([
    readFile('package.json', 'utf8'),
    readFile('.env.example', 'utf8'),
    readFile('compose.yaml', 'utf8'),
    readFile('mira-tv.sh', 'utf8')
  ]);
  const meta = JSON.parse(pkg);
  assert.equal(meta.name, 'mira-tv');
  assert.equal(meta.version, '1.0.0');
  assert.equal(meta.miraVersion, '1.0.0');
  assert.match(env, /^MIRA_TV_VERSION=1\.0\.0$/m);
  assert.match(env, /^MIRA_TV_DOMAIN=$/m);
  assert.match(env, /^MIRA_TV_ACME_EMAIL=$/m);
  assert.match(installer, /^PROGRAM_NAME="MIRA-TV"$/m);
  assert.match(installer, /^SCRIPT_VERSION="1\.0\.0"$/m);
  assert.match(installer, /^INSTALL_DIR="\/opt\/MIRA-TV"$/m);
  assert.match(installer, /ghost-raider-afk\/MIRA-TV/);
  assert.match(compose, /^name: mira-tv$/m);
  assert.match(compose, /container_name: mira-tv\b/);
  assert.match(compose, /container_name: mira-tv-db\b/);
  assert.match(compose, /container_name: mira-tv-proxy\b/);
});

test('MIRA-TV public documentation and vector brand assets exist', async () => {
  for (const path of [
    'README.md', 'CONTRIBUTING.md', 'docs/README.md',
    'docs/ARCHITECTURE.md', 'docs/INSTALLATION.md', 'docs/CONFIGURATION.md',
    'docs/USAGE.md', 'docs/PLAYER.md', 'docs/ANIMATION.md', 'docs/PERFORMANCE.md',
    'docs/TROUBLESHOOTING.md', 'docs/DEPLOYMENT-CHECKLIST.md', 'docs/BRANDING.md', 'docs/ROADMAP.md',
    'src/web/admin-ui/public/brand/mira-tv-mark.svg',
    'src/web/admin-ui/public/brand/mira-tv-logo.svg',
    'src/web/admin-ui/public/brand/mira-tv-splash.svg'
  ]) assert.equal(await exists(path), true, path);
});

test('TV resource defaults use a rare fallback poll and bounded local journal', async () => {
  const env = await readFile('.env.example', 'utf8');
  assert.match(env, /^PLAYER_FALLBACK_POLL_SECONDS=60$/m);
  assert.match(env, /^PLAYER_LOG_BATCH_SIZE=100$/m);
  assert.match(env, /^PLAYER_LOG_LOCAL_MAX_ENTRIES=5000$/m);
  assert.match(env, /^PLAYER_LOG_LOCAL_MAX_BYTES=10485760$/m);
});
