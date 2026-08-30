import { API } from '../core/config.js';
import { api } from '../core/api.js';
import {
  applySceneElementGeometry,
  applySceneStage,
  renderSceneLayer,
  SCENE_ELEMENT_LABELS
} from '../scene-runtime/renderer.js';
import {
  appendSlide,
  createElement,
  createScene,
  duplicateElement,
  removeSlide,
  setDisplayCount,
  touchScene
} from './model.js';
import { createSceneRemote, getScene, updateSceneRemote } from './store.js';
import { normaliseTableConfig, parseTargetVolumes } from './catalog-table.js';
import { createSceneHistory } from './history.js';
import {
  compatibleMediaAssets,
  fetchMediaAssets,
  mediaAcceptForTarget,
  mediaAssetById,
  mediaAssetLabel,
  uploadMediaAsset
} from './media-library.js';

const MEDIA_ELEMENT_TYPES = new Set(['image', 'logo', 'video']);
const history = createSceneHistory({ limit: 100 });

const state = {
  scene: null,
  selectedElementId: null,
  preview: false,
  catalogProducts: [],
  catalogStatus: 'idle',
  catalogError: '',
  mediaAssets: [],
  mediaStatus: 'idle',
  mediaError: '',
  mediaUploading: false,
  autosaveTimer: null,
  clockTimer: null,
  dirtyVersion: 0,
  savedVersion: 0,
  saving: null,
  saveQueued: false,
  saveConflict: false
};

function currentSlide() {
  return state.scene.slides.find((slide) => slide.id === state.scene.active_slide_id) || state.scene.slides[0];
}

function selectedElement() {
  return currentSlide().elements.find((element) => element.id === state.selectedElementId) || null;
}

function findElement(id) {
  for (const slide of state.scene?.slides || []) {
    const element = slide.elements.find((item) => item.id === id);
    if (element) return element;
  }
  return null;
}

function findSlide(id) {
  return state.scene?.slides.find((slide) => slide.id === id) || null;
}

function sceneUsesMedia(scene) {
  return (scene?.slides || []).some((slide) =>
    Boolean(slide?.background?.asset_id)
    || (slide?.elements || []).some((element) => MEDIA_ELEMENT_TYPES.has(element.type) && Boolean(element.asset_id))
  );
}

