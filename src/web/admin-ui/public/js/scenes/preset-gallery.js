import { SCENE_PRESETS, buildScenePresetLayout } from './scene-presets.js';

function dispatch(control, eventType) {
  control?.dispatchEvent(new Event(eventType, { bubbles: true }));
}

function setValue(selector, value, eventType = 'input') {
  const control = document.querySelector(selector);
  if (!control) return false;
  control.value = String(value);
  dispatch(control, eventType);
  return true;
}

function setChecked(selector, value) {
  const control = document.querySelector(selector);
  if (!control) return false;
  control.checked = Boolean(value);
  dispatch(control, 'change');
  return true;
}

function addElement(type) {
  const button = document.querySelector(`[data-add-element="${type}"]`);
  if (!button) return false;
  button.click();
  return true;
}

function setGeometry(geometry) {
  setValue('#element-width', geometry.width);
  setValue('#element-height', geometry.height);
  setValue('#element-x', geometry.x);
  setValue('#element-y', geometry.y);
}

function setElementStyle(style = {}) {
  if (style.color !== undefined) setValue('#element-color', style.color);
  if (style.background !== undefined) setValue('#element-background', style.background, 'change');
  if (style.font_size !== undefined) setValue('#element-font-size', style.font_size);
  if (style.font_weight !== undefined) setValue('#element-font-weight', style.font_weight, 'change');
  if (style.text_align !== undefined) setValue('#element-text-align', style.text_align, 'change');
  if (style.vertical_align !== undefined) setValue('#element-vertical-align', style.vertical_align, 'change');
  if (style.line_height !== undefined) setValue('#element-line-height', style.line_height);
  if (style.letter_spacing !== undefined) setValue('#element-letter-spacing', style.letter_spacing);
  if (style.radius !== undefined) setValue('#element-radius', style.radius);
  if (style.border_width !== undefined) setValue('#element-border-width', style.border_width);
  if (style.border_color !== undefined) setValue('#element-border-color', style.border_color);
}

function setMenuConfig(table = {}) {
  setValue('#table-preset', table.preset || 'clean', 'change');
  setValue('#table-density', table.density || 'comfortable', 'change');
  setValue('#table-header-style', table.headerStyle || 'subtle', 'change');
  setValue('#table-price-style', table.priceStyle || 'accent', 'change');
  setValue('#table-accent-color', table.accentColor || '#f4c915');
  setChecked('#table-show-title', table.showTitle === true);
  setChecked('#table-row-dividers', table.rowDividers !== false);
  setChecked('#table-zebra', table.zebra === true);
  setValue('#table-price-layout', 'single', 'change');
  setValue('#table-row-limit', table.rowLimit || 12);
  setChecked('#table-active-only', true);
  setChecked('#table-show-metadata', true);
  setChecked('#table-show-description', false);
}

function applyElement(spec) {
  if (!addElement(spec.type)) return false;
  setGeometry(spec.geometry);
  if (spec.content !== undefined) setValue('#element-content', spec.content);
  setElementStyle(spec.style);
  if (spec.type === 'table') setMenuConfig(spec.table);
  return true;
}

function sceneIsEmpty() {
  return document.querySelectorAll('#scene-elements-layer .scene-render-element[data-element-id]').length === 0;
}

function displayCount() {
  return Math.min(6, Math.max(1, Number(document.querySelector('#scene-display-count')?.value) || 1));
}

function applyPreset(preset, messageNode) {
  if (!sceneIsEmpty()) {
    messageNode.textContent = 'В сцене уже есть элементы. Чтобы не потерять работу, готовый дизайн пока применяется только к пустой сцене.';
    messageNode.classList.add('is-visible', 'is-warning');
    return false;
  }

  const layout = buildScenePresetLayout(preset, displayCount());
  setValue('#slide-background-type', 'color', 'change');
  setValue('#slide-background-color', layout.background);

  for (const spec of layout.elements) applyElement(spec);

  const sceneName = document.querySelector('#scene-name');
  if (sceneName && (!sceneName.value.trim() || sceneName.value.trim() === 'Новая сцена')) {
    sceneName.value = preset.name;
    dispatch(sceneName, 'input');
  }

  document.querySelector('[data-inspector-tab="data"]')?.click();
  messageNode.textContent = `Дизайн «${preset.name}» применён. Каталог подставится автоматически — выберите нужный класс позиций справа.`;
  messageNode.classList.remove('is-warning');
  messageNode.classList.add('is-visible');
  window.setTimeout(() => messageNode.classList.remove('is-visible'), 4200);
  return true;
}

function previewMarkup(preset) {
  return `
    <div class="scene-preset-preview" style="--preset-bg:${preset.palette.background};--preset-surface:${preset.palette.surface};--preset-text:${preset.palette.text};--preset-accent:${preset.palette.accent}">
      <div class="scene-preset-preview-title">${preset.title}</div>
      <div class="scene-preset-preview-line"><span></span><b></b></div>
      <div class="scene-preset-preview-line"><span></span><b></b></div>
      <div class="scene-preset-preview-line"><span></span><b></b></div>
      <div class="scene-preset-preview-line"><span></span><b></b></div>
    </div>`;
}

