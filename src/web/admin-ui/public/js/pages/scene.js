import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { updateSceneElement, selectSceneElement } from '../editor/commands.js';
import {
  appendRow,
  PROMOTION_BADGE_ANIMATION_OPTIONS,
  PROMOTION_ROW_ANIMATION_OPTIONS,
  renderPreviewRows
} from '../editor/rows.js';
import { buildDisplayLines, buildRenderLayout, buildRenderModel } from '../editor/renderer.js';
import { createEditorHistory } from '../editor/history.js';
import { createEditorState, replaceEditorState } from '../editor/state.js';
import {
  appendSceneElement,
  renderSceneElementInspector,
  renderSceneLayerList
} from '../editor/elements.js';
import { PlayerSceneRenderer } from '../player/player-scene-renderer.js';
import {
  DEFAULT_LIVE_PROFILE,
  bindMotionProfileControls,
  readMotionProfile,
  writeMotionProfile
} from '../motion/profile-editor.js';

const SCENE_WIDTH = 1920;
const SCENE_HEIGHT = 1080;
const ELEMENT_LABELS = Object.freeze({
  text: 'Текстовое поле',
  logo: 'Логотип',
  image: 'Картинка',
  video: 'Видео',
  weather: 'Погода',
  background: 'Фон',
  animation: 'Анимация',
  table: 'Таблица меню'
});
const ELEMENT_ICONS = Object.freeze({
  text: 'T',
  logo: '◈',
  image: '▧',
  video: '▶',
  weather: '☁',
  background: '▧',
  animation: '∿',
  table: '▦'
});
const TABLE_FONTS = Object.freeze([
  ['arial-narrow', 'Arial Narrow'],
  ['tahoma-bold', 'Tahoma Bold'],
  ['arial', 'Arial'],
  ['dejavu-condensed', 'DejaVu Sans Condensed'],
  ['liberation-narrow', 'Liberation Sans Narrow'],
  ['system-sans', 'Системный sans-serif']
]);

function systemOwnerIcon(type) {
  if (!['background','animation','table'].includes(type)) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  if (type === 'animation') {
    const wave = document.createElementNS(svg.namespaceURI, 'path');
    wave.setAttribute('d', 'M3.5 15c2.1-5.3 4.2-5.3 6.3 0s4.2 5.3 6.3 0S20 9.7 21 12M4 9c1.5-2.5 3-2.5 4.5 0');
    svg.append(wave);
    return svg;
  }

  const rect = document.createElementNS(svg.namespaceURI, 'rect');
  rect.setAttribute('x', '3.5');
  rect.setAttribute('y', '4.5');
  rect.setAttribute('width', '17');
  rect.setAttribute('height', '15');
  rect.setAttribute('rx', '2');
  svg.append(rect);

  const path = document.createElementNS(svg.namespaceURI, 'path');
  if (type === 'background') {
    const circle = document.createElementNS(svg.namespaceURI, 'circle');
    circle.setAttribute('cx', '8.5');
    circle.setAttribute('cy', '9');
    circle.setAttribute('r', '1.5');
    path.setAttribute('d', 'm5.5 17 4.2-4.3 3.1 2.8 2.3-2.2 3.4 3.7');
    svg.append(circle, path);
  } else {
    path.setAttribute('d', 'M3.5 9.5h17M9 9.5v10M15 9.5v10M3.5 14.5h17');
    svg.append(path);
  }
  return svg;
}

let generation = 0;

function screenFromQuery(screens) {
  const id = Number(new URL(window.location.href).searchParams.get('screen'));
  return screens.find((screen) => Number(screen.id) === id) || screens[0] || null;
}