function sceneUsesCatalog(scene) {
  return (scene?.slides || []).some((slide) => (slide?.elements || []).some((element) => element.type === 'table'));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

function showMessage(message, error = false) {
  const target = document.querySelector('#scene-editor-message');
  if (!target) return;
  target.textContent = message;
  target.classList.remove('is-hidden');
  target.classList.toggle('is-error', error);
  window.setTimeout(() => target.classList.add('is-hidden'), error ? 4500 : 1800);
}

function setSaveState(text) {
  const target = document.querySelector('#scene-save-state');
  if (target) target.textContent = text;
}

function renderHistoryControls() {
  const undo = document.querySelector('#scene-undo');
  const redo = document.querySelector('#scene-redo');
  if (undo) undo.disabled = state.preview || state.saveConflict || !history.canUndo;
  if (redo) redo.disabled = state.preview || state.saveConflict || !history.canRedo;
}

function recordHistory(groupKey = null) {
  if (!state.scene || state.preview || state.saveConflict) return false;
  const captured = history.capture(state.scene, state.selectedElementId, groupKey);
  renderHistoryControls();
  return captured;
}

function closeHistoryGroup() {
  history.closeGroup();
}

function ensureDynamicDataForScene() {
  if (sceneUsesCatalog(state.scene) && state.catalogStatus === 'idle') void loadCatalogProducts();
  if (sceneUsesMedia(state.scene) && state.mediaStatus === 'idle') void loadMediaAssets();
}

function applyHistoryResult(result, message) {
  if (!result || state.saveConflict) return;
  state.scene = result.scene;
  state.selectedElementId = result.selectedElementId;
  if (!selectedElement()) state.selectedElementId = null;
  touchScene(state.scene);
  scheduleAutosave();
  render();
  ensureDynamicDataForScene();
  showMessage(message);
}

function undoScene() {
  if (state.preview) return;
  applyHistoryResult(history.undo(state.scene, state.selectedElementId), 'Действие отменено.');
}

function redoScene() {
  if (state.preview) return;
  applyHistoryResult(history.redo(state.scene, state.selectedElementId), 'Действие повторено.');
}

async function persistScene({ notify = false } = {}) {
  if (!state.scene || state.saveConflict) return false;
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = null;
  state.scene.name = document.querySelector('#scene-name')?.value.trim() || state.scene.name || 'Новая сцена';

  if (state.saving) {
    state.saveQueued = true;
    return state.saving;
  }
  if (state.dirtyVersion <= state.savedVersion) {
    setSaveState('Сохранено');
    if (notify) showMessage('Шаблон сохранён.');
    return true;
  }

  const savingVersion = state.dirtyVersion;
  const payload = structuredClone(state.scene);
  setSaveState('Сохранение…');
  const operation = updateSceneRemote(payload);
  state.saving = operation;

  try {
    const saved = await operation;
    if (state.dirtyVersion === savingVersion) {
      state.scene = saved;
    } else {
      state.scene.server_revision = saved.server_revision;
      state.scene.created_at = saved.created_at;
      state.scene.updated_at = saved.updated_at;
    }
    state.savedVersion = Math.max(state.savedVersion, savingVersion);
    setSaveState(state.dirtyVersion > state.savedVersion ? 'Изменено' : 'Сохранено');
    if (notify && state.dirtyVersion <= state.savedVersion) showMessage('Шаблон сохранён.');
    return true;
  } catch (error) {
    if (error?.status === 409) {
      state.saveConflict = true;
      setSaveState('Конфликт изменений');
      showMessage('Сцена была изменена в другой вкладке или другим пользователем. Обновите страницу, чтобы не потерять чужие изменения.', true);
      renderHistoryControls();
    } else {
      setSaveState('Не сохранено');
      showMessage(error?.message || 'Не удалось сохранить сцену.', true);
    }
    return false;
  } finally {
    state.saving = null;
    if (!state.saveConflict && (state.saveQueued || state.dirtyVersion > state.savedVersion)) {
      state.saveQueued = false;
      queueMicrotask(() => void persistScene());
    }
  }
}

function scheduleAutosave() {
  if (state.saveConflict) return;
  state.dirtyVersion += 1;
  setSaveState('Изменено');
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = window.setTimeout(() => void persistScene(), 650);
}

async function loadCatalogProducts({ force = false } = {}) {
  if (!force && (state.catalogStatus === 'loading' || state.catalogStatus === 'ready')) return;
  state.catalogStatus = 'loading';
  state.catalogError = '';
  renderElements();
  renderInspector();
  try {
    const products = await api.get(API.products);
    state.catalogProducts = Array.isArray(products) ? products : [];
    state.catalogStatus = 'ready';
  } catch (error) {
    state.catalogProducts = [];
    state.catalogStatus = 'error';
    state.catalogError = error?.message || 'Не удалось загрузить каталог';
  }
  renderElements();
  renderInspector();
}

async function loadMediaAssets({ force = false } = {}) {
  if (!force && (state.mediaStatus === 'loading' || state.mediaStatus === 'ready')) return;
  state.mediaStatus = 'loading';
  state.mediaError = '';
  renderElements();
  renderInspector();
  renderBackgroundControls();
  try {
    state.mediaAssets = await fetchMediaAssets();
    state.mediaStatus = 'ready';
  } catch (error) {
    state.mediaAssets = [];
    state.mediaStatus = 'error';
    state.mediaError = error?.message || 'Не удалось загрузить медиатеку';
  }
  renderElements();
  renderInspector();
  renderBackgroundControls();
}

function mediaStatusText(target, selectedId = '') {
  if (state.mediaUploading) return 'Загрузка файла…';
  if (state.mediaStatus === 'loading' || state.mediaStatus === 'idle') return 'Медиатека загружается…';
  if (state.mediaStatus === 'error') return state.mediaError || 'Медиатека недоступна';
  const selected = mediaAssetById(state.mediaAssets, selectedId);
  if (selected) return mediaAssetLabel(selected);
  const count = compatibleMediaAssets(state.mediaAssets, target).length;
  return count ? `Доступно файлов: ${count}` : 'Подходящих файлов пока нет';
}

function fillMediaSelect(select, target, selectedId) {
  if (!select) return;
  const options = [new Option('Не выбран', '')];
  for (const asset of compatibleMediaAssets(state.mediaAssets, target)) {
    options.push(new Option(mediaAssetLabel(asset), asset.id));
  }
  select.replaceChildren(...options);
  select.value = options.some((option) => option.value === selectedId) ? selectedId : '';
}

async function uploadForElement(file, elementId, targetType) {
  if (!file || state.mediaUploading) return;
  state.mediaUploading = true;
  renderInspector();
  try {
    const asset = await uploadMediaAsset(file);
    state.mediaAssets = [asset, ...state.mediaAssets.filter((item) => item.id !== asset.id)];
    state.mediaStatus = 'ready';
    const element = findElement(elementId);
    if (element && element.type === targetType) {
      recordHistory();
      element.asset_id = asset.id;
      touchScene(state.scene);
      scheduleAutosave();
      showMessage(`${SCENE_ELEMENT_LABELS[targetType]} обновлён.`);
    }
  } catch (error) {
    showMessage(error?.message || 'Не удалось загрузить медиафайл.', true);
  } finally {
    state.mediaUploading = false;
    renderElements();
    renderInspector();
    renderBackgroundControls();
  }
}

async function uploadForBackground(file, slideId, backgroundType) {
  if (!file || state.mediaUploading) return;
  state.mediaUploading = true;
  renderBackgroundControls();
  try {
    const asset = await uploadMediaAsset(file);
    state.mediaAssets = [asset, ...state.mediaAssets.filter((item) => item.id !== asset.id)];
    state.mediaStatus = 'ready';
    const slide = findSlide(slideId);
    if (slide && slide.background.type === backgroundType) {
      recordHistory();
      slide.background.asset_id = asset.id;
      touchScene(state.scene);
      scheduleAutosave();
      showMessage('Фон слайда обновлён.');
    }
  } catch (error) {
    showMessage(error?.message || 'Не удалось загрузить фон.', true);
  } finally {
    state.mediaUploading = false;
    renderElements();
    renderBackgroundControls();
  }
}

function renderGuides() {
  const guides = document.querySelector('#scene-tv-guides');
  guides.replaceChildren();
  for (let index = 0; index < state.scene.display_count; index += 1) {
    const guide = document.createElement('div');
    guide.className = 'scene-tv-guide';
    guide.style.left = `${(index / state.scene.display_count) * 100}%`;
    guide.style.width = `${100 / state.scene.display_count}%`;
    const label = document.createElement('span');
    label.textContent = `TV ${index + 1}`;
    guide.append(label);
    guides.append(guide);
  }
}

function appendTextElement(parent, tagName, text, className = '') {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

function markSelected(node, element) {
  state.selectedElementId = element.id;
  document.querySelectorAll('.scene-render-element.is-selected').forEach((item) => item.classList.remove('is-selected'));
  node.classList.add('is-selected');
  renderInspector();
  if (MEDIA_ELEMENT_TYPES.has(element.type) && state.mediaStatus === 'idle') void loadMediaAssets();
}

function installDrag(node, element) {
  node.addEventListener('pointerdown', (event) => {
    if (state.preview || event.target.closest('.scene-resize-handle')) return;
    markSelected(node, element);
    const stage = document.querySelector('#scene-stage');
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const start = { x: event.clientX, y: event.clientY, elementX: element.x, elementY: element.y };
    let captured = false;
    node.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      const dx = (moveEvent.clientX - start.x) * (state.scene.canvas_width / rect.width);
      const dy = (moveEvent.clientY - start.y) * (state.scene.canvas_height / rect.height);
      const nextX = clamp(start.elementX + dx, 0, state.scene.canvas_width - element.width);
      const nextY = clamp(start.elementY + dy, 0, state.scene.canvas_height - element.height);
      if (!captured && (nextX !== element.x || nextY !== element.y)) {
        recordHistory(`drag:${element.id}`);
        captured = true;
      }
      element.x = nextX;
      element.y = nextY;
      touchScene(state.scene);
      applySceneElementGeometry(node, element, state.scene, rect.width);
      renderInspectorGeometry();
    };
    const stop = () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', stop);
      node.removeEventListener('pointercancel', stop);
      closeHistoryGroup();
      if (captured) scheduleAutosave();
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', stop);
    node.addEventListener('pointercancel', stop);
  });

  const handle = node.querySelector('.scene-resize-handle');
  handle?.addEventListener('pointerdown', (event) => {
    if (state.preview) return;
    event.stopPropagation();
    markSelected(node, element);
    const stage = document.querySelector('#scene-stage');
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const start = { x: event.clientX, y: event.clientY, width: element.width, height: element.height };
    let captured = false;
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      const dx = (moveEvent.clientX - start.x) * (state.scene.canvas_width / rect.width);
      const dy = (moveEvent.clientY - start.y) * (state.scene.canvas_height / rect.height);
      const nextWidth = clamp(start.width + dx, 40, state.scene.canvas_width - element.x);
      const nextHeight = clamp(start.height + dy, 40, state.scene.canvas_height - element.y);
      if (!captured && (nextWidth !== element.width || nextHeight !== element.height)) {
        recordHistory(`resize:${element.id}`);
        captured = true;
      }
      element.width = nextWidth;
      element.height = nextHeight;
      touchScene(state.scene);
      applySceneElementGeometry(node, element, state.scene, rect.width);
      renderInspectorGeometry();
    };
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      closeHistoryGroup();
      if (captured) scheduleAutosave();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  });
}

