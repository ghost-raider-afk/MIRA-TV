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
const MENU_PRESET_OPTIONS = Object.freeze([
  ['clean', 'MIRA-TV'],
  ['glass', 'Современная'],
  ['solid', 'Сетка'],
  ['minimal', 'Минимальная'],
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

function group(title, types = '*', className = '') {
  const root = node('section', `scene-ribbon-group ${className}`.trim());
  root.dataset.ribbonTypes = types;
  const content = node('div', 'scene-ribbon-group-content');
  const label = node('div', 'scene-ribbon-group-label', title);
  root.append(content, label);
  return { root, content };
}

function panel(id) {
  const root = node('div', 'scene-ribbon-panel');
  root.dataset.ribbonPanel = id;
  return root;
}

function field(labelText, control, className = '') {
  const wrapper = node('label', `scene-ribbon-field ${className}`.trim());
  wrapper.append(node('span', 'scene-ribbon-field-label', labelText), control);
  return wrapper;
}

function selectControl(bind, options, label, { dynamic = false } = {}) {
  const select = node('select', 'scene-ribbon-control');
  select.dataset.ribbonBind = bind;
  select.dataset.ribbonEvent = 'change';
  if (dynamic) select.dataset.ribbonDynamic = '1';
  select.setAttribute('aria-label', label);
  for (const [value, text] of options) select.append(new Option(text, value));
  return field(label, select);
}

function numberControl(bind, label, { min = null, max = null, step = '1' } = {}) {
  const input = node('input', 'scene-ribbon-control scene-ribbon-number');
  input.type = 'number';
  input.dataset.ribbonBind = bind;
  input.dataset.ribbonEvent = 'input';
  input.step = step;
  if (min !== null) input.min = String(min);
  if (max !== null) input.max = String(max);
  input.setAttribute('aria-label', label);
  return field(label, input, 'scene-ribbon-field-number');
}

function textControl(bind, label) {
  const input = node('input', 'scene-ribbon-control scene-ribbon-text');
  input.type = 'text';
  input.dataset.ribbonBind = bind;
  input.dataset.ribbonEvent = 'input';
  input.setAttribute('aria-label', label);
  return field(label, input, 'scene-ribbon-field-text');
}

function colorControl(bind, label) {
  const input = node('input', 'scene-ribbon-control scene-ribbon-color');
  input.type = 'color';
  input.dataset.ribbonBind = bind;
  input.dataset.ribbonEvent = 'input';
  input.setAttribute('aria-label', label);
  return field(label, input, 'scene-ribbon-field-color');
}

function rangeControl(bind, label, { min = 0, max = 1, step = 0.05 } = {}) {
  const input = node('input', 'scene-ribbon-control scene-ribbon-range');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.dataset.ribbonBind = bind;
  input.dataset.ribbonEvent = 'input';
  input.setAttribute('aria-label', label);
  return field(label, input, 'scene-ribbon-field-range');
}

function toggleControl(bind, label) {
  const wrapper = node('label', 'scene-ribbon-toggle');
  const input = node('input');
  input.type = 'checkbox';
  input.dataset.ribbonBind = bind;
  input.dataset.ribbonEvent = 'change';
  wrapper.append(input, node('span', '', label));
  return wrapper;
}

function actionButton(selector, label, title = '') {
  const button = node('button', 'scene-ribbon-action', label);
  button.type = 'button';
  button.dataset.ribbonAction = selector;
  if (title) button.title = title;
  return button;
}

function insertButton(type, label) {
  const button = node('button', 'scene-ribbon-insert-action', label);
  button.type = 'button';
  button.dataset.ribbonInsert = type;
  return button;
}

function createTabs() {
  const tabs = node('nav', 'scene-ribbon-tabs');
  tabs.setAttribute('aria-label', 'Разделы панели инструментов');
  const definitions = [
    ['home', 'Главная'],
    ['insert', 'Вставка'],
    ['format', 'Оформление'],
    ['data', 'Данные'],
    ['animation', 'Анимация']
  ];
  for (const [id, label] of definitions) {
    const button = node('button', 'scene-ribbon-tab', label);
    button.type = 'button';
    button.dataset.ribbonTab = id;
    button.setAttribute('role', 'tab');
    tabs.append(button);
  }
  return tabs;
}

function createHomePanel() {
  const root = panel('home');
  const context = group('Выбрано', '*', 'scene-ribbon-context-group');
  context.content.append(
    node('strong', 'scene-ribbon-selection', 'Объект'),
    textControl('#element-content', 'Текст')
  );

  const position = group('Положение и размер');
  position.content.append(
    numberControl('#element-x', 'X', { min: 0 }),
    numberControl('#element-y', 'Y', { min: 0 }),
    numberControl('#element-width', 'Ш', { min: 20 }),
    numberControl('#element-height', 'В', { min: 20 })
  );

  const arrange = group('Упорядочить');
  arrange.content.append(
    actionButton('#element-forward', 'Вперёд'),
    actionButton('#element-backward', 'Назад'),
    actionButton('#element-duplicate', 'Копия', 'Ctrl+D'),
    actionButton('#element-delete', 'Удалить', 'Delete')
  );

  root.append(context.root, position.root, arrange.root);
  return root;
}

function createInsertPanel() {
  const root = panel('insert');
  const design = group('Дизайн', 'always');
  design.content.append(
    actionButton('#scene-preset-gallery-open', '✦ Шаблоны'),
    actionButton('#scene-tools-toggle', 'Фон слайда')
  );

  const elements = group('Элементы', 'always', 'scene-ribbon-insert-group');
  elements.content.append(
    insertButton('table', 'Меню'),
    insertButton('text', 'Текст'),
    insertButton('image', 'Фото'),
    insertButton('logo', 'Логотип'),
    insertButton('video', 'Видео'),
    insertButton('weather', 'Погода'),
    insertButton('clock', 'Часы'),
    insertButton('shape', 'Фигура')
  );

  root.append(design.root, elements.root);
  return root;
}

function createFormatPanel() {
  const root = panel('format');

  const typography = group('Шрифт и текст', 'text table weather clock');
  typography.content.append(
    numberControl('#element-font-size', 'Размер', { min: 8, max: 400 }),
    selectControl('#element-font-weight', [['300', 'Тонкий'], ['400', 'Обычный'], ['500', 'Средний'], ['600', 'Полужирный'], ['700', 'Жирный'], ['800', 'Очень жирный'], ['900', 'Максимум']], 'Начертание'),
    colorControl('#element-color', 'Цвет'),
    selectControl('#element-text-align', [['left', 'Слева'], ['center', 'Центр'], ['right', 'Справа']], 'Горизонтально'),
    selectControl('#element-vertical-align', [['top', 'Сверху'], ['center', 'Центр'], ['bottom', 'Снизу']], 'Вертикально'),
    numberControl('#element-line-height', 'Строки', { min: 0.5, max: 3, step: '0.05' }),
    numberControl('#element-letter-spacing', 'Буквы', { min: -50, max: 100 })
  );

  const surface = group('Заливка и контур');
  surface.content.append(
    selectControl('#element-background-mode', [['transparent', 'Нет'], ['color', 'Цвет']], 'Фон'),
    colorControl('#element-background-color', 'Фон'),
    numberControl('#element-radius', 'Радиус', { min: 0, max: 500 }),
    numberControl('#element-border-width', 'Контур', { min: 0, max: 40 }),
    colorControl('#element-border-color', 'Контур'),
    rangeControl('#element-opacity', 'Прозр.', { min: 0, max: 1, step: 0.05 })
  );

  const effects = group('Эффекты');
  effects.content.append(
    toggleControl('#element-shadow', 'Тень'),
    toggleControl('#element-glow', 'Свечение'),
    rangeControl('#element-blur', 'Размытие', { min: 0, max: 40, step: 1 })
  );

  const table = group('Меню', 'table');
  table.content.append(
    selectControl('#table-preset', MENU_PRESET_OPTIONS, 'Стиль'),
    selectControl('#table-density', [['compact', 'Компактно'], ['comfortable', 'Стандартно'], ['spacious', 'Крупно']], 'Строки'),
    selectControl('#table-header-style', [['subtle', 'Лёгкий'], ['accent', 'Акцент'], ['solid', 'Контраст']], 'Заголовок'),
    selectControl('#table-price-style', [['accent', 'Акцент'], ['bold', 'Жирный'], ['plain', 'Обычный']], 'Цены'),
    colorControl('#table-accent-color', 'Акцент'),
    toggleControl('#table-show-title', 'Название'),
    toggleControl('#table-row-dividers', 'Линии'),
    toggleControl('#table-zebra', 'Чередование')
  );

  const widget = group('Виджет', 'weather clock');
  widget.content.append(
    selectControl('#element-variant', [], 'Вариант', { dynamic: true }),
    selectControl('#widget-appearance-preset', [['', 'Текущий'], ['ios-dark', 'Тёмный'], ['ios-light', 'Светлый'], ['ios-blue', 'Синий'], ['clear', 'Без фона']], 'Стиль')
  );

  const media = group('Медиа', 'image logo video');
  media.content.append(
    selectControl('#element-media-fit', [['cover', 'Заполнить'], ['contain', 'Вписать'], ['fill', 'Растянуть']], 'Масштаб'),
    selectControl('#element-media-position', [['center', 'Центр'], ['top', 'Сверху'], ['bottom', 'Снизу'], ['left', 'Слева'], ['right', 'Справа']], 'Позиция')
  );

  root.append(typography.root, surface.root, effects.root, table.root, widget.root, media.root);
  return root;
}

function createDataPanel() {
  const root = panel('data');

  const table = group('Состав меню', 'table');
  table.content.append(
    actionButton('[data-menu-compose]', 'Настроить состав'),
    selectControl('#table-class-code', [], 'Класс', { dynamic: true }),
    selectControl('#table-price-layout', [['single', 'Одна цена'], ['quantities', 'По объёму']], 'Цены'),
    numberControl('#table-row-limit', 'Строк', { min: 1, max: 50 }),
    toggleControl('#table-active-only', 'Только активные'),
    toggleControl('#table-show-description', 'Описание'),
    toggleControl('#table-show-metadata', 'Свойства')
  );

  const media = group('Медиафайл', 'image logo video');
  media.content.append(
    actionButton('#element-media-upload', 'Загрузить'),
    actionButton('#element-media-refresh', 'Обновить')
  );

  const weather = group('Погода', 'weather');
  weather.content.append(
    textControl('#weather-location', 'Город'),
    actionButton('#weather-refresh', 'Обновить')
  );

  root.append(table.root, media.root, weather.root);
  return root;
}

function createAnimationPanel() {
  const root = panel('animation');
  const motion = group('Анимация объекта');
  motion.content.append(
    selectControl('#element-entrance', [['none', 'Нет'], ['fade', 'Fade'], ['slide-up', 'Снизу вверх'], ['scale', 'Масштаб']], 'Появление'),
    selectControl('#element-loop', [['none', 'Нет'], ['pulse', 'Пульсация'], ['float', 'Плавание']], 'Постоянная'),
    selectControl('#element-exit', [['none', 'Нет'], ['fade', 'Fade'], ['scale', 'Масштаб']], 'Исчезновение')
  );
  const details = group('Точно');
  details.content.append(actionButton('[data-inspector-tab="animation"]', 'Открыть справа'));
  root.append(motion.root, details.root);
  return root;
}

function createRibbon() {
  const ribbon = node('section', 'scene-format-ribbon');
  ribbon.id = 'scene-format-ribbon';
  ribbon.setAttribute('aria-label', 'Панель инструментов сцены');
  ribbon.append(
    createTabs(),
    node('div', 'scene-ribbon-panels')
  );
  const panels = ribbon.querySelector('.scene-ribbon-panels');
  panels.append(
    createHomePanel(),
    createInsertPanel(),
    createFormatPanel(),
    createDataPanel(),
    createAnimationPanel()
  );
  return ribbon;
}

function tabAvailable(id, type) {
  if (id === 'insert') return true;
  if (id === 'data') return Boolean(type && DATA_TYPES.has(type));
  return Boolean(type);
}

function inspectorTabForRibbon(id) {
  if (id === 'home') return 'object';
  if (id === 'format') return 'format';
  if (id === 'data') return 'data';
  if (id === 'animation') return 'animation';
  return '';
}

function activateTab(ribbon, id, { syncInspector = true } = {}) {
  const type = selectedType();
  const requested = tabAvailable(id, type) ? id : (type ? 'home' : 'insert');
  ribbon.dataset.activeTab = requested;
  for (const button of ribbon.querySelectorAll('[data-ribbon-tab]')) {
    const active = button.dataset.ribbonTab === requested;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  for (const pane of ribbon.querySelectorAll('[data-ribbon-panel]')) {
    pane.classList.toggle('is-active', pane.dataset.ribbonPanel === requested);
  }
  if (syncInspector) {
    const inspectorTab = inspectorTabForRibbon(requested);
    if (inspectorTab) document.querySelector(`[data-inspector-tab="${inspectorTab}"]`)?.click();
  }
}

function syncDynamicSelect(target, source) {
  if (target.tagName !== 'SELECT' || target.dataset.ribbonDynamic !== '1') return;
  const current = target.value;
  target.replaceChildren(...[...source.options].map((option) => new Option(option.textContent, option.value)));
  target.value = [...target.options].some((option) => option.value === source.value) ? source.value : current;
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

function groupVisible(groupNode, type) {
  const types = groupNode.dataset.ribbonTypes || '*';
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

  for (const button of ribbon.querySelectorAll('[data-ribbon-tab]')) {
    const available = tabAvailable(button.dataset.ribbonTab, type);
    button.disabled = !available;
    button.classList.toggle('is-disabled', !available);
  }

  for (const groupNode of ribbon.querySelectorAll('.scene-ribbon-group')) {
    groupNode.classList.toggle('is-hidden', !groupVisible(groupNode, type));
  }

  for (const target of ribbon.querySelectorAll('[data-ribbon-bind]')) syncControl(target);
  for (const button of ribbon.querySelectorAll('[data-ribbon-action]')) {
    const source = document.querySelector(button.dataset.ribbonAction);
    button.disabled = !source || source.disabled;
  }

  const backgroundMode = ribbon.querySelector('[data-ribbon-bind="#element-background-mode"]');
  const backgroundColor = ribbon.querySelector('[data-ribbon-bind="#element-background-color"]')?.closest('.scene-ribbon-field');
  if (backgroundMode && backgroundColor) backgroundColor.classList.toggle('is-hidden', backgroundMode.value === 'transparent');

  if (!tabAvailable(ribbon.dataset.activeTab || '', type)) activateTab(ribbon, type ? 'home' : 'insert', { syncInspector: false });
}

function bindRibbon(ribbon) {
  for (const button of ribbon.querySelectorAll('[data-ribbon-tab]')) {
    button.addEventListener('click', () => activateTab(ribbon, button.dataset.ribbonTab));
  }

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

  const inspectorTabs = document.querySelector('#inspector-tabs');
  inspectorTabs?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-inspector-tab]');
    if (!button) return;
    const map = { object: 'home', format: 'format', data: 'data', animation: 'animation' };
    const ribbonTab = map[button.dataset.inspectorTab];
    if (ribbonTab && tabAvailable(ribbonTab, selectedType())) activateTab(ribbon, ribbonTab, { syncInspector: false });
  });

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
  activateTab(ribbon, selectedType() ? 'home' : 'insert', { syncInspector: false });
  syncRibbon(ribbon);
}
