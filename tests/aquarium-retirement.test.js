import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('historical migrations no longer create or interpret Aquarium state', async () => {
  const [overlays, screenSettings, environment] = await Promise.all([
    readFile(new URL('../src/db/migrations/animation-overlays.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/db/migrations/screen-animation-settings.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/db/migrations/environment-layer.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(overlays, /aquarium_json/);
  assert.doesNotMatch(screenSettings, /aquarium_json/);
  assert.doesNotMatch(environment, /contracts\/environment|environmentFromLegacyAquarium|fish_count|bubble_density/);
  assert.match(environment, /DROP COLUMN aquarium_json/);
});
