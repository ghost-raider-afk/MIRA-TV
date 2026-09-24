import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { setMessage } from '../core/dom.js';
import { PlayerSceneRenderer } from '../player/player-scene-renderer.js';
import { formatRussianCount } from '../core/ru-plural.js';

const previewRenderers = new Set();
let fullscreenRenderer = null;
let fullscreenScreenId = null;
let fullscreenEntries = [];
let fullscreenIndex = -1;
let fullscreenRequestToken = 0;

function appName() {
  return state.site?.app_name || state.site?.application_name || state.session?.app_name || 'MIRA-TV';
}

function destroyPreviewRenderers() {
  for (const renderer of previewRenderers) renderer.destroy();
  previewRenderers.clear();
}

async function hydratePreview(stage, screenId, loading) {
  let renderer = null;
  try {
    const context = await api.get(`${API.managerBase}/screens/${screenId}/context`);
    if (!stage.isConnected) return;
    stage.dataset.playerActive = 'false';
    renderer = new PlayerSceneRenderer(stage, {
      weatherEndpoint: `${API.managerBase}/screens/${screenId}/weather`,
      autoplay: false
    });
    previewRenderers.add(renderer);
    await renderer.render(context);
    if (!stage.isConnected) {
      renderer.destroy();
      previewRenderers.delete(renderer);
    }
  } catch (error) {
    renderer?.destroy();
    if (renderer) previewRenderers.delete(renderer);
    if (stage.isConnected) stage.replaceChildren(Object.assign(document.createElement('p'), { className: 'animation-screen-empty', textContent: error.message }));
  } finally {
    loading?.classList.add('is-hidden');
  }
}

function screenAspectRatio(resolution) {
  const match = String(resolution || '').match(/(\d+)\D+(\d+)/);
  const width = Number(match?.[1]) || 1920;
  const height = Number(match?.[2]) || 1080;
  return `${width} / ${height}`;
}

function screenCard(screen, location, orderIndex) {
  const card = document.createElement('button');
  card.className = 'manager-screen-card';
  card.type = 'button';
  card.dataset.managerScreenId = String(screen.id);

  const shell = document.createElement('div');
  shell.className = 'manager-screen-preview-shell';
  shell.style.aspectRatio = screenAspectRatio(screen.resolution);
  const stage = document.createElement('div');
  stage.className = 'manager-screen-stage animation-stage';
  const loading = document.createElement('div');
  loading.className = 'manager-preview-loading';
  loading.textContent = 'Загружаем телевизор…';
  shell.append(stage, loading);

  const copy = document.createElement('div');
  copy.className = 'manager-screen-copy';
  const name = document.createElement('strong');
  name.textContent = screen.name;
  const meta = document.createElement('span');
  meta.className = 'manager-screen-meta';
  meta.textContent = screen.resolution;
  copy.append(name, meta);
  card.append(shell, copy);
  card.addEventListener('click', () => void openFullscreenAt(orderIndex));
  void hydratePreview(stage, screen.id, loading);
  return card;
}

function renderLocations(locations) {
  const root = document.getElementById('manager-locations');
  const empty = document.getElementById('manager-empty');
  if (!root || !empty) return;
  destroyPreviewRenderers();
  root.replaceChildren();
  fullscreenEntries = locations.flatMap((location) =>
    location.screens.map((screen) => ({ screen, location }))
  );
  const orderIndexByScreenId = new Map(
    fullscreenEntries.map((entry, index) => [Number(entry.screen.id), index])
  );
  for (const location of locations) {
    const group = document.createElement('article');
    group.className = 'manager-location';
    const head = document.createElement('header');
    head.className = 'manager-location-head';
    const identity = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = location.name;
    const address = document.createElement('p');
    address.textContent = location.address || 'Адрес не указан';
    identity.append(title, address);
    const count = document.createElement('span');
    count.className = 'manager-location-count';
    count.textContent = formatRussianCount(location.screens.length, ['телевизор', 'телевизора', 'телевизоров']);
    head.append(identity, count);
    const grid = document.createElement('div');
    grid.className = 'manager-screen-grid';
    location.screens.forEach((screen) => grid.append(screenCard(
      screen,
      location,
      orderIndexByScreenId.get(Number(screen.id))
    )));
    group.append(head, grid);
    root.append(group);
  }
  empty.classList.toggle('is-hidden', locations.length !== 0);
}

