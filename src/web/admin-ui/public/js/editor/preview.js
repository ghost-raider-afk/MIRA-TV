import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableSvg } from './renderer.js';
import { parseResolution } from './settings.js';

const previewLayers = new WeakMap();

function textNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function applyPreviewTypography(target, layout) {
  const svg = target.querySelector('svg.menu-table-svg');
  if (!(svg instanceof SVGElement)) return;
  svg.style.fontFamily = layout.typography.family;
  svg.style.fontWeight = String(layout.typography.weightFloor || 400);
  svg.dataset.fontKey = layout.typography.key;
}

function destroyPreviewLayers(target) {
  if (!previewLayers.has(target)) return;
  previewLayers.delete(target);
}

function ensurePreviewLayers(target) {
  const existing = previewLayers.get(target);
  if (existing && existing.menuLayer.parentElement === target && existing.editorLayer.parentElement === target) return existing;

  destroyPreviewLayers(target);
  target.replaceChildren();
  target.style.position = 'relative';
  target.style.overflow = 'hidden';

  const menuLayer = document.createElement('div');
  menuLayer.dataset.editorPreviewMenuLayer = '';
  menuLayer.setAttribute('aria-hidden', 'true');
  menuLayer.style.position = 'absolute';
  menuLayer.style.inset = '0';
  menuLayer.style.zIndex = '0';

  const editorLayer = document.createElement('div');
  editorLayer.className = 'editor-preview-controls-layer';
  editorLayer.dataset.editorPreviewControlsLayer = '';
  editorLayer.setAttribute('aria-label', 'Редактирование строк меню');
  editorLayer.style.position = 'absolute';
  editorLayer.style.inset = '0';
  editorLayer.style.zIndex = '40';
  editorLayer.style.pointerEvents = 'none';

  target.append(menuLayer, editorLayer);
  const current = { menuLayer, editorLayer };
  previewLayers.set(target, current);
  return current;
}

export function renderPreview(editorState, { screen, products, packaging, target }) {
  if (!target) return null;
  const resolution = parseResolution(screen?.resolution);
  if (!resolution) {
    destroyPreviewLayers(target);
    target.classList.add('is-invalid-resolution');
    target.classList.remove('is-overflowing');
    target.style.aspectRatio = '16 / 9';
    target.replaceChildren(textNode('p', 'editor-preview-invalid', 'Укажите разрешение в формате 1920×1080'));
    return { invalidResolution: true };
  }

  target.classList.remove('is-invalid-resolution');
  const model = buildRenderModel(editorState, resolution);
  const lines = buildDisplayLines(model, { products, packaging, fallbackTitle: 'Новый раздел' });
  const layout = buildRenderLayout(model, lines);
  const { palette } = layout;
  const { menuLayer, editorLayer } = ensurePreviewLayers(target);

  target.style.backgroundColor = palette.background;
  target.style.backgroundImage = model.settings.background_image_url ? 'url("' + model.settings.background_image_url + '")' : '';
  target.style.backgroundSize = 'cover';
  target.style.backgroundPosition = 'center';
  target.style.aspectRatio = `${model.viewport.width} / ${model.viewport.height}`;
  target.dataset.menuFits = layout.vertical.fits ? 'true' : 'false';
  target.dataset.fontScaleEffective = String(layout.vertical.effectivePercent);
  target.dataset.fontKey = layout.typography.key;
  target.classList.toggle('is-overflowing', !layout.vertical.fits);

  menuLayer.innerHTML = buildTableSvg(model, lines, layout);
  applyPreviewTypography(menuLayer, layout);

  return { model, lines, layout, editorLayer };
}
