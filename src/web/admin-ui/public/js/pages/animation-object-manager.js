import { api } from '../core/api.js';

const DEFINITIONS = Object.freeze([
  Object.freeze({
    key: 'menu', label: 'Меню', detail: 'Базовое меню и световые поверхности строк.', tab: 'menu',
    visible: { type: 'checkbox', ids: ['animation-menu-visible'] },
    motion: { type: 'menu-effects', ids: ['animation-section-effect', 'animation-item-effect'] }
  }),
  Object.freeze({
    key: 'promotion', label: 'Акция', detail: 'Плашка «АКЦИЯ» и подсветка акционной строки.', tab: 'promotion',
    visible: { type: 'checkbox', ids: ['animation-promotion-visible'] },
    motion: { type: 'select-effect', ids: ['animation-promotion-effect'] }
  }),
  Object.freeze({
    key: 'weather', label: 'Погода', detail: 'Погодный информер и атмосферные эффекты.', tab: 'weather',
    visible: { type: 'checkbox', ids: ['weather-enabled'] },
    motion: { type: 'checkbox', ids: ['weather-animation-enabled'] }
  }),
  Object.freeze({
    key: 'announcement', label: 'Объявление', detail: 'Строка объявления поверх основной сцены.', tab: 'announcement',
    visible: { type: 'checkbox', ids: ['animation-announcement-enabled'] },
    motion: { type: 'checkbox', ids: ['animation-announcement-animation-enabled'] }
  }),
  Object.freeze({
    key: 'brand', label: 'Бренд', detail: 'Название бренда как независимый текстовый объект.', tab: 'brand',
    visible: { type: 'checkbox', ids: ['animation-brand-enabled'] },
    motion: { type: 'checkbox', ids: ['animation-brand-animation-enabled'] }
  }),
  Object.freeze({
    key: 'aquarium', label: 'Аквариум', detail: 'Environment-слой: вода, рыбы, пузырьки и свет.', tab: 'aquarium',
    visible: { type: 'checkbox', ids: ['animation-aquarium-enabled'] },
    motion: { type: 'checkbox', ids: ['animation-aquarium-animation-enabled'] }
  }),
  Object.freeze({
    key: 'entity', label: 'Объект сцены', detail: 'PNG, WebP или видео поверх меню.', tab: 'entity',
    visible: { type: 'checkbox', ids: ['animation-entity-visible'] },
    motion: { type: 'checkbox', ids: ['animation-entity-animation-enabled'] }
  }),
  Object.freeze({
    key: 'playlist', label: 'Плейлист сцен', detail: 'PromoScene, ContentScene и Object Story.', tab: 'playlist',
    visible: { type: 'checkbox', ids: ['animation-scene-playlist-enabled'] },
    motion: { type: 'checkbox', ids: ['animation-scene-playlist-animation-enabled'] }
  })
]);

const PANEL_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'menu', selector: '.animation-motion-card' }),
  Object.freeze({ key: 'promotion', selector: '.animation-promotion-card' }),
  Object.freeze({ key: 'weather', selector: '.weather-settings-card' }),
  Object.freeze({ key: 'announcement', selector: '.animation-announcement-card' }),
  Object.freeze({ key: 'brand', selector: '.animation-brand-card' }),
  Object.freeze({ key: 'aquarium', selector: '.animation-aquarium-card' }),
  Object.freeze({ key: 'entity', selector: '.animation-entity-card' }),
  Object.freeze({ key: 'playlist', selector: '.playlist-scene-editor' })
]);

function node(id) { return document.getElementById(id); }
function sourceNodes(source) { return source.ids.map((id) => node(id)).filter(Boolean); }

function sourceState(source) {
  const sources = sourceNodes(source);
  if (!sources.length) return false;
  if (source.type === 'checkbox') return sources[0].checked === true;
  if (source.type === 'select-effect') return sources[0].value !== 'none';
  if (source.type === 'menu-effects') return sources.some((control) => control.value !== 'none');
  return false;
}

function dispatchSource(source, eventName = 'change') {
  source.dispatchEvent(new Event(eventName, { bubbles: true }));
}

