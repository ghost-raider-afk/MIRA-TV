import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { AnimationPreviewPlayer } from '../motion/preview-player.js';
import { SceneEntityEditor, createEntityMedia, normaliseSceneEntity } from '../motion/entity-editor.js';
import { normaliseAnnouncement, renderAnnouncementLayer } from '../motion/announcement.js';
import { normaliseBrandTitle, renderBrandTitleLayer } from '../motion/brand-title.js';
import { aquariumEnvironment, aquariumParameters, renderEnvironmentLayer, resetEnvironmentIntro } from '../motion/environment.js';
import { renderAnimationScreenEmpty, renderAnimationScreenPreview } from '../motion/screen-preview.js';
import { ScenePlaylistEditor } from '../motion/scene-playlist-editor.js';
import {
  DEFAULT_LIVE_PROFILE,
  bindMotionProfileControls,
  readMotionProfile,
  writeMotionProfile
} from '../motion/profile-editor.js';

const PROFILE_ID = 'cinematic-live-menu';
const ENTITY_MEDIA_TYPES = Object.freeze(['image/png', 'image/webp', 'video/mp4', 'video/webm']);
let currentEntity = normaliseSceneEntity();
let currentAnnouncement = normaliseAnnouncement();
let currentBrand = normaliseBrandTitle();
let currentAquarium = aquariumParameters();
let player = null;
let entityEditor = null;
let scenePlaylistEditor = null;
let previewFrame = null;
let screenLoadSequence = 0;
let studioGeneration = 0;
let availableScreens = [];
const selectedTargetScreenIds = new Set();

function number(id) { return Number(element(id)?.value ?? 0); }
function checked(id) { return element(id)?.checked === true; }
function value(id) { return element(id)?.value || ''; }
function setValue(id, next) { const node = element(id); if (node) node.value = String(next); }
function studioIsActive(generation) { return generation === studioGeneration && document.body.dataset.page !== 'signin'; }

function rebrandPlaylistPage() {
  const heading = document.querySelector('.animation-heading');
  const eyebrow = heading?.querySelector('.eyebrow');
  const title = heading?.querySelector('h1');
  const description = heading?.querySelector('p:not(.eyebrow)');
  if (eyebrow) eyebrow.textContent = 'PLAYLIST STUDIO';
  if (title) title.textContent = 'Плейлист';
  if (description) description.textContent = 'Соберите последовательность сцен для телевизора. MenuScene остаётся постоянной базой, а PromoScene, ContentScene и Object Story включаются по порядку и возвращают меню.';

  const master = document.querySelector('.animation-master-toggle span');
  if (master) {
    const strong = document.createElement('strong');
    strong.textContent = 'Движение MenuScene';
    const small = document.createElement('small');
    small.textContent = 'Эффекты базового меню одинаковы в Preview и на телевизоре.';
    master.replaceChildren(strong, small);
  }

  const previewCard = document.querySelector('.animation-player-card');
  const previewHeading = previewCard?.querySelector('.card-heading h2');
  const previewDescription = previewCard?.querySelector('.card-heading p:not(.eyebrow)');
  if (previewCard) previewCard.setAttribute('aria-label', 'Предпросмотр плейлиста');
  if (previewHeading) previewHeading.textContent = 'Предпросмотр плейлиста';
  if (previewDescription) previewDescription.textContent = 'Тот же Player Context, те же слои и тот же Scene Playlist Runtime, которые работают на реальном ТВ.';
  element('animation-stage')?.setAttribute('aria-label', 'Предпросмотр плейлиста');
}

function renderAnnouncementPreview() {
  const layer = element('animation-stage')?.querySelector('[data-announcement-layer]');
  if (layer) renderAnnouncementLayer(layer, currentAnnouncement);
}

function renderBrandPreview() {
  const layer = element('animation-stage')?.querySelector('[data-brand-layer]');
  if (layer) renderBrandTitleLayer(layer, currentBrand);
}

function renderAquariumPreview(allowIntro = false) {
  const layer = element('animation-stage')?.querySelector('[data-environment-layer]');
  if (layer) renderEnvironmentLayer(layer, aquariumEnvironment(currentAquarium), { allowIntro });
}

function restartPreview() {
  cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(() => {
    if (!element('animation-stage')?.isConnected) return;
    entityEditor?.render();
    renderAnnouncementPreview();
    renderBrandPreview();
    renderAquariumPreview(false);
    player?.restart(readMotionProfile(), currentEntity, checked('animation-enabled'));
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) player?.pause();
  });
}

