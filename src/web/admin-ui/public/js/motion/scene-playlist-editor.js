import { ScenePlaylistRuntime, normaliseScenePlaylist } from './scene-playlist-runtime.js';

const MAX_SCENES = 20;
const TYPE_LABELS = Object.freeze({ promo: 'PromoScene', content: 'ContentScene', 'object-story': 'Object Story' });
const TYPE_SHORT = Object.freeze({ promo: 'PROMO', content: 'CONTENT', 'object-story': 'OBJECT' });
const MODE_LABELS = Object.freeze({ overlay: 'Overlay', split: 'Split', fullscreen: 'Fullscreen' });

function sceneSeed(type, index) {
  const sequence = index + 1;
  if (type === 'content') {
    return { id: `content-${sequence}`, type, enabled: true, mode: 'overlay', duration_seconds: 10, title: 'Информация', body: 'Добавьте текст ContentScene.' };
  }
  if (type === 'object-story') {
    return { id: `object-story-${sequence}`, type, enabled: true, mode: 'split', duration_seconds: 10, title: 'История объекта', body: 'Используется текущий Entity выбранного плейлиста.' };
  }
  return { id: `promo-${sequence}`, type: 'promo', enabled: true, mode: 'overlay', duration_seconds: 8, title: 'Специальное предложение', body: 'Добавьте текст PromoScene.' };
}

function uniqueId(type, scenes) {
  let index = scenes.length;
  let candidate;
  do {
    candidate = sceneSeed(type, index).id;
    index += 1;
  } while (scenes.some((scene) => scene.id === candidate));
  return candidate;
}

function button(text, className = 'button button-secondary') {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  return node;
}

function field(label, control, className = '') {
  const wrapper = document.createElement('label');
  wrapper.className = `field ${className}`.trim();
  const title = document.createElement('span');
  title.textContent = label;
  wrapper.append(title, control);
  return wrapper;
}

export class ScenePlaylistEditor {
  constructor({ stage, getEntity = () => null } = {}) {
    this.stage = stage;
    this.getEntity = getEntity;
    this.runtime = new ScenePlaylistRuntime();
    this.playlist = normaliseScenePlaylist();
    this.root = null;
    this.stripRoot = null;
    this.stripTrack = null;
    this.details = null;
    this.enabled = null;
    this.menuDuration = null;
    this.menuDurationOutput = null;
    this.summary = null;
    this.selectedIndex = null;
    this.disposed = false;
    this.rebindRevision = 0;
    this.handleRouteDispose = () => this.destroy();
    window.addEventListener('mira:route-dispose', this.handleRouteDispose);
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.rebindRevision += 1;
    window.removeEventListener('mira:route-dispose', this.handleRouteDispose);
    this.runtime.destroy();
    this.root?.remove();
    this.stripRoot?.remove();
    this.root = null;
    this.stripRoot = null;
    this.stripTrack = null;
    this.details = null;
    this.enabled = null;
    this.menuDuration = null;
    this.menuDurationOutput = null;
    this.summary = null;
    this.stage = null;
    this.getEntity = () => null;
  }

