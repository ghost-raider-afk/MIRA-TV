import { loadWeatherForScreen } from './weather-studio.js';

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
  if (button) button.textContent = 'Применить сцену';
  installStatus();
}

function markDirty() {
  setStatus('dirty', 'Есть неприменённые изменения. «Применить сцену» отправит один атомарный снимок настроек на выбранные телевизоры.');
}

export function initialiseAnimationApplication() {
  const inspector = document.querySelector('.animation-inspector');
  const message = node('animation-message');
  const screenSelect = node('animation-screen-select');
  if (!(inspector instanceof HTMLElement)) return;

  rebrandApplicationControls();
  let disposed = false;
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

  const messageObserver = message instanceof HTMLElement ? new MutationObserver(() => {
    if (disposed) return;
    const text = message.textContent?.trim() || '';
    const match = text.match(/^Плейлист применён к мониторам:\s*(\d+)\.?$/);
    if (match) {
      const count = Number(match[1]);
      const targets = selectedTargets();
      const labels = targets.slice(0, count).map((target) => target.label);
      setStatus(
        'applied',
        `Сцена атомарно применена: ${count}${labels.length ? ` — ${labels.join('; ')}` : ''}. Realtime revision отправлена телевизорам.`
      );
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
  window.addEventListener('mira:animation-studio-dirty', onDirtyEvent);

  return {
    dispose() {
      disposed = true;
      messageObserver?.disconnect();
      screenObserver?.disconnect();
      screenSelect?.removeEventListener('change', syncPreviewWeather);
      inspector.removeEventListener('input', onInspectorChange);
      inspector.removeEventListener('change', onInspectorChange);
      window.removeEventListener('mira:animation-studio-dirty', onDirtyEvent);
    }
  };
}