function decorateEditorElement(node, element) {
  node.classList.toggle('is-selected', !state.preview && element.id === state.selectedElementId);
  if (!state.preview) {
    const handle = document.createElement('span');
    handle.className = 'scene-resize-handle';
    handle.setAttribute('aria-hidden', 'true');
    node.append(handle);
  }
  node.addEventListener('click', (event) => {
    if (state.preview) return;
    event.stopPropagation();
    state.selectedElementId = element.id;
    renderElements();
    renderInspector();
    if (MEDIA_ELEMENT_TYPES.has(element.type) && state.mediaStatus === 'idle') void loadMediaAssets();
  });
  installDrag(node, element);
}

function rendererMediaContext() {
  return {
    mediaAssets: state.mediaAssets,
    autoplayMedia: state.preview
  };
}

function renderElements() {
  const layer = document.querySelector('#scene-elements-layer');
  renderSceneLayer(layer, {
    scene: state.scene,
    slide: currentSlide(),
    context: {
      catalogProducts: state.catalogProducts,
      catalogStatus: state.catalogStatus,
      catalogError: state.catalogError,
      now: new Date(),
      ...rendererMediaContext()
    },
    decorate: decorateEditorElement
  });
  syncClockTimer();
}

function renderSlides() {
  const target = document.querySelector('#scene-slide-list');
  target.replaceChildren();
  state.scene.slides.forEach((slide, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scene-slide-card';
    button.classList.toggle('active', slide.id === state.scene.active_slide_id);
    appendTextElement(button, 'span', String(index + 1));
    appendTextElement(button, 'strong', slide.name);
    appendTextElement(button, 'small', `${Math.round(slide.duration_ms / 1000)} сек · ${slide.elements.length} эл.`);
    button.addEventListener('click', () => {
      state.scene.active_slide_id = slide.id;
      state.selectedElementId = null;
      render();
      if (slide.background.type !== 'color' && state.mediaStatus === 'idle') void loadMediaAssets();
    });
    const actions = document.createElement('div');
    actions.className = 'scene-slide-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = 'Удалить слайд';
    remove.disabled = state.scene.slides.length <= 1;
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.scene.slides.length <= 1) return;
      recordHistory();
      if (removeSlide(state.scene, slide.id)) {
        state.selectedElementId = null;
        scheduleAutosave();
        render();
      }
    });
    actions.append(remove);
    const wrapper = document.createElement('div');
    wrapper.className = 'scene-slide-item';
    wrapper.append(button, actions);
    target.append(wrapper);
  });
}