  mount(container) {
    if (this.disposed || !(container instanceof Element)) return;
    if (this.root?.isConnected) return;

    const root = document.createElement('section');
    root.className = 'playlist-scene-editor';
    root.setAttribute('aria-label', 'Плейлист сцен');
    root.innerHTML = `
      <div class="playlist-scene-editor-head">
        <div><p class="eyebrow">SCENE PLAYLIST</p><h3>Порядок показа</h3><p>MenuScene — постоянная база. Временные сцены появляются по очереди и после завершения возвращают меню.</p></div>
        <small data-playlist-summary></small>
      </div>
      <div class="playlist-scene-global"></div>
      <div class="playlist-scene-add" aria-label="Добавить сцену"></div>
      <div class="playlist-scene-details" data-playlist-scene-details></div>`;

    this.summary = root.querySelector('[data-playlist-summary]');
    const global = root.querySelector('.playlist-scene-global');
    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'animation-entity-visible playlist-enabled-toggle';
    this.enabled = document.createElement('input');
    this.enabled.type = 'checkbox';
    this.enabled.id = 'animation-scene-playlist-enabled';
    enabledLabel.append(this.enabled, Object.assign(document.createElement('span'), { textContent: 'Включить временные сцены' }));

    this.menuDuration = document.createElement('input');
    this.menuDuration.type = 'range';
    this.menuDuration.min = '5';
    this.menuDuration.max = '300';
    this.menuDuration.step = '5';
    this.menuDuration.id = 'animation-scene-menu-duration';
    this.menuDurationOutput = document.createElement('output');
    this.menuDurationOutput.id = 'animation-scene-menu-duration-output';
    const durationWrap = document.createElement('div');
    durationWrap.className = 'playlist-menu-duration-control';
    durationWrap.append(this.menuDuration, this.menuDurationOutput);
    global.append(enabledLabel, field('MenuScene между временными сценами', durationWrap));

    const add = root.querySelector('.playlist-scene-add');
    for (const type of ['promo', 'content', 'object-story']) {
      const control = button(`+ ${TYPE_LABELS[type]}`);
      control.dataset.addScene = type;
      control.addEventListener('click', () => this.addScene(type));
      add.append(control);
    }

    this.details = root.querySelector('[data-playlist-scene-details]');
    this.enabled.addEventListener('change', () => {
      this.patchPlaylist({ enabled: this.enabled.checked });
      this.rebindPreview();
    });
    this.menuDuration.addEventListener('input', () => {
      const seconds = Number(this.menuDuration.value);
      this.menuDurationOutput.textContent = `${seconds} с`;
      this.patchPlaylist({ menu_duration_seconds: seconds });
    });
    this.menuDuration.addEventListener('change', () => this.rebindPreview());

    container.append(root);
    this.root = root;
    this.mountStrip();
    this.renderControls();
    this.rebindPreview();
  }

  mountStrip() {
    const previewPane = document.querySelector('.playlist-preview-pane, .animation-preview-pane');
    if (!(previewPane instanceof HTMLElement)) return;
    this.stripRoot?.remove();
    const strip = document.createElement('section');
    strip.className = 'playlist-scene-strip';
    strip.setAttribute('aria-label', 'Лента сцен');
    strip.innerHTML = `
      <div class="playlist-scene-strip-head">
        <div><p class="eyebrow">СЦЕНЫ</p><strong>Лента плейлиста</strong></div>
        <small>Выберите карточку для редактирования</small>
      </div>
      <div class="playlist-scene-strip-track" data-playlist-scene-strip-track></div>`;
    previewPane.append(strip);
    this.stripRoot = strip;
    this.stripTrack = strip.querySelector('[data-playlist-scene-strip-track]');
  }

  value() {
    return normaliseScenePlaylist(this.playlist);
  }

  set(value) {
    if (this.disposed) return;
    this.playlist = normaliseScenePlaylist(value);
    if (this.selectedIndex !== null && !this.playlist.scenes[this.selectedIndex]) this.selectedIndex = null;
    this.renderControls();
    const revision = ++this.rebindRevision;
    queueMicrotask(() => {
      if (!this.disposed && revision === this.rebindRevision) this.rebindPreview();
    });
  }

  patchPlaylist(patch) {
    this.playlist = normaliseScenePlaylist({ ...this.playlist, ...patch });
    this.renderSummary();
    this.renderStrip();
  }

  addScene(type) {
    if (this.playlist.scenes.length >= MAX_SCENES) return;
    const scenes = [...this.playlist.scenes];
    const next = sceneSeed(type, scenes.length);
    next.id = uniqueId(type, scenes);
    scenes.push(next);
    this.playlist = normaliseScenePlaylist({ ...this.playlist, enabled: true, scenes });
    this.selectedIndex = scenes.length - 1;
    this.renderControls();
    this.previewScene(this.selectedIndex);
  }

  updateScene(index, patch, { rerender = false } = {}) {
    const scenes = this.playlist.scenes.map((scene, sceneIndex) => sceneIndex === index ? { ...scene, ...patch } : scene);
    this.playlist = normaliseScenePlaylist({ ...this.playlist, scenes });
    if (rerender) this.renderControls();
    else {
      this.renderSummary();
      this.renderStrip();
    }
    if (this.selectedIndex === index) this.previewScene(index);
  }

