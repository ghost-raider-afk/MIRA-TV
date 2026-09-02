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

const TYPOGRAPHY_ELEMENT_TYPES = new Set(['text', 'table', 'weather', 'clock']);

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

function tableColumnWidth(column, totalWeight) {
  return `${((Number(column.weight) || 1) / totalWeight) * 100}%`;
}

function renderCatalogTable(node, element, context) {
  const config = normaliseTableConfig(element.table || {});
  const appearance = config.appearance;
  node.dataset.tablePreset = appearance.preset;
  node.dataset.tableDensity = appearance.density;
  node.style.setProperty('--scene-table-accent', appearance.accent_color);

  const status = context.catalogStatus || 'idle';
  if (status === 'loading' || status === 'idle') {
    appendText(node, 'div', 'Загрузка каталога…', 'scene-table-state');
    return;
  }
  if (status === 'error') {
    appendText(node, 'div', 'Каталог временно недоступен', 'scene-table-state scene-table-state-error');
    return;
  }

  const catalogItems = context.catalogItems || context.catalogProducts || [];
  const columns = catalogTableColumns(config, catalogItems);
  const rows = buildCatalogTableRows(catalogItems, config);
  if (!rows.length) {
    appendText(node, 'div', 'В каталоге нет подходящих активных позиций', 'scene-table-state');
    return;
  }

  const table = document.createElement('table');
  table.className = 'scene-catalog-table';
  table.dataset.preset = appearance.preset;
  table.dataset.density = appearance.density;
  table.dataset.headerStyle = appearance.header_style;
  table.dataset.priceStyle = appearance.price_style;
  table.dataset.priceLayout = config.price_layout;
  table.dataset.rowDividers = String(appearance.row_dividers);
  table.dataset.zebra = String(appearance.zebra);
  table.style.setProperty('--scene-table-accent', appearance.accent_color);

  if (appearance.show_title) {
    const caption = document.createElement('caption');
    caption.className = 'scene-table-title';
    caption.textContent = element.content || 'Меню';
    table.append(caption);
  }

  const totalWeight = Math.max(1, columns.reduce((sum, column) => sum + (Number(column.weight) || 1), 0));
  const colgroup = document.createElement('colgroup');
  for (const column of columns) {
    const col = document.createElement('col');
    col.style.width = tableColumnWidth(column, totalWeight);
    colgroup.append(col);
  }
  table.append(colgroup);

  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const column of columns) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = column.label;
    if (column.kind === 'price') cell.className = 'scene-catalog-price';
    headerRow.append(cell);
  }
  head.append(headerRow);
  table.append(head);

  const body = document.createElement('tbody');
  for (const row of rows) {
    const rowNode = document.createElement('tr');
    for (const column of columns) {
      const cell = document.createElement('td');
      const value = String(row.values[column.key] || '—');
      cell.dataset.column = column.key;
      if (column.kind === 'price') cell.classList.add('scene-catalog-price');
      if (column.key === 'product') {
        const [name, ...metadataParts] = value.split('\n');
        const line = document.createElement('span');
        line.className = 'scene-catalog-product-line';
        appendText(line, 'span', name, 'scene-catalog-product-name');
        appendText(line, 'span', '', 'scene-catalog-product-leader').setAttribute('aria-hidden', 'true');
        cell.append(line);
        const metadata = metadataParts.join(' ').trim();
        if (metadata) appendText(cell, 'span', metadata, 'scene-catalog-product-meta');
      } else {
        appendText(cell, 'span', value, 'scene-catalog-cell-content');
      }
      rowNode.append(cell);
    }
    body.append(rowNode);
  }
  table.append(body);
  node.append(table);
}

function clockTime(now, withSeconds = false) {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {})
  }).format(now);
}

function clockDate(now, variant) {
  if (variant === 'minimal' || variant === 'analog') return '';
  if (variant === 'date') {
    return new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(now);
  }
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
}

function setAnalogHands(node, now) {
  const seconds = now.getSeconds();
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;
  const hour = node.querySelector('.scene-clock-hand-hour');
  const minute = node.querySelector('.scene-clock-hand-minute');
  const second = node.querySelector('.scene-clock-hand-second');
  if (hour) hour.style.transform = `translateX(-50%) rotate(${hours * 30}deg)`;
  if (minute) minute.style.transform = `translateX(-50%) rotate(${minutes * 6}deg)`;
  if (second) second.style.transform = `translateX(-50%) rotate(${seconds * 6}deg)`;
}

function renderAnalogClock(node, now) {
  const face = document.createElement('span');
  face.className = 'scene-analog-clock';
  for (const className of ['hour', 'minute', 'second']) {
    const hand = document.createElement('span');
    hand.className = `scene-clock-hand scene-clock-hand-${className}`;
    face.append(hand);
  }
  const pin = document.createElement('span');
  pin.className = 'scene-clock-pin';
  face.append(pin);
  node.append(face);
  setAnalogHands(node, now);
}