function renderInspectorGeometry() {
  const element = selectedElement();
  if (!element) return;
  document.querySelector('#element-x').value = Math.round(element.x);
  document.querySelector('#element-y').value = Math.round(element.y);
  document.querySelector('#element-width').value = Math.round(element.width);
  document.querySelector('#element-height').value = Math.round(element.height);
}

function renderTableInspector(element) {
  const section = document.querySelector('#table-settings');
  const isTable = element?.type === 'table';
  section.classList.toggle('is-hidden', !isTable);
  if (!isTable) return;
  element.table = normaliseTableConfig(element.table || {});
  document.querySelector('#table-active-only').checked = element.table.active_only;
  document.querySelector('#table-row-limit').value = element.table.row_limit;
  document.querySelector('#table-volumes').value = element.table.volumes_l.map((value) => String(value).replace('.', ',')).join('; ');
  document.querySelector('#table-show-producer').checked = element.table.show_producer;
  document.querySelector('#table-show-strength').checked = element.table.show_strength;
  document.querySelector('#table-show-color').checked = element.table.show_color;
  document.querySelector('#table-show-filtration').checked = element.table.show_filtration;
  const status = document.querySelector('#table-catalog-status');
  if (state.catalogStatus === 'loading' || state.catalogStatus === 'idle') status.textContent = 'Каталог загружается…';
  else if (state.catalogStatus === 'error') status.textContent = state.catalogError || 'Каталог недоступен';
  else status.textContent = `Каталог подключён · ${state.catalogProducts.length} позиций`;
}

