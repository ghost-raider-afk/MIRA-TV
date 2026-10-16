import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { setMessage, setPending } from '../core/dom.js';

export function initialiseSceneTvApply() {
  const actions = document.querySelector('.scene-editor-command-actions');
  const screenSelect = document.getElementById('scene-editor-screen');
  const dirtyState = document.getElementById('scene-editor-dirty-state');
  const saveButton = document.getElementById('scene-editor-save');
  if (!actions || !screenSelect || !dirtyState || !saveButton) return undefined;

  const button = document.createElement('button');
  button.id = 'scene-editor-apply-tv';
  button.className = 'button button-primary';
  button.type = 'button';
  button.textContent = 'Применить на ТВ';
  button.title = 'Сохранить текущее состояние сцены при необходимости и применить его на подключённом ТВ';
  actions.insertBefore(button, saveButton.nextSibling);

  let applyAfterSave = false;
  let applyAfterSaveScreenId = null;

  const selectedScreenId = () => {
    const screenId = Number(screenSelect.value);
    return Number.isSafeInteger(screenId) && screenId > 0 ? screenId : null;
  };

  const syncEnabled = () => {
    button.disabled = applyAfterSave || screenSelect.disabled || saveButton.disabled || !selectedScreenId();
  };

  const forceApply = async (requestedScreenId = selectedScreenId()) => {
    const screenId = Number(requestedScreenId);
    if (!Number.isSafeInteger(screenId) || screenId < 1) return;

    setPending(button, true, 'Применяем…');
    try {
      const result = await api.post(`${API.deviceBindings}/${screenId}/apply`, {});
      setMessage(
        'scene-editor-message',
        `Текущее сохранённое состояние принудительно применяется на ТВ${result?.revision ? ` · ревизия ${result.revision}` : ''}.`,
        'success'
      );
    } catch (error) {
      setMessage('scene-editor-message', error.message || 'Не удалось применить состояние на ТВ.');
    } finally {
      setPending(button, false);
      syncEnabled();
    }
  };

  const syncAfterSave = () => {
    syncEnabled();
    if (!applyAfterSave || saveButton.disabled) return;
    const screenId = applyAfterSaveScreenId;
    applyAfterSave = false;
    applyAfterSaveScreenId = null;
    if (dirtyState.classList.contains('is-dirty')) {
      syncEnabled();
      return;
    }
    void forceApply(screenId);
  };

  const stateObserver = typeof MutationObserver === 'function'
    ? new MutationObserver(syncAfterSave)
    : null;
  stateObserver?.observe(screenSelect, {
    childList: true,
    attributes: true,
    attributeFilter: ['disabled']
  });
  stateObserver?.observe(saveButton, {
    attributes: true,
    attributeFilter: ['disabled']
  });
  stateObserver?.observe(dirtyState, {
    attributes: true,
    attributeFilter: ['class']
  });

  const onApply = () => {
    const screenId = selectedScreenId();
    if (!screenId) return;
    if (dirtyState.classList.contains('is-dirty')) {
      applyAfterSave = true;
      applyAfterSaveScreenId = screenId;
      syncEnabled();
      saveButton.click();
      return;
    }
    void forceApply(screenId);
  };

  button.addEventListener('click', onApply);
  screenSelect.addEventListener('change', syncEnabled);
  syncEnabled();

  return () => {
    button.removeEventListener('click', onApply);
    screenSelect.removeEventListener('change', syncEnabled);
    stateObserver?.disconnect();
    button.remove();
  };
}
