import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';
import { navigate } from '../core/router.js';
import { createEditorState, markEditorSaved, replaceEditorState } from './state.js';
import { updateSettings } from './commands.js';
import { createEditorHistory } from './history.js';
import { normaliseEditorSettings } from './settings.js';
import { appendRow, renderPreviewRows } from './rows.js';
import { bindScreenProperties, bindSettingsProperties, readEditorSettings, readScreenProperties, writeEditorSettings, writeScreenProperties } from './properties.js';
import { renderPreview } from './preview.js';
import { serializeDraft } from './serializer.js';

const EDITOR_LOADING_CONTROLS = Object.freeze([
  'editor-name', 'editor-resolution', 'editor-status', 'editor-active',
  'editor-font-scale', 'editor-font-scale-number', 'editor-font-family',
  'editor-table-x', 'editor-table-y', 'editor-table-width', 'editor-table-height',
  'editor-add-section', 'editor-add-item', 'editor-add-packaging',
  'editor-save'
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

function populateEditor(screen, editorState) {
  writeScreenProperties(screen);
  writeEditorSettings(editorState.settings);
}

function setDirtyState(editorState) {
  const target = element('editor-dirty-state');
  if (!target) return;
  target.textContent = editorState.dirty ? 'Не сохранено' : 'Сохранено';
  target.classList.toggle('is-dirty', editorState.dirty);
}

function setFontScaleState(preview) {
  const target = element('editor-font-scale-effective');
  if (!target) return;
  const vertical = preview?.layout?.vertical;
  if (!vertical) {
    target.textContent = 'Фактический масштаб будет рассчитан после загрузки меню.';
    target.classList.remove('is-auto-reduced');
    return;
  }
  target.textContent = vertical.autoReduced
    ? `Задано ${vertical.requestedPercent}%, применено ${vertical.effectivePercent}% для вмещения.`
    : `Фактически ${vertical.effectivePercent}%.`;
  target.classList.toggle('is-auto-reduced', vertical.autoReduced);
}

function setLayoutWarning(preview, screen) {
  const target = element('editor-layout-warning');
  if (!target) return;
  if (preview?.invalidResolution) {
    target.classList.remove('is-hidden');
    target.textContent = 'Укажите разрешение в формате 1920×1080.';
    return;
  }
  const overflowing = preview?.layout?.vertical?.fits === false;
  target.classList.toggle('is-hidden', !overflowing);
  target.textContent = overflowing
    ? `Таблица не помещается в заданную высоту на ${screen?.resolution || 'экране'}. Увеличьте высоту области или сократите строки.`
    : '';
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
  const history = createEditorHistory(editorState);
  let screen = null;
  let products = [];
  let packaging = [];

  const previewTarget = element('editor-menu-preview');
  const inspectorTarget = element('editor-preview-row-inspector');

  setEditorLoading(form, true);

  const refreshPreview = (screenOverride = editorState.screen || screen) => renderPreview(editorState, {
    screen: screenOverride,
    products,
    packaging,
    target: previewTarget
  });

  const refreshEditorView = ({ syncRows = true } = {}) => {
    if (!isMounted()) return null;
    const activeScreen = editorState.screen || screen;
    const preview = refreshPreview(activeScreen);
    if (syncRows && preview?.editorLayer) {
      renderPreviewRows(editorState, {
        target: preview.editorLayer,
        inspector: inspectorTarget,
        model: preview.model,
        lines: preview.lines,
        layout: preview.layout,
        products,
        packaging,
        onBeforeMutate: () => history.checkpoint(),
        onVisualChange: () => refreshEditorView({ syncRows: false }),
        onStructureChange: () => refreshEditorView({ syncRows: true })
      });
    }
    setLayoutWarning(preview, activeScreen);
    setFontScaleState(preview);
    setDirtyState(editorState);
    return preview;
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
    history.clear();
    populateEditor(screen, editorState);
    const sceneLink = element('editor-scene-link');
    if (sceneLink instanceof HTMLAnchorElement) sceneLink.href = `/scene?screen=${screenId}`;
    setEditorLoading(form, false);
    refreshEditorView();
  };
  void load().catch((error) => { if (isMounted()) setEditorMessage(error.message); });

  bindSettingsProperties(editorState, refreshEditorView);
  bindScreenProperties(editorState, refreshEditorView);
  element('editor-add-section')?.addEventListener('click', () => { history.checkpoint(); appendRow(editorState, 'section'); refreshEditorView(); });
  element('editor-add-item')?.addEventListener('click', () => { history.checkpoint(); appendRow(editorState, 'item'); refreshEditorView(); });
  element('editor-add-packaging')?.addEventListener('click', () => { history.checkpoint(); appendRow(editorState, 'packaging'); refreshEditorView(); });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('editor-save');
    setPending(submit, true, 'Сохраняем…');
    try {
      updateSettings(editorState, readEditorSettings(editorState.settings));
      const screenPayload = readScreenProperties(editorState.screen || screen);
      const preview = refreshPreview(screenPayload);
      setLayoutWarning(preview, screenPayload);
      setFontScaleState(preview);
      if (preview?.invalidResolution) throw new Error('Укажите разрешение в формате 1920×1080.');
      if (!preview?.layout?.vertical?.fits) throw new Error('Таблица не помещается в заданную область. Измените высоту, масштаб или количество строк.');

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
      history.clear();
      populateEditor(screen, editorState);
      refreshEditorView();
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
      unbindToolMenus();
      window.removeEventListener('beforeunload', onBeforeUnload);
    }
  };
}
