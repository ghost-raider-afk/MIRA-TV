import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableSvg } from './renderer.js';
import { parseResolution } from './settings.js';

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

export function renderPreview(editorState, { screen, products, packaging, target }) {
  if (!target) return null;
  const resolution = parseResolution(screen?.resolution);
  if (!resolution) {
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

  target.style.backgroundColor = palette.background;
  target.style.backgroundImage = model.settings.background_image_url ? `url("${model.settings.background_image_url}")` : '';
  target.style.backgroundSize = 'cover';
  target.style.backgroundPosition = 'center';
  target.style.aspectRatio = `${model.viewport.width} / ${model.viewport.height}`;
  target.dataset.menuFits = layout.vertical.fits ? 'true' : 'false';
  target.dataset.fontScaleEffective = String(layout.vertical.effectivePercent);
  target.dataset.fontKey = layout.typography.key;
  target.classList.toggle('is-overflowing', !layout.vertical.fits);
  target.innerHTML = buildTableSvg(model, lines, layout);
  applyPreviewTypography(target, layout);

  return { model, lines, layout };
}