function renderClock(node, element, now) {
  const variant = element.variant || 'digital';
  node.dataset.variant = variant;
  if (variant === 'analog') {
    renderAnalogClock(node, now);
    return;
  }
  appendText(node, 'small', clockDate(now, variant), 'scene-clock-kicker');
  appendText(node, 'span', clockTime(now, variant === 'seconds'), 'scene-clock-value');
  if (variant === 'seconds') appendText(node, 'small', 'точное время', 'scene-clock-date');
}

function temperatureText(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—°';
  const rounded = Math.round(number);
  return `${rounded > 0 ? '+' : ''}${rounded}°`;
}

function weatherLocation(element) {
  return String(element?.weather?.location || '').trim();
}

function weatherData(context, element) {
  const source = context.weatherByElement && typeof context.weatherByElement === 'object'
    ? context.weatherByElement[element.id]
    : null;
  return source && typeof source === 'object' ? source : null;
}

function forecastSummary(data) {
  const today = data?.daily?.[0];
  const tomorrow = data?.daily?.[1];
  const parts = [];
  if (today) parts.push(`Сегодня ${temperatureText(today.temperature_max_c)}`);
  if (tomorrow) parts.push(`Завтра ${temperatureText(tomorrow.temperature_max_c)}`);
  return parts.join(' · ');
}

function weatherRange(data) {
  const today = data?.daily?.[0];
  if (!today) return '';
  return `Макс. ${temperatureText(today.temperature_max_c)} · Мин. ${temperatureText(today.temperature_min_c)}`;
}

function updateWeatherNode(node, element, context = {}) {
  const locationNode = node.querySelector('.scene-weather-location');
  const icon = node.querySelector('.scene-weather-icon');
  const temperature = node.querySelector('.scene-weather-temp');
  const detail = node.querySelector('.scene-weather-detail');
  const range = node.querySelector('.scene-weather-range');
  const forecast = node.querySelector('.scene-weather-forecast');
  if (!locationNode || !icon || !temperature || !detail || !range || !forecast) return;

  const location = weatherLocation(element);
  const data = weatherData(context, element);
  const variant = element.variant || 'compact';
  node.dataset.variant = variant;

  if (!location) {
    locationNode.textContent = 'Погода';
    icon.textContent = '·';
    temperature.textContent = '—°';
    detail.textContent = 'Укажите город';
    range.textContent = '';
    forecast.textContent = '';
    return;
  }
  if (!data) {
    locationNode.textContent = location;
    icon.textContent = '…';
    temperature.textContent = '—°';
    detail.textContent = 'Загрузка…';
    range.textContent = '';
    forecast.textContent = '';
    return;
  }

  locationNode.textContent = data.location || location;
  icon.textContent = variant === 'minimal' ? '' : (data.current?.icon || '•');
  temperature.textContent = temperatureText(data.current?.temperature_c);
  detail.textContent = data.current?.label || 'Нет данных';
  range.textContent = weatherRange(data);
  forecast.textContent = variant === 'forecast' ? forecastSummary(data) : '';
  if (data.stale) detail.textContent += ' · последние данные';
}