function announcementFromControls() {
  return normaliseAnnouncement({
    enabled: checked('animation-announcement-enabled'),
    text: value('animation-announcement-text'),
    position: value('animation-announcement-position'),
    speed_px_per_second: number('animation-announcement-speed'),
    font_size: number('animation-announcement-font-size'),
    font_family: value('animation-announcement-font-family'),
    vertical_scale: number('animation-announcement-vertical-scale'),
    text_color: value('animation-announcement-text-color'),
    background_color: value('animation-announcement-background-color'),
    background_opacity: number('animation-announcement-opacity'),
    glow_enabled: checked('animation-announcement-glow-enabled'),
    glow_color: value('animation-announcement-glow-color'),
    glow_strength: number('animation-announcement-glow-strength')
  });
}

function syncAnnouncementControls(announcement = currentAnnouncement) {
  const current = normaliseAnnouncement(announcement);
  const enabled = element('animation-announcement-enabled');
  const glowEnabled = element('animation-announcement-glow-enabled');
  if (enabled) enabled.checked = current.enabled;
  if (glowEnabled) glowEnabled.checked = current.glow_enabled;
  setValue('animation-announcement-text', current.text);
  setValue('animation-announcement-position', current.position);
  setValue('animation-announcement-speed', current.speed_px_per_second);
  setValue('animation-announcement-font-size', current.font_size);
  setValue('animation-announcement-font-family', current.font_family);
  setValue('animation-announcement-vertical-scale', current.vertical_scale);
  setValue('animation-announcement-text-color', current.text_color);
  setValue('animation-announcement-background-color', current.background_color);
  setValue('animation-announcement-opacity', current.background_opacity);
  setValue('animation-announcement-glow-color', current.glow_color);
  setValue('animation-announcement-glow-strength', current.glow_strength);
  const outputs = {
    'animation-announcement-speed-output': `${Math.round(current.speed_px_per_second)} px/с`,
    'animation-announcement-font-output': `${Math.round(current.font_size)} px`,
    'animation-announcement-vertical-scale-output': `${current.vertical_scale.toFixed(2)}×`,
    'animation-announcement-opacity-output': `${Math.round(current.background_opacity * 100)}%`,
    'animation-announcement-glow-strength-output': `${Math.round(current.glow_strength)} px`
  };
  Object.entries(outputs).forEach(([id, text]) => { const node = element(id); if (node) node.textContent = text; });
}

function bindAnnouncementControls() {
  const ids = [
    'animation-announcement-enabled', 'animation-announcement-text', 'animation-announcement-position',
    'animation-announcement-speed', 'animation-announcement-font-size', 'animation-announcement-font-family',
    'animation-announcement-vertical-scale', 'animation-announcement-text-color',
    'animation-announcement-background-color', 'animation-announcement-opacity',
    'animation-announcement-glow-enabled', 'animation-announcement-glow-color', 'animation-announcement-glow-strength'
  ];
  ids.forEach((id) => {
    const node = element(id);
    if (!node) return;
    const eventName = node instanceof HTMLSelectElement || (node instanceof HTMLInputElement && node.type === 'checkbox') ? 'change' : 'input';
    node.addEventListener(eventName, () => {
      currentAnnouncement = announcementFromControls();
      syncAnnouncementControls(currentAnnouncement);
      renderAnnouncementPreview();
    });
  });
}

function brandFromControls() {
  return normaliseBrandTitle({
    enabled: checked('animation-brand-enabled'),
    text: value('animation-brand-text'),
    x: number('animation-brand-x'),
    y: number('animation-brand-y'),
    font_family: value('animation-brand-font-family'),
    font_size: number('animation-brand-font-size'),
    vertical_scale: number('animation-brand-vertical-scale'),
    letter_spacing: number('animation-brand-letter-spacing'),
    line_spacing: number('animation-brand-line-spacing'),
    text_color: value('animation-brand-text-color'),
    glow_color: value('animation-brand-glow-color'),
    glow_strength: number('animation-brand-glow-strength'),
    entrance_effect: value('animation-brand-entrance-effect'),
    loop_effect: value('animation-brand-effect'),
    effect: value('animation-brand-effect'),
    exit_effect: value('animation-brand-exit-effect'),
    entrance_duration_ms: number('animation-brand-entrance-duration'),
    exit_duration_ms: number('animation-brand-exit-duration'),
    letter_stagger_ms: number('animation-brand-stagger'),
    amplitude_px: number('animation-brand-amplitude'),
    overshoot: number('animation-brand-overshoot'),
    cycle_seconds: number('animation-brand-cycle')
  });
}

