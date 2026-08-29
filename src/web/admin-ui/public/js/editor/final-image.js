import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableSvg } from './renderer.js';
import { parseResolution } from './settings.js';

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Не удалось сформировать JPEG.')),
    'image/jpeg',
    0.92
  ));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось загрузить изображение для рендера.'));
    image.src = url;
  });
}

function drawImageCover(ctx, image, width, height) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function loadSvgImage(svgMarkup) {
  const url = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    return await loadImage(url);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function renderFinalJpeg(editorState, { screen, products, packaging }) {
  const resolution = parseResolution(screen?.resolution);
  if (!resolution) throw new Error('Укажите разрешение монитора в формате 1920×1080.');

  const model = buildRenderModel(editorState, resolution);
  const lines = buildDisplayLines(model, { products, packaging, fallbackTitle: 'Новый раздел' });
  const layout = buildRenderLayout(model, lines);
  if (!layout.vertical.fits) {
    throw new Error(`Даже при минимальном масштабе меню не помещается в ${model.viewport.width}×${model.viewport.height}. Уменьшите количество строк.`);
  }

  const canvas = document.createElement('canvas');
  canvas.width = model.viewport.width;
  canvas.height = model.viewport.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Браузер не поддерживает Canvas 2D.');

  ctx.fillStyle = layout.palette.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (model.settings.background_image_url) {
    const background = await loadImage(model.settings.background_image_url);
    drawImageCover(ctx, background, canvas.width, canvas.height);
  }

  const overlay = await loadSvgImage(buildTableSvg(model, lines, layout));
  ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
  return canvasBlob(canvas);
}
