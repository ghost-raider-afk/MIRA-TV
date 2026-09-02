import { API } from '../core/config.js';
import { api } from '../core/api.js';
import {
  applySceneElementGeometry,
  applySceneStage,
  createSceneBackgroundNode,
  createSceneElementNode,
  renderSceneLayer,
  SCENE_ELEMENT_LABELS,
  updateSceneClockElements,
  updateSceneWeatherElements
} from '../scene-runtime/renderer.js';
import { ScenePlaybackRuntime } from '../scene-runtime/playback.js';
import {
  appendSlide,
  createElement,
  createScene,
  duplicateElement,
  duplicateSlide,
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
const CONTENT_ELEMENT_TYPES = new Set(['text', 'table', 'image', 'logo', 'video']);
const TEXT_STYLE_ELEMENT_TYPES = new Set(['text', 'table', 'weather', 'clock']);
const DATA_ELEMENT_TYPES = new Set(['table', 'image', 'logo', 'video', 'weather']);
const QUANTITY_PRICING_MODELS = new Set(['proportional', 'weight']);
const history = createSceneHistory({ limit: 100 });
const VARIANT_OPTIONS = Object.freeze({
  weather: [
    ['compact', 'Компактный'],
    ['temperature', 'Только температура'],
    ['forecast', 'Прогноз'],
    ['minimal', 'Минималистичный']
  ],
  clock: [
    ['digital', 'Цифровой'],
    ['minimal', 'Только время'],
    ['seconds', 'С секундами'],
    ['date', 'Время и полная дата'],
    ['analog', 'Аналоговый']
  ],
  default: [['default', 'По умолчанию']]
});

const state = {
  scene: null,
  selectedElementId: null,
  clipboardElement: null,
  inspectorTab: 'object',
  preview: false,
  catalogItems: [],
  catalogClasses: [],
  catalogStatus: 'idle',
  catalogError: '',
  mediaAssets: [],
  mediaStatus: 'idle',
  mediaError: '',
  mediaUploading: false,
  weatherByElement: {},
  weatherStatus: {},
  weatherRequestVersion: {},
  autosaveTimer: null,
  clockTimer: null,
  dirtyVersion: 0,
  savedVersion: 0,
  saving: null,
  saveQueued: false,
  saveConflict: false
};

let previewRuntime = null;
let contextMenu = null;

function currentSlide() {
  return state.scene.slides.find((slide) => slide.id === state.scene.active_slide_id) || state.scene.slides[0];
}

function displayedSlide() {
  return state.preview && previewRuntime?.enabled ? previewRuntime.currentSlide : currentSlide();
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

function weatherLocation(element) {
  return String(element?.weather?.location || '').trim();
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

function ensureWeatherForSlide(slide) {
  for (const element of slide?.elements || []) {
    if (element.type === 'weather') void loadWeatherForElement(element);
  }
}

function ensureDynamicDataForScene() {
  if (sceneUsesCatalog(state.scene) && state.catalogStatus === 'idle') void loadCatalogData();
  if (sceneUsesMedia(state.scene) && state.mediaStatus === 'idle') void loadMediaAssets();
  ensureWeatherForSlide(displayedSlide());
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

function sceneRendererContext() {
  return {
    catalogItems: state.catalogItems,
    catalogStatus: state.catalogStatus,
    catalogError: state.catalogError,
    mediaAssets: state.mediaAssets,
    weatherByElement: state.weatherByElement,
    autoplayMedia: state.preview,
    now: new Date()
  };
}

function elementNode(elementId) {
  const layer = document.querySelector('#scene-elements-layer');
  if (!layer || !elementId) return null;
  return [...layer.querySelectorAll('.scene-render-element[data-element-id]')]
    .find((node) => node.dataset.elementId === elementId) || null;
}

function refreshBackgroundNode() {
  if (state.preview && previewRuntime?.enabled) {
    previewRuntime.updateContext(sceneRendererContext());
    return;
  }
  const layer = document.querySelector('#scene-elements-layer');
  if (!layer) return;
  layer.querySelector('.scene-render-background')?.remove();
  const background = createSceneBackgroundNode(currentSlide(), sceneRendererContext());
  if (background) layer.prepend(background);
}

function rebuildElementNode(element) {
  if (!element || state.preview) return;
  const existing = elementNode(element.id);
  if (!existing) return;
  const replacement = createSceneElementNode(element, state.scene, sceneRendererContext());
  decorateEditorElement(replacement, element);
  existing.replaceWith(replacement);
}

function refreshVisibleElements(predicate) {
  if (state.preview && previewRuntime?.enabled) {
    previewRuntime.updateContext(sceneRendererContext());
    return;
  }
  for (const element of currentSlide()?.elements || []) {
    if (predicate(element)) rebuildElementNode(element);
  }
  syncClockTimer();
}

async function loadCatalogData({ force = false } = {}) {
  if (!force && (state.catalogStatus === 'loading' || state.catalogStatus === 'ready')) return;
  state.catalogStatus = 'loading';
  state.catalogError = '';
  refreshVisibleElements((element) => element.type === 'table');
  renderInspector();
  try {
    const [items, classes] = await Promise.all([
      api.get(API.catalogItems),
      api.get(API.catalogClasses)
    ]);
    state.catalogItems = Array.isArray(items) ? items : [];
    state.catalogClasses = Array.isArray(classes) ? classes : [];
    state.catalogStatus = 'ready';
  } catch (error) {
    state.catalogItems = [];
    state.catalogClasses = [];
    state.catalogStatus = 'error';
    state.catalogError = error?.message || 'Не удалось загрузить каталог';
  }
  refreshVisibleElements((element) => element.type === 'table');
  renderInspector();
}

function catalogClassByCode(code) {
  const normalized = String(code || '');
  return state.catalogClasses.find((item) => item?.code === normalized) || null;
}

function catalogClassSupportsQuantities(catalogClass) {
  return Boolean(catalogClass && QUANTITY_PRICING_MODELS.has(catalogClass.pricing_model));
}

function catalogClassLabel(catalogClass) {
  const parent = state.catalogClasses.find((item) => Number(item?.id) === Number(catalogClass?.parent_id));
  return parent ? `${parent.name} · ${catalogClass.name}` : catalogClass.name;
}

function fillCatalogClassSelect(select, selectedCode) {
  if (!select) return;
  const options = [new Option('Все классы', '')];
  const classes = state.catalogClasses
    .filter((item) => item?.active !== false && item?.code)
    .slice()
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.name).localeCompare(String(b.name), 'ru'));
  for (const catalogClass of classes) options.push(new Option(catalogClassLabel(catalogClass), catalogClass.code));
  if (selectedCode && !options.some((option) => option.value === selectedCode)) options.push(new Option(selectedCode, selectedCode));
  select.replaceChildren(...options);
  select.value = options.some((option) => option.value === selectedCode) ? selectedCode : '';
}

async function loadMediaAssets({ force = false } = {}) {
  if (!force && (state.mediaStatus === 'loading' || state.mediaStatus === 'ready')) return;
  state.mediaStatus = 'loading';
  state.mediaError = '';
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
  refreshVisibleElements((element) => MEDIA_ELEMENT_TYPES.has(element.type));
  refreshBackgroundNode();
  renderInspector();
  renderBackgroundControls();
}

async function loadWeatherForElement(element, { force = false } = {}) {
  if (!element || element.type !== 'weather') return;
  const location = weatherLocation(element);
  const id = element.id;
  if (location.length < 2) {
    delete state.weatherByElement[id];
    state.weatherStatus[id] = { state: 'idle', location, error: '' };
    if (state.preview && previewRuntime?.enabled) previewRuntime.updateContext(sceneRendererContext(), { weatherOnly: true });
    else updateSceneWeatherElements(document.querySelector('#scene-elements-layer'), currentSlide(), { weatherByElement: state.weatherByElement });
    if (state.selectedElementId === id) renderWeatherInspector(element);
    return;
  }

  const current = state.weatherStatus[id];
  if (!force && current?.location === location && ['loading', 'ready'].includes(current.state)) return;
  const version = (state.weatherRequestVersion[id] || 0) + 1;
  state.weatherRequestVersion[id] = version;
  state.weatherStatus[id] = { state: 'loading', location, error: '' };
  delete state.weatherByElement[id];
  if (state.preview && previewRuntime?.enabled) previewRuntime.updateContext(sceneRendererContext(), { weatherOnly: true });
  else updateSceneWeatherElements(document.querySelector('#scene-elements-layer'), currentSlide(), { weatherByElement: state.weatherByElement });
  if (state.selectedElementId === id) renderWeatherInspector(element);

  try {
    const data = await api.get(`${API.weather}?location=${encodeURIComponent(location)}`);
    if (state.weatherRequestVersion[id] !== version || weatherLocation(findElement(id)) !== location) return;
    state.weatherByElement[id] = data;
    state.weatherStatus[id] = { state: 'ready', location, error: '' };
  } catch (error) {
    if (state.weatherRequestVersion[id] !== version || weatherLocation(findElement(id)) !== location) return;
    delete state.weatherByElement[id];
    state.weatherStatus[id] = { state: 'error', location, error: error?.message || 'Погода недоступна' };
  }

  if (state.preview && previewRuntime?.enabled) {
    previewRuntime.updateContext(sceneRendererContext(), { weatherOnly: true });
  } else {
    const slide = currentSlide();
    if ((slide.elements || []).some((item) => item.id === id)) {
      updateSceneWeatherElements(document.querySelector('#scene-elements-layer'), slide, { weatherByElement: state.weatherByElement });
    }
  }
  if (state.selectedElementId === id) renderWeatherInspector(findElement(id));
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
      rebuildElementNode(element);
      showMessage(`${SCENE_ELEMENT_LABELS[targetType]} обновлён.`);
    }
  } catch (error) {
    showMessage(error?.message || 'Не удалось загрузить медиафайл.', true);
  } finally {
    state.mediaUploading = false;
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
      refreshBackgroundNode();
      showMessage('Фон слайда обновлён.');
    }
  } catch (error) {
    showMessage(error?.message || 'Не удалось загрузить фон.', true);
  } finally {
    state.mediaUploading = false;
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

function clearSelectionVisual() {
  document.querySelectorAll('.scene-render-element.is-selected').forEach((item) => item.classList.remove('is-selected'));
}

function markSelected(node, element) {
  if (!node || !element) return;
  state.selectedElementId = element.id;
  clearSelectionVisual();
  node.classList.add('is-selected');
  renderInspector();
  if (MEDIA_ELEMENT_TYPES.has(element.type) && state.mediaStatus === 'idle') void loadMediaAssets();
  if (element.type === 'weather') void loadWeatherForElement(element);
}

function installDrag(node, element) {
  node.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || state.preview || event.target.closest('.scene-resize-handle')) return;
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
    if (event.button !== 0 || state.preview) return;
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
    markSelected(node, element);
  });
  installDrag(node, element);
}

