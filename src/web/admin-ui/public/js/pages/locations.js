import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, setMessage, clearMessage, setPending, makeButton, recordRow, refreshList } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';

async function loadLocations() {
  state.locations = await api.get(API.locations);
  renderLocations();
  return state.locations;
}

function renderLocations() {
  const list = document.querySelector('[data-locations-list]');
  const empty = document.querySelector('[data-locations-empty]');
  if (!list || !empty) return;
  refreshList(list, empty, state.locations.map((location) => recordRow(
    location.name,
    location.address || 'Адрес не указан',
    [makeButton('Изменить', '', () => editLocation(location)), makeButton('Удалить', 'danger', () => void deleteLocation(location))]
  )));
}

function drawer() {
  return element('location-drawer');
}

function openDrawer() {
  const root = drawer();
  if (!root) return;
  root.classList.remove('is-hidden');
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('workspace-drawer-open');
  requestAnimationFrame(() => element('location-name')?.focus());
}

function closeDrawer() {
  const root = drawer();
  if (!root) return;
  root.classList.add('is-hidden');
  root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('workspace-drawer-open');
}

function resetLocationForm({ close = false } = {}) {
  const form = element('location-form');
  if (!(form instanceof HTMLFormElement)) return;
  state.editingLocationId = null;
  form.reset();
  element('location-active').checked = true;
  element('location-form-title').textContent = 'Новая точка';
  element('location-submit').textContent = 'Создать точку';
  element('cancel-location-edit')?.classList.add('is-hidden');
  clearMessage('location-message');
  if (close) closeDrawer();
}

function createLocation() {
  resetLocationForm();
  openDrawer();
}

function editLocation(location) {
  state.editingLocationId = location.id;
  element('location-name').value = location.name;
  element('location-address').value = location.address || '';
  element('location-active').checked = location.active !== false;
  element('location-form-title').textContent = 'Редактирование точки';
  element('location-submit').textContent = 'Сохранить точку';
  element('cancel-location-edit')?.classList.remove('is-hidden');
  clearMessage('location-message');
  openDrawer();
}

async function deleteLocation(location) {
  if (!window.confirm(`Удалить точку «${location.name}»?`)) return;
  try {
    await api.delete(`${API.locations}/${location.id}`);
    await loadLocations();
  } catch (error) {
    setMessage('location-message', error.message);
  }
}

export function initialiseLocations() {
  const form = element('location-form');
  if (!(form instanceof HTMLFormElement)) return;

  void loadLocations().catch((error) => setMessage('location-message', error.message));
  element('refresh-locations')?.addEventListener('click', () => { void loadLocations(); });
  element('create-location')?.addEventListener('click', createLocation);
  element('cancel-location-edit')?.addEventListener('click', () => resetLocationForm({ close: true }));
  element('location-drawer-close')?.addEventListener('click', () => resetLocationForm({ close: true }));
  element('location-drawer-backdrop')?.addEventListener('click', () => resetLocationForm({ close: true }));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !drawer()?.classList.contains('is-hidden')) resetLocationForm({ close: true });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('location-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      const payload = {
        name: element('location-name').value,
        address: element('location-address').value,
        active: element('location-active').checked
      };
      if (state.editingLocationId) await api.put(`${API.locations}/${state.editingLocationId}`, payload);
      else await api.post(API.locations, payload);
      resetLocationForm({ close: true });
      await Promise.all([loadLocations(), loadNotifications()]);
    } catch (error) {
      setMessage('location-message', error.message);
    } finally {
      setPending(submit, false, 'Сохраняем…');
    }
  });
}
