import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { PlayerSceneRenderer } from '../player/player-scene-renderer.js';
import { ScenePlaylistEditor } from '../motion/scene-playlist-editor.js';

let renderer = null;
let scenePlaylistEditor = null;
let currentContext = null;
let currentSettings = null;
let availableScreens = [];
let activeScreenId = null;
let generation = 0;
const selectedTargets = new Set();

function active(token) { return token === generation && document.body.dataset.page !== 'signin'; }
function label(screen) { return `${screen.location_name || 'Без точки'} — ${screen.name}`; }

function setStageActive(stage, value) {
  stage.dataset.playerActive = value ? 'true' : 'false';
  stage.dispatchEvent(new CustomEvent('mira:player-active', { detail: { active: value } }));
}

function playlistPayload() {
  return {
    scene_playlist: scenePlaylistEditor?.value() || { enabled:false, animation_enabled:true, menu_duration_seconds:40, scenes:[] }
  };
}

function screenFromUrl() {
  const id = Number(new URL(window.location.href).searchParams.get('screen'));
  return availableScreens.find((screen) => Number(screen.id) === id) || availableScreens[0] || null;
}

function rememberScreen(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('screen', String(id));
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function targetIds() {
  return [...selectedTargets].filter((id) => availableScreens.some((screen) => Number(screen.id) === id));
}

function updateTargetSummary() {
  const ids = targetIds();
  const summary = element('animation-target-summary');
  if (summary) summary.textContent = ids.length ? `${ids.length} ${ids.length === 1 ? 'монитор' : ids.length < 5 ? 'монитора' : 'мониторов'}` : 'Мониторы не выбраны';
  const apply = element('animation-apply-screens');
  if (apply) apply.disabled = ids.length === 0;
}

function renderTargets() {
  const root = element('animation-target-list');
  if (!root) return;
  root.replaceChildren();
  for (const screen of availableScreens) {
    const row = document.createElement('label');
    row.className = 'animation-target-item';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = selectedTargets.has(Number(screen.id));
    check.addEventListener('change', () => {
      if (check.checked) selectedTargets.add(Number(screen.id)); else selectedTargets.delete(Number(screen.id));
      updateTargetSummary();
    });
    const copy = document.createElement('span');
    copy.append(Object.assign(document.createElement('strong'), { textContent: screen.name }), Object.assign(document.createElement('small'), { textContent: screen.location_name || 'Без точки' }));
    row.append(check, copy);
    root.append(row);
  }
  updateTargetSummary();
}

async function renderScreen(screen, token) {
  const stage = element('animation-stage');
  if (!(stage instanceof HTMLElement) || !screen) return;
  activeScreenId = Number(screen.id);
  const select = element('animation-screen-select');
  if (select) select.disabled = true;
  const status = element('animation-screen-status');
  if (status) status.textContent = 'Загружаем состояние монитора…';
  try {
    const [bundle, applied] = await Promise.all([
      api.get(`${API.screens}/${screen.id}/editor`),
      api.get(`${API.animationSettings}/screens/${screen.id}`)
    ]);
    if (!active(token)) return;
    currentSettings = applied || await api.get(API.animationSettings);
    currentContext = {
      screen: bundle.screen,
      draft: bundle.draft,
      products: bundle.products || [],
      packaging: bundle.packaging || [],
      scene: bundle.draft?.scene || { version:1, elements:[] },
      animation: { enabled: currentSettings?.enabled === true, profile: currentSettings?.profile || {} },
      scene_playlist: currentSettings?.scene_playlist || null
    };

    renderer?.destroy();
    stage.replaceChildren();
    setStageActive(stage, true);
    renderer = new PlayerSceneRenderer(stage, { weatherEndpoint: `/api/weather/screens/${screen.id}/snapshot` });
    await renderer.render(currentContext, ['screen','menu','scene','animation']);
    scenePlaylistEditor?.set(currentSettings?.scene_playlist);
    scenePlaylistEditor?.rebindPreview();
    if (status) status.textContent = `${bundle.screen.location_name || 'Без точки'} · ${bundle.screen.name} · ${bundle.screen.resolution}`;
  } catch (error) {
    if (!active(token)) return;
    stage.replaceChildren(Object.assign(document.createElement('p'), { className:'animation-screen-empty', textContent:error.message }));
    if (status) status.textContent = error.message;
  } finally {
    if (active(token) && select) select.disabled = false;
  }
}

async function loadScreens(token) {
  const select = element('animation-screen-select');
  availableScreens = await api.get(API.screens);
  if (!active(token) || !(select instanceof HTMLSelectElement)) return;
  select.replaceChildren();
  if (!availableScreens.length) {
    select.add(new Option('Нет мониторов',''));
    select.disabled = true;
    element('animation-stage')?.replaceChildren(Object.assign(document.createElement('p'), { className:'animation-screen-empty', textContent:'Создайте монитор.' }));
    currentSettings = await api.get(API.animationSettings);
    scenePlaylistEditor?.set(currentSettings?.scene_playlist);
    return;
  }
  for (const screen of availableScreens) select.add(new Option(label(screen), String(screen.id)));
  const selected = screenFromUrl();
  select.value = String(selected.id);
  selectedTargets.clear();
  selectedTargets.add(Number(selected.id));
  renderTargets();
  select.addEventListener('change', () => {
    const screen = availableScreens.find((item) => Number(item.id) === Number(select.value));
    if (!screen) return;
    rememberScreen(screen.id);
    selectedTargets.clear();
    selectedTargets.add(Number(screen.id));
    renderTargets();
    void renderScreen(screen, token);
  });
  await renderScreen(selected, token);
}

async function save(token) {
  const button = element('animation-save');
  setPending(button, true, 'Сохраняем…');
  try {
    currentSettings = await api.put(`${API.animationSettings}/playlist`, playlistPayload());
    if (!active(token)) return;
    setMessage('animation-message', 'Плейлист сохранён. Мониторы не изменены.', 'success');
  } catch (error) {
    if (active(token)) setMessage('animation-message', error.message);
  } finally {
    if (active(token)) setPending(button, false, 'Сохраняем…');
  }
}

async function apply(token) {
  const ids = targetIds();
  if (!ids.length) return setMessage('animation-message','Выберите хотя бы один монитор.','error');
  const button = element('animation-apply-screens');
  setPending(button, true, 'Применяем…');
  try {
    const result = await api.put(`${API.animationSettings}/playlist/apply`, { screen_ids:ids, ...playlistPayload() });
    if (!active(token)) return;
    setMessage('animation-message', `Применено на ТВ: ${result.applied_screen_ids?.length || ids.length}.`, 'success');
    if (activeScreenId && ids.includes(activeScreenId)) {
      const screen = availableScreens.find((item) => Number(item.id) === activeScreenId);
      if (screen) await renderScreen(screen, token);
    }
  } catch (error) {
    if (active(token)) setMessage('animation-message', error.message);
  } finally {
    if (active(token)) { setPending(button, false, 'Применяем…'); updateTargetSummary(); }
  }
}

export function initialisePlaylistStudio() {
  const stage = element('animation-stage');
  if (!(stage instanceof HTMLElement)) return undefined;
  const token = ++generation;
  stage.dataset.playerActive = 'true';
  scenePlaylistEditor = new ScenePlaylistEditor({ stage });
  scenePlaylistEditor.mount(element('animation-playlist-panel'));
  element('animation-target-all')?.addEventListener('click', () => { availableScreens.forEach((screen) => selectedTargets.add(Number(screen.id))); renderTargets(); });
  element('animation-target-none')?.addEventListener('click', () => { selectedTargets.clear(); renderTargets(); });
  element('animation-save')?.addEventListener('click', () => { void save(token); });
  element('animation-apply-screens')?.addEventListener('click', () => { void apply(token); });
  void loadScreens(token).catch((error) => { if (active(token)) setMessage('animation-message', error.message); });

  return {
    dispose() {
      if (token !== generation) return;
      generation += 1;
      renderer?.destroy();
      scenePlaylistEditor?.destroy();
      renderer = null;
      scenePlaylistEditor = null;
      currentContext = null;
      availableScreens = [];
      selectedTargets.clear();
    }
  };
}