function renderMediaInspector(element) {
  const section = document.querySelector('#media-settings');
  const isMedia = MEDIA_ELEMENT_TYPES.has(element?.type);
  section.classList.toggle('is-hidden', !isMedia);
  if (!isMedia) return;
  fillMediaSelect(document.querySelector('#element-media-asset'), element.type, element.asset_id || '');
  document.querySelector('#media-library-status').textContent = mediaStatusText(element.type, element.asset_id);
  const upload = document.querySelector('#element-media-upload');
  upload.disabled = state.mediaUploading;
  upload.textContent = state.mediaUploading ? 'Загрузка…' : 'Загрузить новый';
  const input = document.querySelector('#element-media-upload-input');
  input.accept = mediaAcceptForTarget(element.type);
}

function renderBackgroundControls() {
  if (!state.scene) return;
  const background = currentSlide().background;
  document.querySelector('#slide-background-type').value = background.type;
  document.querySelector('#slide-background-color').value = background.color || '#10141c';
  const mediaPanel = document.querySelector('#slide-background-media');
  const needsMedia = background.type === 'image' || background.type === 'video';
  mediaPanel.classList.toggle('is-hidden', !needsMedia);
  if (!needsMedia) return;
  fillMediaSelect(document.querySelector('#slide-background-asset'), background.type, background.asset_id || '');
  document.querySelector('#slide-background-media-status').textContent = mediaStatusText(background.type, background.asset_id);
  const upload = document.querySelector('#slide-background-upload');
  upload.disabled = state.mediaUploading;
  upload.textContent = state.mediaUploading ? 'Загрузка…' : 'Загрузить фон';
  document.querySelector('#slide-background-upload-input').accept = mediaAcceptForTarget(background.type);
}

function renderInspector() {
  const element = selectedElement();
  document.querySelector('#inspector-empty').classList.toggle('is-hidden', Boolean(element));
  document.querySelector('#inspector-fields').classList.toggle('is-hidden', !element);
  document.querySelector('#inspector-title').textContent = element ? SCENE_ELEMENT_LABELS[element.type] : 'Слайд';
  if (!element) {
    renderTableInspector(null);
    renderMediaInspector(null);
    return;
  }
  renderInspectorGeometry();
  document.querySelector('#element-content').value = element.content || '';
  document.querySelector('#element-content-label').textContent = element.type === 'table' ? 'Заголовок' : MEDIA_ELEMENT_TYPES.has(element.type) ? 'Подпись' : 'Содержимое';
  document.querySelector('#element-color').value = element.style.color || '#ffffff';
  document.querySelector('#element-background').value = element.style.background || 'transparent';
  document.querySelector('#element-font-size').value = element.style.font_size || 40;
  document.querySelector('#element-opacity').value = element.opacity ?? 1;
  document.querySelector('#element-variant').value = element.variant || 'default';
  document.querySelector('#element-shadow').checked = Boolean(element.effects.shadow);
  document.querySelector('#element-glow').checked = Boolean(element.effects.glow);
  document.querySelector('#element-entrance').value = element.animation.entrance || 'none';
  document.querySelector('#element-loop').value = element.animation.loop || 'none';
  document.querySelector('#element-exit').value = element.animation.exit || 'none';
  renderTableInspector(element);
  renderMediaInspector(element);
}

