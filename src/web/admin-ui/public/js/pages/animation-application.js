import { loadWeatherForScreen } from './weather-studio.js';

function node(id) { return document.getElementById(id); }

function activeScreenLabel() {
  const select = node('animation-screen-select');
  if (!(select instanceof HTMLSelectElement)) return 'текущий ТВ';
  return select.selectedOptions?.[0]?.textContent?.trim() || 'текущий ТВ';
}

function installStatus() {
  let status = node('animation-apply-status');
  if (status) return status;
  const actions = node('animation-inspector-actions');
  if (!(actions instanceof HTMLElement)) return null;
  status = document.createElement('div');
  status.id = 'animation-apply-status';
  status.className = 'animation-apply-status';
  status.dataset.state = 'idle';
  status.textContent = 'Preview загружен из состояния выбранного ТВ.';
  actions.before(status);
  return status;
}

function setStatus(state, text) {
  const status = installStatus();
  if (!status) return;
  status.dataset.state = state;
  status.textContent = text;
}

function configureControls() {
  const button = node('animation-apply-screens');
  if (button) button.textContent = 'Применить на ТВ';
  installStatus();
}

export function initialiseAnimationApplication() {
  const inspector = document.querySelector('.animation-inspector');
  const message = node('animation-message');
  const screenSelect = node('animation-screen-select');
  if (!(inspector instanceof HTMLElement)) return;

  configureControls();
  let disposed = false;
  let loadedWeatherScreenId = null;

  const syncPreviewWeather = () => {
    const id = Number(screenSelect?.value);
    if (!Number.isSafeInteger(id) || id < 1 || id === loadedWeatherScreenId || disposed) return;
    loadedWeatherScreenId = id;
    setStatus('idle', `Загружено состояние ТВ: ${activeScreenLabel()}.`);
    void loadWeatherForScreen(id);
  };

  const markDirty = () => {
    setStatus('dirty', `Есть изменения Preview для ${activeScreenLabel()}. Нажмите «Применить на ТВ»; переключатели объектов применяются автоматически.`);
  };

  const onInspectorChange = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#animation-inspector-actions')) return;
    markDirty();
  };
  const onApplyStarted = (event) => {
    const version = Number(event?.detail?.editVersion);
    if (Number.isFinite(version)) inspector.dataset.applyEditVersion = String(version);
  };
  const onApplied = (event) => {
    const appliedVersion = Number(event?.detail?.editVersion);
    const currentVersion = Number(inspector.dataset.editVersion || 0);
    if (!Number.isFinite(appliedVersion) || appliedVersion !== currentVersion) return;
    const revision = event?.detail?.revision ? ` · revision ${event.detail.revision}` : '';
    setStatus('applied', `Применено: ${activeScreenLabel()} · 1 ТВ${revision}. Realtime-сигнал отправлен Player.`);
  };

  const messageObserver = message instanceof HTMLElement ? new MutationObserver(() => {
    if (disposed) return;
    const text = message.textContent?.trim() || '';
    if (/^ТВ обновлён.*более новые изменения/i.test(text)) {
      setStatus('dirty', `${text} Нажмите «Применить на ТВ» для текущего Preview.`);
      return;
    }
    if (text && /ошиб|не удалось|некоррект|не существуют/i.test(text)) setStatus('error', `Не применено: ${text}`);
  }) : null;

  const screenObserver = screenSelect instanceof HTMLSelectElement
    ? new MutationObserver(() => queueMicrotask(syncPreviewWeather))
    : null;

  messageObserver?.observe(message, { childList: true, characterData: true, subtree: true });
  screenObserver?.observe(screenSelect, { childList: true, subtree: true });
  screenSelect?.addEventListener('change', syncPreviewWeather);
  queueMicrotask(syncPreviewWeather);
  inspector.addEventListener('input', onInspectorChange);
  inspector.addEventListener('change', onInspectorChange);
  window.addEventListener('mira:animation-studio-dirty', markDirty);
  window.addEventListener('mira:animation-apply-started', onApplyStarted);
  window.addEventListener('mira:animation-applied-to-tv', onApplied);

  return {
    dispose() {
      disposed = true;
      messageObserver?.disconnect();
      screenObserver?.disconnect();
      screenSelect?.removeEventListener('change', syncPreviewWeather);
      inspector.removeEventListener('input', onInspectorChange);
      inspector.removeEventListener('change', onInspectorChange);
      window.removeEventListener('mira:animation-studio-dirty', markDirty);
      window.removeEventListener('mira:animation-apply-started', onApplyStarted);
      window.removeEventListener('mira:animation-applied-to-tv', onApplied);
    }
  };
}
