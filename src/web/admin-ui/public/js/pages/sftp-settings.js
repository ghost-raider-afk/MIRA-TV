import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';

let locations = [];
let directories = [];
let overview = null;

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} Б`;
  const units = ['КБ', 'МБ', 'ГБ', 'ТБ'];
  let size = bytes;
  let unit = -1;
  do { size /= 1024; unit += 1; } while (size >= 1024 && unit < units.length - 1);
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unit]}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU');
}

function selectedLocation() {
  const id = Number(element('sftp-location')?.value);
  return locations.find((location) => Number(location.id) === id) || null;
}

function setText(id, value) {
  const node = element(id);
  if (node) node.textContent = String(value ?? '—');
}

function renderSummary() {
  const connection = overview?.connection || {};
  const totals = overview?.totals || {};
  setText('sftp-host', connection.host || '—');
  setText('sftp-port', connection.port || '—');
  setText('sftp-access-mode', connection.access_mode === 'read-only' ? 'Только чтение' : connection.access_mode || '—');
  setText('sftp-permissions', Array.isArray(connection.permissions) ? connection.permissions.join(' + ') : '—');
  setText('sftp-api-timeout', connection.api_timeout_ms ? `${connection.api_timeout_ms} мс` : '—');
  setText('sftp-staging-age', connection.staging_max_age_hours ? `${connection.staging_max_age_hours} ч` : '—');
  setText('sftp-password-length', connection.generated_password_length ? `${connection.generated_password_length} символов` : '—');
  setText('sftp-source-limit', formatBytes(connection.screen_source_max_bytes));
  setText('sftp-total-directories', totals.directories || 0);
  setText('sftp-ready-directories', totals.ready_directories || 0);
  setText('sftp-bound-directories', totals.bound_directories || 0);
  setText('sftp-total-files', totals.published_files || 0);
  setText('sftp-total-bytes', formatBytes(totals.published_bytes));
}

function button(label, className, handler) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `button ${className}`;
  node.textContent = label;
  node.addEventListener('click', handler);
  return node;
}

function renderDirectoryList() {
  const root = element('sftp-directory-list');
  const empty = element('sftp-directory-empty');
  if (!root || !empty) return;
  root.replaceChildren();
  empty.classList.toggle('is-hidden', directories.length > 0);

  directories.forEach((directory) => {
    const card = document.createElement('article');
    card.className = 'sftp-directory-row';

    const info = document.createElement('div');
    info.className = 'sftp-directory-info';
    const title = document.createElement('strong');
    title.textContent = directory.name;
    const meta = document.createElement('span');
    meta.textContent = `${directory.storage_status === 'ready' ? 'Физическая папка готова' : 'Физическая папка не создана'} · ${directory.bound_location_name ? `точка: ${directory.bound_location_name}` : 'не привязана'} · файлов: ${directory.file_count || 0} · ${formatBytes(directory.total_bytes)}`;
    const changed = document.createElement('small');
    changed.textContent = `Последнее изменение: ${formatDate(directory.last_modified_at)}`;
    info.append(title, meta, changed);

    const actions = document.createElement('div');
    actions.className = 'sftp-directory-actions';
    if (directory.storage_status !== 'ready') {
      actions.append(button('Создать папку', 'button-secondary', () => { void provisionDirectory(directory); }));
    }
    if (!directory.bound_location_id) {
      actions.append(button('Удалить', 'button-secondary', () => { void deleteDirectory(directory); }));
    }
    card.append(info, actions);
    root.append(card);
  });
}

function renderBindingOptions() {
  const locationSelect = element('sftp-location');
  const directorySelect = element('sftp-directory');
  if (locationSelect instanceof HTMLSelectElement) {
    const selected = locationSelect.value;
    locationSelect.replaceChildren(new Option('Выберите торговую точку', ''), ...locations.map((location) => new Option(location.name, String(location.id))));
    if ([...locationSelect.options].some((option) => option.value === selected)) locationSelect.value = selected;
  }
  if (directorySelect instanceof HTMLSelectElement) {
    const selected = directorySelect.value;
    directorySelect.replaceChildren(new Option('Выберите SFTP-каталог', ''), ...directories.map((directory) => {
      const label = `${directory.name}${directory.storage_status !== 'ready' ? ' — не создан' : ''}${directory.bound_location_name ? ` — ${directory.bound_location_name}` : ''}`;
      const option = new Option(label, String(directory.id));
      option.disabled = Boolean(directory.bound_location_id) || directory.storage_status !== 'ready';
      return option;
    }));
    if ([...directorySelect.options].some((option) => option.value === selected && !option.disabled)) directorySelect.value = selected;
  }
  renderBindingState();
}

function renderBindingState() {
  const current = selectedLocation();
  const details = element('sftp-binding-state');
  const submit = element('sftp-bind-submit');
  const reset = element('sftp-reset-password');
  const unbind = element('sftp-unbind');
  const username = element('sftp-username');
  if (!current) {
    if (details) details.textContent = 'Выберите торговую точку. Для нового доступа нужен свободный подготовленный каталог.';
    if (submit) submit.disabled = false;
    if (username instanceof HTMLInputElement) username.value = '';
    reset?.classList.add('is-hidden');
    unbind?.classList.add('is-hidden');
    return;
  }
  const bound = Boolean(current.sftp_directory_id);
  if (details) details.textContent = bound
    ? `Активно: каталог ${current.sftp_directory_name} · логин ${current.sftp_username} · права list/download · пароль выдаётся только при создании или сбросе.`
    : 'SFTP-доступ для этой точки ещё не настроен.';
  if (submit) submit.disabled = bound;
  if (username instanceof HTMLInputElement) username.value = bound ? current.sftp_username || '' : username.value;
  reset?.classList.toggle('is-hidden', !bound);
  unbind?.classList.toggle('is-hidden', !bound);
}

function setCredentials(credentials) {
  const target = element('sftp-credentials');
  if (!target) return;
  if (!credentials) {
    target.textContent = '';
    target.className = 'form-message is-hidden field-full';
    return;
  }
  target.textContent = `Хост ${credentials.host}, порт ${credentials.port}, логин ${credentials.username}, пароль ${credentials.password}. Сохраните пароль сейчас: повторно он не показывается.`;
  target.className = 'form-message is-success field-full';
}

function renderBrowserOptions() {
  const select = element('sftp-browser-directory');
  if (!(select instanceof HTMLSelectElement)) return;
  const selected = select.value;
  const ready = directories.filter((directory) => directory.storage_status === 'ready');
  select.replaceChildren(new Option('Выберите опубликованный каталог', ''), ...ready.map((directory) => new Option(`${directory.name}${directory.bound_location_name ? ` — ${directory.bound_location_name}` : ''}`, String(directory.id))));
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  else if (ready.length === 1) select.value = String(ready[0].id);
}

function clearFiles(message = 'Выберите каталог.') {
  element('sftp-file-list')?.replaceChildren();
  element('sftp-file-empty')?.classList.add('is-hidden');
  setText('sftp-browser-summary', message);
}

async function loadFiles() {
  const directoryId = Number(element('sftp-browser-directory')?.value);
  if (!directoryId) return clearFiles();
  const response = await api.get(`${API.sftpDirectories}/${directoryId}/files`);
  const directory = response.directory;
  const files = Array.isArray(response.files) ? response.files : [];
  setText('sftp-browser-summary', `${directory.name} · файлов ${files.length} · ${formatBytes(directory.total_bytes)} · последнее изменение ${formatDate(directory.last_modified_at)}`);
  const body = element('sftp-file-list');
  const empty = element('sftp-file-empty');
  if (!body || !empty) return;
  body.replaceChildren();
  empty.classList.toggle('is-hidden', files.length > 0);
  files.forEach((file) => {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = file.name;
    const size = document.createElement('td');
    size.textContent = formatBytes(file.size);
    const modified = document.createElement('td');
    modified.textContent = formatDate(file.modified_at);
    const sha = document.createElement('td');
    const code = document.createElement('code');
    code.className = 'sftp-sha';
    code.title = file.sha256;
    code.textContent = `${file.sha256.slice(0, 12)}…${file.sha256.slice(-8)}`;
    sha.append(code);
    const action = document.createElement('td');
    const link = document.createElement('a');
    link.className = 'button button-secondary sftp-download-button';
    link.href = `${API.sftpDirectories}/${directoryId}/files/${encodeURIComponent(file.name)}/download`;
    link.textContent = 'Скачать';
    link.setAttribute('download', file.name);
    action.append(link);
    row.append(name, size, modified, sha, action);
    body.append(row);
  });
}

async function refreshAll({ preserveBrowser = true } = {}) {
  const browser = preserveBrowser ? element('sftp-browser-directory')?.value : '';
  const [nextOverview, nextLocations] = await Promise.all([api.get(API.sftpOverview), api.get(API.locations)]);
  overview = nextOverview;
  directories = Array.isArray(nextOverview.directories) ? nextOverview.directories : [];
  locations = Array.isArray(nextLocations) ? nextLocations : [];
  renderSummary();
  renderDirectoryList();
  renderBindingOptions();
  renderBrowserOptions();
  const browserSelect = element('sftp-browser-directory');
  if (browser && browserSelect instanceof HTMLSelectElement && [...browserSelect.options].some((option) => option.value === browser)) browserSelect.value = browser;
}

async function provisionDirectory(directory) {
  try {
    await api.post(`${API.sftpDirectories}/${directory.id}/provision`);
    await refreshAll();
    await loadNotifications();
  } catch (error) { setMessage('sftp-settings-message', error.message); }
}

async function deleteDirectory(directory) {
  if (!window.confirm(`Удалить запись SFTP-каталога «${directory.name}»? Физические опубликованные файлы автоматически не удаляются.`)) return;
  try {
    await api.delete(`${API.sftpDirectories}/${directory.id}`);
    await refreshAll({ preserveBrowser: false });
  } catch (error) { setMessage('sftp-settings-message', error.message); }
}

export function initialiseSftpSettings() {
  const directoryForm = element('sftp-directory-form');
  const bindingForm = element('sftp-binding-form');
  if (!(directoryForm instanceof HTMLFormElement) || !(bindingForm instanceof HTMLFormElement)) return;

  void refreshAll({ preserveBrowser: false }).then(() => loadFiles()).catch((error) => setMessage('sftp-settings-message', error.message));

  element('sftp-refresh')?.addEventListener('click', () => {
    void refreshAll().then(() => loadFiles()).catch((error) => setMessage('sftp-settings-message', error.message));
  });
  element('sftp-location')?.addEventListener('change', renderBindingState);
  element('sftp-browser-directory')?.addEventListener('change', () => { void loadFiles().catch((error) => setMessage('sftp-settings-message', error.message)); });
  element('sftp-files-refresh')?.addEventListener('click', () => { void loadFiles().catch((error) => setMessage('sftp-settings-message', error.message)); });

  directoryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('sftp-directory-submit');
    setPending(submit, true, 'Создаём…');
    try {
      const directory = await api.post(API.sftpDirectories, { name: element('sftp-directory-name').value });
      await api.post(`${API.sftpDirectories}/${directory.id}/provision`);
      element('sftp-directory-name').value = '';
      await refreshAll();
      await loadNotifications();
      setMessage('sftp-settings-message', `Каталог «${directory.name}» создан и подготовлен.`, 'success');
    } catch (error) { setMessage('sftp-settings-message', error.message); }
    finally { setPending(submit, false, 'Создаём…'); }
  });

  bindingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const locationId = Number(element('sftp-location').value);
    const submit = element('sftp-bind-submit');
    setPending(submit, true, 'Привязываем…');
    try {
      const result = await api.post(`${API.locations}/${locationId}/sftp-binding`, {
        directory_id: Number(element('sftp-directory').value),
        username: element('sftp-username').value
      });
      setCredentials(result.credentials);
      await refreshAll();
      await loadNotifications();
    } catch (error) { setMessage('sftp-settings-message', error.message); }
    finally { setPending(submit, false, 'Привязываем…'); }
  });

  element('sftp-reset-password')?.addEventListener('click', async () => {
    const locationId = Number(element('sftp-location').value);
    if (!window.confirm('Сгенерировать новый пароль SFTP? Старый пароль сразу перестанет работать.')) return;
    try {
      const result = await api.post(`${API.locations}/${locationId}/sftp-password`);
      setCredentials(result.credentials);
      await loadNotifications();
    } catch (error) { setMessage('sftp-settings-message', error.message); }
  });

  element('sftp-unbind')?.addEventListener('click', async () => {
    const locationId = Number(element('sftp-location').value);
    if (!window.confirm('Отключить SFTP-доступ выбранной торговой точки?')) return;
    try {
      await api.delete(`${API.locations}/${locationId}/sftp-binding`);
      setCredentials(null);
      await refreshAll();
      await loadNotifications();
    } catch (error) { setMessage('sftp-settings-message', error.message); }
  });
}
