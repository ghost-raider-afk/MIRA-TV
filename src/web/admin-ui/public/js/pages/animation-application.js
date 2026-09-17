import { api } from '../core/api.js';
import { setMessage, setPending } from '../core/dom.js';
import { applyWeatherStudioSettings, loadWeatherForScreen, weatherStudioSettings } from './weather-studio.js';

const WEATHER_SETTINGS_ENDPOINT = '/api/weather/settings';

function node(id) { return document.getElementById(id); }

function selectedTargets() {
  const screens = [];
  document.querySelectorAll('#animation-target-list .animation-target-item').forEach((label) => {
    const input = label.querySelector('input[type="checkbox"]');
    if (!(input instanceof HTMLInputElement) || !input.checked) return;
    const name = label.querySelector('strong')?.textContent?.trim() || `Монитор ${input.value}`;
    const location = label.querySelector('small')?.textContent?.trim();
    screens.push({ id: Number(input.value), label: location ? `${location} — ${name}` : name });
  });
  return screens.filter((screen) => Number.isSafeInteger(screen.id) && screen.id > 0);
}

function installStatus() {
  let status = node('animation-apply-status');
  if (status) return status;
  const targets = document.querySelector('.animation-targets');
  if (!(targets instanceof HTMLElement)) return null;
  status = document.createElement('div');
  status.id = 'animation-apply-status';
  status.className = 'weather-adaptive-note';
  status.dataset.state = 'idle';
  status.textContent = 'Изменения ещё не опубликованы на телевизоры.';
  targets.after(status);
  return status;
}

function setStatus(state, text) {
  const status = installStatus();
  if (!status) return;
  status.dataset.state = state;
  status.textContent = text;
}

function rebrandApplicationControls() {
  const heading = document.querySelector('.animation-targets-head strong');
  if (heading) heading.textContent = 'Мониторы для применения';
  const summary = node('animation-target-summary');
  if (summary && !summary.textContent?.trim()) summary.textContent = 'Мониторы не выбраны';
  const button = node('animation-apply-screens');
  if (button) button.textContent = 'Применить все анимации';
  installStatus();
}

function markDirty() {
  setStatus('dirty', 'Есть неприменённые изменения. Выберите мониторы и нажмите «Применить все анимации».');
}

export function initialiseAnimationApplication() {
  const button = node('animation-apply-screens');
  const inspector = document.querySelector('.animation-inspector');
  const message = node('animation-message');
  const screenSelect = node('animation-screen-select');
  if (!(button instanceof HTMLButtonElement) || !(inspector instanceof HTMLElement)) return;

  rebrandApplicationControls();
  let disposed = false;
  let bypassPreflight = false;
  let preflightRunning = false;
  let pendingTargets = [];
  let loadedWeatherScreenId = null;

  const syncPreviewWeather = () => {
    const id = Number(screenSelect?.value);
    if (!Number.isSafeInteger(id) || id < 1 || id === loadedWeatherScreenId || disposed) return;
    loadedWeatherScreenId = id;
    void loadWeatherForScreen(id);
  };

  const onDirtyEvent = () => markDirty();
  const onInspectorChange = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#animation-inspector-actions')) return;
    markDirty();
  };

  const onApplyCapture = async (event) => {
    if (bypassPreflight || disposed) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (preflightRunning) return;

    pendingTargets = selectedTargets();
    if (!pendingTargets.length) {
      setStatus('error', 'Не выбрано ни одного монитора.');
      setMessage('animation-message', 'Выберите хотя бы один монитор.', 'error');
      return;
    }

    preflightRunning = true;
    setPending(button, true, 'Подготавливаем…');
    setStatus('pending', `Подготовка применения: ${pendingTargets.length} ${pendingTargets.length === 1 ? 'монитор' : 'мониторов'}…`);
    try {
      const savedWeather = await api.put(WEATHER_SETTINGS_ENDPOINT, weatherStudioSettings());
      if (disposed) return;
      applyWeatherStudioSettings(savedWeather);
      setPending(button, false, 'Подготавливаем…');
      bypassPreflight = true;
      button.click();
      bypassPreflight = false;
    } catch (error) {
      if (!disposed) {
        setStatus('error', `Не применено: ${error.message}`);
        setMessage('animation-message', error.message, 'error');
      }
    } finally {
      preflightRunning = false;
      if (!disposed && !bypassPreflight && !button.disabled) setPending(button, false, 'Подготавливаем…');
    }
  };

  const messageObserver = message instanceof HTMLElement ? new MutationObserver(() => {
    if (disposed) return;
    const text = message.textContent?.trim() || '';
    const match = text.match(/^Плейлист применён к мониторам:\s*(\d+)\.?$/);
    if (match) {
      const count = Number(match[1]);
      const labels = pendingTargets.slice(0, count).map((target) => target.label);
      setMessage('animation-message', `Все анимации, включая погоду, применены к выбранным мониторам: ${count}.`, 'success');
      setStatus('applied', `Применено на сервере: ${count}/${pendingTargets.length}${labels.length ? ` — ${labels.join('; ')}` : ''}. Отправлено на телевизоры через realtime; офлайн-ТВ получат эту ревизию при следующей синхронизации.`);
      pendingTargets = [];
      return;
    }
    if (text && !text.includes('применён') && pendingTargets.length && /ошиб|не удалось|некоррект|не существуют/i.test(text)) {
      setStatus('error', `Не применено: ${text}`);
      pendingTargets = [];
    }
  }) : null;

  const screenObserver = screenSelect instanceof HTMLSelectElement ? new MutationObserver(() => queueMicrotask(syncPreviewWeather)) : null;
  messageObserver?.observe(message, { childList: true, characterData: true, subtree: true });
  screenObserver?.observe(screenSelect, { childList: true, subtree: true });
  screenSelect?.addEventListener('change', syncPreviewWeather);
  queueMicrotask(syncPreviewWeather);
  button.addEventListener('click', onApplyCapture, true);
  inspector.addEventListener('input', onInspectorChange);
  inspector.addEventListener('change', onInspectorChange);
  window.addEventListener('mira:animation-studio-dirty', onDirtyEvent);

  return {
    dispose() {
      disposed = true;
      messageObserver?.disconnect();
      screenObserver?.disconnect();
      screenSelect?.removeEventListener('change', syncPreviewWeather);
      button.removeEventListener('click', onApplyCapture, true);
      inspector.removeEventListener('input', onInspectorChange);
      inspector.removeEventListener('change', onInspectorChange);
      window.removeEventListener('mira:animation-studio-dirty', onDirtyEvent);
    }
  };
}
