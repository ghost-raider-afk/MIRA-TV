import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableSvg } from '../editor/renderer.js';
import { parseResolution } from '../editor/settings.js';

function applyTypography(stage, layout) {
  const svg = stage.querySelector('svg.menu-table-svg');
  if (!(svg instanceof SVGElement)) return;
  svg.style.fontFamily = layout.typography.family;
  svg.style.fontWeight = String(layout.typography.weightFloor || 400);
  svg.dataset.fontKey = layout.typography.key;
}

function backgroundStyle(layer, model, palette) {
  layer.style.backgroundColor = palette.background;
  layer.style.backgroundImage = model.settings.background_image_url ? `url("${model.settings.background_image_url}")` : '';
  layer.style.backgroundSize = 'cover';
  layer.style.backgroundPosition = 'center';
}

export function renderAnimationScreenPreview(stage, bundle) {
  if (!stage) return null;
  const screen = bundle?.screen;
  const draft = bundle?.draft || { rows: [], settings: {} };
  const resolution = parseResolution(screen?.resolution);

  if (!resolution) {
    stage.classList.add('is-invalid-resolution');
    stage.style.aspectRatio = '16 / 9';
    stage.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'animation-screen-empty',
      textContent: 'У экрана некорректное разрешение.'
    }));
    return { invalidResolution: true };
  }

  stage.classList.remove('is-invalid-resolution');
  const editorState = { rows: draft.rows || [], settings: draft.settings || {} };
  const model = buildRenderModel(editorState, resolution);
  const lines = buildDisplayLines(model, {
    products: bundle?.products || [],
    packaging: bundle?.packaging || [],
    fallbackTitle: 'Новый раздел'
  });
  const layout = buildRenderLayout(model, lines);

  stage.style.aspectRatio = `${model.viewport.width} / ${model.viewport.height}`;
  stage.dataset.screenId = String(screen.id);
  stage.dataset.menuFits = layout.vertical.fits ? 'true' : 'false';
  stage.dataset.fontKey = layout.typography.key;
  stage.innerHTML = `
    <div class="animation-screen-background" data-motion-background></div>
    <div class="animation-screen-environment-layer" data-environment-layer aria-label="Фоновая сцена"></div>
    <div class="animation-screen-canvas" data-scene-menu-layer>${buildTableSvg(model, lines, layout)}</div>
    <div class="animation-screen-fx-layer" data-scene-fx-layer aria-hidden="true"></div>
    <div class="animation-screen-content-layer" data-scene-content-layer aria-label="Scene Playlist"></div>
    <div class="animation-screen-entity-layer" data-motion-entity-layer aria-label="Объекты сцены"></div>
    <div class="animation-screen-brand-layer" data-brand-layer aria-label="Название бренда"></div>
    <div class="animation-screen-announcement-layer" data-announcement-layer aria-label="Бегущая строка"></div>`;

  backgroundStyle(stage.querySelector('.animation-screen-background'), model, layout.palette);
  applyTypography(stage, layout);

  return { model, lines, layout };
}

export function renderAnimationScreenEmpty(stage, message = 'Создайте монитор, чтобы просматривать его анимацию.') {
  if (!stage) return;
  delete stage.dataset.screenId;
  delete stage.dataset.motionSceneVersion;
  stage.style.aspectRatio = '16 / 9';
  stage.replaceChildren(Object.assign(document.createElement('p'), {
    className: 'animation-screen-empty',
    textContent: message
  }));
}
