import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENE_PRESETS,
  buildScenePresetCampaign,
  buildScenePresetLayout,
  getScenePreset
} from '../src/web/admin-ui/public/js/scenes/scene-presets.js';

test('scene preset library is focused on bars cafes and restaurants with campaign packs', () => {
  assert.ok(SCENE_PRESETS.length >= 8);
  assert.equal(new Set(SCENE_PRESETS.map((preset) => preset.id)).size, SCENE_PRESETS.length);
  for (const preset of SCENE_PRESETS) {
    assert.match(preset.id, /^[a-z0-9-]+$/);
    assert.ok(preset.name.length >= 3);
    assert.ok(['Бар', 'Кафе', 'Ресторан'].includes(preset.category));
    assert.match(preset.palette.background, /^#[0-9a-f]{6}$/i);
    assert.match(preset.palette.text, /^#[0-9a-f]{6}$/i);
    assert.match(preset.palette.accent, /^#[0-9a-f]{6}$/i);
    assert.ok(['clean', 'menu-board', 'bistro', 'cafe', 'chalkboard'].includes(preset.tablePreset));
    assert.equal(preset.campaign.length, 4);
    assert.ok(preset.campaign.some((slide) => slide.kind === 'hero'));
    assert.ok(preset.campaign.some((slide) => slide.kind === 'offer'));
    assert.ok(preset.campaign.some((slide) => slide.kind === 'upsell'));
    assert.equal(getScenePreset(preset.id), preset);
  }
});

test('scene preset layout uses final canvas zones instead of stretching 1920 geometry', () => {
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
      if (displays > 1) {
        const art = layout.elements.find((element) => element.role === 'art');
        assert.ok(art.geometry.width <= 1920, 'hero artwork must stay in its own final-canvas zone');
      }
    }
  }
});

test('every preset builds a four-slide marketing campaign', () => {
  for (const preset of SCENE_PRESETS) {
    const campaign = buildScenePresetCampaign(preset, 2);
    assert.equal(campaign.length, 4);
    assert.equal(campaign[0].slide.kind, 'menu');
    assert.ok(campaign.some((slide) => slide.slide.kind === 'hero'));
    assert.ok(campaign.some((slide) => slide.slide.kind === 'offer'));
    assert.ok(campaign.some((slide) => slide.slide.kind === 'upsell'));
  }
});
