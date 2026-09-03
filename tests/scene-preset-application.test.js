import test from 'node:test';
import assert from 'node:assert/strict';
import { applySceneDesignPreset, getScenePreset } from '../src/web/admin-ui/public/js/scenes/scene-presets.js';
import { ensurePresetLogoSlots } from '../src/web/admin-ui/public/js/scenes/preset-brand.js';

function emptyScene() {
  return { display_count: 1, display_width: 1920, display_height: 1080, canvas_width: 1920, canvas_height: 1080, name: 'Новая сцена', active_slide_id: 'slide-1', slides: [{ id: 'slide-1', name: 'Слайд 1', background: { type: 'color', color: '#000', asset_id: '' }, elements: [] }] };
}

test('starter preset produces a complete scene with menu, widget, art and real logo slot', () => {
  const preset = getScenePreset('taproom');
  const result = applySceneDesignPreset(emptyScene(), preset);
  ensurePresetLogoSlots(result.scene, preset);
  const elements = result.scene.slides[0].elements;
  assert.equal(result.seeded, true);
  assert.ok(elements.some((element) => element.type === 'table'));
  assert.ok(elements.some((element) => ['clock', 'weather'].includes(element.type)));
  assert.ok(elements.some((element) => element.type === 'shape' && String(element.style?.background).includes('/assets/presets/taproom.svg')));
  assert.ok(elements.some((element) => element.type === 'logo'));
});

test('changing preset preserves user geometry, text and menu selection while replacing managed design layers', () => {
  const scene = emptyScene();
  scene.name = 'Рабочее меню';
  scene.slides[0].elements.push({
    id: 'element-user-menu', type: 'table', x: 321, y: 222, width: 990, height: 640, z_index: 12, opacity: 1, content: 'МОЁ МЕНЮ', variant: 'default',
    style: { color: '#fff', font_size: 40, font_weight: 500, text_align: 'left', vertical_align: 'top', line_height: 1, letter_spacing: 0, background: 'transparent', radius: 0, border_width: 0, border_color: '#fff' },
    effects: { shadow: false, glow: false, blur: 0 }, animation: { entrance: 'none', loop: 'none', exit: 'none', duration_ms: 600 },
    data_binding: { source: 'catalog_items' }, table: { view_id: 7, item_ids: [31, 12, 45], class_code: '', price_layout: 'single', appearance: { preset: 'clean' } }
  });
  const first = applySceneDesignPreset(scene, 'taproom').scene;
  const second = applySceneDesignPreset(first, 'premium-black').scene;
  const menu = second.slides[0].elements.find((element) => element.id === 'element-user-menu');
  assert.equal(menu.x, 321);
  assert.equal(menu.y, 222);
  assert.equal(menu.width, 990);
  assert.equal(menu.height, 640);
  assert.equal(menu.content, 'МОЁ МЕНЮ');
  assert.equal(menu.table.view_id, 7);
  assert.deepEqual(menu.table.item_ids, [31, 12, 45]);
  assert.equal(menu.table.appearance.preset, 'bistro');
  assert.ok(second.slides[0].elements.filter((element) => String(element.id).startsWith('element-preset-managed-')).length > 0);
});
