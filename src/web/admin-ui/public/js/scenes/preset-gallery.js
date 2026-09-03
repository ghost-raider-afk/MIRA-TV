import { SCENE_PRESETS, addScenePresetCampaign, applySceneDesignPreset } from './scene-presets.js';
import { getScene, updateSceneRemote } from './store.js';

function sceneId() {
  return new URLSearchParams(window.location.search).get('id') || '';
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function sceneLooksEmpty() {
  return document.querySelectorAll('#scene-elements-layer .scene-render-element[data-element-id]').length === 0;
}

async function flushEditorSave() {
  const button = document.querySelector('#scene-save');
  const state = document.querySelector('#scene-save-state');
  button?.click();
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const text = String(state?.textContent || '').trim();
    if (text === 'Сохранено') return;
    if (/Не сохранено|Конфликт|Ошибка/i.test(text)) throw new Error('Сначала устраните ошибку сохранения сцены.');
    await sleep(90);
  }
  throw new Error('Не удалось дождаться сохранения сцены.');
}

function setBusy(root, busy) {
  root.querySelectorAll('[data-apply-preset],[data-add-preset-campaign]').forEach((button) => {
    button.disabled = busy;
  });
}

async function applyPreset(preset, root, message, mode = 'style') {
  const id = sceneId();
  if (!id) return;
  setBusy(root, true);
  message.classList.add('is-visible');
  message.classList.remove('is-warning');
  message.textContent = mode === 'campaign'
    ? `Добавляем комплект «${preset.name}» из ${preset.campaign.length} слайдов…`
    : `Применяем «${preset.name}». Геометрия, тексты и выбранный состав меню сохраняются.`;
  try {
    await flushEditorSave();
    const current = await getScene(id);
    const result = mode === 'campaign'
      ? addScenePresetCampaign(current, preset)
      : applySceneDesignPreset(current, preset, { mode: 'auto' });
    await updateSceneRemote(result.scene);
    message.textContent = mode === 'campaign'
      ? `Добавлен продающий комплект «${preset.name}»: ${result.addedSlides} слайда.`
      : result.seeded
        ? `Создан готовый комплект «${preset.name}» из ${result.addedSlides} слайдов.`
        : `Стиль «${preset.name}» применён без добавления объектов поверх существующей сцены.`;
    await sleep(240);
    window.location.reload();
  } catch (error) {
    setBusy(root, false);
    message.textContent = error?.message || 'Не удалось применить дизайн.';
    message.classList.add('is-warning');
  }
}

function previewRows(preset) {
  return (preset.previewRows || []).map(([name, price]) => `<div><span>${name}</span><i></i><b>${price}</b></div>`).join('');
}

function campaignStrip(preset) {
  return preset.campaign.map((slide, index) => `<span><b>${index + 1}</b>${slide.label}</span>`).join('');
}

function card(preset) {
  const first = preset.campaign[0];
  const article = document.createElement('article');
  article.className = 'scene-preset-card';
  article.dataset.category = preset.category;
  article.innerHTML = `
    <div class="scene-preset-live-preview" style="--p-bg:${preset.palette.background};--p-surface:${preset.palette.surface};--p-text:${preset.palette.text};--p-accent:${preset.palette.accent}">
      <div class="scene-preset-live-glow"></div>
      <img src="${preset.art}" alt="" draggable="false" />
      <span class="scene-preset-live-logo">LOGO</span>
      <div class="scene-preset-live-copy">
        <small>${preset.brand}</small>
        <strong>${first.title}</strong>
        <div class="scene-preset-live-menu">${previewRows(preset)}</div>
      </div>
      <span class="scene-preset-live-promo">${first.promo}</span>
      <span class="scene-preset-live-widget">${preset.widget === 'clock' ? '21:45' : '☀ 18°'}</span>
    </div>
    <div class="scene-preset-card-copy">
      <div class="scene-preset-card-title"><span>${preset.category}</span><h3>${preset.name}</h3><em>${preset.campaign.length} слайда</em></div>
      <p>${preset.description}</p>
      <div class="scene-preset-campaign-strip" aria-label="Состав комплекта">${campaignStrip(preset)}</div>
    </div>
    <div class="scene-preset-card-actions">
      <button type="button" class="button button-primary" data-apply-preset="${preset.id}">Применить</button>
      <button type="button" class="button button-secondary" data-add-preset-campaign="${preset.id}" title="Добавить готовый комплект слайдов в текущую сцену">+ ${preset.campaign.length} слайда</button>
    </div>`;
  return article;
}

