import { api } from '../core/api.js';

const DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'engine', label: 'Motion Engine', detail: 'Общий запуск анимации меню и акции.', tab: 'menu', source: { type: 'checkbox', ids: ['animation-enabled'] } }),
  Object.freeze({ key: 'menu', label: 'Анимация меню', detail: 'Световые поверхности разделов и строк продукции.', tab: 'menu', source: { type: 'menu-effects', ids: ['animation-section-effect', 'animation-item-effect'] } }),
  Object.freeze({ key: 'promotion', label: 'Анимация акции', detail: 'Пульс плашки «АКЦИЯ» и подсветка всей акционной строки.', tab: 'promotion', source: { type: 'select-effect', ids: ['animation-promotion-effect'] } }),
  Object.freeze({ key: 'weather', label: 'Погода', detail: 'Показывать или скрывать погодный информер.', tab: 'weather', source: { type: 'checkbox', ids: ['weather-enabled'] } }),
  Object.freeze({ key: 'weather-motion', label: 'Анимация погоды', detail: 'Дождь, снег, облака, туман, звёзды и свечение.', tab: 'weather', source: { type: 'checkbox', ids: ['weather-animation-enabled'] } }),
  Object.freeze({ key: 'announcement', label: 'Бегущая строка', detail: 'Независимый слой объявления поверх меню.', tab: 'announcement', source: { type: 'checkbox', ids: ['animation-announcement-enabled'] } }),
  Object.freeze({ key: 'brand', label: 'Название бренда', detail: 'Текстовый объект бренда с собственной анимацией.', tab: 'brand', source: { type: 'checkbox', ids: ['animation-brand-enabled'] } }),
  Object.freeze({ key: 'aquarium', label: 'Аквариум', detail: 'Environment-слой: вода, рыбы, пузырьки и каустики.', tab: 'aquarium', source: { type: 'checkbox', ids: ['animation-aquarium-enabled'] } }),
  Object.freeze({ key: 'entity', label: 'Объект сцены', detail: 'PNG, WebP или видео Entity поверх меню.', tab: 'entity', source: { type: 'checkbox', ids: ['animation-entity-visible'] } }),
  Object.freeze({ key: 'playlist', label: 'Плейлист сцен', detail: 'Временные PromoScene, ContentScene и Object Story.', tab: 'playlist', source: { type: 'checkbox', ids: ['animation-scene-playlist-enabled'] } })
]);

const TAB_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'menu', label: 'Меню', selector: '.animation-motion-card' }),
  Object.freeze({ key: 'promotion', label: 'Акция', selector: '.animation-promotion-card' }),
  Object.freeze({ key: 'weather', label: 'Погода', selector: '.weather-settings-card' }),
  Object.freeze({ key: 'announcement', label: 'Объявление', selector: '.animation-announcement-card' }),
  Object.freeze({ key: 'brand', label: 'Бренд', selector: '.animation-brand-card' }),
  Object.freeze({ key: 'aquarium', label: 'Аквариум', selector: '.animation-aquarium-card' }),
  Object.freeze({ key: 'entity', label: 'Объект', selector: '.animation-entity-card' }),
  Object.freeze({ key: 'playlist', label: 'Плейлист', selector: '.playlist-scene-editor' })
]);

function node(id) { return document.getElementById(id); }
function sourceNodes(definition) { return definition.source.ids.map((id) => node(id)).filter(Boolean); }

function configuredState(definition) {
  const sources = sourceNodes(definition);
  if (!sources.length) return false;
  if (definition.source.type === 'checkbox') return sources[0].checked === true;
  if (definition.source.type === 'select-effect') return sources[0].value !== 'none';
  if (definition.source.type === 'menu-effects') return sources.some((source) => source.value !== 'none');
  return false;
}

function effectiveDraftState(definition) {
  const configured = configuredState(definition);
  if (!configured) return false;
  if (definition.key === 'menu' || definition.key === 'promotion') return node('animation-enabled')?.checked === true;
  if (definition.key === 'weather-motion') return node('weather-enabled')?.checked === true && configured;
  return configured;
}

