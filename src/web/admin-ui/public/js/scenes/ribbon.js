const TYPE_LABELS = Object.freeze({
  text: 'Текст', table: 'Меню', image: 'Изображение', logo: 'Логотип', video: 'Видео', weather: 'Погода', clock: 'Часы', shape: 'Фигура'
});
const TYPE_CLASSES = Object.keys(TYPE_LABELS).map((type) => [`scene-element-${type}`, type]);

function node(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function selectedType() {
  const current = document.querySelector('#scene-elements-layer .scene-render-element.is-selected');
  if (!current) return null;
  for (const [className, type] of TYPE_CLASSES) if (current.classList.contains(className)) return type;
  return null;
}

function proxyControl(bind, kind, label, options = []) {
  const wrap = node('label', 'scene-ribbon-quick');
  wrap.dataset.ribbonTypes = kind || '*';
  wrap.append(node('span', '', label));
  const source = document.querySelector(bind);
  let control;
  if (source?.tagName === 'SELECT') {
    control = document.createElement('select');
    for (const option of options.length ? options : [...source.options].map((item) => [item.value, item.textContent])) {
      control.append(new Option(option[1], option[0]));
    }
    control.addEventListener('change', () => {
      source.value = control.value;
      source.dispatchEvent(new Event('change', { bubbles: true }));
    });
  } else if (source?.type === 'color') {
    control = document.createElement('input');
    control.type = 'color';
    control.addEventListener('input', () => {
      source.value = control.value;
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
  } else {
    control = document.createElement('input');
    control.type = 'number';
    control.min = source?.min || '';
    control.max = source?.max || '';
    control.step = source?.step || '1';
    control.addEventListener('input', () => {
      source.value = control.value;
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  control.dataset.ribbonBind = bind;
  wrap.append(control);
  return wrap;
}

function action(label, handler, className = '') {
  const button = node('button', `scene-ribbon-command ${className}`.trim(), label);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}

function insert(type) {
  document.querySelector(`[data-add-element="${type}"]`)?.click();
}

function popoverButton(label, items) {
  const root = node('div', 'scene-ribbon-popover-root');
  const trigger = action(label, () => root.classList.toggle('is-open'));
  trigger.setAttribute('aria-haspopup', 'menu');
  const panel = node('div', 'scene-ribbon-popover');
  panel.setAttribute('role', 'menu');
  for (const [text, callback] of items) panel.append(action(text, () => { root.classList.remove('is-open'); callback(); }, 'scene-ribbon-popover-item'));
  root.append(trigger, panel);
  return root;
}

function inspectorTab(name) {
  document.querySelector(`[data-inspector-tab="${name}"]`)?.click();
}

function createRibbon() {
  const ribbon = node('section', 'scene-format-ribbon');
  ribbon.id = 'scene-format-ribbon';
  ribbon.setAttribute('aria-label', 'Компактная панель сцены');

  const context = node('div', 'scene-ribbon-context');
  context.append(node('small', '', 'СЦЕНА'), node('strong', 'scene-ribbon-selection', 'Добавление элементов'));

  const commands = node('div', 'scene-ribbon-commands');
  commands.append(
    action('✦ Дизайн', () => document.querySelector('#scene-preset-gallery-open, .scene-presets-trigger')?.click(), 'is-primary'),
    popoverButton('+ Добавить', [
      ['Меню', () => insert('table')], ['Текст', () => insert('text')], ['Изображение', () => insert('image')], ['Логотип', () => insert('logo')],
      ['Видео', () => insert('video')], ['Погода', () => insert('weather')], ['Часы', () => insert('clock')], ['Фигура', () => insert('shape')]
    ]),
    action('Фон', () => document.querySelector('#scene-tools-toggle')?.click())
  );

  const quick = node('div', 'scene-ribbon-quickbar');
  quick.append(
    proxyControl('#element-font-size', 'text table weather clock', 'Размер'),
    proxyControl('#element-color', 'text table weather clock', 'Цвет'),
    proxyControl('#table-preset', 'table', 'Стиль меню'),
    proxyControl('#table-accent-color', 'table', 'Акцент'),
    proxyControl('#element-media-fit', 'image logo video', 'Кадр'),
    proxyControl('#element-radius', '*', 'Скругл.')
  );

  const contextual = node('div', 'scene-ribbon-contextual');
  contextual.append(
    action('Объект', () => inspectorTab('object')),
    action('Стиль', () => inspectorTab('format')),
    action('Данные', () => inspectorTab('data')),
    action('Анимация', () => inspectorTab('animation')),
    popoverButton('⋯', [
      ['На слой вперёд', () => document.querySelector('#element-forward')?.click()],
      ['На слой назад', () => document.querySelector('#element-backward')?.click()],
      ['Дублировать', () => document.querySelector('#element-duplicate')?.click()],
      ['Удалить', () => document.querySelector('#element-delete')?.click()]
    ])
  );

  ribbon.append(context, commands, quick, contextual);
  return ribbon;
}

function syncControl(control) {
  const source = document.querySelector(control.dataset.ribbonBind);
  if (!source) return;
  control.disabled = source.disabled;
  control.value = source.value;
}

function syncRibbon(ribbon) {
  const type = selectedType();
  ribbon.classList.toggle('has-selection', Boolean(type));
  ribbon.dataset.sceneType = type || '';
  ribbon.querySelector('.scene-ribbon-context small').textContent = type ? 'ВЫБРАНО' : 'СЦЕНА';
  ribbon.querySelector('.scene-ribbon-selection').textContent = type ? TYPE_LABELS[type] : 'Добавление и дизайн';

  for (const field of ribbon.querySelectorAll('.scene-ribbon-quick')) {
    const types = field.dataset.ribbonTypes || '*';
    const visible = Boolean(type) && (types === '*' || types.split(/\s+/).includes(type));
    field.classList.toggle('is-hidden', !visible);
  }
  for (const control of ribbon.querySelectorAll('[data-ribbon-bind]')) syncControl(control);

  const dataButton = [...ribbon.querySelectorAll('.scene-ribbon-contextual>.scene-ribbon-command')].find((button) => button.textContent === 'Данные');
  if (dataButton) dataButton.classList.toggle('is-hidden', !['table', 'image', 'logo', 'video', 'weather'].includes(type || ''));
}

function bindSync(ribbon) {
  const sync = () => queueMicrotask(() => syncRibbon(ribbon));
  const inspector = document.querySelector('.scene-inspector');
  inspector?.addEventListener('input', sync);
  inspector?.addEventListener('change', sync);
  const layer = document.querySelector('#scene-elements-layer');
  const observer = layer ? new MutationObserver(sync) : null;
  observer?.observe(layer, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('click', (event) => {
    for (const root of ribbon.querySelectorAll('.scene-ribbon-popover-root.is-open')) {
      if (!root.contains(event.target)) root.classList.remove('is-open');
    }
    sync();
  }, true);
  document.addEventListener('keydown', sync, true);
  syncRibbon(ribbon);
}

export function initialiseSceneRibbon() {
  if (document.querySelector('#scene-format-ribbon')) return;
  const toolbar = document.querySelector('.scene-editor-toolbar');
  if (!toolbar) return;
  const ribbon = createRibbon();
  toolbar.after(ribbon);
  bindSync(ribbon);
}