  moveScene(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= this.playlist.scenes.length) return;
    const scenes = [...this.playlist.scenes];
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    this.playlist = normaliseScenePlaylist({ ...this.playlist, scenes });
    this.selectedIndex = target;
    this.renderControls();
    this.previewScene(target);
  }

  removeScene(index) {
    const scenes = this.playlist.scenes.filter((_scene, sceneIndex) => sceneIndex !== index);
    this.playlist = normaliseScenePlaylist({ ...this.playlist, enabled: scenes.length ? this.playlist.enabled : false, scenes });
    if (!scenes.length) this.selectedIndex = null;
    else this.selectedIndex = Math.min(index, scenes.length - 1);
    this.renderControls();
    this.rebindPreview();
  }

  selectMenu() {
    this.selectedIndex = null;
    this.renderControls();
    this.rebindPreview({ autoplay: false });
    this.runtime.resume();
  }

  selectScene(index, { preview = false } = {}) {
    if (!this.playlist.scenes[index]) return;
    this.selectedIndex = index;
    this.renderControls();
    if (preview) this.previewScene(index);
  }

  renderSummary() {
    if (this.enabled) this.enabled.checked = this.playlist.enabled;
    if (this.menuDuration) this.menuDuration.value = String(this.playlist.menu_duration_seconds);
    if (this.menuDurationOutput) this.menuDurationOutput.textContent = `${this.playlist.menu_duration_seconds} с`;
    if (this.summary) {
      const atLimit = this.playlist.scenes.length >= MAX_SCENES;
      this.summary.textContent = atLimit
        ? `${this.playlist.scenes.length + 1} сцен · лимит ${MAX_SCENES} временных`
        : `${this.playlist.scenes.length + 1} сцен · ${this.playlist.scenes.length} временных`;
    }
    const atLimit = this.playlist.scenes.length >= MAX_SCENES;
    this.root?.querySelectorAll('[data-add-scene]').forEach((control) => {
      control.disabled = atLimit;
      control.title = atLimit ? `Достигнут лимит: ${MAX_SCENES} временных сцен` : '';
    });
  }

  renderControls() {
    this.renderSummary();
    this.renderStrip();
    this.renderDetails();
  }

  renderStrip() {
    if (!this.stripTrack) return;
    this.stripTrack.replaceChildren();

    const menu = button('', 'playlist-scene-card playlist-scene-card-menu');
    const menuIndex = document.createElement('span');
    menuIndex.className = 'playlist-scene-card-index';
    menuIndex.textContent = '01';
    const menuCopy = document.createElement('span');
    menuCopy.className = 'playlist-scene-card-copy';
    const menuTitle = document.createElement('strong');
    menuTitle.textContent = 'MenuScene';
    const menuMeta = document.createElement('small');
    menuMeta.textContent = `${this.playlist.menu_duration_seconds} с · база`;
    menuCopy.append(menuTitle, menuMeta);
    menu.append(menuIndex, menuCopy);
    menu.classList.toggle('active', this.selectedIndex === null);
    menu.addEventListener('click', () => this.selectMenu());
    this.stripTrack.append(menu);

    this.playlist.scenes.forEach((scene, index) => {
      const arrow = document.createElement('span');
      arrow.className = 'playlist-scene-arrow';
      arrow.textContent = '→';
      this.stripTrack.append(arrow);

      const card = button('', `playlist-scene-card playlist-scene-card-${scene.type}`);
      card.dataset.sceneId = scene.id;
      card.classList.toggle('active', this.selectedIndex === index);
      card.classList.toggle('is-disabled', !scene.enabled);
      const cardIndex = document.createElement('span');
      cardIndex.className = 'playlist-scene-card-index';
      cardIndex.textContent = String(index + 2).padStart(2, '0');
      const cardCopy = document.createElement('span');
      cardCopy.className = 'playlist-scene-card-copy';
      const cardTitle = document.createElement('strong');
      cardTitle.textContent = TYPE_SHORT[scene.type];
      const cardMeta = document.createElement('small');
      cardMeta.textContent = `${scene.duration_seconds} с · ${MODE_LABELS[scene.mode]}`;
      cardCopy.append(cardTitle, cardMeta);
      card.append(cardIndex, cardCopy);
      card.addEventListener('click', () => this.selectScene(index, { preview: true }));
      this.stripTrack.append(card);
    });
  }

  renderDetails() {
    if (!this.details) return;
    this.details.replaceChildren();

    if (this.selectedIndex === null) {
      const menu = document.createElement('div');
      menu.className = 'playlist-scene-menu-details';
      const copy = document.createElement('div');
      const eyebrow = document.createElement('p');
      eyebrow.className = 'eyebrow';
      eyebrow.textContent = 'BASE SCENE';
      const title = document.createElement('h4');
      title.textContent = 'MenuScene';
      const description = document.createElement('p');
      description.textContent = 'Постоянная сцена меню. Она не удаляется из плейлиста и автоматически возвращается после каждой временной сцены.';
      copy.append(eyebrow, title, description);
      const preview = button('Показать MenuScene');
      preview.addEventListener('click', () => this.selectMenu());
      menu.append(copy, preview);
      this.details.append(menu);
      return;
    }

    const scene = this.playlist.scenes[this.selectedIndex];
    if (!scene) return;
    const index = this.selectedIndex;
    const head = document.createElement('div');
    head.className = 'playlist-scene-details-head';
    const headCopy = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = TYPE_SHORT[scene.type];
    const heading = document.createElement('h4');
    heading.textContent = TYPE_LABELS[scene.type];
    const identifier = document.createElement('small');
    identifier.textContent = scene.id;
    headCopy.append(eyebrow, heading, identifier);
    const actions = document.createElement('div');
    actions.className = 'playlist-scene-details-actions';
    const preview = button('▶ Preview');
    preview.addEventListener('click', () => this.previewScene(index));
    const up = button('←');
    up.title = 'Сдвинуть сцену влево';
    up.disabled = index === 0;
    up.addEventListener('click', () => this.moveScene(index, -1));
    const down = button('→');
    down.title = 'Сдвинуть сцену вправо';
    down.disabled = index === this.playlist.scenes.length - 1;
    down.addEventListener('click', () => this.moveScene(index, 1));
    const remove = button('Удалить');
    remove.addEventListener('click', () => this.removeScene(index));
    actions.append(preview, up, down, remove);
    head.append(headCopy, actions);

    const grid = document.createElement('div');
    grid.className = 'playlist-scene-details-grid';
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = scene.enabled;
    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'animation-entity-visible';
    enabledLabel.append(enabled, Object.assign(document.createElement('span'), { textContent: 'Сцена активна' }));
    enabled.addEventListener('change', () => this.updateScene(index, { enabled: enabled.checked }));

    const mode = document.createElement('select');
    for (const modeValue of ['overlay', 'split', 'fullscreen']) mode.add(new Option(MODE_LABELS[modeValue], modeValue));
    mode.value = scene.mode;
    mode.addEventListener('change', () => this.updateScene(index, { mode: mode.value }));

    const duration = document.createElement('input');
    duration.type = 'number';
    duration.min = '2';
    duration.max = '120';
    duration.step = '1';
    duration.value = String(scene.duration_seconds);
    duration.addEventListener('change', () => this.updateScene(index, { duration_seconds: Number(duration.value) }, { rerender: true }));

    const title = document.createElement('input');
    title.type = 'text';
    title.maxLength = 100;
    title.value = scene.title;
    title.placeholder = TYPE_LABELS[scene.type];
    title.addEventListener('input', () => this.updateScene(index, { title: title.value }));

    const body = document.createElement('textarea');
    body.rows = 5;
    body.maxLength = 500;
    body.value = scene.body;
    body.placeholder = 'Текст сцены';
    body.addEventListener('input', () => this.updateScene(index, { body: body.value }));

    grid.append(enabledLabel, field('Режим показа', mode), field('Длительность, с', duration), field('Заголовок', title, 'field-full'), field('Текст', body, 'field-full'));
    this.details.append(head, grid);
  }

  previewLayers() {
    if (this.disposed || !(this.stage instanceof Element)) return null;
    const menuLayer = this.stage.querySelector('[data-scene-menu-layer]');
    const contentLayer = this.stage.querySelector('[data-scene-content-layer]');
    const fxLayer = this.stage.querySelector('[data-scene-fx-layer]');
    if (!(menuLayer instanceof HTMLElement) || !(contentLayer instanceof HTMLElement) || !(fxLayer instanceof HTMLElement)) return null;
    return { menuLayer, contentLayer, fxLayer };
  }

  rebindPreview({ autoplay = true } = {}) {
    const layers = this.previewLayers();
    if (!layers) return;
    this.runtime.render(this.playlist, { ...layers, entity: this.getEntity(), autoplay });
  }

  previewScene(index) {
    const scene = this.playlist.scenes[index];
    if (!scene || this.disposed) return;
    this.rebindPreview({ autoplay: false });
    this.runtime.preview(scene);
  }
}