function renderWeather(node, element, context) {
  node.dataset.variant = element.variant || 'compact';
  appendText(node, 'small', '', 'scene-weather-location');
  appendText(node, 'span', '', 'scene-weather-icon');
  appendText(node, 'span', '', 'scene-weather-temp');
  appendText(node, 'small', '', 'scene-weather-detail');
  appendText(node, 'small', '', 'scene-weather-range');
  appendText(node, 'small', '', 'scene-weather-forecast');
  updateWeatherNode(node, element, context);
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
    renderWeather(node, element, resolvedContext);
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

function horizontalFlex(value) {
  if (value === 'left') return 'flex-start';
  if (value === 'right') return 'flex-end';
  return 'center';
}

function verticalFlex(value) {
  if (value === 'top') return 'flex-start';
  if (value === 'bottom') return 'flex-end';
  return 'center';
}

function gridAxis(value, startValue, endValue) {
  if (value === startValue) return 'start';
  if (value === endValue) return 'end';
  return 'center';
}

function applyTypographyPresentation(node, element, style, scale) {
  if (!TYPOGRAPHY_ELEMENT_TYPES.has(element.type)) {
    node.style.textAlign = 'center';
    node.style.justifyContent = '';
    node.style.alignItems = '';
    node.style.justifyItems = '';
    node.style.alignContent = '';
    node.style.lineHeight = '';
    node.style.letterSpacing = '';
    return;
  }

  node.style.textAlign = style.text_align || 'center';
  node.style.lineHeight = String(Number(style.line_height) || 1.06);
  node.style.letterSpacing = `${(Number(style.letter_spacing) || 0) * scale}px`;

  if (element.type === 'text') {
    node.style.justifyContent = horizontalFlex(style.text_align);
    node.style.alignItems = verticalFlex(style.vertical_align);
    node.style.justifyItems = '';
    node.style.alignContent = '';
    return;
  }

  node.style.justifyContent = element.type === 'table' ? 'stretch' : '';
  node.style.alignItems = '';
  node.style.justifyItems = gridAxis(style.text_align, 'left', 'right');
  node.style.alignContent = gridAxis(style.vertical_align, 'top', 'bottom');
}

function applyMediaPresentation(node, element) {
  const media = node.querySelector('.scene-media-content');
  if (!media) return;
  const fit = ['cover', 'contain', 'fill'].includes(element.media?.fit)
    ? element.media.fit
    : (element.type === 'logo' ? 'contain' : 'cover');
  const position = ['center', 'top', 'bottom', 'left', 'right'].includes(element.media?.position)
    ? element.media.position
    : 'center';
  media.style.objectFit = fit;
  media.style.objectPosition = position;
}

function isTransparentBackground(value) {
  return String(value || '').trim().toLowerCase() === 'transparent';
}

export function applySceneElementGeometry(node, element, scene, stageWidth) {
  const renderedWidth = Number(stageWidth) || scene.canvas_width;
  const scale = renderedWidth / scene.canvas_width;
  const style = element.style || {};
  const radius = Math.max(0, Number(style.radius) || 0) * scale;
  const borderWidth = Math.max(0, Number(style.border_width) || 0) * scale;
  const background = style.background || 'transparent';

  node.style.left = `${(element.x / scene.canvas_width) * 100}%`;
  node.style.top = `${(element.y / scene.canvas_height) * 100}%`;
  node.style.width = `${(element.width / scene.canvas_width) * 100}%`;
  node.style.height = `${(element.height / scene.canvas_height) * 100}%`;
  node.style.zIndex = String(element.z_index);
  node.style.opacity = String(element.opacity);
  node.style.color = style.color || '#ffffff';
  node.style.fontSize = `${Math.max(8, (Number(style.font_size) || 40) * scale)}px`;
  node.style.fontWeight = String(Number(style.font_weight) || 400);
  node.style.setProperty('--scene-render-scale', String(scale));
  node.style.setProperty('--scene-element-blur', `${Math.max(0, Number(element.effects?.blur) || 0) * scale}px`);
  node.dataset.transparentBackground = String(isTransparentBackground(background));
  node.dataset.variant = element.variant || 'default';

  if (element.type === 'table') {
    node.style.background = 'transparent';
    node.style.borderRadius = '0px';
    node.style.borderWidth = '0px';
    node.style.borderColor = 'transparent';
    node.style.setProperty('--scene-table-surface', background);
    node.style.setProperty('--scene-table-radius', `${radius}px`);
    node.style.setProperty('--scene-table-border-width', `${borderWidth}px`);
    node.style.setProperty('--scene-table-border-color', style.border_color || '#ffffff');
  } else {
    node.style.background = background;
    node.style.borderRadius = `${radius}px`;
    node.style.borderStyle = 'solid';
    node.style.borderWidth = `${borderWidth}px`;
    node.style.borderColor = style.border_color || '#ffffff';
  }

  applyTypographyPresentation(node, element, style, scale);
  applyMediaPresentation(node, element);
  node.classList.toggle('has-shadow', Boolean(element.effects?.shadow));
  node.classList.toggle('has-glow', Boolean(element.effects?.glow));
  node.classList.toggle('has-blur', Number(element.effects?.blur) > 0);
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

export function updateSceneClockElements(layer, slide, now = new Date()) {
  if (!layer || !slide) return;
  const clockById = new Map((slide.elements || []).filter((element) => element.type === 'clock').map((element) => [element.id, element]));
  for (const node of layer.querySelectorAll('.scene-element-clock[data-element-id]')) {
    const element = clockById.get(node.dataset.elementId);
    if (!element) continue;
    const variant = element.variant || 'digital';
    if (variant === 'analog') {
      setAnalogHands(node, now);
      continue;
    }
    const kicker = node.querySelector('.scene-clock-kicker');
    const value = node.querySelector('.scene-clock-value');
    const date = node.querySelector('.scene-clock-date');
    if (kicker) kicker.textContent = clockDate(now, variant);
    if (value) value.textContent = clockTime(now, variant === 'seconds');
    if (date && variant === 'seconds') date.textContent = 'точное время';
  }
}

export function updateSceneWeatherElements(layer, slide, context = {}) {
  if (!layer || !slide) return;
  const weatherById = new Map((slide.elements || []).filter((element) => element.type === 'weather').map((element) => [element.id, element]));
  for (const node of layer.querySelectorAll('.scene-element-weather[data-element-id]')) {
    const element = weatherById.get(node.dataset.elementId);
    if (element) updateWeatherNode(node, element, context);
  }
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
