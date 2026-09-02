const TYPE_LABELS = Object.freeze({
  text: 'Текст',
  table: 'Таблица',
  image: 'Изображение',
  logo: 'Логотип',
  video: 'Видео',
  weather: 'Погода',
  clock: 'Часы',
  shape: 'Фигура'
});

const TYPE_CLASSES = Object.keys(TYPE_LABELS).map((type) => [`scene-element-${type}`, type]);

function selectedType() {
  const node = document.querySelector('#scene-elements-layer .scene-render-element.is-selected');
  if (!node) return null;
  for (const [className, type] of TYPE_CLASSES) {
    if (node.classList.contains(className)) return type;
  }
  return null;
}

function node(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function group(title, types = '*') {
  const root = node('section', 'scene-ribbon-group');
  root.dataset.ribbonTypes = types;
  const content = node('div', 'scene-ribbon-group-content');
  const label = node('div', 'scene-ribbon-group-title', title);
  root.append(content, label);
  return { root, content };
}

function field(labelText, control) {
  const wrapper = node('label', 'scene-ribbon-field');
  const label = node('span', 'scene-ribbon-field-label', labelText);
  wrapper.append(label, control);
  return wrapper;
}

function selectControl(bind, options, label) {
  const select = node('select', 'scene-ribbon-control');
  select.dataset.ribbonBind = bind;
  select.dataset.ribbonEvent = 'change';
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
  return field(label, input);
}

function colorControl(bind, label) {
  const input = node('input', 'scene-ribbon-control scene-ribbon-color');
  input.type = 'color';
  input.dataset.ribbonBind = bind;
  input.dataset.ribbonEvent = 'input';
  input.setAttribute('aria-label', label);
  return field(label, input);
}

function rangeControl(bind, label) {
  const input = node('input', 'scene-ribbon-control scene-ribbon-range');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.05';
  input.dataset.ribbonBind = bind;
  input.dataset.ribbonEvent = 'input';
  input.setAttribute('aria-label', label);
  return field(label, input);
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

function createRibbon() {
  const ribbon = node('section', 'scene-format-ribbon');
  ribbon.id = 'scene-format-ribbon';
  ribbon.setAttribute('aria-label', 'Лента форматирования выбранного объекта');

  const head = node('div', 'scene-ribbon-head');
  head.append(
    node('span', 'scene-ribbon-context', 'ФОРМАТ ОБЪЕКТА'),
    node('strong', 'scene-ribbon-selection', 'Объект не выбран')
  );

  const body = node('div', 'scene-ribbon-body');
  const empty = node('div', 'scene-ribbon-empty', 'Выберите объект на сцене — здесь появятся его основные настройки.');
  body.append(empty);

  const size = group('Размер');
  size.content.append(
    numberControl('#element-width', 'Ширина', { min: 20 }),
    numberControl('#element-height', 'Высота', { min: 20 })
  );

  const typography = group('Шрифт и текст', 'text table weather clock');
  typography.content.append(
    numberControl('#element-font-size', 'Размер', { min: 8, max: 400 }),
    selectControl('#element-font-weight', [['300', 'Тонкий'], ['400', 'Обычный'], ['500', 'Средний'], ['600', 'Полужирный'], ['700', 'Жирный'], ['800', 'Очень жирный'], ['900', 'Максимум']], 'Начертание'),
    colorControl('#element-color', 'Цвет'),
    selectControl('#element-text-align', [['left', 'Слева'], ['center', 'Центр'], ['right', 'Справа']], 'По горизонтали'),
    selectControl('#element-vertical-align', [['top', 'Сверху'], ['center', 'Центр'], ['bottom', 'Снизу']], 'По вертикали'),
    numberControl('#element-line-height', 'Интервал строк', { min: 0.5, max: 3, step: '0.05' }),
    numberControl('#element-letter-spacing', 'Интервал букв', { min: -50, max: 100 })
  );

  const surface = group('Заливка и контур');
  surface.content.append(
    selectControl('#element-background-mode', [['transparent', 'Прозрачный'], ['color', 'Цвет']], 'Фон'),
    colorControl('#element-background-color', 'Цвет фона'),
    numberControl('#element-radius', 'Скругление', { min: 0, max: 500 }),
    numberControl('#element-border-width', 'Контур', { min: 0, max: 40 }),
    colorControl('#element-border-color', 'Цвет контура'),
    rangeControl('#element-opacity', 'Прозрачность'),
    toggleControl('#element-shadow', 'Тень'),
    toggleControl('#element-glow', 'Свечение')
  );

  const table = group('Таблица', 'table');
  table.content.append(
    selectControl('#table-preset', [['clean', 'MIRA-TV'], ['glass', 'Современная'], ['solid', 'Сетка'], ['minimal', 'Минимальная']], 'Вид'),
    selectControl('#table-density', [['compact', 'Компактная'], ['comfortable', 'Стандартная'], ['spacious', 'Крупная']], 'Строки'),
    selectControl('#table-header-style', [['subtle', 'Без заливки'], ['accent', 'Акцент'], ['solid', 'Контрастная']], 'Заголовки'),
    selectControl('#table-price-style', [['accent', 'Акцент'], ['bold', 'Жирные'], ['plain', 'Обычные']], 'Цены'),
    colorControl('#table-accent-color', 'Акцент'),
    toggleControl('#table-show-title', 'Название'),
    toggleControl('#table-row-dividers', 'Разделители'),
    toggleControl('#table-zebra', 'Чередование')
  );

  const widget = group('Виджет', 'weather clock');
  widget.content.append(
    selectControl('#element-variant', [], 'Вариант'),
    selectControl('#widget-appearance-preset', [['', 'Текущий'], ['ios-dark', 'Тёмный'], ['ios-light', 'Светлый'], ['ios-blue', 'Синий'], ['clear', 'Без подложки']], 'Готовый вид')
  );

  const media = group('Изображение и видео', 'image logo video');
  media.content.append(
    selectControl('#element-media-fit', [['cover', 'Заполнить'], ['contain', 'Вписать'], ['fill', 'Растянуть']], 'Заполнение'),
    selectControl('#element-media-position', [['center', 'Центр'], ['top', 'Сверху'], ['bottom', 'Снизу'], ['left', 'Слева'], ['right', 'Справа']], 'Позиция')
  );

  const arrange = group('Упорядочить');
  arrange.content.append(
    actionButton('#element-forward', 'На передний'),
    actionButton('#element-backward', 'Назад'),
    actionButton('#element-duplicate', 'Копия', 'Ctrl+D'),
    actionButton('#element-delete', 'Удалить', 'Delete')
  );

  body.append(size.root, typography.root, surface.root, table.root, widget.root, media.root, arrange.root);
  ribbon.append(head, body);
  return ribbon;
}

function syncDynamicSelect(ribbon, bind) {
  const source = document.querySelector(bind);
  const target = ribbon.querySelector(`[data-ribbon-bind="${bind}"]`);
  if (!source || !target || target.tagName !== 'SELECT') return;
  if (bind !== '#element-variant') return;
  target.replaceChildren(...[...source.options].map((option) => new Option(option.textContent, option.value)));
}

function syncControl(target) {
  const source = document.querySelector(target.dataset.ribbonBind);
  if (!source) return;
  target.disabled = source.disabled;
  if (target.type === 'checkbox') target.checked = source.checked;
  else target.value = source.value;
}

function syncRibbon(ribbon) {
  const type = selectedType();
  ribbon.dataset.sceneType = type || '';
  ribbon.classList.toggle('has-selection', Boolean(type));
  ribbon.querySelector('.scene-ribbon-selection').textContent = type ? TYPE_LABELS[type] : 'Объект не выбран';

  for (const groupNode of ribbon.querySelectorAll('.scene-ribbon-group')) {
    const types = groupNode.dataset.ribbonTypes || '*';
    groupNode.classList.toggle('is-hidden', !type || (types !== '*' && !types.split(/\s+/).includes(type)));
  }

  syncDynamicSelect(ribbon, '#element-variant');
  for (const target of ribbon.querySelectorAll('[data-ribbon-bind]')) syncControl(target);

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

  const inspector = document.querySelector('.scene-inspector');
  inspector?.addEventListener('input', () => queueMicrotask(() => syncRibbon(ribbon)));
  inspector?.addEventListener('change', () => queueMicrotask(() => syncRibbon(ribbon)));

  const layer = document.querySelector('#scene-elements-layer');
  if (layer) {
    const observer = new MutationObserver(() => queueMicrotask(() => syncRibbon(ribbon)));
    observer.observe(layer, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }

  document.addEventListener('click', () => queueMicrotask(() => syncRibbon(ribbon)), true);
  document.addEventListener('contextmenu', () => queueMicrotask(() => syncRibbon(ribbon)), true);
  document.addEventListener('keydown', () => queueMicrotask(() => syncRibbon(ribbon)), true);
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