function syncBrandControls(brand = currentBrand) {
  const current = normaliseBrandTitle(brand);
  const enabled = element('animation-brand-enabled');
  if (enabled) enabled.checked = current.enabled;
  setValue('animation-brand-text', current.text);
  setValue('animation-brand-x', Math.round(current.x));
  setValue('animation-brand-y', Math.round(current.y));
  setValue('animation-brand-font-family', current.font_family);
  setValue('animation-brand-font-size', current.font_size);
  setValue('animation-brand-vertical-scale', current.vertical_scale);
  setValue('animation-brand-letter-spacing', current.letter_spacing);
  setValue('animation-brand-line-spacing', current.line_spacing);
  setValue('animation-brand-text-color', current.text_color);
  setValue('animation-brand-glow-color', current.glow_color);
  setValue('animation-brand-glow-strength', current.glow_strength);
  setValue('animation-brand-entrance-effect', current.entrance_effect);
  setValue('animation-brand-effect', current.loop_effect || current.effect);
  setValue('animation-brand-exit-effect', current.exit_effect);
  setValue('animation-brand-entrance-duration', current.entrance_duration_ms);
  setValue('animation-brand-exit-duration', current.exit_duration_ms);
  setValue('animation-brand-stagger', current.letter_stagger_ms);
  setValue('animation-brand-amplitude', current.amplitude_px);
  setValue('animation-brand-overshoot', current.overshoot);
  setValue('animation-brand-cycle', current.cycle_seconds);
  const outputs = {
    'animation-brand-font-size-output': `${Math.round(current.font_size)} px`,
    'animation-brand-vertical-scale-output': `${current.vertical_scale.toFixed(2)}×`,
    'animation-brand-letter-spacing-output': `${current.letter_spacing.toFixed(1)} px`,
    'animation-brand-line-spacing-output': `${Math.round(current.line_spacing)} px`,
    'animation-brand-glow-strength-output': `${Math.round(current.glow_strength)} px`,
    'animation-brand-entrance-duration-output': `${Math.round(current.entrance_duration_ms)} мс`,
    'animation-brand-exit-duration-output': `${Math.round(current.exit_duration_ms)} мс`,
    'animation-brand-stagger-output': `${Math.round(current.letter_stagger_ms)} мс`,
    'animation-brand-amplitude-output': `${Math.round(current.amplitude_px)} px`,
    'animation-brand-overshoot-output': `${Math.round(current.overshoot * 100)}%`,
    'animation-brand-cycle-output': `${current.cycle_seconds.toFixed(1)} с`
  };
  Object.entries(outputs).forEach(([id, text]) => { const node = element(id); if (node) node.textContent = text; });
}

function patchBrand(patch) {
  currentBrand = normaliseBrandTitle({ ...currentBrand, ...patch });
  syncBrandControls(currentBrand);
  renderBrandPreview();
}

function alignBrand(mode) {
  const positions = {
    'top-left': { x: 180, y: 92 },
    top: { x: 960, y: 92 },
    'top-right': { x: 1740, y: 92 },
    center: { x: 960, y: 540 },
    bottom: { x: 960, y: 990 }
  };
  if (positions[mode]) patchBrand(positions[mode]);
}

function bindBrandControls() {
  const ids = [
    'animation-brand-enabled', 'animation-brand-text', 'animation-brand-x', 'animation-brand-y',
    'animation-brand-font-family', 'animation-brand-font-size', 'animation-brand-vertical-scale',
    'animation-brand-letter-spacing', 'animation-brand-line-spacing', 'animation-brand-text-color', 'animation-brand-glow-color',
    'animation-brand-glow-strength', 'animation-brand-entrance-effect', 'animation-brand-effect', 'animation-brand-exit-effect',
    'animation-brand-entrance-duration', 'animation-brand-exit-duration', 'animation-brand-stagger',
    'animation-brand-amplitude', 'animation-brand-overshoot', 'animation-brand-cycle'
  ];
  ids.forEach((id) => {
    const node = element(id);
    if (!node) return;
    const eventName = node instanceof HTMLSelectElement || (node instanceof HTMLInputElement && node.type === 'checkbox') ? 'change' : 'input';
    node.addEventListener(eventName, () => {
      currentBrand = brandFromControls();
      if (id !== 'animation-brand-text') syncBrandControls(currentBrand);
      renderBrandPreview();
    });
  });
  document.querySelectorAll('[data-brand-align]').forEach((button) => button.addEventListener('click', () => alignBrand(button.dataset.brandAlign)));
}

function aquariumFromControls() {
  return aquariumParameters(aquariumEnvironment({
    enabled: checked('animation-aquarium-enabled'),
    style: value('animation-aquarium-style'),
    intro_fill: checked('animation-aquarium-intro'),
    intensity: number('animation-aquarium-intensity'),
    fish_count: number('animation-aquarium-fish-count'),
    bubble_density: number('animation-aquarium-bubbles'),
    plant_density: number('animation-aquarium-plants'),
    caustics: number('animation-aquarium-caustics'),
    speed: number('animation-aquarium-speed')
  }));
}

