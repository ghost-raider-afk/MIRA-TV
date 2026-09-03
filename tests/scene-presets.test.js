import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_PRESETS, buildScenePresetLayout, getScenePreset } from '../src/web/admin-ui/public/js/scenes/scene-presets.js';

test('scene preset library has unique production-ready starter designs', () => {
  assert.ok(SCENE_PRESETS.length >= 8);
  assert.equal(new Set(SCENE_PRESETS.map((preset) => preset.id)).size, SCENE_PRESETS.length);
  for (const preset of SCENE_PRESETS) {
    assert.match(preset.id, /^[a-z0-9-]+$/);
    assert.ok(preset.name.length >= 3);
    assert.match(preset.palette.background, /^#[0-9a-f]{6}$/i);
    assert.match(preset.palette.text, /^#[0-9a-f]{6}$/i);
    assert.match(preset.palette.accent, /^#[0-9a-f]{6}$/i);
    assert.ok(['clean', 'menu-board', 'bistro', 'cafe', 'chalkboard'].includes(preset.tablePreset));
    assert.equal(getScenePreset(preset.id), preset);
  }
});

test('scene preset layout stays inside the authoring canvas for 1-6 displays', () => {
  for (const preset of SCENE_PRESETS) {
    for (let displays = 1; displays <= 6; displays += 1) {
      const layout = buildScenePresetLayout(preset, displays);
      assert.equal(layout.canvasWidth, 1920 * displays);
      assert.equal(layout.canvasHeight, 1080);
      assert.ok(layout.elements.some((element) => element.type === 'table'));
      for (const element of layout.elements) {
        assert.ok(element.geometry.x >= 0);
        assert.ok(element.geometry.y >= 0);
        assert.ok(element.geometry.width >= 20);
        assert.ok(element.geometry.height >= 20);
        assert.ok(element.geometry.x + element.geometry.width <= layout.canvasWidth);
        assert.ok(element.geometry.y + element.geometry.height <= layout.canvasHeight);
      }
    }
  }
});