function render() {
  const scene = state.scene;
  document.body.classList.toggle('scene-preview-mode', state.preview);
  document.querySelector('#scene-name').value = scene.name;
  document.querySelector('#scene-display-count').value = String(scene.display_count);
  document.querySelector('#scene-resolution-label').textContent = `${scene.canvas_width} × ${scene.canvas_height}`;
  applySceneStage(document.querySelector('#scene-stage'), scene, currentSlide());
  renderBackgroundControls();
  renderGuides();
  renderElements();
  renderSlides();
  renderInspector();
  renderHistoryControls();
}

function addElement(type) {
  recordHistory();
  const slide = currentSlide();
  const element = createElement(type, state.scene, slide);
  slide.elements.push(element);
  state.selectedElementId = element.id;
  touchScene(state.scene);
  scheduleAutosave();
  render();
  if (type === 'table') void loadCatalogProducts();
  if (MEDIA_ELEMENT_TYPES.has(type) && state.mediaStatus === 'idle') void loadMediaAssets();
}

function duplicateSelectedElement() {
  const element = selectedElement();
  if (!element) return;
  recordHistory();
  const copy = duplicateElement(state.scene, currentSlide(), element.id);
  if (!copy) return;
  state.selectedElementId = copy.id;
  scheduleAutosave();
  render();
  showMessage('Элемент продублирован.');
}

function updateSelected(mutator, { historyKey = null } = {}) {
  const element = selectedElement();
  if (!element) return;
  recordHistory(historyKey);
  mutator(element);
  element.x = clamp(element.x, 0, state.scene.canvas_width - element.width);
  element.y = clamp(element.y, 0, state.scene.canvas_height - element.height);
  element.width = clamp(element.width, 40, state.scene.canvas_width - element.x);
  element.height = clamp(element.height, 40, state.scene.canvas_height - element.y);
  touchScene(state.scene);
  scheduleAutosave();
  renderElements();
  renderInspector();
}

function closeHistoryOnChange(selector) {
  const control = document.querySelector(selector);
  control?.addEventListener('change', closeHistoryGroup);
  control?.addEventListener('blur', closeHistoryGroup);
}

function bindTableInspector() {
  document.querySelector('#table-active-only').addEventListener('change', (event) => updateSelected((element) => {
    if (element.type === 'table') element.table.active_only = event.target.checked;
  }));
  document.querySelector('#table-row-limit').addEventListener('input', (event) => updateSelected((element) => {
    if (element.type === 'table') element.table.row_limit = Math.min(50, Math.max(1, Number(event.target.value) || 1));
  }, { historyKey: 'table-row-limit' }));
  closeHistoryOnChange('#table-row-limit');
  document.querySelector('#table-volumes').addEventListener('change', (event) => updateSelected((element) => {
    if (element.type === 'table') element.table.volumes_l = parseTargetVolumes(event.target.value);
  }));
  [
    ['#table-show-producer', 'show_producer'],
    ['#table-show-strength', 'show_strength'],
    ['#table-show-color', 'show_color'],
    ['#table-show-filtration', 'show_filtration']
  ].forEach(([selector, key]) => {
    document.querySelector(selector).addEventListener('change', (event) => updateSelected((element) => {
      if (element.type === 'table') element.table[key] = event.target.checked;
    }));
  });
  document.querySelector('#table-refresh-catalog').addEventListener('click', () => void loadCatalogProducts({ force: true }));
}

function bindMediaInspector() {
  document.querySelector('#element-media-asset').addEventListener('change', (event) => updateSelected((element) => {
    if (MEDIA_ELEMENT_TYPES.has(element.type)) element.asset_id = event.target.value;
  }));
  document.querySelector('#element-media-refresh').addEventListener('click', () => void loadMediaAssets({ force: true }));
  document.querySelector('#element-media-upload').addEventListener('click', () => {
    const element = selectedElement();
    if (!element || !MEDIA_ELEMENT_TYPES.has(element.type)) return;
    const input = document.querySelector('#element-media-upload-input');
    input.accept = mediaAcceptForTarget(element.type);
    input.click();
  });
  document.querySelector('#element-media-upload-input').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const element = selectedElement();
    if (!file || !element || !MEDIA_ELEMENT_TYPES.has(element.type)) return;
    void uploadForElement(file, element.id, element.type);
  });
}

