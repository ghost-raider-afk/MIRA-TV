import { SCENE_PRESETS, applySceneDesignPreset } from './scene-presets.js';
import { ensurePresetLogoSlots } from './preset-brand.js';
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
  root.querySelectorAll('[data-apply-preset]').forEach((button) => {
    button.disabled = busy;
    button.textContent = busy ? 'Применяем…' : 'Применить';
  });
}

async function applyPreset(preset, root, message) {
  const id = sceneId();
  if (!id) return;
  setBusy(root, true);
  message.textContent = `Применяем «${preset.name}». Существующие данные и расположение объектов будут сохранены.`;
  message.classList.add('is-visible');
  message.classList.remove('is-warning');
  try {
    await flushEditorSave();
    const current = await getScene(id);
    const { scene, seeded } = applySceneDesignPreset(current, preset);
    ensurePresetLogoSlots(scene, preset);
    await updateSceneRemote(scene);
    message.textContent = seeded
      ? `«${preset.name}» создан как готовая сцена: меню, логотип, графика, информеры, фон и анимация.`
      : `Дизайн «${preset.name}» применён поверх существующей сцены без удаления пользовательских элементов.`;
    await sleep(280);
    window.location.reload();
  } catch (error) {
    setBusy(root, false);
    message.textContent = error?.message || 'Не удалось применить дизайн.';
    message.classList.add('is-warning');
  }
}

function previewRows(preset) {
  const rows = {
    'mira-minimal': [['Фирменная позиция','490'],['Сезонное меню','620'],['Спецпредложение','350']],
    taproom: [['Citrus IPA','390'],['Helles Lager','340'],['Dark Stout','420']],
    'modern-bistro': [['Тартар','790'],['Паста с трюфелем','980'],['Десерт дня','520']],
    'coffee-house': [['Капучино','240'],['Флэт уайт','280'],['Круассан','210']],
    'chalk-board': [['Латте','260'],['Сэндвич дня','420'],['Чизкейк','330']],
    'night-neon': [['NEON SOUR','590'],['MIDNIGHT IPA','420'],['HIGHBALL','540']],
    'premium-black': [['SIGNATURE','1490'],['CHEF SPECIAL','1890'],['DESSERT','690']],
    'fresh-market': [['Свежая выпечка','190'],['Фермерский сыр','560'],['Сезонные ягоды','430']]
  }[preset.id] || [];
  return rows.map(([name, price]) => `<div><span>${name}</span><i></i><b>${price}</b></div>`).join('');
}

function card(preset) {
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
        <strong>${preset.title}</strong>
        <div class="scene-preset-live-menu">${previewRows(preset)}</div>
      </div>
      <span class="scene-preset-live-promo">${preset.promo}</span>
      <span class="scene-preset-live-widget">${preset.widget === 'clock' ? '21:45' : '☀ 18°'}</span>
    </div>
    <div class="scene-preset-card-copy">
      <div><span>${preset.category}</span><h3>${preset.name}</h3></div>
      <p>${preset.description}</p>
      <div class="scene-preset-card-tags"><span>Графика</span><span>Логотип</span><span>Информер</span><span>Анимация</span></div>
      <button type="button" class="button button-primary" data-apply-preset="${preset.id}">Применить</button>
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
        <div><p class="eyebrow">ГОТОВЫЕ ДИЗАЙНЫ</p><h2>Выберите характер меню</h2><p>Каждый пресет — готовая анимированная сцена. На рабочей сцене меняется дизайн, а ваши данные и расположение объектов сохраняются.</p></div>
        <button type="button" class="scene-preset-close" aria-label="Закрыть">×</button>
      </header>
      <nav class="scene-preset-filters" aria-label="Категории дизайна"></nav>
      <div class="scene-preset-grid"></div>
      <p class="scene-preset-message" aria-live="polite"></p>
    </div>`;
  const grid = root.querySelector('.scene-preset-grid');
  SCENE_PRESETS.forEach((preset) => grid.append(card(preset)));

  const filters = ['Все', ...new Set(SCENE_PRESETS.flatMap((preset) => preset.category.split(' · ')))];
  const nav = root.querySelector('.scene-preset-filters');
  filters.forEach((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.className = index === 0 ? 'active' : '';
    button.addEventListener('click', () => {
      nav.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
      root.querySelectorAll('.scene-preset-card').forEach((item) => {
        item.classList.toggle('is-hidden', name !== 'Все' && !String(item.dataset.category).split(' · ').includes(name));
      });
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
  if (toolCaption) toolCaption.textContent = 'Каталог, цены и категории';
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
    const button = event.target.closest('[data-apply-preset]');
    if (!button) return;
    const preset = SCENE_PRESETS.find((item) => item.id === button.dataset.applyPreset);
    if (preset) void applyPreset(preset, root, message);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.classList.contains('is-hidden')) closeGallery(root);
  });

  if (sceneLooksEmpty() && document.querySelector('#scene-name')?.value.trim() === 'Новая сцена') openGallery(root);
}
