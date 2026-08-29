import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const installerPath = fileURLToPath(new URL('../menu-tv-2.sh', import.meta.url));

test('installer isolates and bounds MIRA-TV build cache', async () => {
  const source = await readFile(installerPath, 'utf8');
  assert.match(source, /^SCRIPT_VERSION="1\.3\.5"$/m);
  assert.match(source, /^BUILD_BUILDER="menu-tv-2-builder"$/m);
  assert.match(source, /^BUILD_CACHE_MAX="1GB"$/m);
  assert.match(source, /^BUILD_CACHE_RESERVED="256MB"$/m);
  assert.match(source, /docker buildx create --name "\$BUILD_BUILDER" --driver docker-container/);
  assert.match(source, /compose build --builder "\$BUILD_BUILDER" "\$APP_SERVICE"/);
  assert.match(source, /compose up -d --no-build --wait/);
  assert.match(source, /docker buildx --builder "\$BUILD_BUILDER" prune --force --max-used-space "\$BUILD_CACHE_MAX" --reserved-space "\$BUILD_CACHE_RESERVED"/);
  assert.match(source, /docker buildx stop "\$BUILD_BUILDER"/);
  assert.match(source, /docker image rm "\$previous_image"/);
  assert.match(source, /docker buildx rm --force "\$BUILD_BUILDER"/);
  assert.doesNotMatch(source, /docker (?:system|volume) prune/);
  assert.doesNotMatch(source, /docker builder prune/);
  assert.doesNotMatch(source, /compose up -d --build --wait/);
});

test('failed update rebuild uses the isolated project builder too', async () => {
  const source = await readFile(installerPath, 'utf8');
  const restore = source.match(/restore_temporary_backup\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(restore, /ensure_project_builder/);
  assert.match(restore, /compose build --builder "\$BUILD_BUILDER" "\$APP_SERVICE"/);
  assert.match(restore, /cleanup_project_build_artifacts "\$failed_image"/);
});