function syncAquariumControls(aquarium = currentAquarium) {
  const current = aquariumParameters(aquariumEnvironment(aquarium));
  const enabled = element('animation-aquarium-enabled');
  const intro = element('animation-aquarium-intro');
  if (enabled) enabled.checked = current.enabled;
  if (intro) intro.checked = current.intro_fill;
  setValue('animation-aquarium-style', current.style);
  setValue('animation-aquarium-intensity', current.intensity);
  setValue('animation-aquarium-fish-count', current.fish_count);
  setValue('animation-aquarium-bubbles', current.bubble_density);
  setValue('animation-aquarium-plants', current.plant_density);
  setValue('animation-aquarium-caustics', current.caustics);
  setValue('animation-aquarium-speed', current.speed);
  const outputs = {
    'animation-aquarium-intensity-output': `${current.intensity}%`,
    'animation-aquarium-fish-count-output': String(current.fish_count),
    'animation-aquarium-bubbles-output': `${current.bubble_density}%`,
    'animation-aquarium-plants-output': `${current.plant_density}%`,
    'animation-aquarium-caustics-output': `${current.caustics}%`,
    'animation-aquarium-speed-output': `${current.speed}%`
  };
  Object.entries(outputs).forEach(([id, text]) => { const node = element(id); if (node) node.textContent = text; });
}

function bindAquariumControls() {
  const ids = [
    'animation-aquarium-enabled', 'animation-aquarium-style', 'animation-aquarium-intro',
    'animation-aquarium-intensity', 'animation-aquarium-fish-count', 'animation-aquarium-bubbles',
    'animation-aquarium-plants', 'animation-aquarium-caustics', 'animation-aquarium-speed'
  ];
  ids.forEach((id) => {
    const node = element(id);
    if (!node) return;
    const eventName = node instanceof HTMLSelectElement || (node instanceof HTMLInputElement && node.type === 'checkbox') ? 'change' : 'input';
    node.addEventListener(eventName, () => {
      currentAquarium = aquariumFromControls();
      syncAquariumControls(currentAquarium);
      renderAquariumPreview(false);
    });
  });
  element('animation-aquarium-replay')?.addEventListener('click', () => {
    currentAquarium = aquariumFromControls();
    resetEnvironmentIntro();
    renderAquariumPreview(true);
  });
}

function entityHeight(entity) {
  const ratio = entity.width > 0 && entity.height > 0 ? entity.height / entity.width : 1;
  return entity.transform.width * ratio * entity.transform.scale;
}

function syncEntityControls(entity = currentEntity) {
  const current = normaliseSceneEntity(entity);
  setValue('animation-entity-name', current.name);
  const visible = element('animation-entity-visible');
  if (visible) visible.checked = current.visible;
  setValue('animation-entity-x', Math.round(current.transform.x));
  setValue('animation-entity-y', Math.round(current.transform.y));
  setValue('animation-entity-width', Math.round(current.transform.width));
  setValue('animation-entity-rotation', current.transform.rotation);
  setValue('animation-entity-scale', current.transform.scale);
  setValue('animation-entity-depth', current.transform.depth);
  setValue('animation-entity-opacity', current.transform.opacity);
  setValue('animation-entity-playback-rate', current.playback_rate);
  const loop = element('animation-entity-loop');
  const muted = element('animation-entity-muted');
  if (loop) loop.checked = current.loop;
  if (muted) muted.checked = current.muted;
  const scale = element('animation-entity-scale-output');
  const depth = element('animation-entity-depth-output');
  const opacity = element('animation-entity-opacity-output');
  if (scale) scale.textContent = `${current.transform.scale.toFixed(2)}×`;
  if (depth) depth.textContent = String(current.transform.depth);
  if (opacity) opacity.textContent = `${Math.round(current.transform.opacity * 100)}%`;

  const thumbnail = element('animation-entity-thumbnail');
  if (!thumbnail) return;
  thumbnail.replaceChildren();
  if (current.asset_url) {
    const media = createEntityMedia(current, { thumbnail: true });
    media.setAttribute('aria-label', current.name);
    thumbnail.append(media);
    const badge = document.createElement('small');
    badge.className = 'animation-entity-media-meta';
    badge.textContent = `${current.asset_type === 'video' ? 'VIDEO' : 'IMAGE'} · ${current.width || '?'}×${current.height || '?'}${current.asset_type === 'video' ? ` · alpha ${current.has_alpha ? 'yes' : 'no'}` : ''}`;
    thumbnail.append(badge);
  } else {
    thumbnail.append(Object.assign(document.createElement('span'), { textContent: 'PNG / WebP / MP4 / WebM' }));
  }
}

function applyEntity(entity) {
  currentEntity = normaliseSceneEntity(entity);
  syncEntityControls(currentEntity);
  entityEditor?.setEntity(currentEntity);
  restartPreview();
  scenePlaylistEditor?.rebindPreview();
}

