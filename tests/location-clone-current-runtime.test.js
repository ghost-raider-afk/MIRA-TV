import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('location cloning copies the canonical screen draft without retired runtime APIs', async () => {
  const source = await readFile(new URL('../src/api/locations/routes.js', import.meta.url), 'utf8');

  assert.match(source, /scene:\s*structuredClone\(sourceDraft\.scene \|\| \{ version: 1, elements: \[\] \}\)/);
  assert.match(source, /markScreenRenderChanged\(clonedIds, \['screen', 'menu', 'scene'\]/);

  assert.doesNotMatch(source, /getScreenAnimationSettings/);
  assert.doesNotMatch(source, /applyAnimationSettingsToScreens/);
  assert.doesNotMatch(source, /getScreenWeatherSettings/);
  assert.doesNotMatch(source, /applyWeatherSettingsToScreens/);
  assert.doesNotMatch(source, /scene_playlist|\banimation\b|\benvironment\b/);
});
