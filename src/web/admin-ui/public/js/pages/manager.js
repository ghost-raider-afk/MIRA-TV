import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { setMessage } from '../core/dom.js';
import { renderAnimationScreenPreview } from '../motion/screen-preview.js';
import { renderSceneEntity } from '../motion/entity-editor.js';
import { renderAnnouncementLayer } from '../motion/announcement.js';
import { renderBrandTitleLayer } from '../motion/brand-title.js';
import { renderEnvironmentLayer } from '../motion/environment.js';
import { applySceneVisibility } from '../motion/scene-visibility.js';
import { PlayerSceneRenderer } from '../player/player-scene-renderer.js';

let fullscreenRenderer = null;
let fullscreenScreenId = null;

function appName() {
  return state.site?.app_name || state.site?.application_name || state.session?.app_name || 'MIRA-TV';
}

function renderStaticContext(stage, context) {
  renderAnimationScreenPreview(stage, {
    screen: context.screen,
    draft: context.draft,
    products: context.products,
    packaging: context.packaging
  });
  applySceneVisibility(stage, context.animation?.profile);
  const environment = stage.querySelector('[data-environment-layer]');
  const brand = stage.querySelector('[data-brand-layer]');
  const announcement = stage.querySelector('[data-announcement-layer]');
  if (environment) renderEnvironmentLayer(environment, context.environment, { allowIntro: false });
  renderSceneEntity(stage, context.entity, { editable: false });
  if (brand) renderBrandTitleLayer(brand, context.brand);
  if (announcement) renderAnnouncementLayer(announcement, context.announcement);
  stage.querySelectorAll('video').forEach((video) => {
    video.pause();
    video.preload = 'metadata';
  });
}

async function hydratePreview(stage, screenId, loading) {
  try {
    const context = await api.get(`${API.managerBase}/screens/${screenId}/context`);
    if (!stage.isConnected) return;
    renderStaticContext(stage, context);
  } catch (error) {
    if (stage.isConnected) stage.replaceChildren(Object.assign(document.createElement('p'), { className: 'animation-screen-empty', textContent: error.message }));
  } finally {
    loading?.classList.add('is-hidden');
  }
}

function screenCard(screen, location) {
  const card = document.createElement('button');
  card.className = 'manager-screen-card';
  card.type = 'button';
  card.dataset.managerScreenId = String(screen.id);

  const shell = document.createElement('div');
  shell.className = 'manager-screen-preview-shell';
  const stage = document.createElement('div');
  stage.className = 'manager-screen-stage animation-stage';
  const loading = document.createElement('div');
  loading.className = 'manager-preview-loading';
  loading.textContent = 'Загружаем опубликованный экран…';
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
  card.addEventListener('click', () => void openFullscreen(screen, location));
  void hydratePreview(stage, screen.id, loading);
  return card;
}

function renderLocations(locations) {
  const root = document.getElementById('manager-locations');
  const empty = document.getElementById('manager-empty');
  if (!root || !empty) return;
  root.replaceChildren();
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
    count.textContent = `${location.screens.length} ${location.screens.length === 1 ? 'экран' : 'экранов'}`;
    head.append(identity, count);
    const grid = document.createElement('div');
    grid.className = 'manager-screen-grid';
    location.screens.forEach((screen) => grid.append(screenCard(screen, location)));
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

async function openFullscreen(screen, location) {
  const overlay = document.getElementById('manager-fullscreen');
  const stage = document.getElementById('manager-fullscreen-stage');
  if (!(overlay instanceof HTMLElement) || !(stage instanceof HTMLElement)) return;

  fullscreenRenderer?.destroy();
  fullscreenRenderer = null;
  fullscreenScreenId = screen.id;
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
    if (fullscreenScreenId !== screen.id || overlay.classList.contains('is-hidden')) return;
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
  fullscreenScreenId = null;
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
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.getElementById('manager-fullscreen')?.classList.contains('is-hidden')) void closeFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    const overlay = document.getElementById('manager-fullscreen');
    if (!document.fullscreenElement && overlay && !overlay.classList.contains('is-hidden')) void closeFullscreen();
  });
  void loadOverview();
}