function patchEntity(patch) {
  currentEntity = normaliseSceneEntity({ ...currentEntity, ...patch, transform: { ...currentEntity.transform, ...(patch.transform || {}) } });
  syncEntityControls(currentEntity);
  entityEditor?.setEntity(currentEntity);
  restartPreview();
  scenePlaylistEditor?.rebindPreview();
}

async function uploadEntityAsset(file, generation = studioGeneration) {
  if (!(file instanceof Blob) || !ENTITY_MEDIA_TYPES.includes(file.type)) {
    setMessage('animation-message', 'Для Entity поддерживаются PNG, WebP, MP4 и WebM.', 'error');
    return;
  }
  const button = element('animation-entity-upload');
  setPending(button, true, 'Загружаем…');
  try {
    const saved = await api.put(API.animationEntityAsset, file, { headers: { 'Content-Type': file.type } });
    if (!studioIsActive(generation)) return;
    applyEntity(saved.entity);
    const entity = normaliseSceneEntity(saved.entity);
    if (entity.asset_type === 'video' && !entity.has_alpha) {
      setMessage('animation-message', 'Видео загружено, но прозрачность в исходном файле не обнаружена. Для настоящего alpha используйте browser-compatible WebM/VP9 alpha.', 'success');
    } else {
      setMessage('animation-message', `${entity.asset_type === 'video' ? 'Видео' : 'Изображение'} Entity загружено. Разместите объект и сохраните настройки.`, 'success');
    }
  } catch (error) {
    if (studioIsActive(generation)) setMessage('animation-message', error.message);
  } finally {
    if (studioIsActive(generation)) setPending(button, false, 'Загружаем…');
  }
}

function alignEntity(mode) {
  const entity = normaliseSceneEntity(currentEntity);
  const width = entity.transform.width * entity.transform.scale;
  const height = entityHeight(entity);
  const margin = 48;
  const transform = {};
  if (mode === 'left') transform.x = margin;
  if (mode === 'center') transform.x = (1920 - width) / 2;
  if (mode === 'right') transform.x = 1920 - width - margin;
  if (mode === 'top') transform.y = margin;
  if (mode === 'middle') transform.y = (1080 - height) / 2;
  if (mode === 'bottom') transform.y = 1080 - height - margin;
  patchEntity({ transform });
}

function bindEntityControls(generation) {
  element('animation-entity-upload')?.addEventListener('click', () => element('animation-entity-file')?.click());
  element('animation-entity-file')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) void uploadEntityAsset(file, generation);
    event.target.value = '';
  });
  element('animation-entity-name')?.addEventListener('input', () => patchEntity({ name: value('animation-entity-name') || 'Бокал пива' }));
  element('animation-entity-visible')?.addEventListener('change', () => patchEntity({ visible: checked('animation-entity-visible') }));
  element('animation-entity-loop')?.addEventListener('change', () => patchEntity({ loop: checked('animation-entity-loop') }));
  element('animation-entity-muted')?.addEventListener('change', () => patchEntity({ muted: checked('animation-entity-muted') }));
  element('animation-entity-playback-rate')?.addEventListener('input', () => patchEntity({ playback_rate: number('animation-entity-playback-rate') }));
  const transformControls = {
    'animation-entity-x': 'x', 'animation-entity-y': 'y', 'animation-entity-width': 'width',
    'animation-entity-rotation': 'rotation', 'animation-entity-scale': 'scale',
    'animation-entity-depth': 'depth', 'animation-entity-opacity': 'opacity'
  };
  Object.entries(transformControls).forEach(([id, key]) => element(id)?.addEventListener('input', () => patchEntity({ transform: { [key]: number(id) } })));
  document.querySelectorAll('[data-entity-align]').forEach((button) => button.addEventListener('click', () => alignEntity(button.dataset.entityAlign)));
  element('animation-entity-reset')?.addEventListener('click', () => patchEntity({ transform: { x: 1580, y: 420, width: 280, scale: 1, rotation: 0, depth: 10, opacity: 1 } }));
}