function bindBackgroundControls() {
  document.querySelector('#slide-background-type').addEventListener('change', (event) => {
    recordHistory();
    const slide = currentSlide();
    slide.background.type = event.target.value;
    slide.background.asset_id = '';
    touchScene(state.scene);
    scheduleAutosave();
    render();
    if (slide.background.type !== 'color' && state.mediaStatus === 'idle') void loadMediaAssets();
  });
  document.querySelector('#slide-background-color').addEventListener('input', (event) => {
    recordHistory('slide-background-color');
    currentSlide().background.color = event.target.value;
    touchScene(state.scene);
    scheduleAutosave();
    applySceneStage(document.querySelector('#scene-stage'), state.scene, currentSlide());
  });
  closeHistoryOnChange('#slide-background-color');
  document.querySelector('#slide-background-asset').addEventListener('change', (event) => {
    recordHistory();
    currentSlide().background.asset_id = event.target.value;
    touchScene(state.scene);
    scheduleAutosave();
    renderElements();
    renderBackgroundControls();
  });
  document.querySelector('#slide-background-refresh').addEventListener('click', () => void loadMediaAssets({ force: true }));
  document.querySelector('#slide-background-upload').addEventListener('click', () => {
    const background = currentSlide().background;
    if (background.type === 'color') return;
    const input = document.querySelector('#slide-background-upload-input');
    input.accept = mediaAcceptForTarget(background.type);
    input.click();
  });
  document.querySelector('#slide-background-upload-input').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const slide = currentSlide();
    if (!file || slide.background.type === 'color') return;
    void uploadForBackground(file, slide.id, slide.background.type);
  });
}

function bindInspector() {
  [['#element-x', 'x'], ['#element-y', 'y'], ['#element-width', 'width'], ['#element-height', 'height']].forEach(([selector, key]) => {
    document.querySelector(selector).addEventListener('input', (event) => updateSelected((element) => { element[key] = Number(event.target.value); }, { historyKey: `geometry:${key}` }));
    closeHistoryOnChange(selector);
  });
  document.querySelector('#element-content').addEventListener('input', (event) => updateSelected((element) => { element.content = event.target.value; }, { historyKey: 'element-content' }));
  closeHistoryOnChange('#element-content');
  document.querySelector('#element-color').addEventListener('input', (event) => updateSelected((element) => { element.style.color = event.target.value; }, { historyKey: 'element-color' }));
  closeHistoryOnChange('#element-color');
  document.querySelector('#element-background').addEventListener('change', (event) => updateSelected((element) => { element.style.background = event.target.value || 'transparent'; }));
  document.querySelector('#element-font-size').addEventListener('input', (event) => updateSelected((element) => { element.style.font_size = Number(event.target.value); }, { historyKey: 'element-font-size' }));
  closeHistoryOnChange('#element-font-size');
  document.querySelector('#element-opacity').addEventListener('input', (event) => updateSelected((element) => { element.opacity = Number(event.target.value); }, { historyKey: 'element-opacity' }));
  closeHistoryOnChange('#element-opacity');
  document.querySelector('#element-variant').addEventListener('change', (event) => updateSelected((element) => { element.variant = event.target.value; }));
  document.querySelector('#element-shadow').addEventListener('change', (event) => updateSelected((element) => { element.effects.shadow = event.target.checked; }));
  document.querySelector('#element-glow').addEventListener('change', (event) => updateSelected((element) => { element.effects.glow = event.target.checked; }));
  document.querySelector('#element-entrance').addEventListener('change', (event) => updateSelected((element) => { element.animation.entrance = event.target.value; }));
  document.querySelector('#element-loop').addEventListener('change', (event) => updateSelected((element) => { element.animation.loop = event.target.value; }));
  document.querySelector('#element-exit').addEventListener('change', (event) => updateSelected((element) => { element.animation.exit = event.target.value; }));

  document.querySelector('#element-delete').addEventListener('click', () => {
    const slide = currentSlide();
    const index = slide.elements.findIndex((item) => item.id === state.selectedElementId);
    if (index < 0) return;
    recordHistory();
    slide.elements.splice(index, 1);
    state.selectedElementId = null;
    touchScene(state.scene);
    scheduleAutosave();
    render();
  });
  document.querySelector('#element-duplicate').addEventListener('click', duplicateSelectedElement);
  document.querySelector('#element-forward').addEventListener('click', () => updateSelected((element) => {
    const max = Math.max(0, ...currentSlide().elements.map((item) => item.z_index));
    element.z_index = max + 1;
  }));
  document.querySelector('#element-backward').addEventListener('click', () => updateSelected((element) => {
    element.z_index = Math.max(0, element.z_index - 1);
  }));
  bindTableInspector();
  bindMediaInspector();
}