function dispatchSource(source, eventName = 'change') {
  source.dispatchEvent(new Event(eventName, { bubbles: true }));
}

function setCheckboxSource(source, checked) {
  source.checked = checked;
  dispatchSource(source, 'change');
}

function setDefinitionState(definition, enabled) {
  const sources = sourceNodes(definition);
  if (!sources.length) return;
  if (definition.source.type === 'checkbox') {
    setCheckboxSource(sources[0], enabled);
    return;
  }
  if (definition.source.type === 'select-effect') {
    sources[0].value = enabled ? 'cinematic' : 'none';
    dispatchSource(sources[0], 'change');
    if (enabled && node('animation-enabled') instanceof HTMLInputElement && !node('animation-enabled').checked) {
      setCheckboxSource(node('animation-enabled'), true);
    }
    return;
  }
  if (definition.source.type === 'menu-effects') {
    for (const source of sources) {
      source.value = enabled ? 'cinematic' : 'none';
      dispatchSource(source, 'change');
    }
    if (enabled && node('animation-enabled') instanceof HTMLInputElement && !node('animation-enabled').checked) {
      setCheckboxSource(node('animation-enabled'), true);
    }
  }
}

function remoteStates(animation, weather) {
  const profile = animation?.profile || {};
  const engine = animation?.enabled === true;
  return new Map([
    ['engine', engine],
    ['menu', engine && (profile.section_effect !== 'none' || profile.item_effect !== 'none')],
    ['promotion', engine && profile.promotion_effect !== 'none'],
    ['weather', weather?.enabled === true],
    ['weather-motion', weather?.enabled === true && weather?.animation_enabled === true],
    ['announcement', animation?.announcement?.enabled === true],
    ['brand', animation?.brand?.enabled === true],
    ['aquarium', animation?.environment?.enabled === true && animation?.environment?.effect === 'aquarium'],
    ['entity', animation?.entity?.visible === true],
    ['playlist', animation?.scene_playlist?.enabled === true]
  ]);
}

function hideDuplicatedVisibilityControls() {
  for (const id of [
    'animation-enabled', 'weather-enabled', 'weather-animation-enabled', 'animation-announcement-enabled',
    'animation-brand-enabled', 'animation-aquarium-enabled', 'animation-entity-visible', 'animation-scene-playlist-enabled'
  ]) {
    const source = node(id);
    source?.closest('label')?.classList.add('animation-manager-source-hidden');
  }
  node('animation-promotion-effect')?.closest('label')?.classList.add('animation-manager-source-hidden');
}

function rebuildTabs(inspector) {
  const previousTabs = inspector.querySelector('.animation-inspector-tabs');
  const previousPanels = inspector.querySelector('.animation-inspector-panels');
  if (!(previousTabs instanceof HTMLElement) || !(previousPanels instanceof HTMLElement)) return null;

  const captured = new Map();
  for (const tab of TAB_DEFINITIONS) {
    const content = document.querySelector(tab.selector);
    if (content instanceof HTMLElement) captured.set(tab.key, content);
  }

  const tabs = document.createElement('div');
  tabs.className = 'animation-inspector-tabs animation-object-tabs';
  tabs.setAttribute('role', 'tablist');
  const panels = document.createElement('div');
  panels.className = 'animation-inspector-panels animation-object-panels';

  const openTab = (key) => {
    tabs.querySelectorAll('[data-animation-object-tab]').forEach((button) => {
      const active = button.dataset.animationObjectTab === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.querySelectorAll('[data-animation-object-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.animationObjectPanel !== key;
    });
  };

  TAB_DEFINITIONS.forEach((tab, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = tab.label;
    button.dataset.animationObjectTab = tab.key;
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => openTab(tab.key));
    tabs.append(button);

    const panel = document.createElement('div');
    panel.dataset.animationObjectPanel = tab.key;
    panel.setAttribute('role', 'tabpanel');
    panel.hidden = index !== 0;
    const content = captured.get(tab.key);
    if (content) panel.append(content);
    else {
      const empty = document.createElement('p');
      empty.className = 'animation-object-panel-empty';
      empty.textContent = 'Настройки этого слоя пока недоступны.';
      panel.append(empty);
    }
    panels.append(panel);
  });

  previousTabs.replaceWith(tabs);
  previousPanels.replaceWith(panels);
  document.querySelector('.animation-motion-grid')?.remove();
  document.querySelector('.animation-overlay-grid')?.remove();
  openTab('menu');
  return { tabs, panels, openTab };
}

