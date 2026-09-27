import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { setMessage } from '../core/dom.js';
import { formatRussianCount } from '../core/ru-plural.js';

const snapshotUrls = new Map();
const snapshotPromises = new Map();
let fullscreenScreenId = null;
let fullscreenEntries = [];
let fullscreenIndex = -1;
let fullscreenRequestToken = 0;

function appName() {
  return state.site?.app_name || state.site?.application_name || state.session?.app_name || 'MIRA-TV';
}

function clearSnapshots() {
  for (const url of snapshotUrls.values()) URL.revokeObjectURL(url);
  snapshotUrls.clear();
  snapshotPromises.clear();
}

function snapshotEndpoint(screenId) {
  return `${API.managerBase}/screens/${screenId}/preview`;
}

async function fetchSnapshot(screenId) {
  const id = Number(screenId);
  const cached = snapshotUrls.get(id);
  if (cached) return cached;
  const pending = snapshotPromises.get(id);
  if (pending) return pending;

  const task = (async () => {
    const response = await fetch(snapshotEndpoint(id), {
      credentials:'include',
      cache:'no-store'
    });
    if (!response.ok) {
      let message = 'Кадр TV Player недоступен.';
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
      } catch {}
      throw new Error(message);
    }
    const blob = await response.blob();
    const previous = snapshotUrls.get(id);
    if (previous) URL.revokeObjectURL(previous);
    const url = URL.createObjectURL(blob);
    snapshotUrls.set(id, url);
    return url;
  })().finally(() => snapshotPromises.delete(id));

  snapshotPromises.set(id, task);
  return task;
}

function snapshotImage(url, alt, fullscreen = false) {
  const image = document.createElement('img');
  image.className = fullscreen ? 'manager-screen-snapshot is-fullscreen' : 'manager-screen-snapshot';
  image.src = url;
  image.alt = alt;
  image.decoding = 'async';
  image.draggable = false;
  return image;
}

async function hydratePreview(stage, screenId, loading) {
  try {
    const url = await fetchSnapshot(screenId);
    if (!stage.isConnected) return;
    stage.replaceChildren(snapshotImage(url, 'Кадр телевизора'));
  } catch (error) {
    if (stage.isConnected) {
      stage.replaceChildren(Object.assign(document.createElement('p'), {
        className:'manager-preview-empty',
        textContent:error.message
      }));
    }
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
  stage.className = 'manager-screen-stage';
  const loading = document.createElement('div');
  loading.className = 'manager-preview-loading';
  loading.textContent = 'Получаем кадр телевизора…';
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
  clearSnapshots();
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
    count.textContent = formatRussianCount(location.screens.length, ['телевизор','телевизора','телевизоров']);
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
  fullscreenScreenId = screen.id;
  fullscreenIndex = orderIndex;
  updateFullscreenNavigation();
  stage.replaceChildren(Object.assign(document.createElement('p'), {
    className:'manager-preview-empty is-fullscreen',
    textContent:'Открываем сохранённый кадр…'
  }));
  document.getElementById('manager-fullscreen-title').textContent = screen.name;
  document.getElementById('manager-fullscreen-subtitle').textContent = `${location.name} · ${screen.resolution}`;
  overlay.classList.remove('is-hidden');

  if (!document.fullscreenElement && overlay.requestFullscreen) {
    void overlay.requestFullscreen({ navigationUI:'hide' }).catch(() => undefined);
  }

  try {
    const url = snapshotUrls.get(Number(screen.id)) || await fetchSnapshot(screen.id);
    if (requestToken !== fullscreenRequestToken || fullscreenScreenId !== screen.id || overlay.classList.contains('is-hidden')) return;
    stage.replaceChildren(snapshotImage(url, `Кадр ${screen.name}`, true));
  } catch (error) {
    if (requestToken !== fullscreenRequestToken) return;
    stage.replaceChildren(Object.assign(document.createElement('p'), {
      className:'manager-preview-empty is-fullscreen',
      textContent:error.message
    }));
  }
}

async function closeFullscreen() {
  fullscreenRequestToken += 1;
  fullscreenScreenId = null;
  fullscreenIndex = -1;
  updateFullscreenNavigation();
  const overlay = document.getElementById('manager-fullscreen');
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
  window.addEventListener('pagehide', clearSnapshots, { once:true });
  void loadOverview();
}