function rememberScreen(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('screen', String(id));
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function resolutionOf(screen) {
  const match = String(screen?.resolution || '').match(/(\d+)\D+(\d+)/);
  return {
    width: Number(match?.[1]) || SCENE_WIDTH,
    height: Number(match?.[2]) || SCENE_HEIGHT
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function labelForScreen(screen) {
  return `${screen.location_name || 'Без точки'} — ${screen.name}`;
}

function menuMotionEnabled(profile) {
  return profile?.section_effect !== 'none'
    || profile?.item_effect !== 'none'
    || profile?.promotion_effect !== 'none';
}

function createState() {
  return createEditorState();
}

export function initialiseSceneEditor() {
  const form = element('scene-editor-form');
  const stage = element('scene-editor-stage');
  const shell = element('scene-editor-stage-shell');
  const canvasPane = element('scene-editor-canvas-pane');
  const selectionLayer = element('scene-editor-selection-layer');
  const tableEditLayer = element('scene-editor-table-edit-layer');
  const layersRoot = element('scene-editor-layers');
  const propertiesRoot = element('scene-editor-properties');
  const addButton = element('scene-editor-add');
  const addMenu = element('scene-editor-add-menu');
  const backgroundLayer = element('scene-editor-background-layer');
  const animationLayer = element('scene-editor-animation-layer');
  const tableLayer = element('scene-editor-table-layer');
  const mobileToolbar = form.querySelector('.scene-editor-mobile-toolbar');
  const undoButton = element('scene-editor-undo');
  const redoButton = element('scene-editor-redo');
  const screenSelect = element('scene-editor-screen');
  if (!(form instanceof HTMLFormElement)
      || !(stage instanceof HTMLElement)
      || !(shell instanceof HTMLElement)
      || !(canvasPane instanceof HTMLElement)
      || !(selectionLayer instanceof HTMLElement)
      || !(tableEditLayer instanceof HTMLElement)
      || !(layersRoot instanceof HTMLElement)
      || !(propertiesRoot instanceof HTMLElement)
      || !(addButton instanceof HTMLButtonElement)
      || !(addMenu instanceof HTMLElement)
      || !(backgroundLayer instanceof HTMLButtonElement)
      || !(animationLayer instanceof HTMLButtonElement)
      || !(tableLayer instanceof HTMLButtonElement)
      || !(undoButton instanceof HTMLButtonElement)
      || !(redoButton instanceof HTMLButtonElement)
      || !(screenSelect instanceof HTMLSelectElement)) return undefined;

  const token = ++generation;
  const state = createState();
  let renderer = null;
  let screens = [];
  let currentBundle = null;
  let currentAnimationSettings = {
    enabled:true,
    preset_id:'cinematic-live-menu',
    profile:structuredClone(DEFAULT_LIVE_PROFILE),
    scene_playlist:null
  };
  let currentScreenId = null;
  let disposed = false;
  let previewFrame = 0;
  let documentPreviewFrame = 0;
  let resizeObserver = null;
  let interactionActive = false;
  let selectedOwner = 'none';
  const history = createEditorHistory(state);

  const active = () => !disposed && token === generation && document.body.dataset.page === 'scene';

  function setDirty() {
    const target = element('scene-editor-dirty-state');
    if (!target) return;
    target.textContent = state.dirty ? 'Не сохранено' : 'Сохранено';
    target.classList.toggle('is-dirty', state.dirty);
    undoButton.disabled = !history.canUndo();
    redoButton.disabled = !history.canRedo();
  }

  function selectedElement() {
    if (selectedOwner !== 'element') return null;
    return state.scene?.elements?.find((item) => item.id === state.selectedElementId) || null;
  }

  function setSelectionStatus() {
    const selected = selectedElement();
    const status = element('scene-editor-selection-status');
    const title = element('scene-editor-properties-title');
    const kind = element('scene-editor-properties-kind');
    const elements = Array.isArray(state.scene?.elements) ? state.scene.elements : [];
    const index = selected ? elements.indexOf(selected) : -1;
    const ownerType = selectedOwner === 'element' ? selected?.type : selectedOwner;
    const caption = selectedOwner === 'background'
      ? 'Фон'
      : selectedOwner === 'animation'
        ? 'Анимация'
        : selectedOwner === 'table'
          ? 'Таблица меню'
          : selected
            ? `Элемент ${index + 1}`
            : 'Элемент не выбран';

    if (status) {
      status.textContent = selected
        ? `${caption} · X ${Math.round(Number(selected.x) || 0)} · Y ${Math.round(Number(selected.y) || 0)}`
        : selectedOwner === 'table'
          ? `Таблица · X ${Math.round(Number(state.settings.table_x) || 0)} · Y ${Math.round(Number(state.settings.table_y) || 0)}`
          : caption;
    }
    if (title) title.textContent = caption;
    if (kind) {
      const typeLabel = ownerType ? (ELEMENT_LABELS[ownerType] || ownerType) : 'Тип элемента не выбран';
      const ownerIcon = systemOwnerIcon(ownerType);
      if (ownerIcon) kind.replaceChildren(ownerIcon);
      else kind.textContent = ownerType ? (ELEMENT_ICONS[ownerType] || '•') : '—';
      kind.dataset.elementType = ownerType || '';
      kind.dataset.tooltip = ownerType ? typeLabel : '';
      kind.setAttribute('aria-label', typeLabel);
      kind.title = ownerType ? typeLabel : '';
    }
  }

  function fitPreviewShell() {
    if (!state.screen) return;
    const resolution = resolutionOf(state.screen);
    const widthLimit = Math.max(1, canvasPane.clientWidth * .9);
    const heightLimit = Math.max(1, canvasPane.clientHeight * .82);
    const previewScale = Math.max(.01, Math.min(widthLimit / resolution.width, heightLimit / resolution.height));
    const width = Math.max(1, Math.floor(resolution.width * previewScale));
    const height = Math.max(1, Math.floor(resolution.height * previewScale));
    shell.style.width = `${width}px`;
    shell.style.height = `${height}px`;
    shell.style.aspectRatio = `${resolution.width} / ${resolution.height}`;
    renderer?.fitViewport?.(resolution);
    const zoom = element('scene-editor-zoom');
    if (zoom) zoom.textContent = `${Math.max(1, Math.round(previewScale * 100))}%`;
  }

  function applyBoxGeometry(box, sceneElement) {
    box.style.left = `${(Number(sceneElement.x || 0) / SCENE_WIDTH) * 100}%`;
    box.style.top = `${(Number(sceneElement.y || 0) / SCENE_HEIGHT) * 100}%`;
    box.style.width = `${(Number(sceneElement.width || 1) / SCENE_WIDTH) * 100}%`;
    box.style.height = `${(Number(sceneElement.height || 1) / SCENE_HEIGHT) * 100}%`;
    box.style.transform = `rotate(${Number(sceneElement.rotation_deg || 0)}deg)`;
  }

  function syncOverlaySelection() {
    selectionLayer.querySelectorAll('.scene-editor-selection-box').forEach((node) => {
      node.classList.toggle('is-selected', selectedOwner === 'element' && node.dataset.sceneElementId === state.selectedElementId);
    });
    selectionLayer.querySelector('.scene-editor-table-selection-box')?.classList.toggle('is-selected', selectedOwner === 'table');
    backgroundLayer.classList.toggle('is-selected', selectedOwner === 'background');
    animationLayer.classList.toggle('is-selected', selectedOwner === 'animation');
    tableLayer.classList.toggle('is-selected', selectedOwner === 'table');
    setSelectionStatus();
  }

  function selectOwner(owner, elementId = null) {
    selectedOwner = owner;
    if (owner === 'element' && elementId) selectSceneElement(state, elementId);
    else state.selectedElementId = null;
    renderLayers();
    renderInspector();
    syncOverlaySelection();
    if (window.matchMedia('(max-width: 1100px)').matches && owner !== 'element') {
      document.body.dataset.sceneMobilePanel = 'properties';
    }
  }

  function selectInCanvas(elementId) {
    selectOwner('element', elementId);
  }

  function checkpointControl(control) {
    let captured = false;
    const capture = () => {
      if (captured) return;
      captured = true;
      history.checkpoint();
      setDirty();
    };
    control.addEventListener('focus', capture, { once:true });
    control.addEventListener('pointerdown', capture, { once:true });
  }

  function syncAfterHistory() {
    selectedOwner = state.selectedElementId ? 'element' : 'none';
    setDirty();
    void renderFullPreview().then(() => renderSelectionOwners());
  }

  async function renderDocumentPreview() {
    if (!renderer || !active()) return;
    await renderer.render(sceneContext(), ['screen', 'menu']);
    if (!active()) return;
    if (!interactionActive) {
      refreshSelectionOverlay();
      if (selectedOwner === 'table') renderTableEditLayer();
    }
  }

  function scheduleDocumentRender() {
    if (documentPreviewFrame) return;
    documentPreviewFrame = requestAnimationFrame(() => {
      documentPreviewFrame = 0;
      void renderDocumentPreview();
    });
  }

  function patchMenuSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    state.dirty = true;
    setDirty();
    setSelectionStatus();
    scheduleDocumentRender();
  }

  function makeField(labelText, control) {
    const label = document.createElement('label');
    label.className = 'field';
    const caption = document.createElement('span');
    caption.textContent = labelText;
    label.append(caption, control);
    return label;
  }

  function compactInput(type, value, { min, max, step } = {}) {
    const input = document.createElement('input');
    input.type = type;
    if (value !== undefined && value !== null) input.value = String(value);
    if (min !== undefined) input.min = String(min);
    if (max !== undefined) input.max = String(max);
    if (step !== undefined) input.step = String(step);
    return input;
  }

  async function applyBackgroundUpload(file) {
    if (!currentScreenId || !file) return;
    const upload = propertiesRoot.querySelector('[data-scene-background-upload]');
    setPending(upload, true, 'Загружаем…');
    const dirtyBefore = state.dirty;
    try {
      const result = await api.put(`${API.screens}/${currentScreenId}/background`, file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Draft-Revision': String(state.draftRevision)
        }
      });
      if (!active()) return;
      state.settings = {
        ...state.settings,
        background_image_url: result.draft?.settings?.background_image_url || ''
      };
      state.draftRevision = Number(result.draft?.revision || state.draftRevision);
      state.screen = structuredClone(result.screen || state.screen);
      state.dirty = dirtyBefore;
      setDirty();
      await renderFullPreview();
      renderInspector();
      setMessage('scene-editor-message', 'Фон загружен.', 'success');
    } catch (error) {
      if (active()) setMessage('scene-editor-message', error.message);
    } finally {
      if (active()) setPending(upload, false, 'Загружаем…');
    }
  }

  async function removeBackground() {
    if (!currentScreenId || !state.settings.background_image_url) return;
    const dirtyBefore = state.dirty;
    try {
      const result = await api.delete(`${API.screens}/${currentScreenId}/background`, {
        headers: { 'X-Draft-Revision': String(state.draftRevision) }
      });
      if (!active()) return;
      state.settings = { ...state.settings, background_image_url: '' };
      state.draftRevision = Number(result.draft?.revision || state.draftRevision);
      state.screen = structuredClone(result.screen || state.screen);
      state.dirty = dirtyBefore;
      setDirty();
      await renderFullPreview();
      renderInspector();
      setMessage('scene-editor-message', 'Фон удалён.', 'success');
    } catch (error) {
      if (active()) setMessage('scene-editor-message', error.message);
    }
  }

  function tableEditModel() {
    if (!state.screen) return null;
    const resolution = resolutionOf(state.screen);
    const model = buildRenderModel(state, resolution);
    const lines = buildDisplayLines(model, {
      products: currentBundle?.products || [],
      packaging: currentBundle?.packaging || [],
      fallbackTitle: 'Новый раздел'
    });
    const layout = buildRenderLayout(model, lines);
    return { model, lines, layout };
  }

  function renderTableEditLayer({ rebuildInspector = false } = {}) {
    const activeTable = selectedOwner === 'table';
    tableEditLayer.hidden = !activeTable;
    if (!activeTable) {
      tableEditLayer.replaceChildren();
      return;
    }
    const computed = tableEditModel();
    if (!computed) return;
    const rowInspector = propertiesRoot.querySelector('[data-scene-table-row-inspector]');
    renderPreviewRows(state, {
      target: tableEditLayer,
      inspector: rowInspector,
      model: computed.model,
      lines: computed.lines,
      layout: computed.layout,
      products: currentBundle?.products || [],
      packaging: currentBundle?.packaging || [],
      onBeforeMutate: () => history.checkpoint(),
      onVisualChange: () => {
        state.dirty = true;
        setDirty();
        scheduleDocumentRender();
      },
      onStructureChange: () => {
        state.dirty = true;
        setDirty();
        scheduleDocumentRender();
        renderTableEditLayer({ rebuildInspector:true });
      }
    });
    if (rebuildInspector) setSelectionStatus();
  }

  function renderBackgroundInspector() {
    tableEditLayer.hidden = true;
    tableEditLayer.replaceChildren();
    propertiesRoot.replaceChildren();
    const stack = document.createElement('div');
    stack.className = 'scene-editor-inspector-stack';

    const appearance = document.createElement('details');
    appearance.className = 'scene-editor-inspector-group';
    appearance.open = true;
    const appearanceSummary = document.createElement('summary');
    appearanceSummary.textContent = 'Фон';
    const appearancePanel = document.createElement('div');
    appearancePanel.className = 'scene-editor-inspector-panel';

    const color = compactInput('color', state.settings.background_color || '#101828');
    color.setAttribute('aria-label', 'Цвет фона');
    checkpointControl(color);
    color.addEventListener('input', () => patchMenuSettings({ background_color: color.value.toUpperCase() }));
    appearancePanel.append(makeField('Цвет', color));

    const file = compactInput('file');
    file.accept = 'image/png,image/jpeg,image/webp';
    file.setAttribute('aria-label', 'Фоновое изображение');
    const status = document.createElement('small');
    status.className = 'scene-editor-background-state';
    status.textContent = state.settings.background_image_url ? 'Изображение загружено' : 'Без изображения';

    const actions = document.createElement('div');
    actions.className = 'scene-editor-inspector-actions';
    const upload = document.createElement('button');
    upload.type = 'button';
    upload.className = 'button button-secondary';
    upload.dataset.sceneBackgroundUpload = '';
    upload.textContent = 'Загрузить';
    upload.addEventListener('click', () => {
      const selected = file.files?.[0];
      if (!selected) {
        setMessage('scene-editor-message', 'Выберите PNG, JPEG или WebP.');
        return;
      }
      void applyBackgroundUpload(selected);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button button-danger';
    remove.textContent = 'Удалить';
    remove.disabled = !state.settings.background_image_url;
    remove.addEventListener('click', () => void removeBackground());
    actions.append(upload, remove);
    appearancePanel.append(makeField('Изображение', file), status, actions);
    appearance.append(appearanceSummary, appearancePanel);
    stack.append(appearance);
    propertiesRoot.append(stack);
  }

  function animationSelect(id, labelText, options) {
    const select = document.createElement('select');
    select.id = id;
    select.setAttribute('aria-label', labelText);
    for (const [value, label] of options) select.add(new Option(label, value));
    return makeField(labelText, select);
  }

  function animationRange(id, labelText, min, max, step, outputId) {
    const label = document.createElement('label');
    label.className = 'field scene-animation-range';
    const caption = document.createElement('span');
    caption.textContent = labelText;
    const line = document.createElement('div');
    const input = compactInput('range', '', { min, max, step });
    input.id = id;
    input.setAttribute('aria-label', labelText);
    const output = document.createElement('output');
    output.id = outputId;
    line.append(input, output);
    label.append(caption, line);
    return label;
  }

  function hiddenAnimationControl(id, type = 'hidden', value = '') {
    const control = document.createElement('input');
    control.id = id;
    control.type = type;
    if (type === 'checkbox') control.className = 'is-hidden';
    else control.value = value;
    return control;
  }

  function promotionRows() {
    return state.rows.filter((row) => row?.kind === 'item' && row?.promotion === true);
  }

  function renderPromotionPresetGroup(titleText, field, options, fallback) {
    const fieldRoot = document.createElement('div');
    fieldRoot.className = 'scene-animation-preset-field';
    const title = document.createElement('span');
    title.textContent = titleText;
    const group = document.createElement('div');
    group.className = 'scene-animation-preset-grid';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', titleText);
    const rows = promotionRows();
    for (const [value, label] of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'scene-animation-preset';
      button.textContent = label;
      button.setAttribute('role', 'radio');
      const selected = rows.length > 0 && rows.every((row) => (row[field] || fallback) === value);
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
      button.disabled = rows.length === 0;
      button.addEventListener('click', () => {
        if (!rows.length || selected) return;
        history.checkpoint();
        for (const row of rows) row[field] = value;
        state.dirty = true;
        setDirty();
        scheduleDocumentRender();
        renderAnimationInspector();
        setSelectionStatus();
      });
      group.append(button);
    }
    fieldRoot.append(title, group);
    return fieldRoot;
  }

  function renderAnimationInspector() {
    tableEditLayer.hidden = true;
    tableEditLayer.replaceChildren();
    propertiesRoot.replaceChildren();

    const stack = document.createElement('div');
    stack.className = 'scene-editor-inspector-stack scene-animation-inspector';

    const menu = document.createElement('details');
    menu.className = 'scene-editor-inspector-group';
    menu.open = true;
    menu.append(Object.assign(document.createElement('summary'), { textContent:'Меню' }));
    const menuPanel = document.createElement('div');
    menuPanel.className = 'scene-editor-inspector-panel scene-animation-panel';
    const menuGrid = document.createElement('div');
    menuGrid.className = 'scene-animation-control-grid';
    menuGrid.append(
      animationSelect('animation-pattern', 'Характер', [
        ['cinematic','Cinematic light'],['ambient','Ambient Glow'],['wave','Light Drift'],
        ['focus','Focus Pulse'],['pulse','Soft Pulse'],['spark','Neon Spark'],['parallax','Depth Light']
      ]),
      animationSelect('animation-flow-direction', 'Направление', [
        ['alternate','Встречное'],['left-to-right','Слева направо'],['right-to-left','Справа налево'],
        ['top-to-bottom','Сверху вниз'],['bottom-to-top','Снизу вверх'],['none','Без направления']
      ]),
      animationSelect('animation-easing', 'Пластика', [
        ['cinematic','Киношная'],['smooth','Очень плавная'],['standard','Стандартная'],['snappy','Энергичная'],['elastic','Упругая']
      ]),
      animationSelect('animation-section-effect', 'Разделы', [
        ['cinematic','Cinematic'],['wave','Волна света'],['lift','Световой подъём'],['glow','Свечение'],
        ['pulse','Пульс'],['shimmer','Блик'],['none','Без движения']
      ]),
      animationSelect('animation-item-effect', 'Строки продукции', [
        ['cinematic','Cinematic'],['wave','Light Drift'],['lift','Световой подъём'],
        ['focus','Focus'],['breathe','Дыхание света'],['none','Без движения']
      ])
    );
    const menuRanges = document.createElement('div');
    menuRanges.className = 'scene-animation-range-grid';
    menuRanges.append(
      animationRange('animation-intensity','Выразительность',0,100,1,'animation-intensity-output'),
      animationRange('animation-travel','Ход света',0,48,1,'animation-travel-output'),
      animationRange('animation-scale','Масштаб',0,.12,.001,'animation-scale-output'),
      animationRange('animation-brightness','Яркость',0,.7,.01,'animation-brightness-output'),
      animationRange('animation-cycle','Период',4,30,.5,'animation-cycle-output'),
      animationRange('animation-stagger','Фаза строк',0,600,10,'animation-stagger-output'),
      animationRange('animation-event-duration','Длительность',400,10000,100,'animation-event-duration-output')
    );
    menuPanel.append(menuGrid, menuRanges);
    menu.append(menuPanel);

    const promo = document.createElement('details');
    promo.className = 'scene-editor-inspector-group';
    promo.open = true;
    promo.append(Object.assign(document.createElement('summary'), { textContent:'Акция' }));
    const promoPanel = document.createElement('div');
    promoPanel.className = 'scene-editor-inspector-panel scene-animation-panel';
    const presetNote = document.createElement('small');
    presetNote.className = 'scene-animation-note';
    presetNote.textContent = promotionRows().length
      ? 'Пресеты применяются ко всем строкам с включённой «Акцией».'
      : 'В таблице пока нет строк с включённой «Акцией».';
    promoPanel.append(
      renderPromotionPresetGroup('Анимация строки акции', 'promotion_animation', PROMOTION_ROW_ANIMATION_OPTIONS, 'wave'),
      renderPromotionPresetGroup('Анимация плашки акции', 'promotion_badge_animation', PROMOTION_BADGE_ANIMATION_OPTIONS, 'shine'),
      presetNote
    );
    const promoGrid = document.createElement('div');
    promoGrid.className = 'scene-animation-control-grid';
    promoGrid.append(
      animationSelect('animation-promotion-effect', 'Подсветка акции', [['cinematic','Включена'],['none','Выключена']]),
      animationSelect('animation-promotion-easing', 'Пластика акции', [['smooth','Плавная'],['cinematic','Киношная']])
    );
    const promoRanges = document.createElement('div');
    promoRanges.className = 'scene-animation-range-grid';
    promoRanges.append(
      animationRange('animation-promotion-intensity','Сила акции',0,100,1,'animation-promotion-intensity-output'),
      animationRange('animation-promotion-brightness','Яркость акции',0,.8,.01,'animation-promotion-brightness-output'),
      animationRange('animation-promotion-glow','Glow акции',0,48,1,'animation-promotion-glow-output'),
      animationRange('animation-promotion-cycle','Период акции',2,15,.5,'animation-promotion-cycle-output'),
      animationRange('animation-promotion-duration','Длительность акции',700,4000,100,'animation-promotion-duration-output')
    );
    promoPanel.append(promoGrid, promoRanges);
    promo.append(promoPanel);

    const menuVisible = hiddenAnimationControl('animation-menu-visible', 'checkbox');
    const promotionVisible = hiddenAnimationControl('animation-promotion-visible', 'checkbox');
    const priceEffect = hiddenAnimationControl('animation-price-effect', 'hidden', 'none');
    const promotionTravel = hiddenAnimationControl('animation-promotion-travel', 'hidden', '0');
    const promotionScale = hiddenAnimationControl('animation-promotion-scale', 'hidden', '0.06');

    stack.append(menu, promo, menuVisible, promotionVisible, priceEffect, promotionTravel, promotionScale);
    propertiesRoot.append(stack);

    writeMotionProfile(currentAnimationSettings?.profile || DEFAULT_LIVE_PROFILE);
    bindMotionProfileControls((profile) => {
      currentAnimationSettings = {
        ...(currentAnimationSettings || {}),
        enabled:menuMotionEnabled(profile),
        preset_id:currentAnimationSettings?.preset_id || 'cinematic-live-menu',
        profile
      };
      state.dirty = true;
      setDirty();
      void renderer?.render(sceneContext(), ['animation']);
    });
  }

  function renderTableInspector() {
    propertiesRoot.replaceChildren();
    const stack = document.createElement('div');
    stack.className = 'scene-editor-inspector-stack';

    const geometry = document.createElement('details');
    geometry.className = 'scene-editor-inspector-group';
    geometry.open = true;
    geometry.append(Object.assign(document.createElement('summary'), { textContent:'Трансформация' }));
    const geometryPanel = document.createElement('div');
    geometryPanel.className = 'scene-editor-inspector-panel';
    const grid = document.createElement('div');
    grid.className = 'geometry-grid';
    for (const [caption, key, min, max] of [
      ['X','table_x',0,1919], ['Y','table_y',0,1079],
      ['W','table_width_px',1,1920], ['H','table_height_px',1,1080]
    ]) {
      const control = compactInput('number', state.settings[key], { min, max, step:1 });
      control.setAttribute('aria-label', caption === 'W' ? 'Ширина таблицы' : caption === 'H' ? 'Высота таблицы' : caption);
      checkpointControl(control);
      control.addEventListener('input', () => {
        const value = Number(control.value);
        if (!Number.isFinite(value)) return;
        const next = Math.round(value);
        const patch = { [key]:next };
        if (key === 'table_x') patch.table_x = clamp(next, 0, SCENE_WIDTH - Number(state.settings.table_width_px || 1));
        if (key === 'table_y') patch.table_y = clamp(next, 0, SCENE_HEIGHT - Number(state.settings.table_height_px || 1));
        if (key === 'table_width_px') patch.table_width_px = clamp(next, 1, SCENE_WIDTH - Number(state.settings.table_x || 0));
        if (key === 'table_height_px') patch.table_height_px = clamp(next, 1, SCENE_HEIGHT - Number(state.settings.table_y || 0));
        patchMenuSettings(patch);
      });
      grid.append(makeField(caption, control));
    }
    geometryPanel.append(grid);
    geometry.append(geometryPanel);

    const typography = document.createElement('details');
    typography.className = 'scene-editor-inspector-group';
    typography.open = true;
    typography.append(Object.assign(document.createElement('summary'), { textContent:'Типографика' }));
    const typePanel = document.createElement('div');
    typePanel.className = 'scene-editor-inspector-panel';
    const font = document.createElement('select');
    for (const [value,label] of TABLE_FONTS) font.add(new Option(label,value));
    font.value = state.settings.font_family || 'arial-narrow';
    font.setAttribute('aria-label','Шрифт таблицы');
    checkpointControl(font);
    font.addEventListener('change', () => patchMenuSettings({ font_family:font.value }));
    const scale = compactInput('number', state.settings.font_scale_percent || 100, { min:55,max:130,step:1 });
    scale.setAttribute('aria-label','Масштаб шрифта таблицы');
    checkpointControl(scale);
    scale.addEventListener('input', () => {
      const value = Number(scale.value);
      if (Number.isFinite(value)) patchMenuSettings({ font_scale_percent:clamp(Math.round(value),55,130) });
    });
    typePanel.append(makeField('Шрифт',font), makeField('Масштаб, %',scale));
    typography.append(typePanel);

    const palette = document.createElement('details');
    palette.className = 'scene-editor-inspector-group';
    palette.append(Object.assign(document.createElement('summary'), { textContent:'Оформление' }));
    const palettePanel = document.createElement('div');
    palettePanel.className = 'scene-editor-inspector-panel';
    const paletteGrid = document.createElement('div');
    paletteGrid.className = 'compact-form-grid';
    for (const [caption,key,fallback] of [['Акцент','accent_color','#F4C915'],['Текст','text_color','#F8FAFC']]) {
      const control = compactInput('color', state.settings[key] || fallback);
      control.setAttribute('aria-label',caption);
      checkpointControl(control);
      control.addEventListener('input', () => patchMenuSettings({ [key]:control.value.toUpperCase() }));
      paletteGrid.append(makeField(caption,control));
    }
    palettePanel.append(paletteGrid);
    palette.append(palettePanel);

    const content = document.createElement('details');
    content.className = 'scene-editor-inspector-group';
    content.open = true;
    content.append(Object.assign(document.createElement('summary'), { textContent:'Содержимое' }));
    const contentPanel = document.createElement('div');
    contentPanel.className = 'scene-editor-inspector-panel';
    const rowActions = document.createElement('div');
    rowActions.className = 'scene-editor-table-row-actions';
    for (const [label, kind] of [['+ Раздел','section'],['+ Продукт','item'],['+ Тара','packaging']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button-secondary';
      button.textContent = label;
      button.addEventListener('click', () => {
        history.checkpoint();
        appendRow(state, kind);
        state.dirty = true;
        setDirty();
        renderTableEditLayer({ rebuildInspector:true });
        scheduleDocumentRender();
      });
      rowActions.append(button);
    }
    const rowInspector = document.createElement('div');
    rowInspector.className = 'scene-editor-table-row-inspector';
    rowInspector.dataset.sceneTableRowInspector = '';
    contentPanel.append(rowActions, rowInspector);
    content.append(contentPanel);

    stack.append(geometry, typography, palette, content);
    propertiesRoot.append(stack);
    renderTableEditLayer();
  }

  function refreshSelectionOverlay() {
    selectionLayer.replaceChildren();
    const elements = Array.isArray(state.scene?.elements) ? state.scene.elements : [];

    const tableBox = document.createElement('button');
    tableBox.type = 'button';
    tableBox.className = 'scene-editor-table-selection-box';
    tableBox.classList.toggle('is-selected', selectedOwner === 'table');
    tableBox.setAttribute('aria-label', 'Выбрать таблицу меню');
    const applyTableGeometry = () => {
      tableBox.style.left = `${(Number(state.settings.table_x || 0) / SCENE_WIDTH) * 100}%`;
      tableBox.style.top = `${(Number(state.settings.table_y || 0) / SCENE_HEIGHT) * 100}%`;
      tableBox.style.width = `${(Number(state.settings.table_width_px || 1) / SCENE_WIDTH) * 100}%`;
      tableBox.style.height = `${(Number(state.settings.table_height_px || 1) / SCENE_HEIGHT) * 100}%`;
    };
    applyTableGeometry();
    const tableLabel = document.createElement('span');
    tableLabel.className = 'scene-editor-selection-label';
    tableLabel.textContent = 'Таблица меню';
    tableBox.append(tableLabel);

    if (selectedOwner === 'table') {
      for (const direction of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
        const resize = document.createElement('span');
        resize.className = 'scene-editor-resize-handle';
        resize.dataset.direction = direction;
        resize.setAttribute('aria-hidden', 'true');
        resize.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          interactionActive = true;
          const pointerStartX = event.clientX;
          const pointerStartY = event.clientY;
          const startLeft = Number(state.settings.table_x || 0);
          const startTop = Number(state.settings.table_y || 0);
          const startRight = startLeft + Math.max(1, Number(state.settings.table_width_px || 1));
          const startBottom = startTop + Math.max(1, Number(state.settings.table_height_px || 1));
          const rect = shell.getBoundingClientRect();
          resize.setPointerCapture?.(event.pointerId);

          const move = (moveEvent) => {
            const deltaX = (moveEvent.clientX - pointerStartX) * (SCENE_WIDTH / Math.max(1, rect.width));
            const deltaY = (moveEvent.clientY - pointerStartY) * (SCENE_HEIGHT / Math.max(1, rect.height));
            let left = startLeft;
            let top = startTop;
            let right = startRight;
            let bottom = startBottom;
            if (direction.includes('w')) left = clamp(startLeft + deltaX, 0, right - 40);
            if (direction.includes('e')) right = clamp(startRight + deltaX, left + 40, SCENE_WIDTH);
            if (direction.includes('n')) top = clamp(startTop + deltaY, 0, bottom - 40);
            if (direction.includes('s')) bottom = clamp(startBottom + deltaY, top + 40, SCENE_HEIGHT);
            state.settings = {
              ...state.settings,
              table_x:Math.round(left),
              table_y:Math.round(top),
              table_width_px:Math.round(right - left),
              table_height_px:Math.round(bottom - top)
            };
            state.dirty = true;
            setDirty();
            setSelectionStatus();
            applyTableGeometry();
            scheduleDocumentRender();
          };
          const end = () => {
            interactionActive = false;
            resize.removeEventListener('pointermove', move);
            resize.removeEventListener('pointerup', end);
            resize.removeEventListener('pointercancel', end);
            renderSelectionOwners();
            scheduleDocumentRender();
          };
          resize.addEventListener('pointermove', move);
          resize.addEventListener('pointerup', end);
          resize.addEventListener('pointercancel', end);
        });
        tableBox.append(resize);
      }
    }

    tableBox.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.scene-editor-resize-handle')) return;
      event.preventDefault();
      history.checkpoint();
      selectOwner('table');
      interactionActive = true;
      const startX = event.clientX;
      const startY = event.clientY;
      const startTableX = Number(state.settings.table_x || 0);
      const startTableY = Number(state.settings.table_y || 0);
      const width = Math.max(1, Number(state.settings.table_width_px || 1));
      const height = Math.max(1, Number(state.settings.table_height_px || 1));
      const rect = shell.getBoundingClientRect();
      tableBox.setPointerCapture?.(event.pointerId);

      const move = (moveEvent) => {
        const deltaX = (moveEvent.clientX - startX) * (SCENE_WIDTH / Math.max(1, rect.width));
        const deltaY = (moveEvent.clientY - startY) * (SCENE_HEIGHT / Math.max(1, rect.height));
        state.settings = {
          ...state.settings,
          table_x:Math.round(clamp(startTableX + deltaX, 0, SCENE_WIDTH - width)),
          table_y:Math.round(clamp(startTableY + deltaY, 0, SCENE_HEIGHT - height))
        };
        state.dirty = true;
        setDirty();
        setSelectionStatus();
        applyTableGeometry();
        scheduleDocumentRender();
      };
      const end = () => {
        interactionActive = false;
        tableBox.removeEventListener('pointermove', move);
        tableBox.removeEventListener('pointerup', end);
        tableBox.removeEventListener('pointercancel', end);
        renderSelectionOwners();
        scheduleDocumentRender();
      };
      tableBox.addEventListener('pointermove', move);
      tableBox.addEventListener('pointerup', end);
      tableBox.addEventListener('pointercancel', end);
    });
    selectionLayer.append(tableBox);

    elements.forEach((sceneElement, index) => {
      if (sceneElement.enabled === false) return;
      const box = document.createElement('button');
      box.type = 'button';
      box.className = 'scene-editor-selection-box';
      box.classList.toggle('is-selected', selectedOwner === 'element' && sceneElement.id === state.selectedElementId);
      box.dataset.sceneElementId = sceneElement.id;
      applyBoxGeometry(box, sceneElement);
      box.setAttribute('aria-label', `Выбрать Элемент ${index + 1}`);
      const label = document.createElement('span');
      label.className = 'scene-editor-selection-label';
      label.textContent = `Элемент ${index + 1}`;
      box.append(label);

      if (selectedOwner === 'element' && sceneElement.id === state.selectedElementId) {
        for (const direction of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
          const resize = document.createElement('span');
          resize.className = 'scene-editor-resize-handle';
          resize.dataset.direction = direction;
          resize.setAttribute('aria-hidden', 'true');
          resize.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            history.checkpoint();
            interactionActive = true;
            const pointerStartX = event.clientX;
            const pointerStartY = event.clientY;
            const startLeft = Number(sceneElement.x || 0);
            const startTop = Number(sceneElement.y || 0);
            const startRight = startLeft + Math.max(1, Number(sceneElement.width || 1));
            const startBottom = startTop + Math.max(1, Number(sceneElement.height || 1));
            const rect = shell.getBoundingClientRect();
            resize.setPointerCapture?.(event.pointerId);

            const move = (moveEvent) => {
              const deltaX = (moveEvent.clientX - pointerStartX) * (SCENE_WIDTH / Math.max(1, rect.width));
              const deltaY = (moveEvent.clientY - pointerStartY) * (SCENE_HEIGHT / Math.max(1, rect.height));
              let left = startLeft;
              let top = startTop;
              let right = startRight;
              let bottom = startBottom;
              if (direction.includes('w')) left = clamp(startLeft + deltaX, 0, right - 20);
              if (direction.includes('e')) right = clamp(startRight + deltaX, left + 20, SCENE_WIDTH);
              if (direction.includes('n')) top = clamp(startTop + deltaY, 0, bottom - 20);
              if (direction.includes('s')) bottom = clamp(startBottom + deltaY, top + 20, SCENE_HEIGHT);
              updateSceneElement(state, sceneElement.id, {
                x: Math.round(left),
                y: Math.round(top),
                width: Math.round(right - left),
                height: Math.round(bottom - top)
              });
              const current = state.scene?.elements?.find((item) => item.id === sceneElement.id);
              if (current) applyBoxGeometry(box, current);
              setDirty();
              setSelectionStatus();
              scheduleSceneRender();
            };
            const end = () => {
              interactionActive = false;
              resize.removeEventListener('pointermove', move);
              resize.removeEventListener('pointerup', end);
              resize.removeEventListener('pointercancel', end);
              renderSelectionOwners();
            };
            resize.addEventListener('pointermove', move);
            resize.addEventListener('pointerup', end);
            resize.addEventListener('pointercancel', end);
          });
          box.append(resize);
        }
      }

      box.addEventListener('pointerdown', (event) => {
        if (event.target.closest('.scene-editor-resize-handle')) return;
        event.preventDefault();
        history.checkpoint();
        selectInCanvas(sceneElement.id);
        interactionActive = true;

        const startX = event.clientX;
        const startY = event.clientY;
        const startSceneX = Number(sceneElement.x || 0);
        const startSceneY = Number(sceneElement.y || 0);
        const rect = shell.getBoundingClientRect();
        const width = Math.max(1, Number(sceneElement.width || 1));
        const height = Math.max(1, Number(sceneElement.height || 1));
        box.setPointerCapture?.(event.pointerId);

        const move = (moveEvent) => {
          const deltaX = (moveEvent.clientX - startX) * (SCENE_WIDTH / Math.max(1, rect.width));
          const deltaY = (moveEvent.clientY - startY) * (SCENE_HEIGHT / Math.max(1, rect.height));
          updateSceneElement(state, sceneElement.id, {
            x: Math.round(clamp(startSceneX + deltaX, 0, SCENE_WIDTH - width)),
            y: Math.round(clamp(startSceneY + deltaY, 0, SCENE_HEIGHT - height))
          });
          const current = state.scene?.elements?.find((item) => item.id === sceneElement.id);
          if (current) applyBoxGeometry(box, current);
          setDirty();
          setSelectionStatus();
          scheduleSceneRender();
        };
        const end = () => {
          interactionActive = false;
          box.removeEventListener('pointermove', move);
          box.removeEventListener('pointerup', end);
          box.removeEventListener('pointercancel', end);
          renderSelectionOwners();
        };
        box.addEventListener('pointermove', move);
        box.addEventListener('pointerup', end);
        box.addEventListener('pointercancel', end);
      });
      selectionLayer.append(box);
    });
    setSelectionStatus();
  }

  function sceneContext() {
    return {
      screen: state.screen,
      draft: { rows: state.rows, settings: state.settings },
      products: currentBundle?.products || [],
      packaging: currentBundle?.packaging || [],
      scene: state.scene,
      animation: {
        enabled: currentAnimationSettings?.enabled === true,
        profile: currentAnimationSettings?.profile || DEFAULT_LIVE_PROFILE
      },
      scene_playlist: null
    };
  }

  async function renderScene() {
    if (!renderer || !active()) return;
    await renderer.render(sceneContext(), ['scene']);
    if (!active()) return;
    if (!interactionActive) refreshSelectionOverlay();
  }

  function scheduleSceneRender() {
    if (previewFrame) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      void renderScene();
    });
  }

  function syncAddMenuAvailability() {
    const elements = Array.isArray(state.scene?.elements) ? state.scene.elements : [];
    const hasWeather = elements.some((item) => item?.type === 'weather');
    const videoCount = elements.filter((item) => item?.type === 'video' && item.enabled !== false).length;
    addMenu.querySelectorAll('[data-scene-element-type]').forEach((button) => {
      const type = button.dataset.sceneElementType;
      const unavailable = (type === 'weather' && hasWeather) || (type === 'video' && videoCount >= 2);
      button.disabled = unavailable;
      if (type === 'weather') button.title = unavailable ? 'На сцене уже есть Погода' : '';
      if (type === 'video') button.title = unavailable ? 'На сцене уже два активных видео' : '';
    });
  }

  function setAddMenuOpen(open) {
    const next = open === true && !addButton.disabled;
    addMenu.hidden = !next;
    addButton.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) syncAddMenuAvailability();
  }

  function renderLayers() {
    backgroundLayer.classList.toggle('is-selected', selectedOwner === 'background');
    animationLayer.classList.toggle('is-selected', selectedOwner === 'animation');
    tableLayer.classList.toggle('is-selected', selectedOwner === 'table');
    renderSceneLayerList(state, {
      container: layersRoot,
      onVisualChange: () => {
        setDirty();
        scheduleSceneRender();
      },
      onStructureChange: () => {
        setDirty();
        renderSelectionOwners();
        scheduleSceneRender();
      },
      onSelect: () => {
        selectedOwner = 'element';
        renderSelectionOwners();
        if (window.matchMedia('(max-width: 1100px)').matches) document.body.dataset.sceneMobilePanel = 'properties';
      }
    });
  }

  async function uploadSceneAsset(file) {
    if (!currentScreenId) throw new Error('Монитор не выбран.');
    return api.put(`${API.screens}/${currentScreenId}/scene-asset`, file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream' }
    });
  }

  function renderInspector() {
    if (selectedOwner === 'background') {
      renderBackgroundInspector();
      setSelectionStatus();
      return;
    }
    if (selectedOwner === 'animation') {
      renderAnimationInspector();
      setSelectionStatus();
      return;
    }
    if (selectedOwner === 'table') {
      renderTableInspector();
      setSelectionStatus();
      return;
    }
    tableEditLayer.hidden = true;
    tableEditLayer.replaceChildren();
    const selected = renderSceneElementInspector(state, {
      container: propertiesRoot,
      onBeforeMutate: () => history.checkpoint(),
      onVisualChange: () => {
        setDirty();
        scheduleSceneRender();
      },
      onStructureChange: () => {
        setDirty();
        renderSelectionOwners();
        scheduleSceneRender();
      },
      onUpload: uploadSceneAsset
    });
    if (!selected) {
      const title = element('scene-editor-properties-title');
      if (title) title.textContent = 'Элемент не выбран';
    }
  }

  function renderSelectionOwners() {
    renderLayers();
    renderInspector();
    syncAddMenuAvailability();
    refreshSelectionOverlay();
  }

  async function renderFullPreview() {
    renderer?.destroy();
    stage.replaceChildren();
    stage.dataset.playerActive = 'true';
    renderer = new PlayerSceneRenderer(stage, { autoplay: false, weatherPreview: true });
    await renderer.render(sceneContext(), ['screen', 'menu', 'scene', 'animation']);
    fitPreviewShell();
    refreshSelectionOverlay();
    if (selectedOwner === 'table') renderTableEditLayer();
  }

  function hydrate(bundle) {
    currentBundle = bundle;
    currentAnimationSettings = structuredClone(bundle.animation || {
      enabled:true,
      preset_id:'cinematic-live-menu',
      profile:DEFAULT_LIVE_PROFILE,
      scene_playlist:null
    });
    replaceEditorState(state, {
      screen:bundle.screen,
      rows:Array.isArray(bundle.draft?.rows) ? bundle.draft.rows : [],
      settings:bundle.draft?.settings || {},
      scene:bundle.draft?.scene || { version:1, elements:[] },
      selectedElementId:null,
      dirty:false,
      revision:0,
      draftRevision:Number(bundle.draft?.revision || 0)
    });
    selectedOwner = 'none';
    history.clear();
    const resolution = element('scene-editor-resolution');
    if (resolution) resolution.textContent = state.screen?.resolution || '—';
    const previewTitle = element('scene-editor-preview-title');
    if (previewTitle) previewTitle.textContent = state.screen?.name || 'Рабочий экран';
    const menuLink = element('scene-editor-menu-link');
    if (menuLink instanceof HTMLAnchorElement) menuLink.href = `/screen-editor?id=${state.screen.id}`;
    setDirty();
    renderSelectionOwners();
  }

  async function loadScreen(screenId) {
    const id = Number(screenId);
    if (!Number.isSafeInteger(id) || id < 1) return;
    currentScreenId = id;
    screenSelect.disabled = true;
    addButton.disabled = true;
    backgroundLayer.disabled = true;
    animationLayer.disabled = true;
    tableLayer.disabled = true;
    const saveButton = element('scene-editor-save');
    if (saveButton) saveButton.disabled = true;
    setMessage('scene-editor-message', '');
    const bundle = await api.get(`${API.screens}/${id}/editor`);
    if (!active() || currentScreenId !== id) return;
    hydrate(bundle);
    rememberScreen(id);
    screenSelect.value = String(id);
    await renderFullPreview();
    if (!active()) return;
    form.setAttribute('aria-busy', 'false');
    element('scene-editor-save').disabled = false;
    addButton.disabled = false;
    backgroundLayer.disabled = false;
    animationLayer.disabled = false;
    tableLayer.disabled = false;
    syncAddMenuAvailability();
    screenSelect.disabled = false;
  }

  async function loadScreens() {
    screens = await api.get(API.screens);
    if (!active()) return;
    screenSelect.replaceChildren();
    if (!screens.length) {
      screenSelect.add(new Option('Нет мониторов', ''));
      screenSelect.disabled = true;
      layersRoot.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'scene-editor-empty',
        textContent: 'Сначала создайте монитор.'
      }));
      propertiesRoot.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'scene-editor-empty',
        textContent: 'Нет доступной сцены.'
      }));
      form.setAttribute('aria-busy', 'false');
      return;
    }
    screens.forEach((screen) => screenSelect.add(new Option(labelForScreen(screen), String(screen.id))));
    const selected = screenFromQuery(screens);
    screenSelect.value = String(selected.id);
    await loadScreen(selected.id);
  }

  screenSelect.addEventListener('change', () => {
    const next = Number(screenSelect.value);
    if (!Number.isSafeInteger(next) || next < 1 || next === currentScreenId) return;
    if (state.dirty && !window.confirm('Есть несохранённые изменения сцены. Переключить монитор без сохранения?')) {
      screenSelect.value = String(currentScreenId);
      return;
    }
    void loadScreen(next).catch((error) => {
      if (!active()) return;
      screenSelect.value = String(currentScreenId || '');
      setMessage('scene-editor-message', error.message);
    });
  });

  undoButton.addEventListener('click', () => {
    if (history.undo()) syncAfterHistory();
  });
  redoButton.addEventListener('click', () => {
    if (history.redo()) syncAfterHistory();
  });

  shell.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.scene-editor-selection-box,.scene-editor-table-selection-box,.scene-editor-table-edit-layer')) return;
    if (selectedOwner === 'none') return;
    selectedOwner = 'none';
    state.selectedElementId = null;
    renderSelectionOwners();
  });

  const onEditorKeydown = (event) => {
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      const changed = event.shiftKey ? history.redo() : history.undo();
      if (changed) syncAfterHistory();
      return;
    }
    if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      if (history.redo()) syncAfterHistory();
      return;
    }
    if (editing) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedOwner === 'element' && state.selectedElementId) {
      const removeButton = propertiesRoot.querySelector('.editor-element-delete');
      if (removeButton instanceof HTMLButtonElement) {
        event.preventDefault();
        removeButton.click();
      }
    }
  };
  form.addEventListener('keydown', onEditorKeydown);

  backgroundLayer.addEventListener('click', () => selectOwner('background'));
  animationLayer.addEventListener('click', () => selectOwner('animation'));
  tableLayer.addEventListener('click', () => selectOwner('table'));

  mobileToolbar?.querySelectorAll('[data-scene-mobile-panel]').forEach((button) => {
    button.addEventListener('click', () => {
      const panel = button.dataset.sceneMobilePanel;
      if (panel === 'add') {
        document.body.dataset.sceneMobilePanel = 'layers';
        setAddMenuOpen(true);
        return;
      }
      document.body.dataset.sceneMobilePanel = document.body.dataset.sceneMobilePanel === panel ? '' : panel;
    });
  });

  addButton.addEventListener('click', () => {
    setAddMenuOpen(addMenu.hidden);
  });

  addMenu.querySelectorAll('[data-scene-element-type]').forEach((button) => {
    button.addEventListener('click', () => {
      history.checkpoint();
      const created = appendSceneElement(state, button.dataset.sceneElementType);
      if (!created) {
        syncAddMenuAvailability();
        return;
      }
      setAddMenuOpen(false);
      selectedOwner = 'element';
      setDirty();
      renderSelectionOwners();
      scheduleSceneRender();
    });
  });

  addMenu.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!addMenu.contains(document.activeElement) && document.activeElement !== addButton) setAddMenuOpen(false);
    }, 0);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentScreenId || !currentBundle) return;
    const save = element('scene-editor-save');
    setPending(save, true, 'Сохраняем…');
    try {
      const saved = await api.put(`${API.screens}/${currentScreenId}/draft`, {
        revision: state.draftRevision,
        rows: structuredClone(state.rows),
        settings: structuredClone(state.settings),
        scene: structuredClone(state.scene),
        animation: {
          enabled: currentAnimationSettings?.enabled === true,
          preset_id: currentAnimationSettings?.preset_id || 'cinematic-live-menu',
          profile: structuredClone(currentAnimationSettings?.profile || DEFAULT_LIVE_PROFILE)
        }
      });
      if (!active()) return;
      currentBundle = { ...currentBundle, screen: saved.screen, draft: saved.draft, animation:saved.animation || currentAnimationSettings };
      currentAnimationSettings = structuredClone(saved.animation || currentAnimationSettings);
      state.screen = structuredClone(saved.screen);
      state.rows = structuredClone(saved.draft.rows || []);
      state.settings = structuredClone(saved.draft.settings || {});
      state.scene = structuredClone(saved.draft.scene || { version: 1, elements: [] });
      if (selectedOwner === 'element' && !state.scene.elements.some((item) => item.id === state.selectedElementId)) {
        state.selectedElementId = state.scene.elements[0]?.id || null;
        selectedOwner = state.selectedElementId ? 'element' : 'table';
      }
      state.draftRevision = Number(saved.draft.revision || state.draftRevision);
      state.dirty = false;
      history.clear();
      setDirty();
      renderSelectionOwners();
      setMessage('scene-editor-message', 'Сцена и анимация сохранены и доступны TV Player.', 'success');
    } catch (error) {
      if (active()) setMessage('scene-editor-message', error.message);
    } finally {
      if (active()) setPending(save, false, 'Сохраняем…');
    }
  });

  const onBeforeUnload = (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  resizeObserver = new ResizeObserver(() => {
    fitPreviewShell();
    refreshSelectionOverlay();
  });
  resizeObserver.observe(canvasPane);

  void loadScreens().catch((error) => {
    if (!active()) return;
    form.setAttribute('aria-busy', 'false');
    setMessage('scene-editor-message', error.message);
  });

  return {
    canLeave() {
      return !state.dirty || window.confirm('Есть несохранённые изменения сцены. Перейти без сохранения?');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      if (previewFrame) cancelAnimationFrame(previewFrame);
      if (documentPreviewFrame) cancelAnimationFrame(documentPreviewFrame);
      resizeObserver?.disconnect();
      renderer?.destroy();
      renderer = null;
      window.removeEventListener('beforeunload', onBeforeUnload);
      form.removeEventListener('keydown', onEditorKeydown);
      delete document.body.dataset.sceneMobilePanel;
    }
  };
}