function createOverview(inspector, openTab) {
  const section = document.createElement('section');
  section.className = 'animation-object-manager';
  section.setAttribute('aria-label', 'Анимации и объекты');
  section.innerHTML = `
    <div class="animation-object-manager-head">
      <div><p class="eyebrow">АНИМАЦИИ И ОБЪЕКТЫ</p><h3>Что включено</h3><p>Галочка меняет текущий черновик. Справа показано реальное сохранённое состояние на телевизоре предпросмотра.</p></div>
      <small id="animation-object-tv-name">Состояние ТВ загружается…</small>
    </div>
    <div class="animation-object-list" id="animation-object-list"></div>`;

  const list = section.querySelector('#animation-object-list');
  for (const definition of DEFINITIONS) {
    const row = document.createElement('div');
    row.className = 'animation-object-row';
    row.dataset.animationObject = definition.key;
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'animation-object-toggle';
    toggle.setAttribute('aria-label', `${definition.label}: включить или выключить`);
    toggle.dataset.animationObjectToggle = definition.key;
    toggle.addEventListener('change', () => setDefinitionState(definition, toggle.checked));

    const copy = document.createElement('div');
    copy.className = 'animation-object-copy';
    const title = document.createElement('strong');
    title.textContent = definition.label;
    const detail = document.createElement('small');
    detail.textContent = definition.detail;
    copy.append(title, detail);

    const draft = document.createElement('span');
    draft.className = 'animation-object-state';
    draft.dataset.animationObjectDraft = definition.key;
    const tv = document.createElement('span');
    tv.className = 'animation-object-state is-unknown';
    tv.dataset.animationObjectTv = definition.key;
    tv.textContent = 'На ТВ: …';

    const configure = document.createElement('button');
    configure.type = 'button';
    configure.className = 'button button-secondary animation-object-configure';
    configure.textContent = 'Настроить';
    configure.addEventListener('click', () => openTab(definition.tab));
    row.append(toggle, copy, draft, tv, configure);
    list.append(row);
  }

  const tabs = inspector.querySelector('.animation-object-tabs');
  tabs?.before(section);
  return section;
}

function draftStatusText(definition) {
  const configured = configuredState(definition);
  const effective = effectiveDraftState(definition);
  if ((definition.key === 'menu' || definition.key === 'promotion') && configured && !effective) return 'Черновик: движок выкл';
  if (definition.key === 'weather-motion' && configured && !effective) return 'Черновик: погода скрыта';
  return `Черновик: ${effective ? 'Вкл' : 'Выкл'}`;
}

