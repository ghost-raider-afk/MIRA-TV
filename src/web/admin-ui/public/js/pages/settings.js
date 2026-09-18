import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { applyPresentation } from '../core/presentation.js';
import { refreshHeaderRoute } from '../components/header.js';
import { loadNotifications, startNotificationPolling } from '../core/notifications.js';

function populateSiteForm(site) {
  element('site-app-name').value = site.app_name || site.application_name || '';
  element('site-domain').value = site.domain;
  element('site-accent-color').value = site.accent_color;
  element('site-signin-logo-size').value = String(site.signin_logo_size || 1);
  element('site-timezone').value = site.timezone;
  element('site-date-format').value = site.date_format;
  element('site-refresh-seconds').value = String(site.dashboard_refresh_seconds);
  element('site-default-resolution').value = site.default_screen_resolution;
  element('site-session-ttl').textContent = `${site.session_ttl_hours} ч`;
}

function applySiteSettings(site) {
  state.site = site;
  applyPresentation(site);
  refreshHeaderRoute();
  populateSiteForm(site);
}

function uploadSiteAsset(kind) {
  const fileInput = element(kind === 'logo' ? 'site-logo-file' : 'site-favicon-file');
  const button = element(kind === 'logo' ? 'upload-logo' : 'upload-favicon');
  const file = fileInput?.files?.[0];
  if (!file) return setMessage('site-settings-message', 'Сначала выберите файл.');
  setPending(button, true, 'Загружаем…');
  void api.put(`${API.siteSettings}/${kind}`, file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } })
    .then((site) => {
      applySiteSettings(site);
      setMessage('site-settings-message', `${kind === 'logo' ? 'Логотип' : 'Favicon'} сохранён.`, 'success');
      return loadNotifications();
    })
    .catch((error) => setMessage('site-settings-message', error.message))
    .finally(() => setPending(button, false, 'Загружаем…'));
}

function managerEndpoint(username, action = '') {
  const base = `${API.managers}/${encodeURIComponent(username)}`;
  return action ? `${base}/${action}` : base;
}

function managerRow(manager) {
  const row = document.createElement('div');
  row.className = 'manager-admin-row';
  row.dataset.managerUsername = manager.username;

  const identity = document.createElement('strong');
  identity.textContent = manager.username;

  const status = document.createElement('span');
  status.className = `manager-admin-status${manager.active ? ' is-active' : ''}`;
  status.textContent = manager.active ? 'Активен' : 'Отключён';

  const password = document.createElement('input');
  password.type = 'password';
  password.autocomplete = 'new-password';
  password.placeholder = 'Новый пароль';
  password.setAttribute('aria-label', `Новый пароль менеджера ${manager.username}`);

  const passwordButton = document.createElement('button');
  passwordButton.type = 'button';
  passwordButton.className = 'button button-secondary';
  passwordButton.textContent = 'Сменить пароль';
  passwordButton.addEventListener('click', async () => {
    try {
      await api.put(managerEndpoint(manager.username, 'password'), { password: password.value });
      password.value = '';
      setMessage('manager-settings-message', `Пароль менеджера «${manager.username}» изменён. Активные сессии завершены.`, 'success');
      await loadManagers();
    } catch (error) {
      setMessage('manager-settings-message', error.message);
    }
  });

  const activeButton = document.createElement('button');
  activeButton.type = 'button';
  activeButton.className = 'button button-secondary';
  activeButton.textContent = manager.active ? 'Отключить' : 'Включить';
  activeButton.addEventListener('click', async () => {
    try {
      await api.put(managerEndpoint(manager.username, 'active'), { active: !manager.active });
      setMessage('manager-settings-message', `Менеджер «${manager.username}» ${manager.active ? 'отключён' : 'включён'}.`, 'success');
      await loadManagers();
    } catch (error) {
      setMessage('manager-settings-message', error.message);
    }
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button button-danger';
  remove.textContent = 'Удалить';
  remove.addEventListener('click', async () => {
    if (!window.confirm(`Удалить менеджера «${manager.username}»?`)) return;
    try {
      await api.delete(managerEndpoint(manager.username));
      setMessage('manager-settings-message', `Менеджер «${manager.username}» удалён.`, 'success');
      await loadManagers();
    } catch (error) {
      setMessage('manager-settings-message', error.message);
    }
  });

  row.append(identity, status, password, passwordButton, activeButton, remove);
  return row;
}

async function loadManagers() {
  const root = element('manager-admin-list');
  const empty = element('manager-admin-empty');
  if (!root || !empty) return;
  const managers = await api.get(API.managers);
  root.replaceChildren(...managers.map(managerRow));
  empty.classList.toggle('is-hidden', managers.length !== 0);
}

function initialiseManagers() {
  const form = element('manager-create-form');
  if (!(form instanceof HTMLFormElement)) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = element('manager-create-submit');
    setPending(button, true, 'Создаём…');
    try {
      await api.post(API.managers, {
        username: element('manager-create-username').value.trim(),
        password: element('manager-create-password').value
      });
      const username = element('manager-create-username').value.trim();
      form.reset();
      setMessage('manager-settings-message', `Менеджер «${username}» создан.`, 'success');
      await loadManagers();
    } catch (error) {
      setMessage('manager-settings-message', error.message);
    } finally {
      setPending(button, false, 'Создаём…');
    }
  });
  void loadManagers().catch((error) => setMessage('manager-settings-message', error.message));
}

export function initialiseSettings() {
  const siteForm = element('site-settings-form');
  if (!(siteForm instanceof HTMLFormElement)) return;
  populateSiteForm(state.site);
  element('upload-logo')?.addEventListener('click', () => uploadSiteAsset('logo'));
  element('upload-favicon')?.addEventListener('click', () => uploadSiteAsset('favicon'));
  siteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('site-settings-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      const site = await api.put(API.siteSettings, {
        application_name: element('site-app-name').value,
        accent_color: element('site-accent-color').value,
        signin_logo_size: Number(element('site-signin-logo-size').value),
        timezone: element('site-timezone').value,
        date_format: element('site-date-format').value,
        dashboard_refresh_seconds: Number(element('site-refresh-seconds').value),
        default_screen_resolution: element('site-default-resolution').value
      });
      applySiteSettings(site);
      startNotificationPolling();
      setMessage('site-settings-message', 'Настройки сайта сохранены.', 'success');
      await loadNotifications();
    } catch (error) {
      setMessage('site-settings-message', error.message);
    } finally {
      setPending(submit, false, 'Сохраняем…');
    }
  });
  siteForm.querySelectorAll('input, select, button').forEach((control) => {
    if (control.id !== 'site-domain') control.disabled = false;
  });
  siteForm.dataset.hydrated = 'true';
  initialiseManagers();
}
