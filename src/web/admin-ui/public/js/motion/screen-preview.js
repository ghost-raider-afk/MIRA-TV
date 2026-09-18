import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableSvg } from '../editor/renderer.js';
import { parseResolution } from '../editor/settings.js';

function applyTypography(stage, layout) {
  const svg = stage.querySelector('svg.menu-table-svg');
  if (!(svg instanceof SVGElement)) return;
  svg.style.fontFamily = layout.typography.family;
  svg.style.fontWeight = String(layout.typography.weightFloor || 400);
  svg.dataset.fontKey = layout.typography.key;
}

function applyPalette(stage, palette) {
  if (!(stage instanceof HTMLElement)) return;
  stage.style.setProperty('--mira-menu-background', palette.background);
  stage.style.setProperty('--mira-menu-accent', palette.accent);
  stage.style.setProperty('--mira-menu-text', palette.primaryText);
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
    <div class="animation-screen-environment-layer tv-player-environment-layer" data-environment-layer data-player-environment-layer data-scene-layer="environment" aria-label="Фоновая сцена"></div>
    <div class="animation-screen-canvas tv-player-menu-layer" data-scene-menu-layer data-player-menu-layer data-scene-layer="menu">${buildTableSvg(model, lines, layout)}</div>
    <div class="animation-screen-fx-layer tv-player-fx-layer" data-scene-fx-layer data-player-fx-layer data-scene-layer="fx" aria-hidden="true"></div>
    <div class="animation-screen-content-layer tv-player-content-layer" data-scene-content-layer data-player-content-layer data-scene-layer="content" aria-label="Scene Playlist"></div>
    <div class="animation-screen-entity-layer tv-player-entity-layer" data-motion-entity-layer data-scene-layer="entity" aria-label="Объекты сцены"></div>
    <div class="animation-screen-weather-layer tv-player-weather-layer" data-weather-layer data-scene-layer="weather" aria-label="Погода"></div>
    <div class="animation-screen-brand-layer tv-player-brand-layer" data-brand-layer data-scene-layer="brand" aria-label="Название бренда"></div>
    <div class="animation-screen-announcement-layer tv-player-announcement-layer" data-announcement-layer data-scene-layer="announcement" aria-label="Бегущая строка"></div>`;

  backgroundStyle(stage.querySelector('.animation-screen-background'), model, layout.palette);
  applyPalette(stage, layout.palette);
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