function setSourceState(source, enabled) {
  const sources = sourceNodes(source);
  if (!sources.length) return;
  if (source.type === 'checkbox') {
    sources[0].checked = enabled;
    dispatchSource(sources[0]);
    return;
  }
  if (source.type === 'select-effect') {
    sources[0].value = enabled ? 'cinematic' : 'none';
    dispatchSource(sources[0]);
    return;
  }
  if (source.type === 'menu-effects') {
    for (const control of sources) {
      control.value = enabled ? 'cinematic' : 'none';
      dispatchSource(control);
    }
  }
}

function remoteStates(animation, weather) {
  const profile = animation?.profile || {};
  const engine = animation?.enabled === true;
  return new Map([
    ['menu', { visible: profile.menu_visible !== false, motion: engine && (profile.section_effect !== 'none' || profile.item_effect !== 'none') }],
    ['promotion', { visible: profile.promotion_visible !== false, motion: engine && profile.promotion_effect !== 'none' }],
    ['weather', { visible: weather?.enabled === true, motion: weather?.animation_enabled !== false }],
    ['announcement', { visible: animation?.announcement?.enabled === true, motion: animation?.announcement?.animation_enabled !== false }],
    ['brand', { visible: animation?.brand?.enabled === true, motion: animation?.brand?.animation_enabled !== false }],
    ['aquarium', { visible: animation?.environment?.enabled === true && animation?.environment?.effect === 'aquarium', motion: animation?.environment?.animation_enabled !== false }],
    ['entity', { visible: animation?.entity?.visible === true, motion: animation?.entity?.animation_enabled !== false }],
    ['playlist', { visible: animation?.scene_playlist?.enabled === true, motion: animation?.scene_playlist?.animation_enabled !== false }]
  ]);
}

function hideDuplicatedSwitches() {
  const ids = [
    'weather-enabled', 'weather-animation-enabled',
    'animation-announcement-enabled', 'animation-announcement-animation-enabled',
    'animation-brand-enabled', 'animation-brand-animation-enabled',
    'animation-aquarium-enabled', 'animation-aquarium-animation-enabled',
    'animation-entity-visible', 'animation-entity-animation-enabled',
    'animation-scene-playlist-enabled', 'animation-scene-playlist-animation-enabled'
  ];
  for (const id of ids) node(id)?.closest('label')?.classList.add('animation-manager-source-hidden');
}

function rebuildPanels(inspector) {
  const previousTabs = inspector.querySelector('.animation-inspector-tabs');
  const previousPanels = inspector.querySelector('.animation-inspector-panels');
  if (!(previousPanels instanceof HTMLElement)) return null;

  const captured = new Map();
  for (const panel of PANEL_DEFINITIONS) {
    const content = document.querySelector(panel.selector);
    if (content instanceof HTMLElement) captured.set(panel.key, content);
  }

  const panels = document.createElement('div');
  panels.className = 'animation-inspector-panels animation-object-panels';
  panels.setAttribute('aria-live', 'polite');

  for (const panelDefinition of PANEL_DEFINITIONS) {
    const panel = document.createElement('section');
    panel.dataset.animationObjectPanel = panelDefinition.key;
    panel.hidden = panelDefinition.key !== 'menu';
    const content = captured.get(panelDefinition.key);
    if (content) panel.append(content);
    panels.append(panel);
  }

  previousTabs?.remove();
  previousPanels.replaceWith(panels);
  document.querySelector('.animation-motion-grid')?.remove();
  document.querySelector('.animation-overlay-grid')?.remove();

  const openPanel = (key) => {
    panels.querySelectorAll('[data-animation-object-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.animationObjectPanel !== key;
    });
    inspector.querySelectorAll('[data-animation-object]').forEach((row) => {
      row.classList.toggle('is-active', row.dataset.animationObject === key);
    });
    inspector.dataset.activeObject = key;
  };

  openPanel('menu');
  return { panels, openPanel };
}

function switchControl(kind, definition, onChange) {
  const label = document.createElement('label');
  label.className = 'animation-object-switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.animationObjectToggle = kind;
  input.setAttribute('aria-label', `${definition.label}: ${kind === 'visible' ? 'показывать объект' : 'включить анимацию'}`);
  input.addEventListener('change', () => onChange(input.checked));
  const caption = document.createElement('span');
  caption.textContent = kind === 'visible' ? 'Объект' : 'Анимация';
  label.append(input, caption);
  return label;
}

