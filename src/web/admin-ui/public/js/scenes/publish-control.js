import { publishSceneRemote } from './store.js';

const SAVE_OK = 'Сохранено';
const SAVE_ERRORS = new Set(['Конфликт изменений', 'Не сохранено', 'Ошибка загрузки']);

function sceneId() {
  return new URLSearchParams(window.location.search).get('id') || '';
}

function waitForSaved(timeoutMs = 12000) {
  const state = document.querySelector('#scene-save-state');
  if (!state) return Promise.reject(new Error('Состояние сохранения сцены недоступно.'));
  if (state.textContent.trim() === SAVE_OK) return Promise.resolve();
  if (SAVE_ERRORS.has(state.textContent.trim())) return Promise.reject(new Error('Сначала устраните ошибку сохранения сцены.'));

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('Сохранение сцены заняло слишком много времени.')), timeoutMs);
    const observer = new MutationObserver(() => {
      const value = state.textContent.trim();
      if (value === SAVE_OK) finish();
      else if (SAVE_ERRORS.has(value)) finish(new Error('Сцена не сохранена. Публикация отменена.'));
    });
    const finish = (error) => {
      window.clearTimeout(timeout);
      observer.disconnect();
      if (error) reject(error);
      else resolve();
    };
    observer.observe(state, { childList: true, characterData: true, subtree: true });
    document.querySelector('#scene-save')?.click();
  });
}

function showEditorMessage(message, error = false) {
  const target = document.querySelector('#scene-editor-message');
  if (!target) return;
  target.textContent = message;
  target.classList.remove('is-hidden');
  target.classList.toggle('is-error', error);
  window.setTimeout(() => target.classList.add('is-hidden'), error ? 5000 : 2600);
}

function createPublishButton() {
  const toolbar = document.querySelector('.scene-toolbar-controls');
  const saveButton = document.querySelector('#scene-save');
  const existing = document.querySelector('#scene-publish');
  if (existing instanceof HTMLButtonElement) return existing;
  if (!toolbar || !saveButton) return null;
  const button = document.createElement('button');
  button.id = 'scene-publish';
  button.type = 'button';
  button.className = 'button button-primary';
  button.textContent = 'Опубликовать';
  button.title = 'Создать неизменяемую опубликованную ревизию сцены';
  saveButton.classList.remove('button-primary');
  saveButton.classList.add('button-secondary');
  saveButton.textContent = 'Сохранить';
  toolbar.append(button);
  return button;
}

export function initialiseScenePublishControl() {
  const button = createPublishButton();
  if (!button || button.dataset.publishControlReady === 'true') return;
  button.dataset.publishControlReady = 'true';

  button.addEventListener('click', async () => {
    const id = sceneId();
    if (!id || button.disabled) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Публикация…';
    try {
      await waitForSaved();
      const revision = await publishSceneRemote(id);
      const number = Number(revision?.revision_number) || 1;
      const displays = Number(revision?.scene?.display_count) || 1;
      const suffix = displays > 1
        ? ' Панорамная сцена сохранена, назначение станет доступно через Display Group.'
        : '';
      showEditorMessage(`Опубликована ревизия ${number}.${suffix}`);
    } catch (error) {
      showEditorMessage(error?.message || 'Не удалось опубликовать сцену.', true);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
}
