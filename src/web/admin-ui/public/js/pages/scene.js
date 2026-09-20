import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { updateSceneElement, selectSceneElement } from '../editor/commands.js';
import {
  appendSceneElement,
  renderSceneElementInspector,
  renderSceneLayerList
} from '../editor/elements.js';
import { PlayerSceneRenderer } from '../player/player-scene-renderer.js';

const SCENE_WIDTH = 1920;
const SCENE_HEIGHT = 1080;
const ELEMENT_LABELS = Object.freeze({
  text: 'Текстовое поле',
  logo: 'Логотип',
  image: 'Картинка',
  video: 'Видео',
  weather: 'Погода',
  background: 'Фон',
  table: 'Таблица меню'
});
const ELEMENT_ICONS = Object.freeze({
  text: 'T',
  logo: '◈',
  image: '▧',
  video: '▶',
  weather: '☁',
  background: '▧',
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

function createState() {
  return {
    screen: null,
    rows: [],
    settings: {},
    scene: { version: 1, elements: [] },
    selectedElementId: null,
    dirty: false,
    revision: 0,
    draftRevision: 0
  };
}

export function initialiseSceneEditor() {
  const form = element('scene-editor-form');
  const stage = element('scene-editor-stage');
  const shell = element('scene-editor-stage-shell');
  const canvasPane = element('scene-editor-canvas-pane');
  const selectionLayer = element('scene-editor-selection-layer');
  const layersRoot = element('scene-editor-layers');
  const propertiesRoot = element('scene-editor-properties');
  const addButton = element('scene-editor-add');
  const addMenu = element('scene-editor-add-menu');
  const backgroundLayer = element('scene-editor-background-layer');
  const tableLayer = element('scene-editor-table-layer');
  const mobileToolbar = form.querySelector('.scene-editor-mobile-toolbar');
  const screenSelect = element('scene-editor-screen');
  if (!(form instanceof HTMLFormElement)
      || !(stage instanceof HTMLElement)
      || !(shell instanceof HTMLElement)
      || !(canvasPane instanceof HTMLElement)
      || !(selectionLayer instanceof HTMLElement)
      || !(layersRoot instanceof HTMLElement)
      || !(propertiesRoot instanceof HTMLElement)
      || !(addButton instanceof HTMLButtonElement)
      || !(addMenu instanceof HTMLElement)
      || !(backgroundLayer instanceof HTMLButtonElement)
      || !(tableLayer instanceof HTMLButtonElement)
      || !(screenSelect instanceof HTMLSelectElement)) return undefined;

  const token = ++generation;
  const state = createState();
  let renderer = null;
  let screens = [];
  let currentBundle = null;
  let currentScreenId = null;
  let disposed = false;
  let previewFrame = 0;
  let resizeObserver = null;
  let interactionActive = false;
  let selectedOwner = 'table';

  const active = () => !disposed && token === generation && document.body.dataset.page === 'scene';

  function setDirty() {
    const target = element('scene-editor-dirty-state');
    if (!target) return;
    target.textContent = state.dirty ? 'Не сохранено' : 'Сохранено';
    target.classList.toggle('is-dirty', state.dirty);
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
      kind.textContent = ownerType ? (ELEMENT_ICONS[ownerType] || '•') : '—';
      kind.dataset.elementType = ownerType || '';
      kind.dataset.tooltip = ownerType ? typeLabel : '';
      kind.setAttribute('aria-label', typeLabel);
      kind.title = ownerType ? typeLabel : '';
    }
  }

  function fitPreviewShell() {
    if (!state.screen) return;
    const resolution = resolutionOf(state.screen);
    const widthLimit = Math.max(360, canvasPane.clientWidth * .9);
    const heightLimit = Math.max(240, canvasPane.clientHeight * .82);
    const scale = Math.min(widthLimit / resolution.width, heightLimit / resolution.height);
    const width = Math.max(360, Math.floor(resolution.width * scale));
    const height = Math.max(203, Math.floor(resolution.height * scale));
    shell.style.width = `${width}px`;
    shell.style.height = `${height}px`;
    shell.style.aspectRatio = `${resolution.width} / ${resolution.height}`;
    const zoom = element('scene-editor-zoom');
    if (zoom) zoom.textContent = `${Math.max(1, Math.round(scale * 100))}%`;
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

  async function renderDocumentPreview() {
    if (!renderer || !active()) return;
    await renderer.render(sceneContext(), ['screen', 'menu']);
    if (!active()) return;
    refreshSelectionOverlay();
  }

  function patchMenuSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    state.dirty = true;
    setDirty();
    setSelectionStatus();
    void renderDocumentPreview();
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

  function renderBackgroundInspector() {
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
    font.addEventListener('change', () => patchMenuSettings({ font_family:font.value }));
    const scale = compactInput('number', state.settings.font_scale_percent || 100, { min:55,max:130,step:1 });
    scale.setAttribute('aria-label','Масштаб шрифта таблицы');
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
      control.addEventListener('input', () => patchMenuSettings({ [key]:control.value.toUpperCase() }));
      paletteGrid.append(makeField(caption,control));
    }
    palettePanel.append(paletteGrid);
    palette.append(palettePanel);

    const content = document.createElement('div');
    content.className = 'scene-editor-table-content-hint';
    content.textContent = 'Клик по таблице на рабочем поле включает её редактирование. Наполнение строк переносится сюда следующим этапом без отдельного Preview-редактора.';

    stack.append(geometry, typography, palette, content);
    propertiesRoot.append(stack);
  }

  function refreshSelectionOverlay() {
    selectionLayer.replaceChildren();
    const elements = Array.isArray(state.scene?.elements) ? state.scene.elements : [];
    elements.forEach((sceneElement, index) => {
      if (sceneElement.enabled === false) return;
      const box = document.createElement('button');
      box.type = 'button';
      box.className = 'scene-editor-selection-box';
      box.classList.toggle('is-selected', sceneElement.id === state.selectedElementId);
      box.dataset.sceneElementId = sceneElement.id;
      applyBoxGeometry(box, sceneElement);
      box.setAttribute('aria-label', `Выбрать Элемент ${index + 1}`);
      const label = document.createElement('span');
      label.className = 'scene-editor-selection-label';
      label.textContent = `Элемент ${index + 1}`;
      box.append(label);

      if (sceneElement.id === state.selectedElementId) {
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
      animation: { enabled: false, profile: null },
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
      onSelect: () => renderSelectionOwners()
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
    if (selectedOwner === 'table') {
      renderTableInspector();
      setSelectionStatus();
      return;
    }
    const selected = renderSceneElementInspector(state, {
      container: propertiesRoot,
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
    stage.dataset.playerActive = 'false';
    renderer = new PlayerSceneRenderer(stage, { autoplay: false, weatherPreview: true });
    await renderer.render(sceneContext(), ['screen', 'menu', 'scene']);
    fitPreviewShell();
    refreshSelectionOverlay();
  }

  function hydrate(bundle) {
    currentBundle = bundle;
    state.screen = structuredClone(bundle.screen);
    state.rows = structuredClone(Array.isArray(bundle.draft?.rows) ? bundle.draft.rows : []);
    state.settings = structuredClone(bundle.draft?.settings || {});
    state.scene = structuredClone(bundle.draft?.scene || { version: 1, elements: [] });
    state.selectedElementId = state.scene.elements?.[0]?.id || null;
    selectedOwner = state.selectedElementId ? 'element' : 'table';
    state.dirty = false;
    state.revision = 0;
    state.draftRevision = Number(bundle.draft?.revision || 0);
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

  backgroundLayer.addEventListener('click', () => selectOwner('background'));
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
        scene: structuredClone(state.scene)
      });
      if (!active()) return;
      currentBundle = { ...currentBundle, screen: saved.screen, draft: saved.draft };
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
      setDirty();
      renderSelectionOwners();
      setMessage('scene-editor-message', 'Сцена сохранена и доступна TV Player.', 'success');
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
      resizeObserver?.disconnect();
      renderer?.destroy();
      renderer = null;
      window.removeEventListener('beforeunload', onBeforeUnload);
      delete document.body.dataset.sceneMobilePanel;
    }
  };
}