function renderElements() {
  if (state.preview && previewRuntime?.enabled) {
    previewRuntime.updateContext(sceneRendererContext());
    return;
  }
  const layer = document.querySelector('#scene-elements-layer');
  renderSceneLayer(layer, {
    scene: state.scene,
    slide: currentSlide(),
    context: sceneRendererContext(),
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
    appendTextElement(button, 'small', `${Math.round(slide.duration_ms / 1000)} сек · ${slide.transition} · ${slide.elements.length} эл.`);
    button.addEventListener('click', () => {
      state.scene.active_slide_id = slide.id;
      state.selectedElementId = null;
      state.inspectorTab = 'object';
      closeHistoryGroup();
      render();
      ensureDynamicDataForScene();
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
        state.inspectorTab = 'object';
        scheduleAutosave();
        render();
        ensureDynamicDataForScene();
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
  const appearanceSection = document.querySelector('#table-appearance-settings');
  const isTable = element?.type === 'table';
  section.classList.toggle('is-hidden', !isTable);
  appearanceSection.classList.toggle('is-hidden', !isTable);
  if (!isTable) return;
  element.table = normaliseTableConfig(element.table || {});
  const appearance = element.table.appearance;
  const catalogClass = catalogClassByCode(element.table.class_code);
  const supportsQuantities = catalogClassSupportsQuantities(catalogClass);
  const classSelect = document.querySelector('#table-class-code');
  fillCatalogClassSelect(classSelect, element.table.class_code);
  document.querySelector('#table-active-only').checked = element.table.active_only;
  document.querySelector('#table-row-limit').value = element.table.row_limit;
  document.querySelector('#table-show-metadata').checked = element.table.show_metadata;
  document.querySelector('#table-show-description').checked = element.table.show_description;
  const priceLayout = document.querySelector('#table-price-layout');
  const quantitiesOption = [...priceLayout.options].find((option) => option.value === 'quantities');
  if (quantitiesOption) quantitiesOption.disabled = !supportsQuantities;
  priceLayout.value = element.table.price_layout;
  const quantitiesField = document.querySelector('#table-quantities-field');
  quantitiesField.classList.toggle('is-hidden', element.table.price_layout !== 'quantities');
  document.querySelector('#table-quantities').value = element.table.quantities.map((value) => String(value).replace('.', ',')).join('; ');
  const unit = catalogClass?.default_unit || element.table.quantity_unit || '';
  document.querySelector('#table-quantity-help').textContent = unit
    ? `Значения через точку с запятой, единица: ${unit}. Цена рассчитывается от базовой цены и базового количества позиции.`
    : 'Значения через точку с запятой. Цена рассчитывается от базовой цены и базового количества позиции.';
  document.querySelector('#table-preset').value = appearance.preset;
  document.querySelector('#table-density').value = appearance.density;
  document.querySelector('#table-header-style').value = appearance.header_style;
  document.querySelector('#table-price-style').value = appearance.price_style;
  document.querySelector('#table-accent-color').value = appearance.accent_color;
  document.querySelector('#table-show-title').checked = appearance.show_title;
  document.querySelector('#table-row-dividers').checked = appearance.row_dividers;
  document.querySelector('#table-zebra').checked = appearance.zebra;
  const status = document.querySelector('#table-catalog-status');
  if (state.catalogStatus === 'loading' || state.catalogStatus === 'idle') status.textContent = 'Каталог загружается…';
  else if (state.catalogStatus === 'error') status.textContent = state.catalogError || 'Каталог недоступен';
  else status.textContent = `Каталог подключён · ${state.catalogItems.length} позиций · ${state.catalogClasses.length} классов`;
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

function renderWeatherInspector(element) {
  const section = document.querySelector('#weather-settings');
  const isWeather = element?.type === 'weather';
  section.classList.toggle('is-hidden', !isWeather);
  if (!isWeather) return;
  element.weather = element.weather && typeof element.weather === 'object' ? element.weather : { location: '' };
  const location = weatherLocation(element);
  document.querySelector('#weather-location').value = location;
  const status = state.weatherStatus[element.id];
  const output = document.querySelector('#weather-status');
  if (!location) output.textContent = 'Укажите город — запросы к погодному сервису пока не выполняются.';
  else if (status?.state === 'loading') output.textContent = `Загрузка погоды: ${location}…`;
  else if (status?.state === 'error') output.textContent = status.error || 'Погода временно недоступна.';
  else if (status?.state === 'ready') {
    const data = state.weatherByElement[element.id];
    output.textContent = `${data?.location || location}${data?.current?.label ? ` · ${data.current.label}` : ''}${data?.stale ? ' · последние данные' : ''}`;
  } else output.textContent = `Готово к загрузке: ${location}`;
  document.querySelector('#weather-refresh').disabled = status?.state === 'loading' || location.length < 2;
}

function renderVariantControl(element) {
  const select = document.querySelector('#element-variant');
  const variants = VARIANT_OPTIONS[element?.type] || VARIANT_OPTIONS.default;
  const options = variants.map(([value, label]) => new Option(label, value));
  if (element?.variant && !variants.some(([value]) => value === element.variant)) {
    options.unshift(new Option('По умолчанию', element.variant));
  }
  select.replaceChildren(...options);
  select.value = element?.variant || variants[0][0];
}

function inspectorTabsForElement(element) {
  if (!element) return [];
  const tabs = ['object', 'format'];
  if (DATA_ELEMENT_TYPES.has(element.type)) tabs.push('data');
  tabs.push('animation');
  return tabs;
}

function renderInspectorTabs(element) {
  const tabsRoot = document.querySelector('#inspector-tabs');
  if (!element) {
    tabsRoot.classList.add('is-hidden');
    document.querySelectorAll('[data-inspector-panel]').forEach((panel) => panel.classList.add('is-hidden'));
    return;
  }
  const available = inspectorTabsForElement(element);
  if (!available.includes(state.inspectorTab)) state.inspectorTab = 'object';
  tabsRoot.classList.remove('is-hidden');
  tabsRoot.querySelectorAll('[data-inspector-tab]').forEach((button) => {
    const visible = available.includes(button.dataset.inspectorTab);
    button.classList.toggle('is-hidden', !visible);
    button.classList.toggle('active', visible && button.dataset.inspectorTab === state.inspectorTab);
    button.setAttribute('aria-selected', String(visible && button.dataset.inspectorTab === state.inspectorTab));
  });
  document.querySelectorAll('[data-inspector-panel]').forEach((panel) => {
    panel.classList.toggle('is-hidden', panel.dataset.inspectorPanel !== state.inspectorTab);
  });
}

function renderContextualInspectorFields(element) {
  document.querySelector('#element-content-field').classList.toggle('is-hidden', !CONTENT_ELEMENT_TYPES.has(element.type));
  document.querySelector('#element-variant-field').classList.toggle('is-hidden', !['weather', 'clock'].includes(element.type));
  document.querySelector('#element-color-field').classList.toggle('is-hidden', !TEXT_STYLE_ELEMENT_TYPES.has(element.type));
  document.querySelector('#text-format-settings').classList.toggle('is-hidden', !TEXT_STYLE_ELEMENT_TYPES.has(element.type));
  document.querySelector('#media-format-settings').classList.toggle('is-hidden', !MEDIA_ELEMENT_TYPES.has(element.type));
}

function renderSlideInspector() {
  const slide = currentSlide();
  document.querySelector('#slide-name').value = slide.name || '';
  document.querySelector('#slide-duration').value = String(Math.max(1, Math.round((Number(slide.duration_ms) || 10000) / 1000)));
  document.querySelector('#slide-transition').value = slide.transition || 'fade';
  document.querySelector('#slide-delete').disabled = state.scene.slides.length <= 1;
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
  const slideFields = document.querySelector('#slide-inspector-fields');
  const elementFields = document.querySelector('#inspector-fields');
  slideFields.classList.toggle('is-hidden', Boolean(element));
  elementFields.classList.toggle('is-hidden', !element);
  document.querySelector('#inspector-title').textContent = element ? SCENE_ELEMENT_LABELS[element.type] : 'Слайд';
  renderInspectorTabs(element);
  if (!element) {
    renderSlideInspector();
    renderTableInspector(null);
    renderMediaInspector(null);
    renderWeatherInspector(null);
    return;
  }
  renderContextualInspectorFields(element);
  renderInspectorGeometry();
  document.querySelector('#element-content').value = element.content || '';
  document.querySelector('#element-content-label').textContent = element.type === 'table' ? 'Заголовок' : MEDIA_ELEMENT_TYPES.has(element.type) ? 'Подпись' : 'Содержимое';
  document.querySelector('#element-color').value = element.style.color || '#ffffff';
  document.querySelector('#element-background').value = element.style.background || 'transparent';
  document.querySelector('#element-font-size').value = element.style.font_size || 40;
  document.querySelector('#element-font-weight').value = String(element.style.font_weight || 400);
  document.querySelector('#element-text-align').value = element.style.text_align || 'center';
  document.querySelector('#element-vertical-align').value = element.style.vertical_align || 'center';
  document.querySelector('#element-line-height').value = element.style.line_height || 1.06;
  document.querySelector('#element-letter-spacing').value = element.style.letter_spacing || 0;
  document.querySelector('#element-radius').value = element.style.radius || 0;
  document.querySelector('#element-border-width').value = element.style.border_width || 0;
  document.querySelector('#element-border-color').value = /^#[0-9a-f]{6}$/i.test(element.style.border_color || '') ? element.style.border_color : '#ffffff';
  document.querySelector('#element-opacity').value = element.opacity ?? 1;
  document.querySelector('#element-blur').value = element.effects.blur || 0;
  if (MEDIA_ELEMENT_TYPES.has(element.type)) {
    element.media = element.media && typeof element.media === 'object' ? element.media : { fit: element.type === 'logo' ? 'contain' : 'cover', position: 'center' };
    document.querySelector('#element-media-fit').value = element.media.fit || (element.type === 'logo' ? 'contain' : 'cover');
    document.querySelector('#element-media-position').value = element.media.position || 'center';
  }
  renderVariantControl(element);
  document.querySelector('#element-shadow').checked = Boolean(element.effects.shadow);
  document.querySelector('#element-glow').checked = Boolean(element.effects.glow);
  document.querySelector('#element-entrance').value = element.animation.entrance || 'none';
  document.querySelector('#element-loop').value = element.animation.loop || 'none';
  document.querySelector('#element-exit').value = element.animation.exit || 'none';
  renderTableInspector(element);
  renderMediaInspector(element);
  renderWeatherInspector(element);
}

function render() {
  const scene = state.scene;
  document.body.classList.toggle('scene-preview-mode', state.preview);
  document.querySelector('#scene-name').value = scene.name;
  document.querySelector('#scene-display-count').value = String(scene.display_count);
  document.querySelector('#scene-resolution-label').textContent = `${scene.canvas_width} × ${scene.canvas_height}`;
  applySceneStage(document.querySelector('#scene-stage'), scene, displayedSlide());
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
  state.inspectorTab = 'object';
  touchScene(state.scene);
  scheduleAutosave();
  render();
  if (type === 'table') void loadCatalogData();
  if (MEDIA_ELEMENT_TYPES.has(type) && state.mediaStatus === 'idle') void loadMediaAssets();
  if (type === 'weather') void loadWeatherForElement(element);
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
  if (copy.type === 'weather') void loadWeatherForElement(copy);
  showMessage('Элемент продублирован.');
}

function duplicateCurrentSlide() {
  const slide = currentSlide();
  if (!slide) return;
  recordHistory();
  const copy = duplicateSlide(state.scene, slide.id);
  if (!copy) return;
  state.selectedElementId = null;
  state.inspectorTab = 'object';
  scheduleAutosave();
  render();
  ensureDynamicDataForScene();
  showMessage('Слайд продублирован.');
}

function removeCurrentSlide() {
  if (state.scene.slides.length <= 1) return;
  const slide = currentSlide();
  recordHistory();
  if (!removeSlide(state.scene, slide.id)) return;
  state.selectedElementId = null;
  state.inspectorTab = 'object';
  scheduleAutosave();
  render();
  ensureDynamicDataForScene();
  showMessage('Слайд удалён.');
}

function patchSelectedElement(element, refresh = 'style') {
  if (!element || state.preview) return;
  if (refresh === 'content') {
    rebuildElementNode(element);
    return;
  }
  const node = elementNode(element.id);
  const stage = document.querySelector('#scene-stage');
  const stageWidth = stage?.getBoundingClientRect().width || state.scene.canvas_width;
  if (node) applySceneElementGeometry(node, element, state.scene, stageWidth);
  if (refresh === 'geometry') renderInspectorGeometry();
}

function updateSelected(mutator, { historyKey = null, refresh = 'style' } = {}) {
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
  patchSelectedElement(element, refresh);
  if (element.type === 'clock') syncClockTimer();
}

function deleteSelectedElement({ notify = false } = {}) {
  const slide = currentSlide();
  const index = slide.elements.findIndex((item) => item.id === state.selectedElementId);
  if (index < 0) return false;
  recordHistory();
  slide.elements.splice(index, 1);
  state.selectedElementId = null;
  state.inspectorTab = 'object';
  touchScene(state.scene);
  scheduleAutosave();
  renderElements();
  renderInspector();
  if (notify) showMessage('Элемент удалён.');
  return true;
}

function copySelectedElement({ notify = false } = {}) {
  const element = selectedElement();
  if (!element) return false;
  state.clipboardElement = structuredClone(element);
  if (notify) showMessage('Элемент скопирован.');
  return true;
}

function pasteClipboardElement() {
  if (!state.clipboardElement) return false;
  const slide = currentSlide();
  recordHistory();
  const copy = structuredClone(state.clipboardElement);
  copy.id = `element-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  copy.x = clamp((Number(copy.x) || 0) + 32, 0, Math.max(0, state.scene.canvas_width - copy.width));
  copy.y = clamp((Number(copy.y) || 0) + 32, 0, Math.max(0, state.scene.canvas_height - copy.height));
  copy.z_index = Math.max(0, ...slide.elements.map((item) => Number(item.z_index) || 0)) + 1;
  slide.elements.push(copy);
  state.selectedElementId = copy.id;
  state.clipboardElement = structuredClone(copy);
  touchScene(state.scene);
  scheduleAutosave();
  renderElements();
  renderInspector();
  if (copy.type === 'weather') void loadWeatherForElement(copy);
  showMessage('Элемент вставлен.');
  return true;
}

function cutSelectedElement() {
  if (!copySelectedElement()) return false;
  return deleteSelectedElement({ notify: true });
}

function closeHistoryOnChange(selector) {
  const control = document.querySelector(selector);
  control?.addEventListener('change', closeHistoryGroup);
  control?.addEventListener('blur', closeHistoryGroup);
}

function bindSlideInspector() {
  const name = document.querySelector('#slide-name');
  name.addEventListener('input', (event) => {
    const value = String(event.target.value || '').slice(0, 120);
    if (!value.trim() || value === currentSlide().name) return;
    recordHistory('slide-name');
    currentSlide().name = value;
    touchScene(state.scene);
    scheduleAutosave();
    renderSlides();
  });
  name.addEventListener('blur', (event) => {
    closeHistoryGroup();
    const value = String(event.target.value || '').trim();
    if (!value) {
      event.target.value = currentSlide().name;
      return;
    }
    if (value === currentSlide().name) return;
    recordHistory();
    currentSlide().name = value;
    touchScene(state.scene);
    scheduleAutosave();
    renderSlides();
  });

  document.querySelector('#slide-duration').addEventListener('change', (event) => {
    const seconds = Math.min(3600, Math.max(1, Math.round(Number(event.target.value) || 1)));
    event.target.value = String(seconds);
    const duration = seconds * 1000;
    if (duration === currentSlide().duration_ms) return;
    recordHistory();
    currentSlide().duration_ms = duration;
    touchScene(state.scene);
    scheduleAutosave();
    renderSlides();
  });

  document.querySelector('#slide-transition').addEventListener('change', (event) => {
    const value = event.target.value;
    if (value === currentSlide().transition) return;
    recordHistory();
    currentSlide().transition = value;
    touchScene(state.scene);
    scheduleAutosave();
    renderSlides();
  });

  document.querySelector('#slide-duplicate').addEventListener('click', duplicateCurrentSlide);
  document.querySelector('#slide-delete').addEventListener('click', removeCurrentSlide);
}

function bindInspectorTabs() {
  document.querySelectorAll('[data-inspector-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const element = selectedElement();
      if (!element) return;
      const tab = button.dataset.inspectorTab;
      if (!inspectorTabsForElement(element).includes(tab)) return;
      state.inspectorTab = tab;
      renderInspectorTabs(element);
    });
  });
}

function bindTableInspector() {
  document.querySelector('#table-class-code').addEventListener('change', (event) => {
    const code = event.target.value;
    const catalogClass = catalogClassByCode(code);
    updateSelected((element) => {
      if (element.type !== 'table') return;
      element.table.class_code = code;
      if (catalogClass?.default_unit) element.table.quantity_unit = catalogClass.default_unit;
      if (!catalogClassSupportsQuantities(catalogClass)) element.table.price_layout = 'single';
    }, { refresh: 'content' });
    renderTableInspector(selectedElement());
  });
  document.querySelector('#table-price-layout').addEventListener('change', (event) => {
    const element = selectedElement();
    if (!element || element.type !== 'table') return;
    const requested = event.target.value;
    const catalogClass = catalogClassByCode(element.table.class_code);
    const value = requested === 'quantities' && !catalogClassSupportsQuantities(catalogClass) ? 'single' : requested;
    event.target.value = value;
    updateSelected((target) => {
      if (target.type === 'table') target.table.price_layout = value;
    }, { refresh: 'content' });
    renderTableInspector(selectedElement());
  });
  document.querySelector('#table-active-only').addEventListener('change', (event) => updateSelected((element) => {
    if (element.type === 'table') element.table.active_only = event.target.checked;
  }, { refresh: 'content' }));
  document.querySelector('#table-row-limit').addEventListener('input', (event) => updateSelected((element) => {
    if (element.type === 'table') element.table.row_limit = Math.min(50, Math.max(1, Number(event.target.value) || 1));
  }, { historyKey: 'table-row-limit', refresh: 'content' }));
  closeHistoryOnChange('#table-row-limit');
  document.querySelector('#table-quantities').addEventListener('change', (event) => updateSelected((element) => {
    if (element.type !== 'table') return;
    const quantities = parseTargetVolumes(event.target.value);
    element.table.quantities = quantities;
    element.table.volumes_l = [...quantities];
  }, { refresh: 'content' }));
  document.querySelector('#table-show-metadata').addEventListener('change', (event) => updateSelected((element) => {
    if (element.type === 'table') element.table.show_metadata = event.target.checked;
  }, { refresh: 'content' }));
  document.querySelector('#table-show-description').addEventListener('change', (event) => updateSelected((element) => {
    if (element.type === 'table') element.table.show_description = event.target.checked;
  }, { refresh: 'content' }));
  [
    ['#table-preset', 'preset'],
    ['#table-density', 'density'],
    ['#table-header-style', 'header_style'],
    ['#table-price-style', 'price_style']
  ].forEach(([selector, key]) => {
    document.querySelector(selector).addEventListener('change', (event) => updateSelected((element) => {
      if (element.type === 'table') element.table.appearance[key] = event.target.value;
    }, { refresh: 'content' }));
  });
  document.querySelector('#table-accent-color').addEventListener('input', (event) => updateSelected((element) => {
    if (element.type === 'table') element.table.appearance.accent_color = event.target.value;
  }, { historyKey: 'table-accent-color', refresh: 'content' }));
  closeHistoryOnChange('#table-accent-color');
  [
    ['#table-show-title', 'show_title'],
    ['#table-row-dividers', 'row_dividers'],
    ['#table-zebra', 'zebra']
  ].forEach(([selector, key]) => {
    document.querySelector(selector).addEventListener('change', (event) => updateSelected((element) => {
      if (element.type === 'table') element.table.appearance[key] = event.target.checked;
    }, { refresh: 'content' }));
  });
  document.querySelector('#table-refresh-catalog').addEventListener('click', () => void loadCatalogData({ force: true }));
}

function bindMediaInspector() {
  document.querySelector('#element-media-asset').addEventListener('change', (event) => updateSelected((element) => {
    if (MEDIA_ELEMENT_TYPES.has(element.type)) element.asset_id = event.target.value;
  }, { refresh: 'content' }));
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

function bindWeatherInspector() {
  document.querySelector('#weather-location').addEventListener('change', (event) => {
    const element = selectedElement();
    if (!element || element.type !== 'weather') return;
    const value = String(event.target.value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (value === weatherLocation(element)) return;
    delete state.weatherByElement[element.id];
    delete state.weatherStatus[element.id];
    updateSelected((target) => {
      if (target.type !== 'weather') return;
      target.weather = target.weather && typeof target.weather === 'object' ? target.weather : { location: '' };
      target.weather.location = value;
    }, { refresh: 'content' });
    void loadWeatherForElement(findElement(element.id), { force: true });
  });
  document.querySelector('#weather-refresh').addEventListener('click', () => {
    const element = selectedElement();
    if (element?.type === 'weather') void loadWeatherForElement(element, { force: true });
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
    applySceneStage(document.querySelector('#scene-stage'), state.scene, slide);
    refreshBackgroundNode();
    renderBackgroundControls();
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
    refreshBackgroundNode();
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
  bindSlideInspector();
  bindInspectorTabs();
  [['#element-x', 'x'], ['#element-y', 'y'], ['#element-width', 'width'], ['#element-height', 'height']].forEach(([selector, key]) => {
    document.querySelector(selector).addEventListener('input', (event) => updateSelected((element) => { element[key] = Number(event.target.value); }, { historyKey: `geometry:${key}`, refresh: 'geometry' }));
    closeHistoryOnChange(selector);
  });
  document.querySelector('#element-content').addEventListener('input', (event) => updateSelected((element) => { element.content = event.target.value; }, { historyKey: 'element-content', refresh: 'content' }));
  closeHistoryOnChange('#element-content');
  document.querySelector('#element-color').addEventListener('input', (event) => updateSelected((element) => { element.style.color = event.target.value; }, { historyKey: 'element-color' }));
  closeHistoryOnChange('#element-color');
  document.querySelector('#element-background').addEventListener('change', (event) => updateSelected((element) => { element.style.background = event.target.value || 'transparent'; }));
  document.querySelector('#element-font-size').addEventListener('input', (event) => updateSelected((element) => { element.style.font_size = Number(event.target.value); }, { historyKey: 'element-font-size' }));
  closeHistoryOnChange('#element-font-size');
  document.querySelector('#element-font-weight').addEventListener('change', (event) => updateSelected((element) => { element.style.font_weight = Number(event.target.value); }));
  document.querySelector('#element-text-align').addEventListener('change', (event) => updateSelected((element) => { element.style.text_align = event.target.value; }));
  document.querySelector('#element-vertical-align').addEventListener('change', (event) => updateSelected((element) => { element.style.vertical_align = event.target.value; }));
  document.querySelector('#element-line-height').addEventListener('input', (event) => updateSelected((element) => { element.style.line_height = Number(event.target.value); }, { historyKey: 'element-line-height' }));
  closeHistoryOnChange('#element-line-height');
  document.querySelector('#element-letter-spacing').addEventListener('input', (event) => updateSelected((element) => { element.style.letter_spacing = Number(event.target.value); }, { historyKey: 'element-letter-spacing' }));
  closeHistoryOnChange('#element-letter-spacing');
  document.querySelector('#element-radius').addEventListener('input', (event) => updateSelected((element) => { element.style.radius = Number(event.target.value); }, { historyKey: 'element-radius' }));
  closeHistoryOnChange('#element-radius');
  document.querySelector('#element-border-width').addEventListener('input', (event) => updateSelected((element) => { element.style.border_width = Number(event.target.value); }, { historyKey: 'element-border-width' }));
  closeHistoryOnChange('#element-border-width');
  document.querySelector('#element-border-color').addEventListener('input', (event) => updateSelected((element) => { element.style.border_color = event.target.value; }, { historyKey: 'element-border-color' }));
  closeHistoryOnChange('#element-border-color');
  document.querySelector('#element-opacity').addEventListener('input', (event) => updateSelected((element) => { element.opacity = Number(event.target.value); }, { historyKey: 'element-opacity' }));
  closeHistoryOnChange('#element-opacity');
  document.querySelector('#element-blur').addEventListener('input', (event) => updateSelected((element) => { element.effects.blur = Number(event.target.value); }, { historyKey: 'element-blur' }));
  closeHistoryOnChange('#element-blur');
  document.querySelector('#element-media-fit').addEventListener('change', (event) => updateSelected((element) => {
    if (!MEDIA_ELEMENT_TYPES.has(element.type)) return;
    element.media = element.media && typeof element.media === 'object' ? element.media : {};
    element.media.fit = event.target.value;
  }));
  document.querySelector('#element-media-position').addEventListener('change', (event) => updateSelected((element) => {
    if (!MEDIA_ELEMENT_TYPES.has(element.type)) return;
    element.media = element.media && typeof element.media === 'object' ? element.media : {};
    element.media.position = event.target.value;
  }));
  document.querySelector('#element-variant').addEventListener('change', (event) => updateSelected((element) => { element.variant = event.target.value; }, { refresh: 'content' }));
  document.querySelector('#element-shadow').addEventListener('change', (event) => updateSelected((element) => { element.effects.shadow = event.target.checked; }));
  document.querySelector('#element-glow').addEventListener('change', (event) => updateSelected((element) => { element.effects.glow = event.target.checked; }));
  document.querySelector('#element-entrance').addEventListener('change', (event) => updateSelected((element) => { element.animation.entrance = event.target.value; }));
  document.querySelector('#element-loop').addEventListener('change', (event) => updateSelected((element) => { element.animation.loop = event.target.value; }));
  document.querySelector('#element-exit').addEventListener('change', (event) => updateSelected((element) => { element.animation.exit = event.target.value; }));

  document.querySelector('#element-delete').addEventListener('click', () => deleteSelectedElement());
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
  bindWeatherInspector();
}

function editableFocus() {
  return document.activeElement?.matches('input,select,textarea,[contenteditable="true"]');
}

function closeContextMenu() {
  contextMenu?.remove();
  contextMenu = null;
}

function contextMenuButton(label, shortcut, handler, { disabled = false, danger = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'scene-context-menu-item';
  button.classList.toggle('is-danger', danger);
  button.disabled = disabled;
  appendTextElement(button, 'span', label);
  if (shortcut) appendTextElement(button, 'kbd', shortcut);
  button.addEventListener('click', () => {
    closeContextMenu();
    handler();
  });
  return button;
}

function showContextMenu(clientX, clientY) {
  closeContextMenu();
  const hasSelection = Boolean(selectedElement());
  const menu = document.createElement('div');
  menu.className = 'scene-context-menu';
  menu.setAttribute('role', 'menu');
  menu.append(
    contextMenuButton('Вырезать', 'Ctrl+X', cutSelectedElement, { disabled: !hasSelection }),
    contextMenuButton('Копировать', 'Ctrl+C', () => copySelectedElement({ notify: true }), { disabled: !hasSelection }),
    contextMenuButton('Вставить', 'Ctrl+V', pasteClipboardElement, { disabled: !state.clipboardElement }),
    document.createElement('hr'),
    contextMenuButton('Дублировать', 'Ctrl+D', duplicateSelectedElement, { disabled: !hasSelection }),
    contextMenuButton('На передний план', '', () => updateSelected((element) => {
      element.z_index = Math.max(0, ...currentSlide().elements.map((item) => Number(item.z_index) || 0)) + 1;
    }), { disabled: !hasSelection }),
    contextMenuButton('На задний план', '', () => updateSelected((element) => {
      element.z_index = 0;
    }), { disabled: !hasSelection }),
    document.createElement('hr'),
    contextMenuButton('Удалить', 'Del', () => deleteSelectedElement({ notify: true }), { disabled: !hasSelection, danger: true })
  );
  document.body.append(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8))}px`;
  contextMenu = menu;
}

function bindContextMenu() {
  const stage = document.querySelector('#scene-stage');
  stage.addEventListener('contextmenu', (event) => {
    if (state.preview) return;
    event.preventDefault();
    const node = event.target.closest('.scene-render-element[data-element-id]');
    if (node) {
      const element = findElement(node.dataset.elementId);
      if (element) markSelected(node, element);
    } else {
      state.selectedElementId = null;
      state.inspectorTab = 'object';
      clearSelectionVisual();
      renderInspector();
    }
    showContextMenu(event.clientX, event.clientY);
  });
  window.addEventListener('pointerdown', (event) => {
    if (contextMenu && !contextMenu.contains(event.target)) closeContextMenu();
  }, true);
  window.addEventListener('blur', closeContextMenu);
  window.addEventListener('resize', closeContextMenu);
  document.addEventListener('scroll', closeContextMenu, true);
}

function bindKeyboardShortcuts() {
  window.addEventListener('keydown', (event) => {
    if (state.preview) return;
    const key = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    const editing = editableFocus();

    if (event.key === 'Escape' && contextMenu) {
      event.preventDefault();
      closeContextMenu();
      return;
    }
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
    if (command && !editing && key === 'c' && state.selectedElementId) {
      event.preventDefault();
      copySelectedElement();
      return;
    }
    if (command && !editing && key === 'x' && state.selectedElementId) {
      event.preventDefault();
      cutSelectedElement();
      return;
    }
    if (command && !editing && key === 'v' && state.clipboardElement) {
      event.preventDefault();
      pasteClipboardElement();
      return;
    }
    if (command && !editing && key === 'd' && state.selectedElementId) {
      event.preventDefault();
      duplicateSelectedElement();
      return;
    }
    if (event.key === 'Delete' && state.selectedElementId && !editing) {
      event.preventDefault();
      deleteSelectedElement();
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
    state.inspectorTab = 'object';
    clearSelectionVisual();
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
    state.inspectorTab = 'object';
    scheduleAutosave();
    render();
  });
  document.querySelector('#scene-preview-toggle').addEventListener('click', (event) => {
    closeContextMenu();
    if (!state.preview) {
      state.preview = true;
      closeHistoryGroup();
      event.target.textContent = 'Вернуться в редактор';
      render();
      previewRuntime.load(state.scene, sceneRendererContext(), {
        startSlideId: state.scene.active_slide_id,
        preserveSlide: false,
        animateEntrance: true
      });
      ensureDynamicDataForScene();
      syncClockTimer();
      return;
    }
    previewRuntime.clear();
    state.preview = false;
    closeHistoryGroup();
    event.target.textContent = 'Предпросмотр';
    render();
  });
  bindContextMenu();
  bindKeyboardShortcuts();
  window.addEventListener('beforeunload', (event) => {
    if (state.dirtyVersion <= state.savedVersion && !state.saving) return;
    event.preventDefault();
    event.returnValue = '';
  });
  bindBackgroundControls();
}

function syncClockTimer() {
  window.clearTimeout(state.clockTimer);
  state.clockTimer = null;
  if (state.preview && previewRuntime?.enabled) return;
  const slide = currentSlide();
  const clocks = (slide?.elements || []).filter((element) => element.type === 'clock');
  if (!clocks.length || document.visibilityState === 'hidden') return;
  const precise = clocks.some((element) => ['seconds', 'analog'].includes(element.variant));
  const now = new Date();
  const delay = precise
    ? Math.max(120, 1000 - now.getMilliseconds() + 20)
    : Math.max(1000, (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 20);
  state.clockTimer = window.setTimeout(() => {
    state.clockTimer = null;
    updateSceneClockElements(document.querySelector('#scene-elements-layer'), currentSlide(), new Date());
    syncClockTimer();
  }, delay);
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
  state.clipboardElement = null;
  state.inspectorTab = 'object';
  state.catalogItems = [];
  state.catalogClasses = [];
  state.catalogStatus = 'idle';
  state.catalogError = '';
  state.weatherByElement = {};
  state.weatherStatus = {};
  state.weatherRequestVersion = {};
  history.reset();
  previewRuntime = new ScenePlaybackRuntime({
    stage: document.querySelector('#scene-stage'),
    layer: document.querySelector('#scene-elements-layer'),
    onSlideChange: ensureWeatherForSlide
  });
  previewRuntime.clear();
  bindInspector();
  bindGlobalControls();
  document.addEventListener('visibilitychange', syncClockTimer);
  setSaveState('Сохранено');
  render();
  ensureDynamicDataForScene();
}
