import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addScenePresetCampaign,
  applySceneDesignPreset,
  getScenePreset
} from '../src/web/admin-ui/public/js/scenes/scene-presets.js';

function emptyScene() {
  return {
    display_count: 1,
    display_width: 1920,
    display_height: 1080,
    canvas_width: 1920,
    canvas_height: 1080,
    name: 'Новая сцена',
    active_slide_id: 'slide-1',
    slides: [{ id: 'slide-1', name: 'Слайд 1', background: { type: 'color', color: '#000', asset_id: '' }, elements: [] }]
  };
}

test('empty scene receives a complete four-slide sales campaign', () => {
  const preset = getScenePreset('taproom');
  const result = applySceneDesignPreset(emptyScene(), preset);
  assert.equal(result.seeded, true);
  assert.equal(result.addedSlides, 4);
  assert.equal(result.scene.slides.length, 4);
  assert.ok(result.scene.slides[0].elements.some((element) => element.type === 'table'));
  assert.ok(result.scene.slides.some((slide) => slide.elements.some((element) => ['clock', 'weather'].includes(element.type))));
  assert.ok(result.scene.slides.some((slide) => slide.elements.some((element) => element.type === 'shape' && String(element.style?.background).includes('/assets/presets/taproom.svg'))));
  assert.ok(result.scene.slides.every((slide) => slide.elements.some((element) => element.type === 'logo')));
});

test('changing design on an existing scene preserves geometry text and menu selection without adding layers', () => {
  const scene = emptyScene();
  scene.name = 'Рабочее меню';
  scene.slides[0].elements.push({
    id: 'element-user-menu', type: 'table', x: 321, y: 222, width: 990, height: 640, z_index: 12, opacity: 1, content: 'МОЁ МЕНЮ', variant: 'default',
    style: { color: '#fff', font_size: 40, font_weight: 500, text_align: 'left', vertical_align: 'top', line_height: 1, letter_spacing: 0, background: 'transparent', radius: 0, border_width: 0, border_color: '#fff' },
    effects: { shadow: false, glow: false, blur: 0 }, animation: { entrance: 'none', loop: 'none', exit: 'none', duration_ms: 600 },
    data_binding: { source: 'catalog_items' }, table: { selection_mode: 'view', view_id: 7, item_ids: [31, 12, 45], class_code: '', price_layout: 'single', appearance: { preset: 'clean' } }
  });
  const beforeCount = scene.slides[0].elements.length;
  const result = applySceneDesignPreset(scene, 'premium-black').scene;
  const menu = result.slides[0].elements.find((element) => element.id === 'element-user-menu');
  assert.equal(result.slides[0].elements.length, beforeCount);
  assert.equal(menu.x, 321);
  assert.equal(menu.y, 222);
  assert.equal(menu.width, 990);
  assert.equal(menu.height, 640);
  assert.equal(menu.content, 'МОЁ МЕНЮ');
  assert.equal(menu.table.selection_mode, 'view');
  assert.equal(menu.table.view_id, 7);
  assert.deepEqual(menu.table.item_ids, [31, 12, 45]);
  assert.equal(menu.table.appearance.preset, 'bistro');
});

test('campaign can be appended as a grouped set without replacing existing slides', () => {
  const scene = emptyScene();
  scene.slides[0].elements.push({ id: 'custom', type: 'text', x: 10, y: 10, width: 300, height: 80, z_index: 1, opacity: 1, content: 'Мой слайд', style: {}, effects: {}, animation: {} });
  const result = addScenePresetCampaign(scene, 'coffee-house');
  assert.equal(result.addedSlides, 4);
  assert.equal(result.scene.slides.length, 5);
  assert.equal(result.scene.slides[0].elements[0].content, 'Мой слайд');
  assert.match(result.scene.slides[1].name, /Coffee House/);
});
