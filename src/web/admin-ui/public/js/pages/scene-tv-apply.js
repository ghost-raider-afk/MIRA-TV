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

  const syncEnabled = () => {
    button.disabled = screenSelect.disabled || saveButton.disabled || !/^\d+$/.test(String(screenSelect.value || ''));
  };

  const selectObserver = typeof MutationObserver === 'function'
    ? new MutationObserver(syncEnabled)
    : null;
  selectObserver?.observe(screenSelect, {
    childList: true,
    attributes: true,
    attributeFilter: ['disabled']
  });
  selectObserver?.observe(saveButton, {
    attributes: true,
    attributeFilter: ['disabled']
  });

  const onApply = async () => {
    if (dirtyState.classList.contains('is-dirty')) {
      saveButton.click();
      return;
    }
    const screenId = Number(screenSelect.value);
    if (!Number.isSafeInteger(screenId) || screenId < 1) return;

    setPending(button, true, 'Применяем…');
    try {
      const result = await api.post(`${API.deviceBindings}/${screenId}/apply`, {});
      setMessage(
        'scene-editor-message',
        `Сохранённое состояние отправлено на ТВ${result?.revision ? ` · ревизия ${result.revision}` : ''}.`,
        'success'
      );
    } catch (error) {
      setMessage('scene-editor-message', error.message || 'Не удалось применить состояние на ТВ.');
    } finally {
      setPending(button, false);
      syncEnabled();
    }
  };

  button.addEventListener('click', onApply);
  screenSelect.addEventListener('change', syncEnabled);
  syncEnabled();

  return () => {
    button.removeEventListener('click', onApply);
    screenSelect.removeEventListener('change', syncEnabled);
    selectObserver?.disconnect();
    button.remove();
  };
}
