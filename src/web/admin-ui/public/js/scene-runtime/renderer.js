import {
  buildCatalogTableRows,
  catalogTableColumns,
  normaliseTableConfig
} from '../scenes/catalog-table.js';

export const SCENE_ELEMENT_LABELS = Object.freeze({
  text: 'Текст',
  table: 'Таблица',
  image: 'Изображение',
  logo: 'Логотип',
  video: 'Видео',
  weather: 'Погода',
  clock: 'Часы',
  shape: 'Фигура'
});

function appendText(parent, tagName, text, className = '') {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  node.textContent = String(text ?? '');
  parent.append(node);
  return node;
}

function rendererContext(context = {}) {
  if (context.mediaAssetMap instanceof Map) return context;
  const mediaAssetMap = new Map();
  for (const asset of Array.isArray(context.mediaAssets) ? context.mediaAssets : []) {
    if (asset?.id) mediaAssetMap.set(asset.id, asset);
  }
  return { ...context, mediaAssetMap };
}

function mediaAsset(context, id, kind) {
  if (!id) return null;
  const asset = context.mediaAssetMap?.get(id) || null;
  if (!asset?.url || (kind && asset.kind !== kind)) return null;
  return asset;
}

function gridTemplate(columns) {
  return columns.map((column) => `minmax(0, ${column.weight || 1}fr)`).join(' ');
}

function renderCatalogTable(node, element, context) {
  appendText(node, 'strong', element.content || 'Меню', 'scene-table-title');
  const status = context.catalogStatus || 'idle';
  if (status === 'loading' || status === 'idle') {
    appendText(node, 'div', 'Загрузка каталога…', 'scene-table-state');
    return;
  }
  if (status === 'error') {
    appendText(node, 'div', 'Каталог временно недоступен', 'scene-table-state scene-table-state-error');
    return;
  }

  const config = normaliseTableConfig(element.table || {});
  const columns = catalogTableColumns(config);
  const rows = buildCatalogTableRows(context.catalogProducts || [], config);
  if (!rows.length) {
    appendText(node, 'div', 'В каталоге нет подходящих активных позиций', 'scene-table-state');
    return;
  }

  const table = document.createElement('div');
  table.className = 'scene-catalog-table';
  table.style.setProperty('--scene-table-columns', gridTemplate(columns));
  const header = document.createElement('div');
  header.className = 'scene-catalog-row scene-catalog-head';
  for (const column of columns) appendText(header, 'span', column.label);
  table.append(header);

  for (const row of rows) {
    const rowNode = document.createElement('div');
    rowNode.className = 'scene-catalog-row';
    for (const column of columns) {
      const cell = appendText(rowNode, 'span', row.values[column.key] || '—');
      if (column.kind === 'price') cell.className = 'scene-catalog-price';
    }
    table.append(rowNode);
  }
  node.append(table);
}

function renderClock(node, element, now) {
  appendText(node, 'span', new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(now), 'scene-clock-value');
  const date = element.variant === 'minimal'
    ? ''
    : new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  appendText(node, 'small', date);
}

function renderWeather(node, element) {
  appendText(node, 'span', '☀', 'scene-weather-icon');
  appendText(node, 'span', '+18°', 'scene-weather-temp');
  appendText(node, 'small', element.variant === 'forecast' ? 'Сегодня · +18° · завтра +16°' : 'Ясно');
}

function renderMediaPlaceholder(node, element) {
  appendText(node, 'span', element.type === 'video' ? '▶' : '▧', 'scene-media-symbol');
  appendText(node, 'strong', element.content || SCENE_ELEMENT_LABELS[element.type]);
}

function renderImage(node, element, context) {
  const asset = mediaAsset(context, element.asset_id, 'image');
  if (!asset) return renderMediaPlaceholder(node, element);
  const image = document.createElement('img');
  image.className = `scene-media-content scene-media-${element.type}`;
  image.src = asset.url;
  image.alt = element.content || asset.original_name || SCENE_ELEMENT_LABELS[element.type];
  image.draggable = false;
  node.append(image);
}

function renderVideo(node, element, context) {
  const asset = mediaAsset(context, element.asset_id, 'video');
  if (!asset) return renderMediaPlaceholder(node, element);
  const video = document.createElement('video');
  video.className = 'scene-media-content scene-media-video';
  video.src = asset.url;
  video.muted = true;
  video.loop = true;
  video.autoplay = context.autoplayMedia !== false;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('aria-label', element.content || asset.original_name || 'Видео');
  node.append(video);
  if (video.autoplay) void video.play().catch(() => undefined);
}