async function loadOverview() {
  const button = document.getElementById('manager-refresh');
  if (button) button.disabled = true;
  try {
    const locations = await api.get(API.managerOverview);
    renderLocations(Array.isArray(locations) ? locations : []);
    setMessage('manager-message', '');
  } catch (error) {
    setMessage('manager-message', error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

function setFullscreenActive(stage, active) {
  stage.dataset.playerActive = active ? 'true' : 'false';
  stage.dispatchEvent(new CustomEvent('mira:player-active', { detail: { active } }));
}

function updateFullscreenNavigation() {
  const previous = document.getElementById('manager-fullscreen-prev');
  const next = document.getElementById('manager-fullscreen-next');
  const hasCurrent = fullscreenIndex >= 0 && fullscreenIndex < fullscreenEntries.length;
  if (previous) previous.disabled = !hasCurrent || fullscreenIndex === 0;
  if (next) next.disabled = !hasCurrent || fullscreenIndex >= fullscreenEntries.length - 1;
}

function openFullscreenAt(index) {
  if (!Number.isInteger(index) || index < 0 || index >= fullscreenEntries.length) return Promise.resolve();
  const entry = fullscreenEntries[index];
  return openFullscreen(entry.screen, entry.location, index);
}

function moveFullscreen(delta) {
  if (!Number.isInteger(fullscreenIndex)) return;
  const target = fullscreenIndex + delta;
  if (target < 0 || target >= fullscreenEntries.length) return;
  void openFullscreenAt(target);
}

async function openFullscreen(screen, location, orderIndex) {
  const overlay = document.getElementById('manager-fullscreen');
  const stage = document.getElementById('manager-fullscreen-stage');
  if (!(overlay instanceof HTMLElement) || !(stage instanceof HTMLElement)) return;

  const requestToken = ++fullscreenRequestToken;
  fullscreenRenderer?.destroy();
  fullscreenRenderer = null;
  fullscreenScreenId = screen.id;
  fullscreenIndex = orderIndex;
  updateFullscreenNavigation();
  stage.replaceChildren();
  stage.removeAttribute('style');
  setFullscreenActive(stage, false);
  document.getElementById('manager-fullscreen-title').textContent = screen.name;
  document.getElementById('manager-fullscreen-subtitle').textContent = `${location.name} · ${screen.resolution}`;
  overlay.classList.remove('is-hidden');

  if (!document.fullscreenElement && overlay.requestFullscreen) {
    void overlay.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  }

  try {
    const context = await api.get(`${API.managerBase}/screens/${screen.id}/context`);
    if (requestToken !== fullscreenRequestToken || fullscreenScreenId !== screen.id || overlay.classList.contains('is-hidden')) return;
    fullscreenRenderer = new PlayerSceneRenderer(stage, {
      weatherEndpoint: `${API.managerBase}/screens/${screen.id}/weather`
    });
    await fullscreenRenderer.render(context);
    setFullscreenActive(stage, true);
  } catch (error) {
    stage.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'animation-screen-empty',
      textContent: error.message
    }));
  }
}

async function closeFullscreen() {
  fullscreenRequestToken += 1;
  fullscreenScreenId = null;
  fullscreenIndex = -1;
  updateFullscreenNavigation();
  const overlay = document.getElementById('manager-fullscreen');
  const stage = document.getElementById('manager-fullscreen-stage');
  if (stage) setFullscreenActive(stage, false);
  fullscreenRenderer?.destroy();
  fullscreenRenderer = null;
  overlay?.classList.add('is-hidden');
  if (document.fullscreenElement === overlay) await document.exitFullscreen().catch(() => undefined);
}

async function logout() {
  try { await api.post(API.logout); }
  finally { window.location.replace('/signin'); }
}

export function initialiseManagerView() {
  document.title = `${appName()} — Просмотр`;
  const app = document.querySelector('[data-manager-app-name]');
  const user = document.querySelector('[data-manager-user]');
  if (app) app.textContent = appName();
  if (user) user.textContent = state.session?.display_name || state.session?.username || '';
  document.getElementById('manager-refresh')?.addEventListener('click', () => void loadOverview());
  document.getElementById('manager-logout')?.addEventListener('click', () => void logout());
  document.getElementById('manager-fullscreen-close')?.addEventListener('click', () => void closeFullscreen());
  document.getElementById('manager-fullscreen-prev')?.addEventListener('click', () => moveFullscreen(-1));
  document.getElementById('manager-fullscreen-next')?.addEventListener('click', () => moveFullscreen(1));
  document.addEventListener('keydown', (event) => {
    const overlay = document.getElementById('manager-fullscreen');
    if (!overlay || overlay.classList.contains('is-hidden')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      void closeFullscreen();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFullscreen(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveFullscreen(1);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const overlay = document.getElementById('manager-fullscreen');
    if (!document.fullscreenElement && overlay && !overlay.classList.contains('is-hidden')) void closeFullscreen();
  });
  void loadOverview();
}
