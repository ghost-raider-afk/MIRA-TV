const TYPE_LABELS = Object.freeze({
  text: 'Текст',
  table: 'Меню',
  image: 'Изображение',
  logo: 'Логотип',
  video: 'Видео',
  weather: 'Погода',
  clock: 'Часы',
  shape: 'Фигура'
});

const TYPE_CLASSES = Object.keys(TYPE_LABELS).map((type) => [`scene-element-${type}`, type]);
const DATA_TYPES = new Set(['table', 'image', 'logo', 'video', 'weather']);
const TEXT_TYPES = 'text table weather clock';
const MEDIA_TYPES = 'image logo video';
const WIDGET_TYPES = 'weather clock';
const MENU_PRESET_OPTIONS = Object.freeze([
  ['clean', 'MIRA-TV'],
  ['glass', 'Современное'],
  ['solid', 'Сетка'],
  ['minimal', 'Минимальное'],
  ['menu-board', 'Menu Board'],
  ['bistro', 'Bistro'],
  ['cafe', 'Café'],
  ['chalkboard', 'Chalkboard']
]);

function node(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function selectedType() {
  const current = document.querySelector('#scene-elements-layer .scene-render-element.is-selected');
  if (!current) return null;
  for (const [className, type] of TYPE_CLASSES) {
    if (current.classList.contains(className)) return type;
  }
  return null;
}

function section(label, types = '*', className = '') {
  const root = node('section', `scene-ribbon-section ${className}`.trim());
  root.dataset.ribbonTypes = types;
  if (label) root.append(node('span', 'scene-ribbon-section-label', label));
  const body = node('div', 'scene-ribbon-section-body');
  root.append(body);
  return { root, body };
}

function field(labelText, control, className = '') {
  const wrapper = node('label', `scene-ribbon-field ${className}`.trim());
  wrapper.append(node('span', 'scene-ribbon-field-label', labelText), control);
  return wrapper;
}

function selectControl(bind, options, label, { dynamic = false, className = '' } = {}) {
  const select = node('select', 'scene-ribbon-control');
  select.dataset.ribbonBind = bind;
  select.dataset.ribbonEvent = 'change';
  if (dynamic) select.dataset.ribbonDynamic = '1';
  select.setAttribute('aria-label', label);
  for (const [value, text] of options) select.append(new Option(text, value));
  return field(label, select, className);
}

function numberControl(bind, label, { min = null, max = null, step = '1', className = '' } = {}) {
  const input = node('input', 'scene-ribbon-control scene-ribbon-number');
  input.type = 'number';
  input.dataset.ribbonBind = bind;
  input.dataset.ribbonEvent = 'input';
  input.step = step;
  if (min !== null) input.min = String(min);
  if (max !== null) input.max = String(max);
  input.setAttribute('aria-label', label);
  return field(label, input, className);
}

function colorControl(bind, label, className = '') {
  const input = node('input', 'scene-ribbon-control scene-ribbon-color');
  input.type = 'color';
  input.dataset.ribbonBind = bind;
  input.dataset.ribbonEvent = 'input';
  input.setAttribute('aria-label', label);
  return field(label, input, className);
}

function actionButton(selector, label, { title = '', className = '' } = {}) {
  const button = node('button', `scene-ribbon-action ${className}`.trim(), label);
  button.type = 'button';
  button.dataset.ribbonAction = selector;
  if (title) button.title = title;
  return button;
}

function insertButton(type, label, className = '') {
  const button = node('button', `scene-ribbon-action scene-ribbon-insert-action ${className}`.trim(), label);
  button.type = 'button';
  button.dataset.ribbonInsert = type;
  return button;
}

function inspectorButton(tab, label) {
  const button = node('button', 'scene-ribbon-action scene-ribbon-inspector-action', label);
  button.type = 'button';
  button.dataset.ribbonInspector = tab;
  return button;
}

function createRibbon() {
  const ribbon = node('section', 'scene-format-ribbon');
  ribbon.id = 'scene-format-ribbon';
  ribbon.setAttribute('aria-label', 'Быстрые инструменты сцены');

  const insert = section('', 'always', 'scene-ribbon-static');
  insert.body.append(
    actionButton('#scene-preset-gallery-open', 'Шаблоны', { className: 'scene-ribbon-design-action' }),
    insertButton('table', '+ Меню'),
    insertButton('text', 'Текст', 'scene-ribbon-secondary'),
    insertButton('image', 'Фото', 'scene-ribbon-secondary'),
    actionButton('#scene-tools-toggle', 'Ещё…', { className: 'scene-ribbon-more-action' })
  );

  const identity = section('', '*', 'scene-ribbon-identity');
  identity.body.append(
    node('span', 'scene-ribbon-selection-kicker', 'ВЫБРАНО'),
    node('strong', 'scene-ribbon-selection', 'Объект')
  );

  const geometry = section('Размер');
  geometry.body.append(
    numberControl('#element-width', 'Ш', { min: 20 }),
    numberControl('#element-height', 'В', { min: 20 })
  );

  const text = section('Текст', TEXT_TYPES);
  text.body.append(
    numberControl('#element-font-size', 'pt', { min: 8, max: 400 }),
    selectControl('#element-font-weight', [['300', 'Тонкий'], ['400', 'Обычный'], ['500', 'Средний'], ['600', 'Полужирный'], ['700', 'Жирный'], ['800', 'Очень жирный'], ['900', 'Максимум']], 'Начертание'),
    colorControl('#element-color', 'Цвет'),
    selectControl('#element-text-align', [['left', 'Слева'], ['center', 'Центр'], ['right', 'Справа']], 'Выравнивание', { className: 'scene-ribbon-secondary' })
  );

  const table = section('Меню', 'table');
  table.body.append(
    selectControl('#table-preset', MENU_PRESET_OPTIONS, 'Стиль'),
    selectControl('#table-density', [['compact', 'Компактно'], ['comfortable', 'Стандартно'], ['spacious', 'Крупно']], 'Плотность', { className: 'scene-ribbon-secondary' })
  );

  const media = section('Медиа', MEDIA_TYPES);
  media.body.append(
    selectControl('#element-media-fit', [['cover', 'Заполнить'], ['contain', 'Вписать'], ['fill', 'Растянуть']], 'Масштаб'),
    selectControl('#element-media-position', [['center', 'Центр'], ['top', 'Сверху'], ['bottom', 'Снизу'], ['left', 'Слева'], ['right', 'Справа']], 'Позиция', { className: 'scene-ribbon-secondary' })
  );

  const widget = section('Виджет', WIDGET_TYPES);
  widget.body.append(
    selectControl('#element-variant', [], 'Вариант', { dynamic: true })
  );

  const surface = section('Объект');
  surface.body.append(
    selectControl('#element-background-mode', [['transparent', 'Без фона'], ['color', 'Заливка']], 'Фон', { className: 'scene-ribbon-secondary' }),
    colorControl('#element-background-color', 'Заливка', 'scene-ribbon-secondary')
  );

  const arrange = section('', '*', 'scene-ribbon-arrange');
  arrange.body.append(
    actionButton('#element-backward', '↓', { title: 'На слой назад' }),
    actionButton('#element-forward', '↑', { title: 'На слой вперёд' }),
    actionButton('#element-duplicate', '⧉', { title: 'Дублировать · Ctrl+D' }),
    actionButton('#element-delete', '×', { title: 'Удалить · Delete', className: 'scene-ribbon-delete-action' })
  );

  const inspect = section('', '*', 'scene-ribbon-inspect');
  inspect.body.append(
    inspectorButton('object', 'Свойства'),
    inspectorButton('format', 'Оформление'),
    inspectorButton('data', 'Данные'),
    inspectorButton('animation', 'Анимация')
  );

  const empty = node('div', 'scene-ribbon-empty', 'Выберите объект на слайде для быстрых настроек');

  ribbon.append(insert.root, identity.root, geometry.root, text.root, table.root, media.root, widget.root, surface.root, arrange.root, inspect.root, empty);
  return ribbon;
}

function syncDynamicSelect(target, source) {
  if (target.tagName !== 'SELECT' || target.dataset.ribbonDynamic !== '1') return;
  target.replaceChildren(...[...source.options].map((option) => new Option(option.textContent, option.value)));
}

function syncControl(target) {
  const source = document.querySelector(target.dataset.ribbonBind);
  if (!source) {
    target.disabled = true;
    return;
  }
  syncDynamicSelect(target, source);
  target.disabled = source.disabled;
  if (target.type === 'checkbox') target.checked = source.checked;
  else target.value = source.value;
}

function sectionVisible(sectionNode, type) {
  const types = sectionNode.dataset.ribbonTypes || '*';
  if (types === 'always') return true;
  if (!type) return false;
  return types === '*' || types.split(/\s+/).includes(type);
}

function syncRibbon(ribbon) {
  const type = selectedType();
  ribbon.dataset.sceneType = type || '';
  ribbon.classList.toggle('has-selection', Boolean(type));
  const selection = ribbon.querySelector('.scene-ribbon-selection');
  if (selection) selection.textContent = type ? TYPE_LABELS[type] : 'Слайд';

  for (const sectionNode of ribbon.querySelectorAll('.scene-ribbon-section')) {
    sectionNode.classList.toggle('is-hidden', !sectionVisible(sectionNode, type));
  }
  ribbon.querySelector('.scene-ribbon-empty')?.classList.toggle('is-hidden', Boolean(type));

  for (const target of ribbon.querySelectorAll('[data-ribbon-bind]')) syncControl(target);
  for (const button of ribbon.querySelectorAll('[data-ribbon-action]')) {
    const source = document.querySelector(button.dataset.ribbonAction);
    button.disabled = !source || source.disabled;
  }

  const dataButton = ribbon.querySelector('[data-ribbon-inspector="data"]');
  if (dataButton) dataButton.classList.toggle('is-hidden', !type || !DATA_TYPES.has(type));

  const backgroundMode = ribbon.querySelector('[data-ribbon-bind="#element-background-mode"]');
  const backgroundColor = ribbon.querySelector('[data-ribbon-bind="#element-background-color"]')?.closest('.scene-ribbon-field');
  if (backgroundMode && backgroundColor) backgroundColor.classList.toggle('is-hidden', backgroundMode.value === 'transparent');
}

function bindRibbon(ribbon) {
  for (const target of ribbon.querySelectorAll('[data-ribbon-bind]')) {
    const eventName = target.dataset.ribbonEvent || 'change';
    target.addEventListener(eventName, () => {
      const source = document.querySelector(target.dataset.ribbonBind);
      if (!source) return;
      if (target.type === 'checkbox') source.checked = target.checked;
      else source.value = target.value;
      source.dispatchEvent(new Event(eventName, { bubbles: true }));
      queueMicrotask(() => syncRibbon(ribbon));
    });
  }

  for (const button of ribbon.querySelectorAll('[data-ribbon-action]')) {
    button.addEventListener('click', () => document.querySelector(button.dataset.ribbonAction)?.click());
  }
  for (const button of ribbon.querySelectorAll('[data-ribbon-insert]')) {
    button.addEventListener('click', () => document.querySelector(`[data-add-element="${button.dataset.ribbonInsert}"]`)?.click());
  }
  for (const button of ribbon.querySelectorAll('[data-ribbon-inspector]')) {
    button.addEventListener('click', () => document.querySelector(`[data-inspector-tab="${button.dataset.ribbonInspector}"]`)?.click());
  }

  const observer = new MutationObserver(() => queueMicrotask(() => syncRibbon(ribbon)));
  const layer = document.querySelector('#scene-elements-layer');
  const inspector = document.querySelector('.scene-inspector');
  if (layer) observer.observe(layer, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  if (inspector) observer.observe(inspector, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'disabled'] });

  inspector?.addEventListener('input', () => queueMicrotask(() => syncRibbon(ribbon)));
  inspector?.addEventListener('change', () => queueMicrotask(() => syncRibbon(ribbon)));
  document.addEventListener('click', () => queueMicrotask(() => syncRibbon(ribbon)), true);
}

export function initialiseSceneRibbon() {
  if (document.querySelector('#scene-format-ribbon')) return;
  const toolbar = document.querySelector('.scene-editor-toolbar');
  if (!toolbar) return;
  const ribbon = createRibbon();
  toolbar.after(ribbon);
  bindRibbon(ribbon);
  syncRibbon(ribbon);
}
