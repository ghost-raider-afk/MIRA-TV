import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

test('Scene Editor exposes only static element types plus live weather', async () => {
  const [html, page, elements, routes, assets] = await Promise.all([
    read('src/web/admin-ui/public/scene.html'),
    read('src/web/admin-ui/public/js/pages/scene.js'),
    read('src/web/admin-ui/public/js/editor/elements.js'),
    read('src/api/screens/routes.js'),
    read('src/services/scene-assets-service.js')
  ]);
  for (const label of ['Текстовое поле','Погода','Картинка','Логотип']) assert.ok(elements.includes(label), label);
  assert.doesNotMatch(elements, /\['video', 'Видео'\]|animation_enabled|Анимация/);
  assert.doesNotMatch(html, /scene-editor-animation-layer|scene-editor-promotion-row-layer|scene-editor-publish|Render Agent|data-scene-element-type="video"/);
  assert.match(page, /new PlayerSceneRenderer/);
  assert.match(page, /renderPromotionInspector/);
  assert.doesNotMatch(page, /renderAnimationInspector|renderPromotionRowInspector|bindMotionProfileControls|LOCAL_RENDER_AGENT/);
  assert.doesNotMatch(routes, /render-package|animationSettingsInput|applyAnimationSettingsToScreens/);
  assert.doesNotMatch(assets, /ffprobe|video\/mp4|video\/webm/);
});

test('Scene Editor save goes directly through the live draft path', async () => {
  const page = await read('src/web/admin-ui/public/js/pages/scene.js');
  assert.ok(page.includes('/draft'));
  assert.match(page, /Сцена сохранена и отправлена на TV Player/);
  assert.doesNotMatch(page, /render-package|publishCurrentScene/);
});