function createGallery() {
  const root = document.createElement('section');
  root.className = 'scene-preset-gallery is-hidden';
  root.id = 'scene-preset-gallery';
  root.setAttribute('aria-label', 'Готовые дизайны сцен');
  root.innerHTML = `
    <div class="scene-preset-gallery-dialog">
      <header class="scene-preset-gallery-head">
        <div><p class="eyebrow">ГОТОВЫЕ ДИЗАЙНЫ</p><h2>Готовые продающие меню</h2><p>Основная кнопка меняет оформление существующей сцены без добавления лишних объектов. На пустой сцене создаётся готовый комплект из нескольких слайдов. Кнопка «+ слайда» добавляет комплект к текущей сцене.</p></div>
        <button type="button" class="scene-preset-close" aria-label="Закрыть">×</button>
      </header>
      <nav class="scene-preset-filters" aria-label="Категории дизайна"></nav>
      <div class="scene-preset-grid"></div>
      <p class="scene-preset-message" aria-live="polite"></p>
    </div>`;
  const grid = root.querySelector('.scene-preset-grid');
  SCENE_PRESETS.forEach((preset) => grid.append(card(preset)));

  const filters = ['Все', ...new Set(SCENE_PRESETS.map((preset) => preset.category))];
  const nav = root.querySelector('.scene-preset-filters');
  filters.forEach((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.className = index === 0 ? 'active' : '';
    button.addEventListener('click', () => {
      nav.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
      root.querySelectorAll('.scene-preset-card').forEach((item) => item.classList.toggle('is-hidden', name !== 'Все' && item.dataset.category !== name));
    });
    nav.append(button);
  });
  return root;
}

function openGallery(root) {
  root.classList.remove('is-hidden');
  document.body.classList.add('scene-preset-gallery-open');
}

function closeGallery(root) {
  root.classList.add('is-hidden');
  document.body.classList.remove('scene-preset-gallery-open');
}

function relabelLegacyTableTerms() {
  const tool = document.querySelector('[data-add-element="table"] strong');
  if (tool) tool.textContent = 'Меню';
  const toolCaption = document.querySelector('[data-add-element="table"] span');
  if (toolCaption) toolCaption.textContent = 'Подборка, цены и категории';
  const appearance = document.querySelector('#table-appearance-settings summary');
  if (appearance) appearance.textContent = 'Оформление меню';
  const data = document.querySelector('#table-settings summary');
  if (data) data.textContent = 'Данные и состав меню';
}

export function initialiseScenePresetGallery() {
  if (document.querySelector('#scene-preset-gallery')) return;
  const page = document.querySelector('.scene-editor-page');
  const toolbar = document.querySelector('.scene-toolbar-controls');
  if (!page || !toolbar) return;

  relabelLegacyTableTerms();
  const root = createGallery();
  page.append(root);
  const message = root.querySelector('.scene-preset-message');
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.id = 'scene-preset-gallery-open';
  launcher.className = 'button button-secondary scene-preset-launcher';
  launcher.textContent = '◫ Дизайн';
  toolbar.prepend(launcher);

  launcher.addEventListener('click', () => openGallery(root));
  root.querySelector('.scene-preset-close').addEventListener('click', () => closeGallery(root));
  root.addEventListener('click', (event) => {
    if (event.target === root) closeGallery(root);
    const apply = event.target.closest('[data-apply-preset]');
    if (apply) {
      const preset = SCENE_PRESETS.find((item) => item.id === apply.dataset.applyPreset);
      if (preset) void applyPreset(preset, root, message, 'style');
      return;
    }
    const add = event.target.closest('[data-add-preset-campaign]');
    if (add) {
      const preset = SCENE_PRESETS.find((item) => item.id === add.dataset.addPresetCampaign);
      if (preset) void applyPreset(preset, root, message, 'campaign');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.classList.contains('is-hidden')) closeGallery(root);
  });

  if (sceneLooksEmpty() && document.querySelector('#scene-name')?.value.trim() === 'Новая сцена') openGallery(root);
}
