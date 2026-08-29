import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';
import { navigate } from '../core/router.js';
import { createEditorState, markEditorSaved, replaceEditorState } from './state.js';
import { updateSettings } from './commands.js';
import { createEditorHistory } from './history.js';
import { normaliseEditorSettings } from './settings.js';
import { appendRow, renderRows } from './rows.js';
import { bindScreenProperties, bindSettingsProperties, readEditorSettings, readScreenProperties, syncDeliveryControls, writeEditorSettings, writeScreenProperties } from './properties.js';
import { renderPreview } from './preview.js';
import { serializeDraft } from './serializer.js';
import { renderFinalJpeg } from './final-image.js';

const EDITOR_LOADING_CONTROLS = Object.freeze([
  'editor-name', 'editor-resolution', 'editor-status', 'editor-active',
  'editor-background-color', 'editor-accent-color', 'editor-text-color',
  'editor-font-scale', 'editor-font-scale-number', 'editor-font-family',
  'editor-table-x', 'editor-table-y', 'editor-table-width', 'editor-table-height',
  'editor-background-file', 'editor-background-upload', 'editor-background-remove',
  'editor-add-section', 'editor-add-item', 'editor-add-packaging',
  'editor-publish', 'editor-save'
]);

function editorScreenId() {
  const id = Number(new URLSearchParams(window.location.search).get('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function bindExclusiveToolMenus(form) {
  const menus = [...form.querySelectorAll('.editor-tool-menu')].filter((node) => node instanceof HTMLDetailsElement);
  menus.forEach((menu) => {
    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      menus.forEach((other) => {
        if (other !== menu) other.open = false;
      });
    });
  });

  const onKeydown = (event) => {
    if (event.key !== 'Escape') return;
    menus.forEach((menu) => { menu.open = false; });
  };
  document.addEventListener('keydown', onKeydown);
  return () => document.removeEventListener('keydown', onKeydown);
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
  syncDeliveryControls(screen, editorState);
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
  const rowsTarget = element('editor-menu-rows');
  const rowsEmpty = element('editor-menu-empty');

  setEditorLoading(form, true);

  const refreshPreview = (screenOverride = editorState.screen || screen) => renderPreview(editorState, {
    screen: screenOverride,
    products,
    packaging,
    target: previewTarget
  });

  const refreshEditorView = () => {
    if (!isMounted()) return null;
    const activeScreen = editorState.screen || screen;
    const preview = refreshPreview(activeScreen);
    setLayoutWarning(preview, activeScreen);
    setFontScaleState(preview);
    setDirtyState(editorState);
    syncDeliveryControls(screen || activeScreen, editorState);
    return preview;
  };

  const refreshRows = () => {
    if (!isMounted()) return;
    renderRows(editorState, {
      target: rowsTarget,
      empty: rowsEmpty,
      products,
      packaging,
      onChange: refreshEditorView
    });
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
      dirty: false,
      revision: 0,
      draftRevision: Number(editor.draft?.revision || 0)
    });
    history.clear();
    populateEditor(screen, editorState);
    refreshRows();
    setEditorLoading(form, false);
    refreshEditorView();
  };
  void load().catch((error) => { if (isMounted()) setEditorMessage(error.message); });

  bindSettingsProperties(editorState, refreshEditorView);
  bindScreenProperties(editorState, refreshEditorView);
  element('editor-add-section')?.addEventListener('click', () => { history.checkpoint(); appendRow(editorState, 'section'); refreshRows(); refreshEditorView(); });
  element('editor-add-item')?.addEventListener('click', () => { history.checkpoint(); appendRow(editorState, 'item'); refreshRows(); refreshEditorView(); });
  element('editor-add-packaging')?.addEventListener('click', () => { history.checkpoint(); appendRow(editorState, 'packaging'); refreshRows(); refreshEditorView(); });

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
        dirty: false,
        revision: editorState.revision,
        draftRevision: Number(saved.draft.revision || 0)
      });
      screen = saved.screen;
      markEditorSaved(editorState);
      history.clear();

      let jpegPrepared = false;
      let jpegError = null;
      try {
        const jpeg = await renderFinalJpeg(editorState, { screen, products, packaging });
        screen = await api.put(`${API.screens}/${screenId}/source`, jpeg, { headers: { 'Content-Type': 'image/jpeg' } });
        if (!isMounted()) return;
        editorState.screen = structuredClone(screen);
        jpegPrepared = true;
      } catch (error) {
        jpegError = error;
      }

      if (!isMounted()) return;
      populateEditor(screen, editorState);
      refreshRows();
      refreshEditorView();
      await loadNotifications();
      if (jpegPrepared) setEditorMessage('Сохранено. JPEG собран и готов к публикации.', 'success');
      else setEditorMessage(`Меню сохранено, но JPEG не собран: ${jpegError?.message || 'неизвестная ошибка'}.`, 'error');
    } catch (error) {
      if (isMounted()) setEditorMessage(error.message);
    } finally {
      if (isMounted()) setPending(submit, false, 'Сохраняем…');
    }
  });

  element('editor-background-upload')?.addEventListener('click', async () => {
    if (editorState.dirty) return setEditorMessage('Сначала сохраните текущие изменения, затем загрузите фон.');
    const file = element('editor-background-file')?.files?.[0];
    if (!file) return setEditorMessage('Выберите PNG, JPEG или WebP.');
    const button = element('editor-background-upload');
    setPending(button, true, 'Загружаем…');
    try {
      const result = await api.put(`${API.screens}/${screenId}/background`, file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Draft-Revision': String(editorState.draftRevision) }
      });
      if (!isMounted()) return;
      screen = result.screen;
      replaceEditorState(editorState, {
        screen,
        rows: result.draft.rows || [],
        settings: normaliseEditorSettings(result.draft.settings || {}),
        dirty: false,
        revision: editorState.revision,
        draftRevision: Number(result.draft.revision || 0)
      });
      history.clear();
      populateEditor(screen, editorState);
      refreshEditorView();
      setEditorMessage('Фон монитора загружен.', 'success');
    } catch (error) {
      if (isMounted()) setEditorMessage(error.message);
    } finally {
      if (isMounted()) setPending(button, false, 'Загружаем…');
    }
  });

  element('editor-background-remove')?.addEventListener('click', async () => {
    if (editorState.dirty) return setEditorMessage('Сначала сохраните текущие изменения.');
    if (!editorState.settings.background_image_url) return;
    try {
      const result = await api.delete(`${API.screens}/${screenId}/background`, {
        headers: { 'X-Draft-Revision': String(editorState.draftRevision) }
      });
      if (!isMounted()) return;
      screen = result.screen;
      replaceEditorState(editorState, {
        screen,
        rows: result.draft.rows || [],
        settings: normaliseEditorSettings(result.draft.settings || {}),
        dirty: false,
        revision: editorState.revision,
        draftRevision: Number(result.draft.revision || 0)
      });
      history.clear();
      populateEditor(screen, editorState);
      refreshEditorView();
      setEditorMessage('Фон удалён.', 'success');
    } catch (error) {
      if (isMounted()) setEditorMessage(error.message);
    }
  });

  element('editor-publish')?.addEventListener('click', async () => {
    if (editorState.dirty) return setEditorMessage('Сначала сохраните изменения.');
    const button = element('editor-publish');
    setPending(button, true, 'Публикуем…');
    try {
      screen = await api.post(`${API.screens}/${screenId}/publish`);
      if (!isMounted()) return;
      editorState.screen = structuredClone(screen);
      populateEditor(screen, editorState);
      refreshEditorView();
      setEditorMessage('JPEG опубликован в SFTP-папке торговой точки.', 'success');
      await loadNotifications();
    } catch (error) {
      if (isMounted()) setEditorMessage(error.message);
    } finally {
      if (isMounted()) setPending(button, false, 'Публикуем…');
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