export function initialiseAnimationObjectManager() {
  const inspector = document.querySelector('.animation-inspector');
  if (!(inspector instanceof HTMLElement)) return;
  const tabRuntime = rebuildTabs(inspector);
  if (!tabRuntime) return;
  hideDuplicatedVisibilityControls();
  const overview = createOverview(inspector, tabRuntime.openTab);
  let disposed = false;
  let remote = new Map();
  let refreshSequence = 0;
  const sourceListeners = [];
  const timers = [];

  const syncDraft = () => {
    if (disposed) return;
    for (const definition of DEFINITIONS) {
      const toggle = overview.querySelector(`[data-animation-object-toggle="${definition.key}"]`);
      const status = overview.querySelector(`[data-animation-object-draft="${definition.key}"]`);
      if (toggle instanceof HTMLInputElement) toggle.checked = configuredState(definition);
      if (status instanceof HTMLElement) {
        const effective = effectiveDraftState(definition);
        status.textContent = draftStatusText(definition);
        status.classList.toggle('is-on', effective);
        status.classList.toggle('is-off', !effective);
      }
    }
  };

  const syncRemote = () => {
    for (const definition of DEFINITIONS) {
      const status = overview.querySelector(`[data-animation-object-tv="${definition.key}"]`);
      if (!(status instanceof HTMLElement)) continue;
      const state = remote.get(definition.key);
      status.classList.remove('is-on', 'is-off', 'is-unknown');
      if (typeof state !== 'boolean') {
        status.textContent = 'На ТВ: ?';
        status.classList.add('is-unknown');
      } else {
        status.textContent = `На ТВ: ${state ? 'Вкл' : 'Выкл'}`;
        status.classList.add(state ? 'is-on' : 'is-off');
      }
    }
  };

  const refreshRemote = async () => {
    const select = node('animation-screen-select');
    const screenId = Number(select?.value);
    const name = overview.querySelector('#animation-object-tv-name');
    if (!Number.isSafeInteger(screenId) || screenId < 1) {
      remote = new Map();
      if (name) name.textContent = 'Монитор предпросмотра не выбран';
      syncRemote();
      return;
    }
    const sequence = ++refreshSequence;
    if (name) name.textContent = `ТВ: ${select?.selectedOptions?.[0]?.textContent?.trim() || `Монитор ${screenId}`} · проверяем…`;
    try {
      const [animation, weather] = await Promise.all([
        api.get(`/api/settings/animation/screens/${screenId}`),
        api.get(`/api/weather/screens/${screenId}`)
      ]);
      if (disposed || sequence !== refreshSequence) return;
      remote = remoteStates(animation, weather);
      if (name) name.textContent = `ТВ: ${select?.selectedOptions?.[0]?.textContent?.trim() || `Монитор ${screenId}`}`;
      syncRemote();
    } catch {
      if (disposed || sequence !== refreshSequence) return;
      remote = new Map();
      if (name) name.textContent = 'Состояние ТВ не удалось загрузить';
      syncRemote();
    }
  };

  for (const definition of DEFINITIONS) {
    for (const source of sourceNodes(definition)) {
      const handler = () => queueMicrotask(syncDraft);
      source.addEventListener('change', handler);
      source.addEventListener('input', handler);
      sourceListeners.push([source, handler]);
    }
  }
  const engine = node('animation-enabled');
  if (engine) {
    const handler = () => queueMicrotask(syncDraft);
    engine.addEventListener('change', handler);
    sourceListeners.push([engine, handler]);
  }
  const weatherVisible = node('weather-enabled');
  if (weatherVisible) {
    const handler = () => queueMicrotask(syncDraft);
    weatherVisible.addEventListener('change', handler);
    sourceListeners.push([weatherVisible, handler]);
  }

  const screenSelect = node('animation-screen-select');
  const onScreenChange = () => void refreshRemote();
  screenSelect?.addEventListener('change', onScreenChange);
  const message = node('animation-message');
  const messageObserver = message instanceof HTMLElement ? new MutationObserver(() => {
    const text = message.textContent?.trim() || '';
    if (/применен|применён|применены/i.test(text)) void refreshRemote();
  }) : null;
  messageObserver?.observe(message, { childList: true, characterData: true, subtree: true });

  syncDraft();
  syncRemote();
  void refreshRemote();
  for (const delay of [150, 400, 900, 1600]) timers.push(setTimeout(() => { syncDraft(); void refreshRemote(); }, delay));

  return {
    dispose() {
      disposed = true;
      refreshSequence += 1;
      timers.forEach(clearTimeout);
      sourceListeners.forEach(([source, handler]) => {
        source.removeEventListener('change', handler);
        source.removeEventListener('input', handler);
      });
      screenSelect?.removeEventListener('change', onScreenChange);
      messageObserver?.disconnect();
    }
  };
}

export { DEFINITIONS as ANIMATION_OBJECT_DEFINITIONS };