function editableFocus() {
  return document.activeElement?.matches('input,select,textarea,[contenteditable="true"]');
}

function bindKeyboardShortcuts() {
  window.addEventListener('keydown', (event) => {
    if (state.preview) return;
    const key = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    const editing = editableFocus();

    if (command && !editing && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redoScene();
      else undoScene();
      return;
    }
    if (command && !editing && key === 'y') {
      event.preventDefault();
      redoScene();
      return;
    }
    if (command && !editing && key === 'd' && state.selectedElementId) {
      event.preventDefault();
      duplicateSelectedElement();
      return;
    }
    if (event.key === 'Delete' && state.selectedElementId && !editing) {
      event.preventDefault();
      document.querySelector('#element-delete').click();
    }
  });
}

function bindGlobalControls() {
  document.querySelectorAll('[data-add-element]').forEach((button) => {
    button.addEventListener('click', () => addElement(button.dataset.addElement));
  });
  document.querySelector('#scene-stage').addEventListener('click', () => {
    if (state.preview) return;
    state.selectedElementId = null;
    renderElements();
    renderInspector();
  });
  document.querySelector('#scene-undo').addEventListener('click', undoScene);
  document.querySelector('#scene-redo').addEventListener('click', redoScene);
  document.querySelector('#scene-save').addEventListener('click', () => void persistScene({ notify: true }));
  document.querySelector('#scene-name').addEventListener('input', (event) => {
    recordHistory('scene-name');
    state.scene.name = event.target.value;
    touchScene(state.scene);
    scheduleAutosave();
  });
  closeHistoryOnChange('#scene-name');
  document.querySelector('#scene-display-count').addEventListener('change', (event) => {
    recordHistory();
    setDisplayCount(state.scene, Number(event.target.value));
    scheduleAutosave();
    render();
  });
  document.querySelector('#add-slide').addEventListener('click', () => {
    recordHistory();
    appendSlide(state.scene);
    state.selectedElementId = null;
    scheduleAutosave();
    render();
  });
  document.querySelector('#scene-preview-toggle').addEventListener('click', (event) => {
    state.preview = !state.preview;
    closeHistoryGroup();
    event.target.textContent = state.preview ? 'Вернуться в редактор' : 'Предпросмотр';
    render();
  });
  bindKeyboardShortcuts();
  window.addEventListener('beforeunload', (event) => {
    if (state.dirtyVersion <= state.savedVersion && !state.saving) return;
    event.preventDefault();
    event.returnValue = '';
  });
  bindBackgroundControls();
}

function syncClockTimer() {
  const hasClock = currentSlide().elements.some((element) => element.type === 'clock');
  if (!hasClock) {
    window.clearTimeout(state.clockTimer);
    state.clockTimer = null;
    return;
  }
  if (state.clockTimer) return;
  const now = new Date();
  const delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 20;
  state.clockTimer = window.setTimeout(() => {
    state.clockTimer = null;
    if (currentSlide().elements.some((element) => element.type === 'clock')) renderElements();
  }, Math.max(1000, delay));
}

export async function initialiseSceneEditor() {
  const sceneId = new URLSearchParams(window.location.search).get('id');
  try {
    state.scene = sceneId ? await getScene(sceneId) : await createSceneRemote(createScene());
    if (!sceneId) window.history.replaceState(null, '', `/scene-editor?id=${encodeURIComponent(state.scene.id)}`);
  } catch (error) {
    setSaveState('Ошибка загрузки');
    showMessage(error?.message || 'Не удалось открыть сцену.', true);
    return;
  }
  state.dirtyVersion = 0;
  state.savedVersion = 0;
  state.saveConflict = false;
  history.reset();
  bindInspector();
  bindGlobalControls();
  setSaveState('Сохранено');
  render();
  ensureDynamicDataForScene();
}