function createOverview(inspector, openPanel) {
  const section = document.createElement('section');
  section.className = 'animation-object-manager';
  section.setAttribute('aria-label', 'Объекты сцены');
  section.innerHTML = `
    <div class="animation-object-manager-head">
      <div><p class="eyebrow">ОБЪЕКТЫ СЦЕНЫ</p><h3>Показывать / Анимация</h3><p>Две независимые галочки управляют объектом и его движением. Motion Runtime запускается автоматически только когда он нужен.</p></div>
      <small id="animation-object-tv-name">Состояние ТВ загружается…</small>
    </div>
    <div class="animation-object-list" id="animation-object-list"></div>`;

  const list = section.querySelector('#animation-object-list');
  for (const definition of DEFINITIONS) {
    const row = document.createElement('article');
    row.className = 'animation-object-row';
    row.dataset.animationObject = definition.key;

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'animation-object-copy';
    copy.addEventListener('click', () => openPanel(definition.tab));
    const title = document.createElement('strong');
    title.textContent = definition.label;
    const detail = document.createElement('small');
    detail.textContent = definition.detail;
    copy.append(title, detail);

    const switches = document.createElement('div');
    switches.className = 'animation-object-switches';
    switches.append(
      switchControl('visible', definition, (value) => setSourceState(definition.visible, value)),
      switchControl('motion', definition, (value) => setSourceState(definition.motion, value))
    );

    const tv = document.createElement('span');
    tv.className = 'animation-object-tv-state is-unknown';
    tv.dataset.animationObjectTv = definition.key;
    tv.textContent = 'ТВ: …';

    const configure = document.createElement('button');
    configure.type = 'button';
    configure.className = 'button button-secondary animation-object-configure';
    configure.textContent = 'Настроить';
    configure.addEventListener('click', () => openPanel(definition.tab));

    row.append(copy, switches, tv, configure);
    list.append(row);
  }

  inspector.querySelector('.animation-object-panels')?.before(section);
  return section;
}

export function initialiseAnimationObjectManager() {
  const inspector = document.querySelector('.animation-inspector');
  if (!(inspector instanceof HTMLElement)) return;

  const panelRuntime = rebuildPanels(inspector);
  if (!panelRuntime) return;
  hideDuplicatedSwitches();
  const overview = createOverview(inspector, panelRuntime.openPanel);

  let disposed = false;
  let remote = new Map();
  let refreshSequence = 0;
  const sourceListeners = [];
  const timers = [];

  const syncDraft = () => {
    if (disposed) return;
    for (const definition of DEFINITIONS) {
      const row = overview.querySelector(`[data-animation-object="${definition.key}"]`);
      if (!(row instanceof HTMLElement)) continue;
      const visible = row.querySelector('[data-animation-object-toggle="visible"]');
      const motion = row.querySelector('[data-animation-object-toggle="motion"]');
      if (visible instanceof HTMLInputElement) visible.checked = sourceState(definition.visible);
      if (motion instanceof HTMLInputElement) motion.checked = sourceState(definition.motion);
      row.classList.toggle('is-hidden-object', !sourceState(definition.visible));
    }
  };

  const syncRemote = () => {
    for (const definition of DEFINITIONS) {
      const status = overview.querySelector(`[data-animation-object-tv="${definition.key}"]`);
      if (!(status instanceof HTMLElement)) continue;
      const state = remote.get(definition.key);
      status.classList.remove('is-on', 'is-off', 'is-unknown');
      if (!state || typeof state.visible !== 'boolean' || typeof state.motion !== 'boolean') {
        status.textContent = 'ТВ: ?';
        status.classList.add('is-unknown');
        continue;
      }
      status.textContent = `ТВ: ${state.visible ? 'объект вкл' : 'объект выкл'} · ${state.motion ? 'анимация вкл' : 'анимация выкл'}`;
      status.classList.add(state.visible ? 'is-on' : 'is-off');
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
    for (const source of [...sourceNodes(definition.visible), ...sourceNodes(definition.motion)]) {
      const handler = () => queueMicrotask(syncDraft);
      source.addEventListener('change', handler);
      source.addEventListener('input', handler);
      sourceListeners.push([source, handler]);
    }
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
  for (const delay of [150, 450, 1000]) timers.push(setTimeout(() => { syncDraft(); void refreshRemote(); }, delay));

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