function cardMarkup(preset) {
  return `
    <article class="scene-preset-card" data-preset-id="${preset.id}">
      ${previewMarkup(preset)}
      <div class="scene-preset-card-copy">
        <span class="scene-preset-category">${preset.category}</span>
        <h3>${preset.name}</h3>
        <p>${preset.description}</p>
      </div>
      <button class="button button-primary scene-preset-apply" type="button" data-apply-preset="${preset.id}">Использовать</button>
    </article>`;
}

function galleryMarkup() {
  return `
    <section class="scene-preset-gallery is-hidden" id="scene-preset-gallery" aria-label="Готовые дизайны">
      <div class="scene-preset-gallery-backdrop" data-close-presets></div>
      <div class="scene-preset-gallery-panel">
        <header class="scene-preset-gallery-head">
          <div>
            <span class="eyebrow">БЫСТРЫЙ СТАРТ</span>
            <h2>Выберите готовый дизайн</h2>
            <p>Ваш каталог и цены подставятся автоматически. После применения можно изменить любой элемент.</p>
          </div>
          <button class="scene-preset-close" type="button" data-close-presets aria-label="Закрыть">×</button>
        </header>
        <div class="scene-preset-filter" role="tablist" aria-label="Категории шаблонов">
          <button type="button" class="is-active" data-preset-filter="all">Все</button>
          <button type="button" data-preset-filter="Бар">Бар</button>
          <button type="button" data-preset-filter="Кафе">Кафе</button>
          <button type="button" data-preset-filter="Ресторан">Ресторан</button>
          <button type="button" data-preset-filter="Магазин">Магазин</button>
        </div>
        <p class="scene-preset-message" id="scene-preset-message" role="status" aria-live="polite"></p>
        <div class="scene-preset-grid">${SCENE_PRESETS.map(cardMarkup).join('')}</div>
        <footer class="scene-preset-gallery-foot">
          <strong>Нужен свой дизайн?</strong>
          <span>Закройте галерею и собирайте сцену с нуля — все инструменты редактора остаются доступны.</span>
        </footer>
      </div>
    </section>`;
}

function applyMenuTerminology(root = document) {
  const tool = root.querySelector('[data-add-element="table"]');
  const title = tool?.querySelector('strong');
  const caption = tool?.querySelector('span');
  if (title) title.textContent = 'Меню';
  if (caption) caption.textContent = 'Каталог, цены и категории';
  const appearanceSummary = root.querySelector('#table-appearance-settings > summary');
  const dataSummary = root.querySelector('#table-settings > summary');
  if (appearanceSummary) appearanceSummary.textContent = 'Оформление меню';
  if (dataSummary) dataSummary.textContent = 'Данные меню';
  const inspectorTitle = root.querySelector('#inspector-title');
  if (inspectorTitle?.textContent.trim() === 'Таблица') inspectorTitle.textContent = 'Меню';
}

function installMenuTerminologySync() {
  const stage = document.querySelector('#scene-stage');
  const tableTool = document.querySelector('[data-add-element="table"]');
  const sync = () => queueMicrotask(() => applyMenuTerminology());
  stage?.addEventListener('pointerdown', sync);
  tableTool?.addEventListener('click', sync);
}

export function initialiseScenePresetGallery() {
  const toolbar = document.querySelector('.scene-toolbar-controls');
  const page = document.querySelector('.scene-editor-page');
  if (!toolbar || !page || document.querySelector('#scene-preset-gallery')) return;

  applyMenuTerminology();
  installMenuTerminologySync();

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'button button-secondary scene-presets-trigger';
  trigger.innerHTML = '<span aria-hidden="true">▦</span> Шаблоны';
  toolbar.prepend(trigger);

  page.insertAdjacentHTML('beforeend', galleryMarkup());
  const gallery = document.querySelector('#scene-preset-gallery');
  const message = document.querySelector('#scene-preset-message');

  const open = () => {
    gallery.classList.remove('is-hidden');
    document.body.classList.add('scene-preset-gallery-open');
    message.classList.remove('is-visible', 'is-warning');
    message.textContent = '';
  };
  const close = () => {
    gallery.classList.add('is-hidden');
    document.body.classList.remove('scene-preset-gallery-open');
  };

  trigger.addEventListener('click', open);
  gallery.querySelectorAll('[data-close-presets]').forEach((button) => button.addEventListener('click', close));
  gallery.querySelectorAll('[data-apply-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = SCENE_PRESETS.find((item) => item.id === button.dataset.applyPreset);
      if (preset && applyPreset(preset, message)) window.setTimeout(close, 650);
    });
  });
  gallery.querySelectorAll('[data-preset-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.presetFilter;
      gallery.querySelectorAll('[data-preset-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
      gallery.querySelectorAll('.scene-preset-card').forEach((card) => {
        const preset = SCENE_PRESETS.find((item) => item.id === card.dataset.presetId);
        const visible = filter === 'all' || preset?.category.includes(filter);
        card.classList.toggle('is-hidden', !visible);
      });
    });
  });

  if (sceneIsEmpty() && (document.querySelector('#scene-name')?.value.trim() || '') === 'Новая сцена') open();
}