function screenLabel(screen) { return `${screen.location_name || 'Без точки'} — ${screen.name}`; }
function setScreenStatus(text) { const node = element('animation-screen-status'); if (node) node.textContent = text; }
function screenFromUrl(screens) { const candidate = Number(new URL(window.location.href).searchParams.get('screen')); return screens.find((screen) => Number(screen.id) === candidate) || screens[0] || null; }
function rememberSelectedScreen(screenId) { const url = new URL(window.location.href); url.searchParams.set('screen', String(screenId)); history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`); }

async function loadScreenPreview(screenId, generation = studioGeneration) {
  const stage = element('animation-stage');
  const select = element('animation-screen-select');
  if (!stage || !screenId || !studioIsActive(generation)) return;
  const sequence = ++screenLoadSequence;
  if (select) select.disabled = true;
  setScreenStatus('Загружаем сохранённый экран…');
  try {
    const bundle = await api.get(`${API.screens}/${screenId}/editor`);
    if (!studioIsActive(generation) || sequence !== screenLoadSequence) return;
    renderAnimationScreenPreview(stage, bundle);
    entityEditor?.render();
    renderAnnouncementPreview();
    renderBrandPreview();
    renderAquariumPreview(false);
    setScreenStatus(`${bundle.screen.location_name || 'Без точки'} · ${bundle.screen.name} · ${bundle.screen.resolution}`);
    restartPreview();
    scenePlaylistEditor?.rebindPreview();
  } catch (error) {
    if (!studioIsActive(generation) || sequence !== screenLoadSequence) return;
    renderAnimationScreenEmpty(stage, 'Не удалось загрузить выбранный монитор.');
    setScreenStatus(error.message);
  } finally {
    if (studioIsActive(generation) && sequence === screenLoadSequence && select) select.disabled = false;
  }
}

async function loadScreenOptions(generation) {
  const stage = element('animation-stage');
  const select = element('animation-screen-select');
  if (!stage || !(select instanceof HTMLSelectElement) || !studioIsActive(generation)) return;
  const screens = await api.get(API.screens);
  if (!studioIsActive(generation)) return;
  availableScreens = Array.isArray(screens) ? screens : [];
  select.replaceChildren();
  if (!Array.isArray(screens) || screens.length === 0) {
    select.add(new Option('Нет мониторов', ''));
    select.disabled = true;
    renderAnimationScreenEmpty(stage, 'Создайте монитор, чтобы просматривать его плейлист.');
    setScreenStatus('В проекте пока нет мониторов.');
    player?.destroy();
    scenePlaylistEditor?.runtime?.destroy();
    return;
  }
  for (const screen of screens) select.add(new Option(screenLabel(screen), String(screen.id)));
  const selected = screenFromUrl(screens);
  if (selectedTargetScreenIds.size === 0 && selected?.id) selectedTargetScreenIds.add(Number(selected.id));
  renderTargetScreens();
  select.value = String(selected.id);
  select.addEventListener('change', () => {
    const id = Number(select.value);
    if (!id) return;
    rememberSelectedScreen(id);
    void loadScreenPreview(id, generation);
  });
  await loadScreenPreview(selected.id, generation);
}

function setInspectorTab(name) {
  document.querySelectorAll('[data-animation-inspector-tab]').forEach((button) => button.classList.toggle('active', button.dataset.animationInspectorTab === name));
  document.querySelectorAll('[data-animation-inspector-panel]').forEach((panel) => { panel.hidden = panel.dataset.animationInspectorPanel !== name; });
}

function targetScreenIds() {
  return [...selectedTargetScreenIds].filter((id) => availableScreens.some((screen) => Number(screen.id) === id));
}

function updateTargetSummary() {
  const ids = targetScreenIds();
  const node = element('animation-target-summary');
  if (node) node.textContent = ids.length ? `${ids.length} ${ids.length === 1 ? 'монитор' : ids.length < 5 ? 'монитора' : 'мониторов'}` : 'Мониторы не выбраны';
  const apply = element('animation-apply-screens');
  if (apply) apply.disabled = ids.length === 0;
}

function renderTargetScreens() {
  const list = element('animation-target-list');
  if (!list) return;
  list.replaceChildren();
  for (const screen of availableScreens) {
    const label = document.createElement('label');
    label.className = 'animation-target-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = String(screen.id);
    checkbox.checked = selectedTargetScreenIds.has(Number(screen.id));
    checkbox.addEventListener('change', () => {
      const id = Number(screen.id);
      if (checkbox.checked) selectedTargetScreenIds.add(id); else selectedTargetScreenIds.delete(id);
      updateTargetSummary();
    });
    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = screen.name;
    const location = document.createElement('small');
    location.textContent = screen.location_name || 'Без точки';
    text.append(name, location);
    label.append(checkbox, text);
    list.append(label);
  }
  updateTargetSummary();
}

function buildStudioWorkspace() {
  const content = document.querySelector('.animation-content');
  const previewCard = content?.querySelector('.animation-player-card-full');
  if (!(content instanceof HTMLElement) || !(previewCard instanceof HTMLElement) || content.querySelector('.animation-studio-workspace')) return;

  const workspace = document.createElement('section');
  workspace.className = 'animation-studio-workspace playlist-studio-workspace';
  const previewPane = document.createElement('div');
  previewPane.className = 'animation-preview-pane playlist-preview-pane';
  const inspector = document.createElement('aside');
  inspector.className = 'animation-inspector playlist-inspector';
  inspector.setAttribute('aria-label', 'Панель настроек плейлиста');
  inspector.innerHTML = `
    <div class="animation-inspector-head"><div><p class="eyebrow">SCENE CONTROLS</p><h2>Настройки</h2></div><div id="animation-inspector-master"></div></div>
    <div class="animation-inspector-tabs" role="tablist">
      <button type="button" class="active" data-animation-inspector-tab="menu">Меню</button>
      <button type="button" data-animation-inspector-tab="text">Текст</button>
      <button type="button" data-animation-inspector-tab="scene">Сцена</button>
      <button type="button" data-animation-inspector-tab="playlist">Плейлист</button>
    </div>
    <div class="animation-inspector-panels">
      <div data-animation-inspector-panel="menu"></div>
      <div data-animation-inspector-panel="text" hidden></div>
      <div data-animation-inspector-panel="scene" hidden></div>
      <div data-animation-inspector-panel="playlist" hidden></div>
    </div>
    <div class="animation-targets">
      <div class="animation-targets-head"><div><strong>Применить к мониторам</strong><small id="animation-target-summary">Мониторы не выбраны</small></div><div><button class="button button-secondary" id="animation-target-all" type="button">Все</button><button class="button button-secondary" id="animation-target-none" type="button">Снять</button></div></div>
      <div class="animation-target-list" id="animation-target-list"></div>
    </div>
    <div class="animation-inspector-actions" id="animation-inspector-actions"></div>`;

  previewPane.append(previewCard);
  const menuPanel = inspector.querySelector('[data-animation-inspector-panel="menu"]');
  const textPanel = inspector.querySelector('[data-animation-inspector-panel="text"]');
  const scenePanel = inspector.querySelector('[data-animation-inspector-panel="scene"]');
  const motionGrid = content.querySelector('.animation-motion-grid');
  const announcement = content.querySelector('.animation-announcement-card');
  const overlayGrid = content.querySelector('.animation-overlay-grid');
  const brand = overlayGrid?.querySelector('.animation-brand-card');
  const aquarium = overlayGrid?.querySelector('.animation-aquarium-card');
  const entity = content.querySelector('.animation-entity-card');
  if (motionGrid) menuPanel?.append(motionGrid);
  if (announcement) textPanel?.append(announcement);
  if (brand) textPanel?.append(brand);
  if (aquarium) scenePanel?.append(aquarium);
  if (entity) scenePanel?.append(entity);
  overlayGrid?.remove();

  const master = content.querySelector('.animation-master-toggle');
  if (master) inspector.querySelector('#animation-inspector-master')?.append(master);
  const save = element('animation-save');
  if (save) { save.textContent = 'Сохранить плейлист'; inspector.querySelector('#animation-inspector-actions')?.append(save); }
  const apply = document.createElement('button');
  apply.className = 'button button-primary';
  apply.id = 'animation-apply-screens';
  apply.type = 'button';
  apply.textContent = 'Применить к выбранным';
  inspector.querySelector('#animation-inspector-actions')?.append(apply);

  workspace.append(previewPane, inspector);
  const heading = content.querySelector('.animation-heading');
  (heading || content.firstElementChild)?.after(workspace);
  document.querySelectorAll('[data-animation-inspector-tab]').forEach((button) => button.addEventListener('click', () => setInspectorTab(button.dataset.animationInspectorTab)));
  element('animation-target-all')?.addEventListener('click', () => { availableScreens.forEach((screen) => selectedTargetScreenIds.add(Number(screen.id))); renderTargetScreens(); });
  element('animation-target-none')?.addEventListener('click', () => { selectedTargetScreenIds.clear(); renderTargetScreens(); });
  setInspectorTab('menu');
}

function playlistPayload() {
  currentAnnouncement = announcementFromControls();
  currentBrand = brandFromControls();
  currentAquarium = aquariumFromControls();
  return {
    enabled: checked('animation-enabled'), preset_id: PROFILE_ID, profile: readMotionProfile(),
    entity: currentEntity, announcement: currentAnnouncement, brand: currentBrand,
    environment: aquariumEnvironment(currentAquarium),
    scene_playlist: scenePlaylistEditor?.value() || { enabled: false, menu_duration_seconds: 40, scenes: [] }
  };
}

function applySavedSettings(saved) {
  writeMotionProfile(saved.profile);
  currentAnnouncement = normaliseAnnouncement(saved.announcement);
  currentBrand = normaliseBrandTitle(saved.brand);
  currentAquarium = aquariumParameters(saved.environment);
  syncAnnouncementControls(currentAnnouncement);
  syncBrandControls(currentBrand);
  syncAquariumControls(currentAquarium);
  applyEntity(saved.entity);
  scenePlaylistEditor?.set(saved.scene_playlist);
  renderAnnouncementPreview();
  renderBrandPreview();
  renderAquariumPreview(false);
}

async function applySettingsToScreens(generation) {
  const button = element('animation-apply-screens');
  const screenIds = targetScreenIds();
  if (!screenIds.length) { setMessage('animation-message', 'Выберите хотя бы один монитор.', 'error'); return; }
  setPending(button, true, 'Применяем…');
  try {
    const result = await api.put(API.animationApply, { screen_ids: screenIds, settings: playlistPayload() });
    if (!studioIsActive(generation)) return;
    applySavedSettings(result.settings);
    setMessage('animation-message', `Плейлист применён к мониторам: ${result.applied_screen_ids.length}.`, 'success');
  } catch (error) {
    if (studioIsActive(generation)) setMessage('animation-message', error.message);
  } finally {
    if (studioIsActive(generation)) { setPending(button, false, 'Применяем…'); updateTargetSummary(); }
  }
}

async function loadSettings(generation) {
  const settings = await api.get(API.animationSettings);
  if (!studioIsActive(generation)) return;
  const enabled = element('animation-enabled');
  if (enabled) enabled.checked = settings?.enabled === true;
  writeMotionProfile(settings?.profile || DEFAULT_LIVE_PROFILE);
  currentAnnouncement = normaliseAnnouncement(settings?.announcement);
  currentBrand = normaliseBrandTitle(settings?.brand);
  currentAquarium = aquariumParameters(settings?.environment);
  syncAnnouncementControls(currentAnnouncement);
  syncBrandControls(currentBrand);
  syncAquariumControls(currentAquarium);
  applyEntity(settings?.entity);
  scenePlaylistEditor?.set(settings?.scene_playlist);
  renderAnnouncementPreview();
  renderBrandPreview();
  renderAquariumPreview(false);
  restartPreview();
}

async function saveSettings(generation) {
  const button = element('animation-save');
  setPending(button, true, 'Сохраняем…');
  try {
    const saved = await api.put(API.animationSettings, playlistPayload());
    if (!studioIsActive(generation)) return;
    applySavedSettings(saved);
    setMessage('animation-message', 'Плейлист сохранён. Мониторы не изменены — используйте «Применить к выбранным».', 'success');
  } catch (error) {
    if (studioIsActive(generation)) setMessage('animation-message', error.message);
  } finally {
    if (studioIsActive(generation)) setPending(button, false, 'Сохраняем…');
  }
}

function disposePlaylistStudio(generation) {
  if (generation !== studioGeneration) return;
  studioGeneration += 1;
  screenLoadSequence += 1;
  cancelAnimationFrame(previewFrame);
  previewFrame = null;
  player?.destroy();
  entityEditor?.destroy();
  scenePlaylistEditor?.destroy();
  player = null;
  entityEditor = null;
  scenePlaylistEditor = null;
  availableScreens = [];
  selectedTargetScreenIds.clear();
}

export function initialisePlaylistStudio() {
  const stage = element('animation-stage');
  if (!stage) return;
  const generation = ++studioGeneration;
  rebrandPlaylistPage();
  buildStudioWorkspace();
  player?.destroy();
  entityEditor?.destroy();
  scenePlaylistEditor?.destroy();
  player = new AnimationPreviewPlayer({
    stage, timeline: element('animation-timeline'), timeLabel: element('animation-time'),
    playButton: element('animation-play'), pauseButton: element('animation-pause'), replayButton: element('animation-replay')
  });
  entityEditor = new SceneEntityEditor({
    stage,
    onChange(entity) { currentEntity = entity; syncEntityControls(entity); },
    onCommit() { restartPreview(); scenePlaylistEditor?.rebindPreview(); }
  });
  scenePlaylistEditor = new ScenePlaylistEditor({ stage, getEntity: () => currentEntity });
  scenePlaylistEditor.mount(document.querySelector('[data-animation-inspector-panel="playlist"]'));
  bindMotionProfileControls(() => restartPreview());
  bindAnnouncementControls();
  bindBrandControls();
  bindAquariumControls();
  bindEntityControls(generation);
  element('animation-enabled')?.addEventListener('change', () => restartPreview());
  syncEntityControls();
  syncAnnouncementControls();
  syncBrandControls();
  syncAquariumControls();
  element('animation-save')?.addEventListener('click', () => { void saveSettings(generation); });
  element('animation-apply-screens')?.addEventListener('click', () => { void applySettingsToScreens(generation); });
  void Promise.all([loadSettings(generation), loadScreenOptions(generation)]).catch((error) => {
    if (studioIsActive(generation)) setMessage('animation-message', error.message);
  });
  return { dispose: () => disposePlaylistStudio(generation) };
}
