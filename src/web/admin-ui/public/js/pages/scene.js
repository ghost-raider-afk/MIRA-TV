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
  const screenSelect = element('scene-editor-screen');
  if (!(form instanceof HTMLFormElement)
      || !(stage instanceof HTMLElement)
      || !(shell instanceof HTMLElement)
      || !(canvasPane instanceof HTMLElement)
      || !(selectionLayer instanceof HTMLElement)
      || !(layersRoot instanceof HTMLElement)
      || !(propertiesRoot instanceof HTMLElement)
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

  const active = () => !disposed && token === generation && document.body.dataset.page === 'scene';

  function setDirty() {
    const target = element('scene-editor-dirty-state');
    if (!target) return;
    target.textContent = state.dirty ? 'Не сохранено' : 'Сохранено';
    target.classList.toggle('is-dirty', state.dirty);
  }

  function selectedElement() {
    return state.scene?.elements?.find((item) => item.id === state.selectedElementId) || null;
  }

  function setSelectionStatus() {
    const selected = selectedElement();
    const status = element('scene-editor-selection-status');
    const title = element('scene-editor-properties-title');
    const elements = Array.isArray(state.scene?.elements) ? state.scene.elements : [];
    const index = selected ? elements.indexOf(selected) : -1;
    const caption = selected ? `Элемент ${index + 1}` : 'Элемент не выбран';
    if (status) status.textContent = selected
      ? `${caption} · X ${Math.round(Number(selected.x) || 0)} · Y ${Math.round(Number(selected.y) || 0)}`
      : 'Элемент не выбран';
    if (title) title.textContent = caption;
  }

  function fitPreviewShell() {
    if (!state.screen) return;
    const resolution = resolutionOf(state.screen);
    const widthLimit = Math.max(240, canvasPane.clientWidth * .82);
    const heightLimit = Math.max(180, canvasPane.clientHeight * .68);
    const scale = Math.min(widthLimit / resolution.width, heightLimit / resolution.height);
    const width = Math.max(240, Math.floor(resolution.width * scale));
    const height = Math.max(135, Math.floor(resolution.height * scale));
    shell.style.width = `${width}px`;
    shell.style.height = `${height}px`;
    shell.style.aspectRatio = `${resolution.width} / ${resolution.height}`;
    const zoom = element('scene-editor-zoom');
    if (zoom) zoom.textContent = `${Math.max(1, Math.round(scale * 100))}%`;
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
      box.style.left = `${(Number(sceneElement.x || 0) / SCENE_WIDTH) * 100}%`;
      box.style.top = `${(Number(sceneElement.y || 0) / SCENE_HEIGHT) * 100}%`;
      box.style.width = `${(Number(sceneElement.width || 1) / SCENE_WIDTH) * 100}%`;
      box.style.height = `${(Number(sceneElement.height || 1) / SCENE_HEIGHT) * 100}%`;
      box.style.transform = `rotate(${Number(sceneElement.rotation_deg || 0)}deg)`;
      box.setAttribute('aria-label', `Выбрать Элемент ${index + 1}`);
      const label = document.createElement('span');
      label.className = 'scene-editor-selection-label';
      label.textContent = `Элемент ${index + 1}`;
      box.append(label);

      box.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        selectSceneElement(state, sceneElement.id);
        renderSelectionOwners();

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
          setDirty();
          scheduleSceneRender();
        };
        const end = () => {
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
    refreshSelectionOverlay();
  }

  function scheduleSceneRender() {
    if (previewFrame) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      void renderScene();
    });
  }

  function renderLayers() {
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
    element('scene-editor-add').disabled = false;
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

  element('scene-editor-add')?.addEventListener('click', () => {
    appendSceneElement(state);
    setDirty();
    renderSelectionOwners();
    scheduleSceneRender();
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
      if (!state.scene.elements.some((item) => item.id === state.selectedElementId)) {
        state.selectedElementId = state.scene.elements[0]?.id || null;
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
    }
  };
}
