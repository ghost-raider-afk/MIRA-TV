import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';
import { navigate } from '../core/router.js';
import { createEditorState, markEditorSaved, replaceEditorState } from './state.js';
import { normaliseEditorSettings, parseResolution } from './settings.js';
import { bindScreenProperties, readScreenProperties, writeScreenProperties } from './properties.js';
import { serializeDraft } from './serializer.js';
import { PlayerSceneRenderer } from '../player/player-scene-renderer.js';

const EDITOR_LOADING_CONTROLS = Object.freeze([
  'editor-name', 'editor-resolution', 'editor-status', 'editor-active', 'editor-save'
]);

function editorScreenId() {
  const id = Number(new URLSearchParams(window.location.search).get('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function bindExclusiveToolMenus(form) {
  const menus = [...form.querySelectorAll('.editor-tool-menu')].filter((node) => node instanceof HTMLDetailsElement);
  const listeners = [];

  menus.forEach((menu) => {
    const summary = menu.querySelector(':scope > summary');
    if (!(summary instanceof HTMLElement)) return;
    const onClick = (event) => {
      event.preventDefault();
      const shouldOpen = !menu.open;
      menus.forEach((other) => { other.open = false; });
      menu.open = shouldOpen;
    };
    summary.addEventListener('click', onClick);
    listeners.push([summary, onClick]);
  });

  const onKeydown = (event) => {
    if (event.key !== 'Escape') return;
    menus.forEach((menu) => { menu.open = false; });
  };
  document.addEventListener('keydown', onKeydown);
  return () => {
    listeners.forEach(([summary, onClick]) => summary.removeEventListener('click', onClick));
    document.removeEventListener('keydown', onKeydown);
  };
}

function setEditorMessage(message, kind = 'error') {
  setMessage('screen-editor-message', message, kind);
}

function setEditorLoading(form, loading) {
  form.setAttribute('aria-busy', loading ? 'true' : 'false');
  EDITOR_LOADING_CONTROLS.forEach((id) => {
    const control = element(id);
    if (control && 'disabled' in control) control.disabled = loading;
  });
}

function populateEditor(screen) {
  writeScreenProperties(screen);
}

function setDirtyState(editorState) {
  const target = element('editor-dirty-state');
  if (!target) return;
  target.textContent = editorState.dirty ? 'Не сохранено' : 'Сохранено';
  target.classList.toggle('is-dirty', editorState.dirty);
}

function setResolutionWarning(screen) {
  const target = element('editor-layout-warning');
  if (!target) return;
  const valid = Boolean(parseResolution(screen?.resolution));
  target.classList.toggle('is-hidden', valid);
  target.textContent = valid ? '' : 'Укажите разрешение в формате 1920×1080.';
}

export function initialiseScreenEditor() {
  const form = element('screen-editor-form');
  const screenId = editorScreenId();
  if (!(form instanceof HTMLFormElement) || !screenId) {
    void navigate('/screens.html', { replace: true });
    return undefined;
  }

  let disposed = false;
  const unbindToolMenus = bindExclusiveToolMenus(form);
  const isMounted = () => !disposed && document.getElementById('screen-editor-form') === form;

  const editorState = createEditorState();
  let screen = null;
  let products = [];
  let packaging = [];
  let renderer = null;
  let previewFrame = 0;

  const previewTarget = element('editor-menu-preview');
  if (!(previewTarget instanceof HTMLElement)) {
    void navigate('/screens.html', { replace:true });
    return undefined;
  }

  setEditorLoading(form, true);

  const syncPreviewFrame = (screenOverride = editorState.screen || screen) => {
    const resolution = parseResolution(screenOverride?.resolution);
    previewTarget.style.aspectRatio = resolution ? `${resolution.width} / ${resolution.height}` : '16 / 9';
    setResolutionWarning(screenOverride);
    return resolution;
  };

  const previewContext = (screenOverride = editorState.screen || screen) => ({
    screen:screenOverride,
    draft:{ rows:editorState.rows, settings:editorState.settings },
    products,
    packaging,
    scene:editorState.scene,
    animation:{ enabled:false, profile:null },
    scene_playlist:null
  });

  const renderPlayerPreview = async (screenOverride = editorState.screen || screen, changed = ['screen','menu']) => {
    if (!isMounted() || !screenOverride) return;
    syncPreviewFrame(screenOverride);
    if (!renderer) renderer = new PlayerSceneRenderer(previewTarget, { autoplay:false, weatherPreview:true });
    await renderer.render(previewContext(screenOverride), changed);
  };

  const schedulePlayerPreview = (screenOverride = editorState.screen || screen) => {
    if (previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      void renderPlayerPreview(screenOverride);
    });
  };

  const refreshEditorView = () => {
    if (!isMounted()) return;
    const activeScreen = editorState.screen || screen;
    syncPreviewFrame(activeScreen);
    setDirtyState(editorState);
    schedulePlayerPreview(activeScreen);
  };

  const load = async () => {
    const editor = await api.get(`${API.screens}/${screenId}/editor`);
    if (!isMounted()) return;
    screen = editor.screen;
    products = editor.products;
    packaging = editor.packaging;
    replaceEditorState(editorState, {
      screen,
      rows: Array.isArray(editor.draft?.rows) ? editor.draft.rows : [],
      settings: normaliseEditorSettings(editor.draft?.settings || {}),
      scene: structuredClone(editor.draft?.scene || { version: 1, elements: [] }),
      dirty: false,
      revision: 0,
      draftRevision: Number(editor.draft?.revision || 0)
    });
    populateEditor(screen);
    const sceneLink = element('editor-scene-link');
    const previewSceneLink = element('editor-preview-scene-link');
    if (sceneLink instanceof HTMLAnchorElement) sceneLink.href = `/scene?screen=${screenId}`;
    if (previewSceneLink instanceof HTMLAnchorElement) previewSceneLink.href = `/scene?screen=${screenId}`;
    setEditorLoading(form, false);
    setDirtyState(editorState);
    await renderPlayerPreview(screen, ['screen','menu','scene']);
  };
  void load().catch((error) => { if (isMounted()) setEditorMessage(error.message); });

  bindScreenProperties(editorState, refreshEditorView);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('editor-save');
    setPending(submit, true, 'Сохраняем…');
    try {
      const screenPayload = readScreenProperties(editorState.screen || screen);
      if (!parseResolution(screenPayload.resolution)) throw new Error('Укажите разрешение в формате 1920×1080.');

      const saved = await api.put(`${API.screens}/${screenId}/draft`, serializeDraft(editorState, screenPayload));
      if (!isMounted()) return;
      replaceEditorState(editorState, {
        screen: saved.screen,
        rows: saved.draft.rows || [],
        settings: normaliseEditorSettings(saved.draft.settings || {}),
        scene: structuredClone(saved.draft.scene || { version: 1, elements: [] }),
        dirty: false,
        revision: editorState.revision,
        draftRevision: Number(saved.draft.revision || 0)
      });
      screen = saved.screen;
      markEditorSaved(editorState);
      populateEditor(screen);
      setDirtyState(editorState);
      await renderPlayerPreview(screen, ['screen','menu','scene']);
      await loadNotifications();
      setEditorMessage('Состояние сохранено и доступно TV Player.', 'success');
    } catch (error) {
      if (isMounted()) setEditorMessage(error.message);
    } finally {
      if (isMounted()) setPending(submit, false, 'Сохраняем…');
    }
  });

  const onBeforeUnload = (event) => {
    if (!editorState.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  return {
    canLeave() {
      return !editorState.dirty || window.confirm('Есть несохранённые изменения. Перейти в другой раздел без сохранения?');
    },
    dispose() {
      disposed = true;
      if (previewFrame) cancelAnimationFrame(previewFrame);
      renderer?.destroy();
      renderer = null;
      unbindToolMenus();
      window.removeEventListener('beforeunload', onBeforeUnload);
    }
  };
}