export function renderSceneElementContent(node, element, context = {}) {
  const resolvedContext = rendererContext(context);
  node.replaceChildren();
  if (element.type === 'clock') {
    renderClock(node, element, resolvedContext.now instanceof Date ? resolvedContext.now : new Date());
    return;
  }
  if (element.type === 'weather') {
    renderWeather(node, element);
    return;
  }
  if (element.type === 'table') {
    renderCatalogTable(node, element, resolvedContext);
    return;
  }
  if (element.type === 'video') return renderVideo(node, element, resolvedContext);
  if (element.type === 'image' || element.type === 'logo') return renderImage(node, element, resolvedContext);
  if (element.type === 'shape') return;
  node.textContent = element.content || SCENE_ELEMENT_LABELS[element.type] || '';
}

export function applySceneElementGeometry(node, element, scene, stageWidth) {
  const renderedWidth = Number(stageWidth) || scene.canvas_width;
  node.style.left = `${(element.x / scene.canvas_width) * 100}%`;
  node.style.top = `${(element.y / scene.canvas_height) * 100}%`;
  node.style.width = `${(element.width / scene.canvas_width) * 100}%`;
  node.style.height = `${(element.height / scene.canvas_height) * 100}%`;
  node.style.zIndex = String(element.z_index);
  node.style.opacity = String(element.opacity);
  node.style.color = element.style.color;
  node.style.background = element.style.background;
  node.style.borderRadius = `${element.style.radius || 0}px`;
  node.style.fontSize = `${Math.max(12, element.style.font_size * (renderedWidth / scene.canvas_width))}px`;
  node.classList.toggle('has-shadow', Boolean(element.effects?.shadow));
  node.classList.toggle('has-glow', Boolean(element.effects?.glow));
  node.dataset.entrance = element.animation?.entrance || 'none';
  node.dataset.loop = element.animation?.loop || 'none';
  node.dataset.exit = element.animation?.exit || 'none';
}

export function createSceneElementNode(element, scene, context = {}) {
  const resolvedContext = rendererContext(context);
  const node = document.createElement('div');
  node.className = `scene-render-element scene-element-${element.type}`;
  node.dataset.elementId = element.id;
  renderSceneElementContent(node, element, resolvedContext);
  applySceneElementGeometry(node, element, scene, resolvedContext.stageWidth);
  return node;
}

export function createSceneBackgroundNode(slide, context = {}) {
  const resolvedContext = rendererContext(context);
  const type = slide?.background?.type || 'color';
  if (type === 'color') return null;
  const expectedKind = type === 'video' ? 'video' : 'image';
  const asset = mediaAsset(resolvedContext, slide?.background?.asset_id, expectedKind);
  if (!asset) return null;

  const wrapper = document.createElement('div');
  wrapper.className = `scene-render-background scene-render-background-${type}`;
  wrapper.setAttribute('aria-hidden', 'true');
  if (type === 'image') {
    const image = document.createElement('img');
    image.src = asset.url;
    image.alt = '';
    image.draggable = false;
    wrapper.append(image);
  } else {
    const video = document.createElement('video');
    video.src = asset.url;
    video.muted = true;
    video.loop = true;
    video.autoplay = resolvedContext.autoplayMedia !== false;
    video.playsInline = true;
    video.preload = 'auto';
    wrapper.append(video);
    if (video.autoplay) void video.play().catch(() => undefined);
  }
  return wrapper;
}

export function applySceneStage(stage, scene, slide, { constrainAspect = true } = {}) {
  stage.style.aspectRatio = constrainAspect ? `${scene.canvas_width} / ${scene.canvas_height}` : '';
  stage.style.background = slide?.background?.color || '#10141c';
}

export function renderSceneLayer(layer, { scene, slide, context = {}, decorate = null } = {}) {
  if (!layer || !scene || !slide) return [];
  const stage = layer.parentElement;
  const stageWidth = context.stageWidth || stage?.clientWidth || scene.canvas_width;
  const resolvedContext = rendererContext({ ...context, stageWidth });
  const nodes = [];
  const fragment = document.createDocumentFragment();
  const background = createSceneBackgroundNode(slide, resolvedContext);
  if (background) fragment.append(background);
  for (const element of [...slide.elements].sort((a, b) => a.z_index - b.z_index)) {
    const node = createSceneElementNode(element, scene, resolvedContext);
    if (typeof decorate === 'function') decorate(node, element);
    fragment.append(node);
    nodes.push(node);
  }
  layer.replaceChildren(fragment);
  return nodes;
}
